/* dashboard.js — Mapa 3D Mapbox GL JS Standard style
   Flujo: init → dusk preset → buildings-hit invisible → industrial/empresas →
          búsqueda geocode → click edificio → popup → /estudio */

const DEFAULT_LAT = 40.3456;
const DEFAULT_LON = -1.1065;
const DEFAULT_ZOOM = 16.2;
const PITCH_3D    = 52;
const BEARING_3D  = -18;
const OVERPASS_MIN_ZOOM = 14;
const BUILDING_HEIGHT   = 10;

mapboxgl.accessToken = window.__SYMBIOSIS.mapboxToken;

// Calcula el área en m² de un anillo GeoJSON [[lon,lat],...] con corrección Mercator
function _calcAreaM2(ring, refLat) {
  const cosLat = Math.cos(refLat * Math.PI / 180);
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j  = (i + 1) % n;
    const xi = ring[i][0] * cosLat * 111320;
    const yi = ring[i][1] * 111320;
    const xj = ring[j][0] * cosLat * 111320;
    const yj = ring[j][1] * 111320;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

const map = new mapboxgl.Map({
  container:    'map',
  style:        'mapbox://styles/mapbox/standard',
  center:       [DEFAULT_LON, DEFAULT_LAT],
  zoom:         DEFAULT_ZOOM,
  pitch:        PITCH_3D,
  bearing:      BEARING_3D,
  antialias:    true,
  maxZoom:      21,
  fadeDuration: 150,   // tiles aparecen casi al instante (default: 300ms)
});

map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

const popup = new mapboxgl.Popup({
  maxWidth:    '320px',
  className:   'symbiо-popup',
  closeButton: true,
  closeOnClick: false,
});

const claimedLocations = [];
let industrialFeatures = [];

// ── Carga del mapa ────────────────────────────────────────────────────────────
map.on('load', () => {
  // Standard style v3 — lightPreset 'dusk' da el efecto de maqueta arquitectónica
  // con sombras reales, iluminación direccional y atmósfera crepuscular
  try {
    map.setConfigProperty('basemap', 'lightPreset', 'dusk');
    map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
    map.setConfigProperty('basemap', 'showTransitLabels', false);
  } catch (_) {}

  // streets-v8 proporciona polígonos de edificios para detección de clics.
  // El Standard style renderiza los edificios internamente con su propia
  // iluminación, así que solo necesitamos una capa invisible encima.
  map.addSource('streets-v8', {
    type: 'vector',
    url:  'mapbox://mapbox.mapbox-streets-v8',
  });

  map.addLayer({
    id:     'buildings-hit',
    type:   'fill-extrusion',
    source: 'streets-v8',
    'source-layer': 'building',
    paint: {
      'fill-extrusion-color':  '#ffffff',
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'],
        14, 0,
        15, ['coalesce', ['get', 'height'], ['get', 'render_height'], 10],
      ],
      'fill-extrusion-base': [
        'interpolate', ['linear'], ['zoom'],
        14, 0,
        15, ['coalesce', ['get', 'min_height'], 0],
      ],
      'fill-extrusion-opacity': 0.001,
    },
  });

  _addIndustrialLayers();

  // Esperar a que el mapa esté completamente renderizado antes de
  // lanzar llamadas externas — el usuario ve el mapa primero
  map.once('idle', async () => {
    map.easeTo({ pitch: PITCH_3D, bearing: BEARING_3D, duration: 1800, easing: t => 1 - Math.pow(1 - t, 3) });
    await loadRegisteredCompanies();
    _renderMyBuildings();
    loadBuildingsInView();
  });
});

map.on('moveend', loadBuildingsInView);
map.on('click', _handleMapClick);

map.on('mouseenter', 'buildings-hit', () => { map.getCanvas().style.cursor = 'crosshair'; });
map.on('mouseleave', 'buildings-hit', () => { map.getCanvas().style.cursor = ''; });

