// regulatory.js — Agente Normativa

const LAT_DEFAULT = 40.364;
const LON_DEFAULT = -1.102;

const urlParams = new URLSearchParams(location.search);
const lat = parseFloat(urlParams.get('lat') || LAT_DEFAULT);
const lon = parseFloat(urlParams.get('lon') || LON_DEFAULT);

document.getElementById('coords-display').textContent = `📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}`;

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function fmtEur(val) {
  return val != null ? eurFmt.format(val) : '--';
}

function subsidyAmount(s) {
  return s.importe_max
    ? `Hasta ${fmtEur(s.importe_max)}`
    : `Hasta ${s.porcentaje_max}%`;
}

function renderSubsidies(subsidies) {
  const badge = document.getElementById('subsidy-count-badge');
  if (badge) badge.textContent = `${subsidies.length} activa${subsidies.length !== 1 ? 's' : ''}`;

  document.getElementById('subsidy-list').innerHTML = subsidies.map(s => {
    const pctW = Math.min(s.porcentaje_max || 0, 100);
    const isOpen = !(s.estado || '').toLowerCase().includes('cerr');
    return `
    <div class="subsidy-card">
      <div class="subsidy-card__header">
        <span class="subsidy-card__name">${s.nombre}</span>
        <span class="subsidy-card__amount">${subsidyAmount(s)}</span>
      </div>
      <div class="subsidy-card__type">${s.tipo} · <span style="color:${isOpen ? '#065f46' : '#9a1b0f'}">${s.estado}</span></div>
      <div class="subsidy-card__desc">${s.descripcion}</div>
      <div class="subsidy-card__source">${s.fuente}</div>
      <div class="subsidy-card__bar" style="width:${pctW}%"></div>
    </div>`;
  }).join('');
}

function renderEuProjects(projects, maxEur) {
  if (!projects || projects.length === 0) return;
  const section = document.getElementById('eu-section');
  if (section) section.style.display = '';

  const statEu = document.getElementById('norm-stat-eu');
  if (statEu) statEu.textContent = fmtEur(maxEur) + ' €';

  document.getElementById('eu-projects-list').innerHTML = projects.map(p => {
    const limit = p.importe_max ? `hasta ${fmtEur(p.importe_max)} €` : `${p.porcentaje_max}% sin tope`;
    return `
    <div class="eu-proj-card">
      <div class="eu-proj-card__header">
        <span class="eu-proj-card__name">${p.nombre}</span>
        <span class="eu-proj-card__pct">${p.porcentaje_max}% · ${limit}</span>
      </div>
      <p class="eu-proj-card__desc">${p.descripcion}</p>
      <div class="eu-proj-card__footer">
        <span>${(p.ods || []).map(o => `ODS ${o}`).join(' · ')}</span>
        <span class="eu-proj-card__status">${p.estado}</span>
      </div>
    </div>`;
  }).join('');
}

function renderFooter(data) {
  document.getElementById('data-footer').innerHTML = `
    <span class="agent-badge agent-badge--source">📡 ${data.data_source}</span>
    <span class="agent-badge agent-badge--alta">Confianza: ${data.confidence_level}</span>
  `;
}

function renderResults(data) {
  document.getElementById('max-subsidy').textContent = fmtEur(data.max_subsidy_amount_cap_eur);
  document.getElementById('regional-status').textContent = data.regional_status;

  // Stats row
  const subs = data.eligible_subsidies || [];
  const eu   = data.european_projects || [];
  const countEl  = document.getElementById('norm-stat-count');
  const maxEl    = document.getElementById('norm-stat-max');
  const euEl     = document.getElementById('norm-stat-eu');
  const regionEl = document.getElementById('norm-stat-region');
  if (countEl)  countEl.textContent  = subs.length;
  if (maxEl)    maxEl.textContent    = fmtEur(data.max_subsidy_amount_cap_eur) + ' €';
  if (euEl)     euEl.textContent     = eu.length ? eu.length + ' prog.' : '—';
  if (regionEl) regionEl.textContent = data.regional_status || '—';

  renderSubsidies(subs);
  renderEuProjects(eu, data.european_max_eur);
  document.getElementById('results').classList.remove('hidden');
  renderFooter(data);
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = `Error al obtener datos: ${msg}`;
  el.classList.remove('hidden');
}

async function loadAnalysis() {
  try {
    const res = await fetch(`/api/regulatory?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderResults(await res.json());
  } catch (err) {
    showError(err.message);
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

loadAnalysis();
