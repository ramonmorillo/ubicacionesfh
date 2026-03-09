const input = document.getElementById('searchInput');
const clearButton = document.getElementById('clearButton');
const resultsNode = document.getElementById('results');
const countNode = document.getElementById('resultsCount');
const activeFiltersNode = document.getElementById('activeFilters');
const template = document.getElementById('cardTemplate');
const zoneButtons = Array.from(document.querySelectorAll('.zone-filter[data-zone]'));
const clearZoneFilterButton = document.getElementById('clearZoneFilter');
const searchPromptNode = document.getElementById('searchPrompt');
const statusRowNode = document.querySelector('.status-row');
const datasetMetaNode = document.querySelector('.dataset-meta');
const metaCountNode = document.getElementById('metaCount');
const metaUpdatedNode = document.getElementById('metaUpdated');

let medicamentos = [];
let selectedZone = '';
const cimaResolutionCache = new Map();
const cimaRequestCache = new Map();

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalZone(value) {
  const key = normalize(value);
  if (['nev', 'nevera'].includes(key)) return 'NEVERA';
  if (['carr', 'carrusel'].includes(key)) return 'CARRUSEL';
  if (['pext', 'pex', 'pacientes externos'].includes(key)) return 'PACIENTES EXTERNOS';
  return (value || '').trim();
}

function parseLocation(rawLocation) {
  const clean = (rawLocation || '').trim();
  if (!clean) return { zoneLabel: 'No disponible', cell: '' };

  const canonical = canonicalZone(clean);
  const normalized = normalize(clean);

  if (normalized.startsWith('nevera') || normalized.startsWith('nev')) {
    const cell = clean.replace(/^(nevera|nev)[\s\-/:]*/i, '').trim();
    return { zoneLabel: 'NEVERA', cell };
  }
  if (normalized.startsWith('carrusel') || normalized.startsWith('carr')) {
    const cell = clean.replace(/^(carrusel|carr)[\s\-/:]*/i, '').trim();
    return { zoneLabel: 'CARRUSEL', cell };
  }
  if (normalized.startsWith('pacientes externos') || normalized.startsWith('pext') || normalized.startsWith('pex')) {
    const cell = clean.replace(/^(pacientes externos|pext|pex)[\s\-/:]*/i, '').trim();
    return { zoneLabel: 'PACIENTES EXTERNOS', cell };
  }

  return { zoneLabel: canonical || clean, cell: '' };
}

function isUseful(value) {
  const key = normalize(value);
  return key && key !== 'no disponible';
}

function hasUsefulPosition(value) {
  const key = normalize(value);
  return isUseful(value) && !['-', 's/n', 'sn'].includes(key);
}

function zoneClass(zoneLabel) {
  const key = normalize(zoneLabel);
  if (key.includes('nevera')) return 'zona-nevera';
  if (key.includes('carrusel')) return 'zona-carrusel';
  if (key.includes('pacientes externos')) return 'zona-pexternos';
  return '';
}

function isGenericAlmacen(almacen) {
  const key = normalize(almacen);
  return !key || key === 'farmacia valme';
}

function buildSearchText(item) {
  const parsed = parseLocation(item.ubicacion);
  return normalize([
    item.codigo,
    item.nombre,
    item.ubicacion,
    parsed.zoneLabel,
    parsed.cell,
    hasUsefulPosition(item.posicion) ? item.posicion : '',
  ].join(' '));
}

