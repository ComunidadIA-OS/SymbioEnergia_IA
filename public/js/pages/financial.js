// financial.js — Agente Financiero

const LAT_DEFAULT = 40.364;
const LON_DEFAULT = -1.102;
const KWH_DEFAULT = 185000;

const urlParams = new URLSearchParams(location.search);
const lat = parseFloat(urlParams.get('lat') || LAT_DEFAULT);
const lon = parseFloat(urlParams.get('lon') || LON_DEFAULT);
const kwh = parseFloat(urlParams.get('kwh') || KWH_DEFAULT);

document.getElementById('coords-display').textContent =
  `${lat.toFixed(5)}, ${lon.toFixed(5)} · ${kwh.toLocaleString('es-ES')} kWh/año`;

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function fmtEur(val) { return val != null ? eurFmt.format(val) : '--'; }
function fmt(val, d = 1) { return val != null ? Number(val).toFixed(d) : '--'; }
function fmtNum(val) { return val != null ? Math.round(val).toLocaleString('es-ES') : '--'; }

function paybackClassify(years) {
  if (years <= 4)  return { label: 'Excelente', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' };
  if (years <= 6)  return { label: 'Muy bueno', color: '#a3e635', bg: 'rgba(163,230,53,0.12)' };
  if (years <= 8)  return { label: 'Bueno',     color: '#f9a825', bg: 'rgba(249,168,37,0.12)' };
  if (years <= 10) return { label: 'Aceptable', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' };
  return                   { label: 'Revisar',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' };
}

function tirClassify(pct) {
  if (pct >= 15) return { label: 'Excelente',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)' };
  if (pct >= 10) return { label: 'Muy buena',  color: '#a3e635', bg: 'rgba(163,230,53,0.12)' };
  if (pct >= 7)  return { label: 'Buena',      color: '#f9a825', bg: 'rgba(249,168,37,0.12)' };
  return                 { label: 'Revisar',   color: '#f87171', bg: 'rgba(248,113,113,0.12)' };
}

function renderTimeline(paybackNet, paybackGross) {
  const HORIZON = 20;
  const netPct   = Math.min((paybackNet   / HORIZON) * 100, 98);
  const grossPct = Math.min((paybackGross / HORIZON) * 100, 98);

  const recovery = document.getElementById('fin-timeline-recovery');
  const netMark  = document.getElementById('fin-timeline-net-mark');
  const grossMark = document.getElementById('fin-timeline-gross-mark');
  const track    = document.getElementById('fin-timeline-track');

  if (!recovery) return;

  const profit = document.getElementById('fin-timeline-profit');
  requestAnimationFrame(() => {
    recovery.style.width = `${netPct}%`;
    if (profit)    profit.style.width   = `${100 - netPct}%`;
    if (netMark)   netMark.style.left   = `calc(${netPct}% - 1.5px)`;
    if (grossMark) grossMark.style.left = `calc(${grossPct}% - 1px)`;
  });
}

function renderResults(data) {
  const paybackNet   = data.payback_years_with_subsidy    ?? 0;
  const paybackGross = data.payback_years_without_subsidy ?? 0;
  const irr          = data.irr_15_years_percent          ?? 0;
  const totalInv     = data.total_investment_eur          ?? 1;
  const subsidyAmt   = data.subsidy_amount_eur            ?? 0;

  // Payback hero
  document.getElementById('payback-net').textContent   = fmt(paybackNet);
  document.getElementById('payback-gross').textContent = fmt(paybackGross);

  const pbCls = paybackClassify(paybackNet);
  const badge = document.getElementById('payback-badge');
  if (badge) {
    badge.textContent       = pbCls.label;
    badge.style.color       = pbCls.color;
    badge.style.borderColor = pbCls.color;
    badge.style.background  = pbCls.bg;
  }

  renderTimeline(paybackNet, paybackGross);

  // Hero KPIs
  document.getElementById('npv').textContent     = fmtEur(data.npv_15_years_eur);
  document.getElementById('irr').textContent     = fmt(irr);
  document.getElementById('savings').textContent = fmtEur(data.annual_savings_net_eur);

  const tirCls = tirClassify(irr);
  const tirBadge = document.getElementById('tir-badge');
  if (tirBadge) {
    tirBadge.textContent       = tirCls.label;
    tirBadge.style.color       = tirCls.color;
    tirBadge.style.borderColor = tirCls.color;
    tirBadge.style.background  = tirCls.bg;
  }

  // Installation
  document.getElementById('capacity').textContent       = fmt(data.recommended_capacity_kwp);
  document.getElementById('generation').textContent     = fmtNum(data.annual_generation_kwh);
  document.getElementById('investment').textContent     = fmtEur(totalInv);
  document.getElementById('subsidy').textContent        = fmtEur(subsidyAmt);
  document.getElementById('net-investment').textContent = fmtEur(data.net_investment_eur);

  // Investment breakdown bar
  const subsidyPct = Math.min((subsidyAmt / totalInv) * 100, 100);
  const invBar = document.getElementById('inv-bar-subsidy');
  if (invBar) requestAnimationFrame(() => { invBar.style.width = `${subsidyPct}%`; });

  // Financing
  const fs = data.financing_scenario;
  if (fs) {
    document.getElementById('loan-amount').textContent  = fmtEur(fs.loan_amount_eur);
    document.getElementById('own-capital').textContent  = fmtEur(fs.own_capital_eur);
    document.getElementById('loan-payment').textContent = fmtEur(fs.annual_loan_payment_eur);
    document.getElementById('loan-period').textContent  = `${fs.loan_period_years} años`;
    document.getElementById('loan-rate').textContent    = `${fs.loan_interest_rate_percent}%`;
  }

  document.getElementById('results').classList.remove('hidden');

  document.getElementById('data-footer').innerHTML = `
    <span class="agent-badge agent-badge--source">📡 ${data.data_source}</span>
    <span class="agent-badge agent-badge--alta">Confianza: ${data.confidence_level}</span>
  `;
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = `Error: ${msg}`;
  el.classList.remove('hidden');
}

async function loadAnalysis() {
  try {
    const res = await fetch(`/api/financial?lat=${lat}&lon=${lon}&kwh=${kwh}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderResults(await res.json());
  } catch (err) {
    showError(err.message);
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

loadAnalysis();
