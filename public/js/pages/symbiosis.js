// symbiosis.js — Red Polígono · Simbiosis

const LAT_DEFAULT = 40.364;
const LON_DEFAULT = -1.102;

const urlParams = new URLSearchParams(location.search);
const lat = parseFloat(urlParams.get('lat') || LAT_DEFAULT);
const lon = parseFloat(urlParams.get('lon') || LON_DEFAULT);
const kwp = parseFloat(urlParams.get('kwp') || 0) || null;

document.getElementById('coords-display').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

function fmtKwh(val) {
  if (val == null) return '--';
  return val >= 1000
    ? `${(val / 1000).toFixed(0)}k`
    : String(Math.round(val));
}

function fmtEur(val) {
  if (val == null) return '--';
  return val >= 1000000
    ? `${(val / 1000000).toFixed(1)}M`
    : val >= 1000
      ? `${(val / 1000).toFixed(0)}k`
      : String(Math.round(val));
}

// ── Interactive Network Map (Leaflet) ───────────────────────────────────

let _networkMap = null;

function renderNetwork(neighbors, originLat, originLon) {
  const mapDiv = document.getElementById('network-map');
  if (!mapDiv) return;

  const oLat = originLat || lat;
  const oLon = originLon || lon;

  if (_networkMap) { _networkMap.remove(); _networkMap = null; }

  const map = L.map('network-map', { zoomControl: true, attributionControl: false }).setView([oLat, oLon], 14);
  _networkMap = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  L.control.attribution({ prefix: false }).addTo(map);

  // ── Origin marker ────────────────────────────────────────────────────────
  const originIcon = L.divIcon({
    html: `<div style="background:#078080;border-radius:50%;width:28px;height:28px;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:900;box-shadow:0 2px 10px rgba(7,128,128,0.5);cursor:default">★</div>`,
    className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16]
  });
  L.marker([oLat, oLon], { icon: originIcon })
    .addTo(map)
    .bindPopup(`<div style="text-align:center"><strong>Tu empresa</strong><br><small>${oLat.toFixed(5)}, ${oLon.toFixed(5)}</small></div>`);

  // ── Neighbor markers + connection lines ──────────────────────────────────
  neighbors.forEach(n => {
    const pct = n.complementarity || 50;
    const color = pct >= 75 ? '#078080' : pct >= 55 ? '#f4a261' : '#f45d48';
    const r = 8 + Math.round(pct / 12);

    L.polyline([[oLat, oLon], [n.lat, n.lon]], {
      color, weight: 1.5 + pct / 50,
      opacity: 0.25 + pct / 130,
      dashArray: '6, 5'
    }).addTo(map);

    const neighborIcon = L.divIcon({
      html: `<div style="background:${color};border-radius:50%;width:${r*2}px;height:${r*2}px;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:10px">${pct}%</div>`,
      className: '', iconSize: [r*2, r*2], iconAnchor: [r, r], popupAnchor: [0, -r-4]
    });

    L.marker([n.lat, n.lon], { icon: neighborIcon })
      .addTo(map)
      .bindPopup(`
        <div style="min-width:170px;line-height:1.5">
          <strong>${n.name}</strong><br>
          <span style="color:#555;font-size:.82em">${n.sector}</span><br>
          <span style="color:${color};font-weight:700">${pct}% compatibilidad</span><br>
          <span style="font-size:.82em">${n.distance_km ?? '?'} km · ${fmtKwh(n.annual_kwh)} kWh/año</span><br>
          <span style="font-size:.78em;color:#777">${n.notes}</span>
        </div>
      `);
  });

  // ── Fit bounds ───────────────────────────────────────────────────────────
  const allLatLons = [[oLat, oLon], ...neighbors.map(n => [n.lat, n.lon])];
  setTimeout(() => {
    map.invalidateSize();
    if (allLatLons.length > 1) {
      map.fitBounds(allLatLons, { padding: [40, 40], maxZoom: 15 });
    }
  }, 50);
}

// ── Autosuficiencia Ring ─────────────────────────────────────────────────

function renderAutosufRing(pct) {
  const ring = document.getElementById('autosuf-ring-fill');
  const label = document.getElementById('autosuf-pct');
  const detail = document.getElementById('autosuf-pct-detail');
  if (!ring) return;

  const circumference = 2 * Math.PI * 50;
  const offset = circumference - (pct / 100) * circumference;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = offset;
  label.textContent = `${Math.round(pct)}%`;
  if (detail) detail.textContent = `${Math.round(pct)}%`;
}