// ── Capa de edificios industriales (Overpass) ─────────────────────────────────
function _addIndustrialLayers() {
  map.addSource('industrial-buildings', {
    type:       'geojson',
    data:       { type: 'FeatureCollection', features: [] },
    generateId: true,
  });

  map.addLayer({
    id:     'industrial-3d',
    type:   'fill-extrusion',
    source: 'industrial-buildings',
    paint: {
      'fill-extrusion-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], '#f45d48',
        ['boolean', ['get', 'claimed'], false],          '#f45d48',
        '#0a9090',
      ],
      'fill-extrusion-height':  BUILDING_HEIGHT,
      'fill-extrusion-base':    0,
      'fill-extrusion-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 0.95,
        0.82,
      ],
    },
  });

  map.addLayer({
    id:     'industrial-outline',
    type:   'line',
    source: 'industrial-buildings',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['get', 'claimed'], false], '#f45d48',
        '#0a9090',
      ],
      'line-width':   1.5,
      'line-opacity': 0.75,
    },
  });

  let hoveredId = null;

  map.on('mousemove', 'industrial-3d', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    if (e.features.length > 0) {
      if (hoveredId !== null) map.setFeatureState({ source: 'industrial-buildings', id: hoveredId }, { hover: false });
      hoveredId = e.features[0].id;
      map.setFeatureState({ source: 'industrial-buildings', id: hoveredId }, { hover: true });
    }
  });

  map.on('mouseleave', 'industrial-3d', () => {
    map.getCanvas().style.cursor = '';
    if (hoveredId !== null) map.setFeatureState({ source: 'industrial-buildings', id: hoveredId }, { hover: false });
    hoveredId = null;
  });

  map.on('click', 'industrial-3d', (e) => {
    e.preventDefault();
    const props = e.features[0].properties;
    const geom  = e.features[0].geometry;
    let areaM2 = null;
    const heightM = Number(props.height) || Number(props.render_height) || 10;
    if (geom?.coordinates?.[0]?.length >= 3) {
      let ring = geom.coordinates[0];
      if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
        ring = ring.slice(0, -1);
      }
      areaM2 = _calcAreaM2(ring, e.lngLat.lat);
      const footprint = ring.map(c => ({ lat: c[1], lon: c[0] }));
      const shape = { footprint, height: heightM, min_height: Number(props.min_height) || 0 };
      try {
        localStorage.setItem('symbio_building_shape', JSON.stringify(shape));
        sessionStorage.setItem('symbio_footprint', JSON.stringify(footprint));
      } catch {}
    }
    openBuildingPopup(e.lngLat.lat, e.lngLat.lng, props.name, props.claimed, areaM2, heightM);
  });
}

// ── Cargar empresas registradas en claimedLocations ──────────────────────────
// Popula claimedLocations para que loadBuildingsInView marque edificios claimed.
// Los puntos coral fueron eliminados del mapa (diseño), pero los datos se
// siguen necesitando para el color coral de edificios reclamados en industrial-3d.
async function loadRegisteredCompanies() {
  try {
    const res  = await fetch('/api/companies');
    if (!res.ok) return;
    const data = await res.json();

    claimedLocations.length = 0;
    const userId = window.__SYMBIOSIS?.loggedIn ? window.__SYMBIOSIS?.userId : null;
    const myCos = [];
    (data.companies || []).forEach(c => {
      if (c.lat != null && c.lon != null) {
        claimedLocations.push({ lat: c.lat, lon: c.lon, name: c.name });
        if (userId != null && c.user_id === userId) myCos.push(c);
      }
    });
    window.__SYMBIOSIS.myCompanies = myCos;
  } catch (_) {}
}

// ── Cargar edificios industriales (Overpass) ──────────────────────────────────
const loadedBBoxes = new Set();

async function loadBuildingsInView() {
  if (map.getZoom() < OVERPASS_MIN_ZOOM) return;

  const bounds = map.getBounds();
  const s = bounds.getSouth().toFixed(3);
  const w = bounds.getWest().toFixed(3);
  const n = bounds.getNorth().toFixed(3);
  const e = bounds.getEast().toFixed(3);
  const bboxKey = `${s},${w},${n},${e}`;
  if (loadedBBoxes.has(bboxKey)) return;
  loadedBBoxes.add(bboxKey);

  try {
    const query = `[out:json][timeout:10];
      (way(${s},${w},${n},${e})["building"];
       relation(${s},${w},${n},${e})["building"];);
      out geom;`;

    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const data = await res.json();

    const currentFeatures = [...industrialFeatures];

    const newFeatures = (data.elements || [])
      .filter(el => el.geometry?.length >= 3)
      .map(el => {
        const coords = el.geometry.map(pt => [pt.lon, pt.lat]);
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
          coords.push(coords[0]);
        }
        const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
        const centLon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
        const claimed = _nearClaimed(centLat, centLon);
        return {
          type:     'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: {
            name:      el.tags?.name || el.tags?.['addr:street'] || 'Edificio',
            claimed:   !!claimed,
            claimedBy: claimed?.name || null,
            centLat, centLon,
          },
        };
      });

    const merged = [...currentFeatures, ...newFeatures];
    industrialFeatures = merged;
    map.getSource('industrial-buildings').setData({
      type: 'FeatureCollection',
      features: merged,
    });
  } catch (err) {
    console.error('Error al cargar edificios Overpass:', err);
  }
}

