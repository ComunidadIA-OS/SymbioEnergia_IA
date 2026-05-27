// geo.js — Agente Geo-Scanner

const LAT_DEFAULT = 40.364;
const LON_DEFAULT = -1.102;

const urlParams = new URLSearchParams(location.search);
const lat = parseFloat(urlParams.get('lat') || LAT_DEFAULT);
const lon = parseFloat(urlParams.get('lon') || LON_DEFAULT);

document.getElementById('coords-display').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

function fmt(val, decimals = 1) {
  return val != null ? Number(val).toFixed(decimals) : '--';
}

function fmtInt(val) {
  return val != null ? Math.round(Number(val)).toLocaleString('es-ES') : '--';
}

// Convierte azimut en texto de punto cardinal
function azimutToText(deg) {
  const dirs = ['Norte','Norte-NE','Noreste','Este-NE','Este','Este-SE','Sureste','Sur-SE',
                 'Sur','Sur-SO','Suroeste','Oeste-SO','Oeste','Oeste-NO','Noroeste','Norte-NO'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

// Calcula eficiencia orientación+pendiente respecto al óptimo (S, 30-35°)
function solarEfficiency(orientDeg, slopeDeg) {
  const oNorm = ((orientDeg % 360) + 360) % 360;
  const diffO = Math.min(Math.abs(oNorm - 180), 360 - Math.abs(oNorm - 180));
  const orientFactor = Math.cos(diffO * Math.PI / 180);
  const optSlope = 33;
  const diffS = Math.abs(slopeDeg - optSlope);
  const slopeFactor = Math.max(0, 1 - diffS / 45);
  const pct = Math.round(orientFactor * slopeFactor * 100);
  if (pct >= 85) return { pct, label: 'Excelente', color: '#078080' };
  if (pct >= 60) return { pct, label: 'Buena',     color: '#4ade80' };
  if (pct >= 35) return { pct, label: 'Aceptable', color: '#f9c74f' };
  return             { pct, label: 'Subóptima',    color: '#f87171' };
}

function drawTerrain(slopeDeg, orientDeg) {
  const canvas = document.getElementById('terrain-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  ctx.scale(dpr, dpr);
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1117');
  bg.addColorStop(1, '#0a0e1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  const compassCY = H * 0.42;
  const compassR  = Math.min(W, H * 0.84) * 0.34;
  const cx        = W / 2;

  // ── Compass outer ring ──
  ctx.beginPath();
  ctx.arc(cx, compassCY, compassR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, compassCY, compassR * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.stroke();

  // Tick marks every 45°
  for (let a = 0; a < 360; a += 45) {
    const rad = (a - 90) * Math.PI / 180;
    const inner = compassR * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * inner,      compassCY + Math.sin(rad) * inner);
    ctx.lineTo(cx + Math.cos(rad) * compassR,   compassCY + Math.sin(rad) * compassR);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = a % 90 === 0 ? 1.5 : 0.8;
    ctx.stroke();
  }

  // Cardinal labels
  const labels = [['N',0],['E',90],['S',180],['O',270]];
  ctx.font = `bold ${Math.round(compassR * 0.22)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [lbl, deg] of labels) {
    const rad  = (deg - 90) * Math.PI / 180;
    const dist = compassR * 1.18;
    const isSouth = deg === 180;
    ctx.fillStyle = isSouth ? '#4cc9f0' : 'rgba(255,255,255,0.45)';
    ctx.fillText(lbl, cx + Math.cos(rad) * dist, compassCY + Math.sin(rad) * dist);
  }

  // "Sur = óptimo" arc highlight
  const sOptRad = (180 - 90) * Math.PI / 180;
  ctx.beginPath();
  ctx.arc(cx, compassCY, compassR * 0.72, sOptRad - 0.35, sOptRad + 0.35);
  ctx.strokeStyle = 'rgba(76,201,240,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Orientation arrow
  const arrowRad = ((orientDeg - 90 + 360) % 360) * Math.PI / 180;
  const eff = solarEfficiency(orientDeg, slopeDeg);
  const arrowColor = eff.color;

  ctx.save();
  ctx.shadowBlur  = 12;
  ctx.shadowColor = arrowColor;

  // Arrow shaft
  ctx.beginPath();
  ctx.moveTo(cx, compassCY);
  ctx.lineTo(cx + Math.cos(arrowRad) * compassR * 0.68, compassCY + Math.sin(arrowRad) * compassR * 0.68);
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Arrow head
  const tipX = cx + Math.cos(arrowRad) * compassR * 0.68;
  const tipY = compassCY + Math.sin(arrowRad) * compassR * 0.68;
  const headLen = compassR * 0.14;
  const headAngle = 0.45;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - Math.cos(arrowRad - headAngle) * headLen, tipY - Math.sin(arrowRad - headAngle) * headLen);
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - Math.cos(arrowRad + headAngle) * headLen, tipY - Math.sin(arrowRad + headAngle) * headLen);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, compassCY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = arrowColor;
  ctx.fill();
  ctx.restore();

  // Azimut degrees label inside compass
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `${Math.round(compassR * 0.19)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(orientDeg)}°`, cx, compassCY + compassR * 0.35);

  // ── Slope cross-section ──
  const sY       = H * 0.84;
  const sW       = W * 0.72;
  const sX0      = (W - sW) / 2;
  const slopePx  = Math.tan(Math.min(slopeDeg, 60) * Math.PI / 180) * sW * 0.45;
  const optPx    = Math.tan(32 * Math.PI / 180) * sW * 0.45;

  // Optimal slope line (dashed, teal)
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(sX0, sY);
  ctx.lineTo(sX0 + sW * 0.45, sY - optPx);
  ctx.strokeStyle = 'rgba(76,201,240,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.setLineDash([]);

  // Ground line
  ctx.beginPath();
  ctx.moveTo(sX0, sY);
  ctx.lineTo(sX0 + sW, sY);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Actual roof slope
  ctx.save();
  ctx.shadowBlur  = 8;
  ctx.shadowColor = arrowColor;
  ctx.beginPath();
  ctx.moveTo(sX0, sY);
  ctx.lineTo(sX0 + sW * 0.45, sY - slopePx);
  ctx.lineTo(sX0 + sW, sY);
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // Slope angle arc
  const arcR = sW * 0.12;
  ctx.beginPath();
  ctx.arc(sX0, sY, arcR, -Math.atan2(slopePx, sW * 0.45), 0);
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Slope label
  ctx.fillStyle = arrowColor;
  ctx.font = `bold ${Math.round(compassR * 0.18)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${Math.round(slopeDeg)}°`, sX0 + arcR + 4, sY - 3);

  // "Óptimo 32°" label
  ctx.fillStyle = 'rgba(76,201,240,0.45)';
  ctx.font = `${Math.round(compassR * 0.14)}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('óptimo 32°', sX0 + arcR * 1.8 + 4, sY - 3);
}

function renderFooter(data) {
  const confClass = data.confidence_level?.startsWith('alta') ? 'alta' : 'media';
  let extra = '';
  if (data.location?.municipio) {
    extra += `<span class="agent-badge agent-badge--source">📍 ${data.location.municipio}, ${data.location.provincia}</span>`;
  }
  if (data.province?.nombre) {
    extra += `<span class="agent-badge agent-badge--accent">🗺️ ${data.province.nombre}</span>`;
  }
  document.getElementById('data-footer').innerHTML = `
    <span class="agent-badge agent-badge--source">📡 ${data.data_source}</span>
    <span class="agent-badge agent-badge--${confClass}">Confianza: ${data.confidence_level}</span>
    ${extra}
  `;
}

function drawLidar(points) {
  const canvas = document.getElementById('lidar-canvas');
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  ctx.scale(dpr, dpr);

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  // Dark background with subtle gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1117');
  bg.addColorStop(1, '#0a0e1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const gridStep = 40;
  for (let x = 0; x <= W; x += gridStep) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += gridStep) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  if (!points || points.length === 0) return;

  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const zs = points.map(p => p[2]);

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const zRange = maxZ - minZ || 1;

  const padding = 28;
  const scaleX = (W - padding * 2) / (maxX - minX || 1);
  const scaleY = (H - padding * 2) / (maxY - minY || 1);
  const scale  = Math.min(scaleX, scaleY);

  const offsetX = padding + ((W - padding * 2) - (maxX - minX) * scale) / 2;
  const offsetY = padding + ((H - padding * 2) - (maxY - minY) * scale) / 2;

  for (const [x, y, z] of points) {
    const cx = offsetX + (x - minX) * scale;
    const cy = offsetY + (maxY - y) * scale;
    const zNorm = (z - minZ) / zRange;

    let r, g, b, alpha, radius;

    if (zNorm < 0.05) {
      // Ground
      r = 74; g = 85; b = 104; alpha = 0.45; radius = 1.2;
    } else if (zNorm < 0.75) {
      // Walls — blue gradient
      const t = (zNorm - 0.05) / 0.7;
      r = Math.round(14  + t * 45);
      g = Math.round(165 + t * -35);
      b = Math.round(233 + t * 13);
      alpha = 0.5 + zNorm * 0.35;
      radius = 1.5;
    } else {
      // Roof — leaf green / gold glow
      const t = (zNorm - 0.75) / 0.25;
      r = Math.round(7  + t * (245 - 7));
      g = Math.round(128 + t * (191 - 128));
      b = Math.round(128 + t * (11  - 128));
      alpha = 0.75 + zNorm * 0.25;
      radius = 2 + t * 1;
    }

    // Glow for high points
    if (zNorm > 0.75) {
      ctx.shadowBlur  = 6;
      ctx.shadowColor = `rgba(${r},${g},${b},0.5)`;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

function renderResults(data) {
  document.getElementById('building-name').textContent  = data.building_name || 'Edificio Industrial';
  document.getElementById('usable-area').textContent    = fmtInt(data.usable_area_m2);
  document.getElementById('total-area').textContent     = fmtInt(data.total_area_m2);
  document.getElementById('height').textContent         = fmt(data.building_height_m);
  document.getElementById('slope').textContent          = fmt(data.roof_slope_deg);
  document.getElementById('orientation').textContent    = fmt(data.roof_orientation_deg, 0);
  document.getElementById('solar-capacity').textContent = fmt(data.solar_capacity_kwp);

  // Utilization bar
  const pct = data.total_area_m2 && data.usable_area_m2
    ? Math.round(data.usable_area_m2 / data.total_area_m2 * 100)
    : 82;
  const utilBar = document.getElementById('util-bar');
  const utilPct = document.getElementById('util-pct');
  if (utilBar) requestAnimationFrame(() => { utilBar.style.width = `${pct}%`; });
  if (utilPct) utilPct.textContent = `· ${pct}% disponible`;

  // Terrain analysis metrics
  const slope  = data.roof_slope_deg    ?? 12;
  const orient = data.roof_orientation_deg ?? 180;
  const eff    = solarEfficiency(orient, slope);
  const orientEl = document.getElementById('terrain-orient-text');
  const slopeEl  = document.getElementById('terrain-slope-text');
  const effEl    = document.getElementById('terrain-efficiency');
  if (orientEl) orientEl.textContent = `${azimutToText(orient)} (${Math.round(orient)}°)`;
  if (slopeEl)  slopeEl.textContent  = `${fmt(slope)}° — ${slope < 20 ? 'plana' : slope < 35 ? 'óptima' : 'pronunciada'}`;
  if (effEl) {
    effEl.textContent = `${eff.pct}% — ${eff.label}`;
    effEl.style.color = eff.color;
  }

  document.getElementById('results').classList.remove('hidden');
  renderFooter(data);

  requestAnimationFrame(() => {
    drawLidar(data.lidar_point_cloud);
    drawTerrain(slope, orient);
  });
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = `Error al obtener datos: ${msg}`;
  el.classList.remove('hidden');
}

async function loadAnalysis() {
  try {
    const res = await fetch(`/api/geo?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderResults(await res.json());
  } catch (err) {
    showError(err.message);
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

loadAnalysis();
