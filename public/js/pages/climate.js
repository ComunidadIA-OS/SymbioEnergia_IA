// climate.js — Agente Clima

const LAT_DEFAULT = 40.364;
const LON_DEFAULT = -1.102;
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const PEAK_IDX = new Set([4,5,6,7,8]);

const urlParams = new URLSearchParams(location.search);
const lat = parseFloat(urlParams.get('lat') || LAT_DEFAULT);
const lon = parseFloat(urlParams.get('lon') || LON_DEFAULT);
const KWP_DEFAULT = parseFloat(urlParams.get('kwp') || 50);

document.getElementById('coords-display').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

function fmt(val, d = 1) { return val != null ? Number(val).toFixed(d) : '--'; }

// Clasifica la producción anual solar de España (800–1800 kWh/kWp)
function solarClassify(kwh) {
  if (kwh >= 1700) return { label: 'Excelente',   color: '#d97706', bg: 'rgba(217,119,6,0.1)' };
  if (kwh >= 1500) return { label: 'Muy buena',   color: '#f9a825', bg: 'rgba(249,168,37,0.1)' };
  if (kwh >= 1200) return { label: 'Buena',        color: '#078080', bg: 'rgba(7,128,128,0.1)' };
  if (kwh >= 1000) return { label: 'Media',        color: '#5a6070', bg: 'rgba(90,96,112,0.1)' };
  return                   { label: 'Baja',         color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
}

// Icono SVG según nubosidad
function skyIcon(cloudPct) {
  if (cloudPct <= 20) return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f9a825" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  if (cloudPct <= 60) return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
  return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
}

function renderChart(monthly) {
  const ctx = document.getElementById('solar-chart').getContext('2d');

  // Color per bar: cool → warm based on value
  const max  = Math.max(...monthly);
  const avg  = monthly.reduce((a, b) => a + b, 0) / monthly.length;

  const barColors = monthly.map(v => {
    const t = max > 0 ? v / max : 0;
    const r = Math.round(226 + t * (217 - 226));
    const g = Math.round(221 + t * (119 - 221));
    const b = Math.round(214 + t * (6   - 214));
    return `rgba(${r},${g},${b},${0.4 + t * 0.55})`;
  });

  const borderColors = monthly.map(v => {
    const t = max > 0 ? v / max : 0;
    const r = Math.round(226 + t * (217 - 226));
    const g = Math.round(221 + t * (119 - 221));
    const b = Math.round(214 + t * (6   - 214));
    return `rgba(${r},${g},${b},1)`;
  });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        {
          label: 'kWh/kWp',
          data: monthly,
          backgroundColor: barColors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 4,
          order: 1,
        },
        {
          label: 'Media',
          data: Array(12).fill(avg),
          type: 'line',
          borderColor: 'rgba(0,0,0,0.18)',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(35,35,35,0.92)',
          borderColor: 'rgba(0,0,0,0.12)',
          borderWidth: 1,
          titleColor: '#c0b8b0',
          bodyColor: '#f1f5f9',
          callbacks: {
            label: c => c.dataset.label === 'Media'
              ? `Media: ${c.parsed.y.toFixed(1)} kWh/kWp`
              : `${c.parsed.y.toFixed(1)} kWh/kWp`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
          ticks: { color: '#8a8070', font: { size: 10, family: 'monospace' } },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
          ticks: { color: '#8a8070', font: { size: 10, family: 'monospace' } },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderHoursVisual(annualHours) {
  const wrap = document.getElementById('clima-hours-visual');
  if (!wrap) return;
  // Distribución aproximada mensual (% del total)
  const dist = [0.05,0.06,0.08,0.09,0.10,0.11,0.12,0.11,0.09,0.08,0.06,0.05];
  const maxH  = dist[6] * annualHours;
  wrap.innerHTML = dist.map((p, i) => {
    const h = Math.round((p * annualHours / maxH) * 100);
    const isPeak = PEAK_IDX.has(i);
    return `<div class="clima-month-bar${isPeak ? ' clima-month-bar--peak' : ''}" style="height:${h}%" title="${MONTHS[i]}"></div>`;
  }).join('');
}

function renderResults(data) {
  const annual = data.solar_annual_kwh_per_kwp ?? 0;
  document.getElementById('solar-annual').textContent = fmt(annual, 0);
  document.getElementById('hours-sun').textContent    = fmt(data.annual_hours_sun, 0);
  document.getElementById('avg-temp').textContent     = `${fmt(data.avg_temp_c)} °C`;
  document.getElementById('rain-days').textContent    = `${data.precipitation_days ?? '--'} días`;
  document.getElementById('wind-speed').textContent   = `${fmt(data.wind_speed_m_s)} m/s`;

  // Classification badge
  const cls = solarClassify(annual);
  const badge = document.getElementById('solar-classification');
  if (badge) {
    badge.textContent = cls.label;
    badge.style.color       = cls.color;
    badge.style.borderColor = cls.color;
    badge.style.background  = cls.bg;
  }

  // Solar meter (range 800–1800)
  const meterFill = document.getElementById('solar-meter-fill');
  if (meterFill) {
    const pct = Math.min(Math.max((annual - 800) / (1800 - 800) * 100, 0), 100);
    requestAnimationFrame(() => { meterFill.style.width = `${pct}%`; });
  }

  // Hours visual mini-bars
  if (data.annual_hours_sun) renderHoursVisual(data.annual_hours_sun);

  document.getElementById('results').classList.remove('hidden');

  // Footer
  const confClass = data.confidence_level?.startsWith('alta') ? 'alta' : 'media';
  document.getElementById('data-footer').innerHTML = `
    <span class="agent-badge agent-badge--source">📡 ${data.data_source}</span>
    <span class="agent-badge agent-badge--${confClass}">Confianza: ${data.confidence_level}</span>
  `;

  renderChart(data.solar_monthly_kwh_per_kwp || []);
}

function showError(msg) {
  document.getElementById('error').textContent = `Error: ${msg}`;
  document.getElementById('error').classList.remove('hidden');
}

async function loadAnalysis() {
  try {
    const res = await fetch(`/api/climate?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderResults(await res.json());
  } catch (err) {
    showError(err.message);
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

async function loadWeather() {
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (!res.ok) return;
    const data = await res.json();
    const c = data.current;
    if (!c) return;

    document.getElementById('w-temp').textContent      = fmt(c.temperature_2m, 0);
    document.getElementById('w-humidity').textContent  = c.relative_humidity_2m ?? '--';
    document.getElementById('w-cloud').textContent     = c.cloud_cover ?? '--';
    document.getElementById('w-radiation').textContent = fmt(c.direct_radiation, 0);
    document.getElementById('w-wind').textContent      = fmt(c.wind_speed_10m);
    document.getElementById('w-description').textContent = c.weather_description ?? '';

    const iconEl = document.getElementById('w-sky-icon');
    if (iconEl) iconEl.innerHTML = skyIcon(c.cloud_cover ?? 50);

    document.getElementById('weather-widget').classList.remove('hidden');
    renderInstantPower(c.direct_radiation ?? 0, KWP_DEFAULT);
  } catch (_) {}
}

// ── Instant generation estimate ──────────────────────────────────────────

function renderInstantPower(radiationW, kwp) {
  const peakSunHours = 5.5;
  const pr = 0.82;
  const instantKw = (radiationW / 1000) * kwp * pr;
  const dailyKwh   = (radiationW / 1000) * kwp * pr * peakSunHours;
  const pct        = Math.min((radiationW / 1000) * 100, 100);

  const valEl  = document.getElementById('w-gen-kw');
  const barEl  = document.getElementById('w-gen-bar');
  const subEl  = document.getElementById('w-gen-sub');
  const peakEl = document.getElementById('w-gen-peak-label');

  if (valEl)  valEl.textContent  = instantKw.toFixed(1);
  if (peakEl) peakEl.textContent = `${kwp} kWp pico`;
  if (subEl)  subEl.textContent  = `~${dailyKwh.toFixed(0)} kWh estimados hoy`;
  requestAnimationFrame(() => { if (barEl) barEl.style.width = `${pct}%`; });
}

// ── Weather background animation (disabled) ───────────────────────────────

let _weatherAnimId = null;

function startWeatherAnim(cloudPct = 50, tempC = 20, windMs = 2, radiationW = 0) {
  const canvas = document.getElementById('weather-anim-canvas');
  if (!canvas) return;
  if (_weatherAnimId) { cancelAnimationFrame(_weatherAnimId); _weatherAnimId = null; }

  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  canvas.width  = 300;
  canvas.height = Math.max(hero.offsetHeight || 130, 100);
  const W = canvas.width, H = canvas.height;

  const isNight = radiationW <= 0;
  const isClear = cloudPct < 25;
  const isRainy = cloudPct > 68;

  const nClouds = Math.ceil(cloudPct / 18);
  const clouds = Array.from({ length: nClouds }, (_, i) => ({
    x:     W * (i / Math.max(nClouds, 1)) + Math.random() * W * 0.25,
    y:     H * 0.15 + Math.random() * H * 0.35,
    w:     36 + Math.random() * 38,
    h:     14 + Math.random() * 12,
    speed: 0.12 + Math.random() * 0.1 + windMs * 0.018,
    alpha: 0.35 + Math.random() * 0.3,
  }));

  const rain = isRainy
    ? Array.from({ length: 28 }, () => ({ x: Math.random() * W, y: Math.random() * H, len: 5 + Math.random() * 7, spd: 2.8 + Math.random() * 1.8 }))
    : [];

  const wind = windMs > 1.5
    ? Array.from({ length: Math.ceil(windMs * 2.5) }, () => ({ x: Math.random() * W, y: H * 0.08 + Math.random() * H * 0.84, len: 18 + Math.random() * 38, spd: windMs * 0.5 + Math.random() * windMs, a: 0.08 + Math.random() * 0.13 }))
    : [];

  let sunAngle = 0, tick = 0;
  const warmness = Math.min(Math.max((tempC - 8) / 22, 0), 1);

  function frame() {
    tick++; sunAngle += 0.006;
    ctx.clearRect(0, 0, W, H);

    // Background gradient (temp-based sky)
    const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
    if (isNight) {
      bg.addColorStop(0, 'rgba(8,12,35,0.92)');
      bg.addColorStop(1, 'rgba(4,8,25,0.97)');
    } else if (isClear) {
      const r1 = Math.round(110 + warmness * 60),  g1 = Math.round(165 - warmness * 35), b1 = Math.round(220 - warmness * 70);
      const r2 = Math.round(175 + warmness * 45),  g2 = Math.round(130 - warmness * 20), b2 = Math.round(90  - warmness * 30);
      bg.addColorStop(0, `rgba(${r1},${g1},${b1},0.88)`);
      bg.addColorStop(1, `rgba(${r2},${g2},${b2},0.78)`);
    } else {
      const r = Math.round(65 + warmness * 28), g = Math.round(82 + warmness * 12), b = Math.round(115 + warmness * 8);
      bg.addColorStop(0, `rgba(${r},${g},${b},0.88)`);
      bg.addColorStop(1, `rgba(${r+20},${g+10},${b-15},0.82)`);
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Sun / moon
    const sx = W * 0.78, sy = H * 0.28;
    if (!isNight) {
      // corona glow
      const halo = ctx.createRadialGradient(sx, sy, 10, sx, sy, 52);
      halo.addColorStop(0, `rgba(249,168,37,${0.3 + warmness * 0.15})`);
      halo.addColorStop(1, 'rgba(249,168,37,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(sx, sy, 52, 0, Math.PI * 2); ctx.fill();
      // rotating rays
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(sunAngle);
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(22, 0);
        ctx.strokeStyle = `rgba(249,168,37,${0.5 + warmness * 0.25})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
      // disk
      ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.fillStyle = cloudPct > 60 ? 'rgba(249,168,37,0.5)' : '#f9a825'; ctx.fill();
    } else {
      // moon crescent
      ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(210,215,240,0.82)'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 5, sy - 2, 8.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,12,35,0.97)'; ctx.fill();
      // stars
      if (tick % 3 === 0) {
        for (let s = 0; s < 4; s++) {
          const stX = 20 + s * (W * 0.18);
          const stY = 10 + (s % 3) * (H * 0.15);
          ctx.beginPath(); ctx.arc(stX, stY, 0.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.4 * Math.sin(tick * 0.04 + s)})`; ctx.fill();
        }
      }
    }

    // Clouds
    clouds.forEach(c => {
      c.x += c.speed; if (c.x > W + c.w) c.x = -c.w;
      ctx.save(); ctx.globalAlpha = c.alpha;
      const cg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.w * 0.62);
      const cc = isRainy ? '72,85,105' : isNight ? '130,140,160' : '200,212,228';
      cg.addColorStop(0, `rgba(${cc},1)`); cg.addColorStop(0.65, `rgba(${cc},0.55)`); cg.addColorStop(1, `rgba(${cc},0)`);
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w * 0.62, c.h * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Rain
    rain.forEach(r => {
      r.y += r.spd; r.x += windMs * 0.18;
      if (r.y > H) { r.y = -r.len; r.x = Math.random() * W; }
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + windMs * 0.35, r.y + r.len);
      ctx.strokeStyle = 'rgba(170,195,220,0.42)'; ctx.lineWidth = 0.75; ctx.stroke();
    });

    // Wind streaks
    wind.forEach(wp => {
      wp.x += wp.spd; if (wp.x > W + wp.len) wp.x = -wp.len;
      const wg = ctx.createLinearGradient(wp.x - wp.len, wp.y, wp.x + 4, wp.y);
      wg.addColorStop(0, 'rgba(255,255,255,0)'); wg.addColorStop(0.5, `rgba(255,255,255,${wp.a})`); wg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.moveTo(wp.x - wp.len, wp.y); ctx.lineTo(wp.x + 4, wp.y);
      ctx.strokeStyle = wg; ctx.lineWidth = 0.75; ctx.stroke();
    });

    _weatherAnimId = requestAnimationFrame(frame);
  }

  _weatherAnimId = requestAnimationFrame(frame);
}

Promise.allSettled([loadAnalysis(), loadWeather()]);
