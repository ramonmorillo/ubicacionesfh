const input = document.getElementById('searchInput');
const clearButton = document.getElementById('clearButton');
const resultsNode = document.getElementById('results');
const countNode = document.getElementById('resultsCount');
const template = document.getElementById('cardTemplate');

let medicamentos = [];

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function prettyValue(value, fallback = 'No disponible') {
  const clean = (value || '').trim();
  return clean || fallback;
}

function zoneClass(zone) {
  const key = normalize(zone);
  if (key.includes('nevera')) return 'zona-nevera';
  if (key.includes('carrusel')) return 'zona-carrusel';
  if (key.includes('pacientes externos')) return 'zona-pexternos';
  return '';
}

function dedupeForRender(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = [item.codigo, item.nombre, item.ubicacion, item.posicion].map(normalize).join('|');
    const previous = byKey.get(key);
    if (!previous || (!previous.almacen && item.almacen)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function relevanceScore(item, query) {
  const q = normalize(query);
  const code = normalize(item.codigo);
  const name = normalize(item.nombre);
  const zone = normalize(item.ubicacion);
  const text = normalize(item.searchText);

  if (!q) return 0;
  if (code === q) return 120;
  if (name === q) return 110;
  if (name.startsWith(q)) return 90;
  if (code.startsWith(q)) return 85;
  if (zone.startsWith(q)) return 70;
  if (text.includes(q)) return 55;
  return 0;
}

function render(items, query = '') {
  resultsNode.innerHTML = '';

  if (!items.length) {
    countNode.textContent = '0 resultados';
    const empty = document.createElement('article');
    empty.className = 'empty-state';
    empty.textContent = query
      ? `Sin resultados para “${query}”. Prueba con otro nombre, código o ubicación.`
      : 'No hay resultados disponibles.';
    resultsNode.appendChild(empty);
    return;
  }

  countNode.textContent = `${items.length} resultado(s)`;

  for (const med of items.slice(0, 150)) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector('.nombre').textContent = prettyValue(med.nombre, '(Sin nombre)');
    card.querySelector('.codigo').textContent = `Código ${prettyValue(med.codigo)}`;

    const zona = card.querySelector('.zona-badge');
    zona.textContent = prettyValue(med.ubicacion);
    const zClass = zoneClass(med.ubicacion);
    if (zClass) zona.classList.add(zClass);

    card.querySelector('.almacen').textContent = prettyValue(med.almacen);
    card.querySelector('.ubicacion').textContent = prettyValue(med.ubicacion);
    card.querySelector('.ubicacion').classList.add('highlight');
    card.querySelector('.posicion').textContent = prettyValue(med.posicion);
    card.querySelector('.posicion').classList.add('highlight');
    resultsNode.appendChild(card);
  }
}

function search() {
  const query = normalize(input.value);
  if (!query) {
    render(dedupeForRender(medicamentos));
    return;
  }

  const ranked = medicamentos
    .map((item) => ({ item, score: relevanceScore(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || normalize(a.item.nombre).localeCompare(normalize(b.item.nombre)));

  render(dedupeForRender(ranked.map((entry) => entry.item)), input.value.trim());
}

async function main() {
  const response = await fetch('data/processed/medicamentos.json');
  medicamentos = await response.json();
  render(dedupeForRender(medicamentos));
  input.addEventListener('input', search);
  clearButton.addEventListener('click', () => {
    input.value = '';
    input.focus();
    render(dedupeForRender(medicamentos));
  });
}

main().catch((err) => {
  countNode.textContent = 'Error cargando datos';
  console.error(err);
});