function _nearClaimed(lat, lon) {
  const THRESH = 0.0005;
  return claimedLocations.find(c => Math.abs(c.lat - lat) < THRESH && Math.abs(c.lon - lon) < THRESH) || null;
}

// ── Refrescar edificios claimed en el mapa ────────────────────────────────────
function _refreshClaimedBuildings() {
  for (const f of industrialFeatures) {
    const props = f.properties || {};
    if (props.centLat != null && props.centLon != null) {
      const claimed = _nearClaimed(props.centLat, props.centLon);
      props.claimed = !!claimed;
      props.claimedBy = claimed?.name || null;
    }
  }
  const src = map.getSource('industrial-buildings');
  if (src) src.setData({ type: 'FeatureCollection', features: industrialFeatures });
}

// ── Renderizar "Mis naves" ───────────────────────────────────────────────────
function _renderMyBuildings() {
  const container = document.getElementById('my-buildings-list');
  if (!container) return;

  const loggedIn = window.__SYMBIOSIS?.loggedIn;
  const myCos    = window.__SYMBIOSIS?.myCompanies || [];

  if (!loggedIn || myCos.length === 0) {
    container.innerHTML = '<div class="my-buildings__empty">Aún no tienes naves registradas.</div>';
    document.querySelector('.my-buildings-section')?.classList.add('my-buildings-section--empty');
    return;
  }

  document.querySelector('.my-buildings-section')?.classList.remove('my-buildings-section--empty');
  container.innerHTML = myCos.map(c => `
    <div class="my-buildings__item">
      <span class="my-buildings__item-name">${c.name}</span>
      <button class="my-buildings__item-btn" data-lat="${c.lat}" data-lon="${c.lon}">Ver →</button>
    </div>
  `).join('');

  container.querySelectorAll('.my-buildings__item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat = parseFloat(btn.dataset.lat);
      const lon = parseFloat(btn.dataset.lon);
      map.flyTo({ center: [lon, lat], zoom: 17, pitch: PITCH_3D, bearing: BEARING_3D, duration: 1200 });
    });
  });
}

// ── Toggle "Mis naves" ───────────────────────────────────────────────────────
function _initMyBuildingsToggle() {
  const header = document.querySelector('.my-buildings-section__header');
  const body   = document.querySelector('.my-buildings-section__body');
  if (!header || !body) return;

  header.addEventListener('click', () => {
    body.classList.toggle('my-buildings-section__body--open');
    header.classList.toggle('my-buildings-section__header--open');
  });
  body.classList.add('my-buildings-section__body--open');
  header.classList.add('my-buildings-section__header--open');
}

// ── Click genérico en el mapa ─────────────────────────────────────────────────
function _handleMapClick(e) {
  // Industrial/registered layers have their own event listeners
  const specific = map.queryRenderedFeatures(e.point, { layers: ['industrial-3d', 'registered-dots'] });
  if (specific.length > 0) return;

  // Only show popup when clicking an actual building (buildings-hit is the dedicated hit-test layer)
  const buildingHit = map.queryRenderedFeatures(e.point, { layers: ['buildings-hit'] });
  if (!buildingHit.length) return;

  const feature = buildingHit[0];

  // Capture real building polygon from Mapbox vector tile and persist for the 3D viewer
  const geom = feature.geometry;
  let areaM2 = null;
  const heightM = Number(feature.properties?.height) || Number(feature.properties?.render_height) || 10;
  if (geom?.coordinates?.[0]?.length >= 3) {
    let ring = geom.coordinates[0];
    if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
      ring = ring.slice(0, -1);
    }
    areaM2 = _calcAreaM2(ring, e.lngLat.lat);
    const shape = {
      footprint:  ring.map(c => ({ lat: c[1], lon: c[0] })),
      height:     heightM,
      min_height: Number(feature.properties?.min_height) || 0,
    };
    try { localStorage.setItem('symbio_building_shape', JSON.stringify(shape)); } catch {}
  }

  const name = feature.properties?.name || null;
  openBuildingPopup(e.lngLat.lat, e.lngLat.lng, name, false, areaM2, heightM);
}