// ── Network Design ───────────────────────────────────────────────────────

function renderNetworkDesign(design) {
  const el = document.getElementById('network-design');
  if (!design) {
    el.innerHTML = '<p class="network-design__empty">Diseño de red no disponible.</p>';
    return;
  }
  el.innerHTML = `
    <div class="network-design__model">${design.model}</div>
    <p class="network-design__desc">${design.description}</p>
    <div class="network-design__specs">
      <div class="network-design__spec">
        <span class="network-design__spec-label">Capacidad total red</span>
        <span class="network-design__spec-value">${fmtKwh(design.total_capacity_kwp)} kWp</span>
      </div>
      <div class="network-design__spec">
        <span class="network-design__spec-label">Marco legal</span>
        <span class="network-design__spec-value">${design.legal_framework}</span>
      </div>
      <div class="network-design__spec">
        <span class="network-design__spec-label">Modelo suscripción</span>
        <span class="network-design__spec-value">${design.subscription_model}</span>
      </div>
    </div>
    <div class="network-design__note ${design.storage_recommended ? 'network-design__note--warn' : 'network-design__note--ok'}">
      ${design.storage_note}
    </div>
  `;
}

// ── Neighbor Cards ───────────────────────────────────────────────────────

function renderNeighbors(neighbors) {
  const list = document.getElementById('neighbor-list');
  if (!neighbors || neighbors.length === 0) {
    list.innerHTML = '<p class="neighbor-list__empty">No se detectaron empresas compatibles en el radio de 5 km.</p>';
    return;
  }
  list.innerHTML = neighbors.map(n => `
    <div class="neighbor-card ${n.registered ? 'neighbor-card--registered' : ''}">
      <div class="neighbor-card__header">
        <div>
          <div class="neighbor-card__name">${n.name}</div>
          <div class="neighbor-card__sector">${n.sector}</div>
        </div>
        <div class="neighbor-card__badge">${n.complementarity}%</div>
      </div>
      <div class="neighbor-card__dist">${n.distance_km ?? '?'} km · ${fmtKwh(n.annual_kwh)} kWh/año</div>
      <div class="neighbor-card__notes">${n.notes}</div>
      ${n.registered ? '<span class="neighbor-card__registered">✓ Registrada en la red</span>' : ''}
    </div>
  `).join('');
}

// ── HRIA ─────────────────────────────────────────────────────────────────

function renderHria(hria) {
  document.getElementById('hria-score').textContent = hria.hria_score ?? '--';
  document.getElementById('hria-transparency').textContent = hria.declaracion_de_transparencia || '';

  document.getElementById('hria-list').innerHTML = (hria.risks_evaluated || []).map(r => `
    <div class="hria-item ${r.impact === 'Medio' ? 'hria-item--medium' : ''}">
      <div class="hria-item__risk">${r.risk}</div>
      <div class="hria-item__impact">Impacto: ${r.impact}</div>
      <div class="hria-item__mitigation">${r.mitigation}</div>
    </div>
  `).join('');
}

// ── Monthly Balance ──────────────────────────────────────────────────────

function openContract() {
  const company = encodeURIComponent(document.title || 'Tu empresa');
  const kwpParam = kwp ? `&kwp=${kwp}` : '';
  window.open(`/contrato-ce?lat=${lat}&lon=${lon}${kwpParam}&company=${company}`, '_blank');
}

function openInvoice() {
  const company = encodeURIComponent(document.title || 'Tu empresa');
  const kwpParam = kwp ? `&kwp=${kwp}` : '';
  window.open(`/factura-mensual?lat=${lat}&lon=${lon}${kwpParam}&company=${company}`, '_blank');
}

