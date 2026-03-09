const input = document.getElementById('searchInput');
const resultsNode = document.getElementById('results');
const countNode = document.getElementById('resultsCount');
const template = document.getElementById('cardTemplate');

let medicamentos = [];

function render(items) {
  resultsNode.innerHTML = '';
  countNode.textContent = `${items.length} resultado(s)`;

  const maxItems = 150;
  const limited = items.slice(0, maxItems);

  for (const med of limited) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector('.nombre').textContent = med.nombre || '(Sin nombre)';
    card.querySelector('.codigo').textContent = med.codigo || '-';
    card.querySelector('.almacen').textContent = med.almacen || '-';
    card.querySelector('.ubicacion').textContent = med.ubicacion || '-';
    card.querySelector('.posicion').textContent = med.posicion || '-';
    resultsNode.appendChild(card);
  }
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function search() {
  const query = normalize(input.value);
  if (!query) {
    render(medicamentos.slice(0, 150));
    return;
  }
  const filtered = medicamentos.filter((item) => item.searchText.includes(query));
  render(filtered);
}

async function main() {
  const response = await fetch('data/processed/medicamentos.json');
  medicamentos = await response.json();
  render(medicamentos.slice(0, 150));
  input.addEventListener('input', search);
}

main().catch((err) => {
  countNode.textContent = 'Error cargando datos';
  console.error(err);
});