// ── Registro AJAX de empresa desde popup ──────────────────────────────────────
async function _claimBuilding(lat, lng) {
  const btn = document.getElementById('btn-claim');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }
  const companyName = window.__SYMBIOSIS?.userCompany || 'Mi Empresa';
  try {
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: companyName, lat, lon: lng }),
    });
    const data = await res.json();
    if (res.ok) {
      const badge = document.createElement('span');
      badge.className = 'building-popup__badge building-popup__badge--claimed';
      badge.textContent = data.updated ? `Empresa actualizada ✓` : `Empresa registrada ✓`;
      btn?.replaceWith(badge);
      await loadRegisteredCompanies();
      _refreshClaimedBuildings();
      _renderMyBuildings();
    } else if (res.status === 409) {
      if (btn) { btn.disabled = false; btn.textContent = `Ya reclamado: ${data.registered_by}`; }
    } else if (res.status === 401) {
      window.location.href = '/login';
    } else {
      if (btn) { btn.disabled = false; btn.textContent = data.error || 'Error al registrar'; }
    }
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = 'Error de red. Reintenta.'; }
  }
}

// ── Popup de edificio ─────────────────────────────────────────────────────────
function openBuildingPopup(lat, lng, name, claimed, areaM2 = null, heightM = null) {
  const latStr = lat.toFixed(6);
  const lonStr = lng.toFixed(6);

  popup.setLngLat([lng, lat]).setHTML(`
    <div class="building-popup">
      <div class="building-popup__loading">
        <div class="building-popup__spinner"></div>
        <span class="building-popup__loading-label">SymbioEnergia IA</span>
        <span class="building-popup__loading-sub">Calculando potencial solar real…</span>
      </div>
    </div>`).addTo(map);

  // Pasar área y altura reales del vector tile para que la API no use simulación
  let apiUrl = `/api/building-summary?lat=${latStr}&lon=${lonStr}`;
  if (areaM2 && areaM2 > 10) apiUrl += `&area_m2=${Math.round(areaM2)}`;
  if (heightM)               apiUrl += `&height_m=${Math.round(heightM)}`;
  if (name)                  apiUrl += `&name=${encodeURIComponent(name)}`;

  fetch(apiUrl)
    .then(r => {
      if (r.status === 429) throw Object.assign(new Error('rate-limit'), { is429: true });
      return r.json();
    })
    .then(data => {
      if (data.error) throw new Error(data.error);
      const fmt    = n => new Intl.NumberFormat('es-ES').format(n);
      const fmtEur = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
      const isClaimed = !!data.registered_by;
      const loggedIn  = window.__SYMBIOSIS?.loggedIn;

      const statusBadge = isClaimed
        ? `<span class="building-popup__badge building-popup__badge--claimed">Reclamado · ${data.registered_by.name}</span>`
        : `<span class="building-popup__badge building-popup__badge--free">Disponible</span>`;

      const claimCta = isClaimed ? ''
        : loggedIn
          ? `<button onclick="_claimBuilding(${lat},${lng})" id="btn-claim" class="building-popup__cta building-popup__cta--claim">Registrar mi empresa aquí →</button>`
          : `<a href="/registro" class="building-popup__cta building-popup__cta--claim">¿Tu empresa aquí? Regístrate →</a>`;

      const odsHtml = (data.ods || []).map(o =>
        `<span class="building-popup__ods-badge" style="border-color:${o.color};color:${o.color}" title="${o.label}">${o.num}</span>`
      ).join('');

      // Área: usar la del vector tile si está disponible (más precisa)
      const displayArea = areaM2 && areaM2 > 10 ? Math.round(areaM2) : Math.round(data.total_area_m2);

      popup.setHTML(`
        <div class="building-popup">
          <div class="building-popup__header">
            <span class="building-popup__name">${data.building_name}</span>
            <span class="building-popup__area">${fmt(displayArea)} m²</span>
          </div>
          ${statusBadge}
          <div class="building-popup__metrics">
            <div class="building-popup__metric">
              <span class="building-popup__metric-label">Potencial solar</span>
              <span class="building-popup__metric-value">${fmt(data.solar_kwh_year)} kWh/año</span>
            </div>
            <div class="building-popup__metric">
              <span class="building-popup__metric-label">Paneles estimados</span>
              <span class="building-popup__metric-value">${fmt(data.panel_count)} uds.</span>
            </div>
            <div class="building-popup__metric">
              <span class="building-popup__metric-label">Ahorro CO₂/año</span>
              <span class="building-popup__metric-value">${data.co2_savings_t} t CO₂</span>
            </div>
            <div class="building-popup__metric">
              <span class="building-popup__metric-label">Subvención máx.</span>
              <span class="building-popup__metric-value">${fmtEur(data.subsidy_max_eur)}</span>
            </div>
          </div>
          ${odsHtml ? `<div class="building-popup__ods">${odsHtml}</div>` : ''}
          <div class="building-popup__footer">
            <a href="/estudio?lat=${latStr}&lon=${lonStr}" class="building-popup__cta">Ver análisis completo →</a>
            ${claimCta}
          </div>
        </div>`);
    })
    .catch(err => {
      const msg = err.is429
        ? 'Demasiadas consultas seguidas. Espera unos segundos y vuelve a hacer clic.'
        : 'No se pudo cargar el análisis.';
      popup.setHTML(`
        <div class="building-popup">
          <div class="building-popup__error">
            ${msg}
            <a href="/estudio?lat=${latStr}&lon=${lonStr}">Ir a estudio →</a>
          </div>
        </div>`);
    });
}