function dedupeForRender(items) {
  const byKey = new Map();
  for (const item of items) {
    const parsed = parseLocation(item.ubicacion);
    const key = [item.codigo, item.nombre, parsed.zoneLabel, parsed.cell, item.posicion]
      .map(normalize)
      .join('|');
    const previous = byKey.get(key);
    if (!previous || (isGenericAlmacen(previous.almacen) && !isGenericAlmacen(item.almacen))) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function scoreItem(item, normalizedQuery) {
  if (!normalizedQuery) return 0;

  const code = normalize(item.codigo);
  const name = normalize(item.nombre);
  const text = buildSearchText(item);
  const tokens = text.split(' ').filter(Boolean);

  if (code === normalizedQuery) return 180;
  if (name === normalizedQuery) return 170;
  if (name.startsWith(normalizedQuery)) return 150;
  if (code.startsWith(normalizedQuery)) return 140;
  if (tokens.some((token) => token.startsWith(normalizedQuery))) return 120;
  if (text.includes(normalizedQuery)) return 100;

  return 0;
}

function formatDetails(item, parsedLocation) {
  const details = [];
  if (isUseful(parsedLocation.cell)) details.push(`Celda ${parsedLocation.cell}`);
  if (hasUsefulPosition(item.posicion)) details.push(`Posición ${item.posicion.trim()}`);
  return details;
}


function extractCodigoNacional(item) {
  const cnFields = [
    item.cn,
    item.codigo_nacional,
    item.codigoNacional,
    item.cod_nacional,
    item.codigo_nac,
    item.c_n,
  ];

  for (const candidate of cnFields) {
    const digits = String(candidate || '').replace(/\D/g, '');
    if (digits.length >= 6 && digits.length <= 8) return digits;
  }

  return '';
}

function buildCimaUrl(item) {
  const directUrl = buildCimaDirectUrl(item.cima_nregistro || item.nregistro);
  if (directUrl) {
    return {
      label: 'Ver ficha técnica',
      href: directUrl,
      isDirect: true,
    };
  }

  const cn = extractCodigoNacional(item);
  if (cn) {
    return {
      label: 'Buscar en CIMA',
      href: `https://cima.aemps.es/cima/publico/lista.html?keyword=${encodeURIComponent(cn)}`,
      isDirect: false,
    };
  }

  const nombre = (item.nombre || '').trim();
  if (!nombre || nombre.length < 3) return null;

  return {
    label: 'Buscar en CIMA',
    href: `https://cima.aemps.es/cima/publico/lista.html?keyword=${encodeURIComponent(nombre)}`,
    isDirect: false,
  };
}

function extractNregistroFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const queue = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    const candidate = String(current.nregistro || '').trim();
    if (candidate) return candidate;

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        queue.push(...value);
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return '';
}

function buildCimaDirectUrl(nregistro) {
  const code = String(nregistro || '').trim();
  if (!code) return '';
  return `https://cima.aemps.es/cima/dochtml/ft/${encodeURIComponent(code)}/FichaTecnica.html`;
}

async function resolveCimaNregistroByCn(cn) {
  if (!cn) return '';
  if (cimaResolutionCache.has(cn)) return cimaResolutionCache.get(cn);
  if (cimaRequestCache.has(cn)) return cimaRequestCache.get(cn);

  const request = (async () => {
    const endpoints = [
      `https://cima.aemps.es/cima/rest/medicamento?cn=${encodeURIComponent(cn)}`,
      `https://cima.aemps.es/cima/rest/presentacion?cn=${encodeURIComponent(cn)}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) continue;

        const payload = await response.json();
        const nregistro = extractNregistroFromPayload(payload);
        if (nregistro) {
          cimaResolutionCache.set(cn, nregistro);
          return nregistro;
        }
      } catch (error) {
        console.warn('No se pudo resolver ficha técnica desde CIMA', { cn, endpoint, error });
      }
    }

    cimaResolutionCache.set(cn, '');
    return '';
  })();

  cimaRequestCache.set(cn, request);

  try {
    return await request;
  } finally {
    cimaRequestCache.delete(cn);
  }
}

async function enhanceCimaButton(buttonNode, item) {
  const cn = extractCodigoNacional(item);
  if (!cn) return;

  try {
    const nregistro = await resolveCimaNregistroByCn(cn);
    const directUrl = buildCimaDirectUrl(nregistro);
    if (!directUrl || !buttonNode.isConnected) return;
    buttonNode.textContent = 'Ver ficha técnica';
    buttonNode.href = directUrl;
  } catch (error) {
    console.warn('No se pudo mejorar el enlace de CIMA', { cn, error });
  }
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

  for (const med of items.slice(0, 200)) {
    const parsedLocation = parseLocation(med.ubicacion);
    const details = formatDetails(med, parsedLocation);

    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector('.nombre').textContent = (med.nombre || '').trim() || '(Sin nombre)';

    const zoneBadge = card.querySelector('.zona-badge');
    zoneBadge.textContent = parsedLocation.zoneLabel;
    const badgeClass = zoneClass(parsedLocation.zoneLabel);
    if (badgeClass) zoneBadge.classList.add(badgeClass);

    const detailsNode = card.querySelector('.detalles-linea');
    if (details.length) {
      detailsNode.textContent = details.join(' · ');
    } else {
      detailsNode.remove();
    }

    card.querySelector('.codigo').textContent = `Código ${med.codigo || 'No disponible'}`;

    const cimaButton = card.querySelector('.cima-button');
    const cimaLink = buildCimaUrl(med);
    if (cimaLink) {
      cimaButton.textContent = cimaLink.label;
      cimaButton.href = cimaLink.href;
      if (!cimaLink.isDirect) {
        enhanceCimaButton(cimaButton, med);
      }
    } else {
      cimaButton.remove();
    }

    resultsNode.appendChild(card);
  }
}

function updateActiveFiltersText() {
  const labels = [];
  const q = input.value.trim();
  if (q) labels.push(`Texto: “${q}”`);
  if (selectedZone) labels.push(`Zona: ${selectedZone}`);
  activeFiltersNode.textContent = labels.length ? `Filtros activos · ${labels.join(' · ')}` : '';
}

function applySearchAndFilters() {
  const query = normalize(input.value);
  const hasActiveFilters = Boolean(query || selectedZone);

  statusRowNode.hidden = !hasActiveFilters;
  datasetMetaNode.hidden = !hasActiveFilters;
  searchPromptNode.hidden = hasActiveFilters;

  if (!hasActiveFilters) {
    resultsNode.innerHTML = '';
    countNode.textContent = '';
    activeFiltersNode.textContent = '';
    return;
  }

  let filtered = medicamentos;

  if (selectedZone) {
    filtered = filtered.filter((item) => normalize(parseLocation(item.ubicacion).zoneLabel) === normalize(selectedZone));
  }

  if (!query) {
    const deduped = dedupeForRender(filtered);
    render(deduped);
    updateActiveFiltersText();
    return;
  }

  let ranked = filtered
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || normalize(a.item.nombre).localeCompare(normalize(b.item.nombre)));

  const nameTokenPrefixMatches = ranked.filter((entry) =>
    normalize(entry.item.nombre)
      .split(' ')
      .some((token) => token.startsWith(query))
  );
  if (nameTokenPrefixMatches.length) {
    ranked = nameTokenPrefixMatches;
  } else {
    const nameMatches = ranked.filter((entry) => normalize(entry.item.nombre).includes(query));
    if (nameMatches.length) {
      ranked = nameMatches;
    }
  }

  render(dedupeForRender(ranked.map((entry) => entry.item)), input.value.trim());
  updateActiveFiltersText();
}

function setZoneFilter(zoneLabel) {
  selectedZone = zoneLabel;
  clearZoneFilterButton.hidden = false;

  zoneButtons.forEach((button) => {
    button.classList.toggle('active', normalize(button.dataset.zone) === normalize(zoneLabel));
  });

  applySearchAndFilters();
}

function clearZoneFilter() {
  selectedZone = '';
  clearZoneFilterButton.hidden = true;
  zoneButtons.forEach((button) => button.classList.remove('active'));
  applySearchAndFilters();
}

function updateDatasetMeta() {
  metaCountNode.textContent = String(medicamentos.length);

  const fileInfoDate = document.lastModified ? new Date(document.lastModified) : null;
  if (fileInfoDate && !Number.isNaN(fileInfoDate.getTime())) {
    metaUpdatedNode.textContent = fileInfoDate.toLocaleDateString('es-ES');
  }
}

async function main() {
  const response = await fetch('data/processed/medicamentos.json');
  medicamentos = await response.json();

  updateDatasetMeta();
  applySearchAndFilters();

  input.addEventListener('input', applySearchAndFilters);
  clearButton.addEventListener('click', () => {
    input.value = '';
    input.focus();
    applySearchAndFilters();
  });

  zoneButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setZoneFilter(canonicalZone(button.dataset.zone));
    });
  });

  clearZoneFilterButton.addEventListener('click', clearZoneFilter);
}

main().catch((err) => {
  countNode.textContent = 'Error cargando datos';
  console.error(err);
});