function renderMonthlyBalance(balance) {
  const wrap = document.getElementById('balance-table-wrap');
  const summaryEl = document.getElementById('balance-summary');
  if (!balance || !balance.rows || balance.rows.length === 0) {
    wrap.innerHTML = '<p class="balance-empty">Balance mensual no disponible — se necesitan datos PVGIS.</p>';
    return;
  }

  const annualNet = balance.annual_net_kwh;
  const annualEur = balance.annual_monetary_eur;
  const isSurplus = annualNet >= 0;

  summaryEl.innerHTML = `
    <div class="balance-kpi balance-kpi--${isSurplus ? 'surplus' : 'deficit'}">
      <span class="balance-kpi__value">${fmtKwh(Math.abs(annualNet))} kWh</span>
      <span class="balance-kpi__label">${isSurplus ? 'Excedente anual' : 'Compra anual neta'}</span>
    </div>
    <div class="balance-kpi balance-kpi--${isSurplus ? 'surplus' : 'deficit'}">
      <span class="balance-kpi__value">${fmtEur(Math.abs(annualEur))} €</span>
      <span class="balance-kpi__label">${isSurplus ? 'Ingreso anual estimado' : 'Coste anual de compra'}</span>
    </div>
    <div class="balance-kpi">
      <span class="balance-kpi__value">${balance.price_eur_per_kwh} €/kWh</span>
      <span class="balance-kpi__label">Precio de referencia</span>
    </div>
  `;

  const rows = balance.rows.map(r => `
    <tr class="${r.surplus ? 'balance-row--surplus' : 'balance-row--deficit'}">
      <td class="balance-cell--month">${r.month}</td>
      <td class="balance-cell--num">${fmtKwh(r.production_kwh)}</td>
      <td class="balance-cell--num">${fmtKwh(r.consumption_kwh)}</td>
      <td class="balance-cell--num balance-cell--net">${fmtKwh(Math.abs(r.net_kwh))}</td>
      <td class="balance-cell--num balance-cell--eur">${Math.abs(r.monetary_eur).toFixed(0)} €</td>
      <td class="balance-cell--tag">${r.surplus ? '<span class="balance-tag balance-tag--surplus">Excedente</span>' : '<span class="balance-tag balance-tag--deficit">Compra</span>'}</td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="balance-table">
      <thead>
        <tr>
          <th>Mes</th>
          <th>Producción<br><small>kWh</small></th>
          <th>Consumo red<br><small>kWh</small></th>
          <th>Neto<br><small>kWh</small></th>
          <th>Valor<br><small>€</small></th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="balance-note">
      Producción estimada con ${balance.kwp_origin} kWp · Radiación: PVGIS EU-JRC ·
      Precio: ${balance.price_eur_per_kwh} €/kWh (ref. OMIE media anual)
    </p>
  `;
}

// ── Footer ───────────────────────────────────────────────────────────────

function renderFooter(data) {
  const confClass = data.confidence_level?.startsWith('alta') ? 'alta' : 'media';
  document.getElementById('data-footer').innerHTML = `
    <span class="agent-badge agent-badge--source">${data.data_source}</span>
    <span class="agent-badge agent-badge--${confClass}">Confianza: ${data.confidence_level}</span>
  `;
}

// ── Main Render ─────────────────────────────────────────────────────────

function renderResults(data) {
  const neighbors = data.matching_neighbors || [];
  document.getElementById('neighbor-count').textContent = neighbors.length;
  document.getElementById('shared-kwh').textContent = fmtKwh(data.shared_annual_potential_kwh);
  document.getElementById('shared-kwh-detail').textContent = fmtKwh(data.shared_annual_potential_kwh);
  document.getElementById('total-consumption').textContent = fmtKwh(data.total_consumption_kwh);

  const pct = data.autosuficiencia_pct ?? 0;
  renderAutosufRing(pct);
  renderNetworkDesign(data.network_design);
  renderMonthlyBalance(data.monthly_balance);
  renderNeighbors(neighbors);
  if (data.hria_assessment) renderHria(data.hria_assessment);
  renderFooter(data);

  // Mostrar resultados antes de inicializar Leaflet: necesita dimensiones reales del contenedor
  document.getElementById('results').classList.remove('hidden');
  renderNetwork(neighbors, data.origin_lat, data.origin_lon);
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = `Error al obtener datos: ${msg}`;
  el.classList.remove('hidden');
}

async function loadAnalysis() {
  const kwpParam = kwp ? `&kwp=${kwp}` : '';
  try {
    const res = await fetch(`/api/symbiosis?lat=${lat}&lon=${lon}${kwpParam}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderResults(await res.json());
  } catch (err) {
    showError(err.message);
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

loadAnalysis();