// ── Búsqueda M3 ───────────────────────────────────────────────────────────────
const searchInput   = document.getElementById('search-input');
const searchBtn     = document.getElementById('search-btn');
const searchClear   = document.getElementById('search-clear');
const searchResults = document.getElementById('search-results');

function _syncClearBtn() {
  searchClear.classList.toggle('hidden', searchInput.value.length === 0);
}

searchInput.addEventListener('input', _syncClearBtn);

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchResults.innerHTML = '';
  searchResults.classList.add('hidden');
  searchClear.classList.add('hidden');
  searchInput.focus();
});

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query || query.length < 3) return;

  searchBtn.disabled = true;

  try {
    const res    = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const result = await res.json();
    searchResults.innerHTML = '';

    if (result.source === 'error' || result.lat === null) {
      const empty = document.createElement('li');
      empty.className  = 'search-result-item';
      empty.textContent = 'Sin resultados';
      empty.setAttribute('role', 'option');
      searchResults.appendChild(empty);
      searchResults.classList.remove('hidden');
      return;
    }

    const item = document.createElement('li');
    item.className   = 'search-result-item';
    item.textContent = result.formatted_address || query;
    item.setAttribute('role', 'option');
    item.addEventListener('click', () => {
      map.flyTo({ center: [result.lon, result.lat], zoom: 17, pitch: PITCH_3D, bearing: BEARING_3D, duration: 1600 });
      searchResults.classList.add('hidden');
    });
    searchResults.appendChild(item);
    searchResults.classList.remove('hidden');
  } catch (err) {
    console.error('Error de geocodificación:', err);
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') performSearch(); });
document.addEventListener('click', e => { if (!e.target.closest('.search-m3')) searchResults.classList.add('hidden'); });

// ── Toggle 3D / 2D ────────────────────────────────────────────────────────────
document.getElementById('btn-3d').addEventListener('click', function () {
  this.classList.add('map-controls__btn--active');
  document.getElementById('btn-2d').classList.remove('map-controls__btn--active');
  map.easeTo({ pitch: PITCH_3D, bearing: BEARING_3D, duration: 800 });
});

document.getElementById('btn-2d').addEventListener('click', function () {
  this.classList.add('map-controls__btn--active');
  document.getElementById('btn-3d').classList.remove('map-controls__btn--active');
  map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
});

// ── Init "Mis naves" ─────────────────────────────────────────────────────────
_initMyBuildingsToggle();
