// estudio.js — Controlador de la página de estudio del edificio
// Flujo: wizard de datos → scene3d → 5 peticiones API en paralelo → renderizar resultados

import { SymbioScene } from '../components/scene3d.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Obtener coordenadas de la URL y establecer fallbacks
  const params = new URLSearchParams(window.location.search);
  let lat = parseFloat(params.get('lat'));
  let lon = parseFloat(params.get('lon'));
  const kwpFromUrl = parseFloat(params.get('kwp')) || null;

  if (isNaN(lat) || isNaN(lon) || lat === 0.0 || lon === 0.0) {
    lat = 40.364000;
    lon = -1.102000;
  }

  // Actualizar badges de coordenadas
  document.getElementById('badge-lat').textContent = lat.toFixed(6);
  document.getElementById('badge-lon').textContent = lon.toFixed(6);
  if (kwpFromUrl) {
    const coordBadge = document.querySelector('.coordinates-badge');
    if (coordBadge) {
      const kwpChip = document.createElement('span');
      kwpChip.className = 'badge-kwp-chip';
      kwpChip.textContent = `${Math.round(kwpFromUrl)} kWp`;
      coordBadge.appendChild(kwpChip);
    }
  }

  // 2. Inicializar la Escena 3D
  const scene = new SymbioScene('viewer-3d');

  // Leer el footprint real capturado en Mapbox al hacer clic en el edificio
  const _mapboxBuildingShape = (() => {
    try {
      const raw = localStorage.getItem('symbio_building_shape');
      if (!raw) return null;
      localStorage.removeItem('symbio_building_shape');
      return JSON.parse(raw);
    } catch { return null; }
  })();

  // Mostrar edificio real inmediatamente si tenemos el footprint de Mapbox
  if (_mapboxBuildingShape?.footprint?.length >= 3) {
    const cosLat   = Math.cos(lat * Math.PI / 180);
    const projected = _mapboxBuildingShape.footprint.map(pt => [
      (pt.lon - lon) * cosLat * 111320,
      (pt.lat - lat) * 111320,
    ]);
    scene.buildFromFootprint(projected, { height: _mapboxBuildingShape.height || 9 });
    scene.setLocation(lat, lon);
  } else {
    // Edificio genérico de espera — se reemplaza cuando la API devuelva el footprint real
    scene.showFallback();
  }

  function _activateModeBtn(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    const ll = document.getElementById('lidar-legend');
    if (ll) ll.style.display = mode === 'lidar' ? 'flex' : 'none';
  }

  // ── Toggle minimizar panel de agentes ────────────────────────────────────
  document.getElementById('agent-bar-toggle')?.addEventListener('click', () => {
    const bar = document.getElementById('agent-status-bar');
    const btn = document.getElementById('agent-bar-toggle');
    const collapsed = bar.classList.toggle('agent-status-bar--collapsed');
    btn.setAttribute('aria-label', collapsed ? 'Expandir panel de agentes' : 'Minimizar panel de agentes');
  });

  // ── Wizard de datos del edificio ──────────────────────────────────────────
  const WIZARD_KEY = 'symbioenergía_wizard';
  let userKwh = null;
  const wizard = document.getElementById('estudio-wizard');

  function _loadWizardData() {
    try { return JSON.parse(localStorage.getItem(WIZARD_KEY) || 'null'); } catch { return null; }
  }

  // Timer de eliminación del wizard — se cancela si se reabre antes de que dispare
  let _wizardRemoveTimer = null;

  function _removeWizardNow() {
    if (wizard.parentNode) wizard.remove();
  }

  function closeWizard(kwh) {
    userKwh = kwh || null;
    if (userKwh) localStorage.setItem(WIZARD_KEY, JSON.stringify({ kwh: userKwh, savedAt: new Date().toISOString() }));
    wizard.classList.add('wizard--hidden');
    _wizardRemoveTimer = setTimeout(_removeWizardNow, 350);
    _ensureUpdateChip();
    loadAnalysis(userKwh);
  }

  function _ensureUpdateChip() {
    if (document.querySelector('.update-kwh-chip')) return;
    const coordBadge = document.querySelector('.coordinates-badge');
    if (!coordBadge) return;
    const chip = document.createElement('button');
    chip.className = 'update-kwh-chip glassmorphic';
    chip.title = userKwh ? `Consumo actual: ${new Intl.NumberFormat('es-ES').format(Math.round(userKwh))} kWh/año` : 'Actualizar consumo';
    chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Actualizar consumo`;
    chip.addEventListener('click', openWizard);
    coordBadge.insertAdjacentElement('afterend', chip);
  }

  function openWizard() {
    // Cancelar cualquier timer de eliminación pendiente antes de mostrar
    if (_wizardRemoveTimer) { clearTimeout(_wizardRemoveTimer); _wizardRemoveTimer = null; }
    wizard.classList.remove('wizard--hidden');
    if (!wizard.parentNode) {
      // Reiniciar animación al re-adjuntar al DOM
      wizard.style.animation = 'none';
      document.body.appendChild(wizard);
      requestAnimationFrame(() => { wizard.style.animation = ''; });
    }
  }

  // Formatters declarados antes del check del wizard para evitar TDZ
  // si wizard.remove() lanza un error antes de que se declaren más abajo
  const eurFormatter = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  });
  const numFormatter = new Intl.NumberFormat('es-ES');

  // Si ya hay datos previos del wizard, saltar directamente al análisis
  const _prevWizard = _loadWizardData();
  if (_prevWizard?.kwh) {
    userKwh = _prevWizard.kwh;
    wizard.remove(); // sin DOM = sin flash

    // Mostrar chip "Actualizar consumo" junto al badge de coordenadas
    const coordBadge = document.querySelector('.coordinates-badge');
    if (coordBadge) {
      const chip = document.createElement('button');
      chip.className = 'update-kwh-chip glassmorphic';
      chip.title = `Consumo actual: ${new Intl.NumberFormat('es-ES').format(Math.round(userKwh))} kWh/año`;
      chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Actualizar consumo`;
      chip.addEventListener('click', openWizard);
      coordBadge.insertAdjacentElement('afterend', chip);
    }
    loadAnalysis(userKwh);
  }

  // Tabs del wizard — usar wizard.querySelectorAll para funcionar aunque el wizard
  // haya sido retirado del DOM antes de este punto (caso: datos previos en localStorage)
  wizard.querySelectorAll('.wizard-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      wizard.querySelectorAll('.wizard-tab').forEach(b => b.classList.remove('active'));
      wizard.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      wizard.querySelector(`#wizard-panel-${btn.dataset.wizardTab}`).classList.add('active');
    });
  });

  // Subir factura PDF → analizar con IA
  // Usar wizard.querySelector en lugar de document.getElementById porque el wizard
  // puede haber sido retirado del DOM (wizard.remove()) pero sigue en memoria
  const invoiceFile = wizard.querySelector('#wizard-invoice-file');
  const uploadArea  = wizard.querySelector('#wizard-upload-area');
  const statusEl    = wizard.querySelector('#wizard-invoice-status');
  const resultEl    = wizard.querySelector('#wizard-invoice-result');

  let extractedKwh = null;

  ['dragenter', 'dragover'].forEach(ev => uploadArea.addEventListener(ev, e => { e.preventDefault(); uploadArea.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev => uploadArea.addEventListener(ev, () => uploadArea.classList.remove('drag-over')));
  uploadArea.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleInvoiceFile(e.dataTransfer.files[0]); });
  invoiceFile.addEventListener('change', () => { if (invoiceFile.files[0]) handleInvoiceFile(invoiceFile.files[0]); });

  async function handleInvoiceFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Solo se aceptan ficheros PDF.'); return;
    }
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    wizard.querySelector('#wizard-invoice-msg').textContent = 'Analizando factura con IA...';

    const form = new FormData();
    form.append('invoice', file);

    try {
      const res = await fetch('/api/analyze-invoice', { method: 'POST', body: form });
      const data = await res.json();
      statusEl.classList.add('hidden');

      if (data.error && !data.kwh_annual) {
        resultEl.innerHTML = `<p style="color:var(--coral);font-size:.82rem">No se pudieron extraer datos. Usa el formulario manual.</p>`;
        resultEl.classList.remove('hidden');
        return;
      }

      extractedKwh = data.kwh_annual || null;
      const fmtN = n => n ? new Intl.NumberFormat('es-ES').format(Math.round(n)) : '—';
      const fmtE = n => n ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '—';

      resultEl.innerHTML = `
        <div class="wizard-invoice-result__row">
          <span class="wizard-invoice-result__label">Consumo anual</span>
          <span class="wizard-invoice-result__value">${fmtN(data.kwh_annual)} kWh</span>
        </div>
        <div class="wizard-invoice-result__row">
          <span class="wizard-invoice-result__label">Coste anual estimado</span>
          <span class="wizard-invoice-result__value">${fmtE(data.cost_annual_eur)}</span>
        </div>
        ${data.tariff ? `<div class="wizard-invoice-result__row">
          <span class="wizard-invoice-result__label">Tarifa</span>
          <span class="wizard-invoice-result__value">${data.tariff}</span>
        </div>` : ''}
        <p class="wizard-invoice-result__confidence">Confianza: ${data.confidence || 'media'}</p>`;
      resultEl.classList.remove('hidden');
    } catch {
      statusEl.classList.add('hidden');
      resultEl.innerHTML = `<p style="color:var(--coral);font-size:.82rem">Error al comunicarse con el servidor.</p>`;
      resultEl.classList.remove('hidden');
    }
  }

  wizard.querySelector('#wizard-skip').addEventListener('click', () => closeWizard(null));

  wizard.querySelector('#wizard-submit').addEventListener('click', () => {
    const activeTab = wizard.querySelector('.wizard-tab.active')?.dataset?.wizardTab;
    let kwh = null;
    if (activeTab === 'manual') {
      const raw = parseFloat(wizard.querySelector('#wizard-kwh').value);
      kwh = !isNaN(raw) && raw > 0 ? raw : null;
    } else {
      kwh = extractedKwh;
    }
    closeWizard(kwh);
  });
  // ──────────────────────────────────────────────────────────────────────────

  // Dibujar placeholders inmediatamente (antes de que lleguen los datos de la API)
  // — se actualizan con valores reales cuando el agente de renovables responde
  setTimeout(() => {
    _drawSolarHeatmap(null, 0.21, 180);
    _drawTerrainMap(null, 12, 180);
    _drawSimbiosisNetwork([]);
  }, 0);

  // Helper: actualizar subtítulo de pestaña
  function _setTabSub(tab, text) {
    const el = document.getElementById(`tab-sub-${tab}`);
    if (el) el.textContent = text;
  }

  // Helper: dibujar mapa de calor solar con círculos difuminados estéticos
  function _drawSolarHeatmap(irradiation, slopeRad, orientationDeg, monthlyProfile) {
    const canvas = document.getElementById('solar-heatmap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Fondo oscuro profundo para que los círculos de calor brillen
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const intensity = Math.min(1, Math.max(0.15, (irradiation || 1100) / 2000));

    // Dirección de mayor irradiación según orientación
    const orientRad = ((orientationDeg || 180) - 180) * Math.PI / 180;
    const sunOffX   = Math.sin(orientRad)  * W  * 0.18;
    const sunOffY   = Math.cos(orientRad)  * H  * 0.18;
    const slope     = Math.min(0.5, Math.tan(slopeRad || 0.17));

    // Gradiente de fondo suave (base de calor) — amarillo cálido difuso
    const bg = ctx.createRadialGradient(
      W / 2 + sunOffX, H / 2 + sunOffY, 0,
      W / 2, H / 2, W * 0.75
    );
    bg.addColorStop(0,   `rgba(255,200,60,${0.18 + intensity * 0.22})`);
    bg.addColorStop(0.5, `rgba(230,100,20,${0.08 + intensity * 0.14})`);
    bg.addColorStop(1,   'rgba(120,20,10,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Círculos difuminados de calor (blobs) — posiciones pseudoaleatorias pero deterministas
    const blobs = [
      { rx: 0.5 + sunOffX / W * 0.6, ry: 0.45 + sunOffY / H * 0.6, r: 0.42, a: 0.55 + intensity * 0.3 },
      { rx: 0.3 + slope * 0.2,        ry: 0.35,                       r: 0.28, a: 0.35 + intensity * 0.25 },
      { rx: 0.72 - slope * 0.1,       ry: 0.62,                       r: 0.32, a: 0.30 + intensity * 0.2  },
      { rx: 0.55,                      ry: 0.72,                       r: 0.22, a: 0.25 + intensity * 0.18 },
      { rx: 0.28,                      ry: 0.65,                       r: 0.18, a: 0.20 + intensity * 0.15 },
    ];

    ctx.globalCompositeOperation = 'screen';
    blobs.forEach(({ rx, ry, r, a }) => {
      const cx2 = rx * W, cy2 = ry * H, radius = r * Math.min(W, H);
      const g = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, radius);
      // Core: blanco cálido → naranja → rojo → transparente
      g.addColorStop(0,    `rgba(255,245,180,${a})`);
      g.addColorStop(0.25, `rgba(255,160, 40,${a * 0.75})`);
      g.addColorStop(0.55, `rgba(200, 50, 10,${a * 0.40})`);
      g.addColorStop(1,    'rgba(80,10,5,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx2, cy2, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';

    // Contorno del tejado — perspectiva ligera en blanco semitransparente
    const pad = 12, persp = 7;
    ctx.beginPath();
    ctx.moveTo(pad + persp, pad);
    ctx.lineTo(W - pad - persp, pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.lineTo(pad, H - pad);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Etiqueta valor — pill oscuro en la parte inferior
    const label = irradiation ? `${Math.round(irradiation)} kWh/m²` : '--';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const tw = ctx.measureText(label).width + 16;
    const tx = W / 2 - tw / 2;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(tx, H - 17, tw, 13, 6); ctx.fill();
    } else {
      ctx.fillRect(tx, H - 17, tw, 13);
    }
    ctx.fillStyle = 'rgba(255,220,120,0.95)';
    ctx.font = 'bold 9.5px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, H - 7);
  }

  // Helper: mapa de sombras animado — sol girando con sombra proyectada en tiempo real
  let _shadowAnimId = null;
  function _drawTerrainMap(elevationM, slopeDeg, orientationDeg) {
    const canvas = document.getElementById('terrain-canvas');
    if (!canvas) return;

    // Cancelar animación anterior si existe
    if (_shadowAnimId) { cancelAnimationFrame(_shadowAnimId); _shadowAnimId = null; }

    const ctx  = canvas.getContext('2d');
    const W    = canvas.width, H = canvas.height;
    const cx   = W / 2, cy = H / 2;
    // Centro del edificio en el canvas
    const bx = cx, by = cy + 5;
    // Tamaño del edificio (planta)
    const bW = W * 0.32, bH = H * 0.26;

    const slope    = Math.min(35, slopeDeg  || 10);
    const orient   = orientationDeg || 180;
    const elevLabel = elevationM ? `${Math.round(elevationM)} m s.n.m.` : '-- m';

    let phase = 0; // 0..1 = amanecer..atardecer

    function frame() {
      phase = (phase + 0.004) % 1;

      ctx.clearRect(0, 0, W, H);

      // ── Fondo: cielo con gradiente horario ─────────────────────────────────
      const dayT  = Math.sin(Math.PI * phase); // 0=alba/ocaso, 1=mediodía
      const skyR  = Math.round(10  + dayT * 120);
      const skyG  = Math.round(18  + dayT * 145);
      const skyB  = Math.round(40  + dayT * 180);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      bgGrad.addColorStop(0, `rgb(${skyR},${skyG},${skyB})`);
      bgGrad.addColorStop(1, `rgb(${skyR + 20},${skyG + 30},${skyB - 20})`);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Suelo ──────────────────────────────────────────────────────────────
      const groundGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
      groundGrad.addColorStop(0, `rgba(${180 + dayT * 30},${165 + dayT * 20},${140},1)`);
      groundGrad.addColorStop(1, '#b0a898');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);

      // Horizonte sutil
      ctx.beginPath();
      ctx.moveTo(0, H * 0.5); ctx.lineTo(W, H * 0.5);
      ctx.strokeStyle = `rgba(${skyR + 30},${skyG + 20},${skyB - 10},0.5)`;
      ctx.lineWidth = 1; ctx.stroke();

      // ── Posición del sol (arco de este a oeste) ───────────────────────────
      const sunAngle = Math.PI + phase * Math.PI; // π (este) → 2π (oeste)
      const sunR = Math.min(W, H) * 0.38;
      const sunX  = cx + Math.cos(sunAngle) * sunR;
      const sunY  = cy - Math.abs(Math.sin(sunAngle)) * sunR * 0.7 - 8;
      const sunElev = Math.max(0, Math.sin(Math.PI * phase)); // 0=horizonte, 1=cénit

      // Arco del sol (trayectoria)
      if (sunElev > 0.01) {
        ctx.beginPath();
        ctx.arc(cx, cy + 10, sunR * 0.78, Math.PI * 1.05, Math.PI * 1.95);
        ctx.strokeStyle = 'rgba(255,200,80,0.12)';
        ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Halo del sol
      if (sunElev > 0.02) {
        const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 28 + sunElev * 14);
        halo.addColorStop(0,   `rgba(255,240,150,${0.7 * sunElev})`);
        halo.addColorStop(0.3, `rgba(255,180, 60,${0.35 * sunElev})`);
        halo.addColorStop(1,   'rgba(255,100,20,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(sunX, sunY, 40, 0, Math.PI * 2); ctx.fill();

        // Disco solar
        ctx.beginPath(); ctx.arc(sunX, sunY, 6 + sunElev * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,245,${Math.round(180 - sunElev * 100)},${0.85 + sunElev * 0.15})`;
        ctx.fill();
      }

      // ── Sombra proyectada del edificio ────────────────────────────────────
      if (sunElev > 0.04) {
        // Dirección sombra opuesta al sol
        const shadowDirX = -(sunX - bx) / sunR;
        const shadowDirY = -(sunY - by) / (sunR * 0.5);
        const shadowLen  = (bH / 2 + bW / 4) * (1.5 - sunElev * 1.2);

        ctx.save();
        ctx.translate(bx, by);

        // Elipse de sombra
        ctx.beginPath();
        ctx.ellipse(
          shadowDirX * shadowLen, shadowDirY * shadowLen + bH * 0.3,
          bW * 0.55, bH * 0.28,
          Math.atan2(shadowDirY, shadowDirX),
          0, Math.PI * 2
        );
        ctx.fillStyle = `rgba(20,15,10,${0.35 - sunElev * 0.2})`;
        ctx.filter = 'blur(3px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.restore();
      }

      // ── Edificio (planta + alzado simplificado) ───────────────────────────
      // Fachada lateral (lado iluminado)
      const lightSide = sunX > bx ? 1 : -1;
      ctx.fillStyle = `rgba(${200 + dayT * 30},${190 + dayT * 25},${175},1)`;
      ctx.fillRect(bx - bW / 2, by - bH / 2, bW, bH);

      // Tejado
      const roofH = bH * 0.22 * (1 + slope / 60);
      ctx.beginPath();
      ctx.moveTo(bx - bW / 2 - 2, by - bH / 2);
      ctx.lineTo(bx, by - bH / 2 - roofH);
      ctx.lineTo(bx + bW / 2 + 2, by - bH / 2);
      ctx.closePath();
      const roofLight = Math.round(220 + dayT * 25);
      ctx.fillStyle = `rgba(${roofLight},${roofLight - 10},${roofLight - 20},1)`;
      ctx.fill();

      // Borde del edificio
      ctx.strokeStyle = `rgba(60,50,40,${0.25 + dayT * 0.15})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - bW / 2, by - bH / 2, bW, bH);

      // ── Hora y elevación ─────────────────────────────────────────────────
      const totalMin = 6 * 60 + phase * 14 * 60;
      const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
      const mm = String(Math.floor(totalMin % 60)).padStart(2, '0');

      ctx.fillStyle = `rgba(255,255,255,${0.45 + dayT * 0.45})`;
      ctx.font = 'bold 10px system-ui,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${hh}:${mm}`, 6, 14);

      ctx.fillStyle = `rgba(200,190,170,${0.5 + dayT * 0.3})`;
      ctx.font = '8.5px system-ui,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(elevLabel, W - 5, H - 6);

      _shadowAnimId = requestAnimationFrame(frame);
    }

    _shadowAnimId = requestAnimationFrame(frame);
  }

  // Helper: canvas de red de empresas del polígono (Simbiosis) — versión profesional
  let _networkAnimId = null;
  function _drawSimbiosisNetwork(neighbors) {
    const canvas = document.getElementById('symbiosis-network-canvas');
    if (!canvas) return;
    if (_networkAnimId) { cancelAnimationFrame(_networkAnimId); _networkAnimId = null; }

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx0 = W / 2, cy0 = H / 2;

    const SECTOR_PAL = {
      manufacturing: { base: '#f45d48', glow: 'rgba(244,93,72,0.55)' },
      logistics:     { base: '#f59e0b', glow: 'rgba(245,158,11,0.55)' },
      food:          { base: '#34d399', glow: 'rgba(52,211,153,0.55)' },
      construction:  { base: '#94a3b8', glow: 'rgba(148,163,184,0.5)' },
      automotive:    { base: '#a78bfa', glow: 'rgba(167,139,250,0.5)' },
      other:         { base: '#22d3ee', glow: 'rgba(34,211,238,0.5)'  },
    };
    const TEAL_PAL = { base: '#00d4aa', glow: 'rgba(0,212,170,0.65)' };

    const safeN = (neighbors || []).slice(0, 7);
    const nodes = [{ x: cx0, y: cy0, r: 14, label: 'Mi Nave', pal: TEAL_PAL, isCenter: true, pct: null }];
    safeN.forEach((n, i) => {
      const arc = Math.PI * 0.85;
      const startA = -Math.PI / 2 - arc / 2;
      const angle = safeN.length === 1 ? -Math.PI / 2 : startA + arc * (i / (safeN.length - 1));
      const rDist = Math.min(W, H) * 0.36;
      nodes.push({
        x: cx0 + Math.cos(angle) * rDist,
        y: cy0 + Math.sin(angle) * rDist * 0.72,
        r: 7.5 + (n.complementarity || 55) / 20,
        label: (n.name || n.sector || '').split(' ')[0].slice(0, 10),
        pal: SECTOR_PAL[n.sector] || SECTOR_PAL.other,
        isCenter: false,
        pct: n.complementarity || null,
        angle,
      });
    });

    const packets = safeN.map((_, i) => ({
      ni: i + 1,
      t: i / Math.max(safeN.length, 1),
      speed: 0.006 + Math.random() * 0.002,
    }));

    let tick = 0;

    // Draw subtle hex grid background
    function drawGrid() {
      const s = 22; // hex side
      ctx.strokeStyle = 'rgba(0,212,170,0.04)';
      ctx.lineWidth = 0.5;
      const rows = Math.ceil(H / (s * 1.5)) + 1;
      const cols = Math.ceil(W / (s * Math.sqrt(3))) + 1;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const xOff = col * s * Math.sqrt(3) + (row % 2 === 0 ? 0 : s * Math.sqrt(3) / 2);
          const yOff = row * s * 1.5;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 180) * (60 * k - 30);
            const hx = xOff + s * Math.cos(a);
            const hy = yOff + s * Math.sin(a);
            k === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    // Bezier control point (adds subtle curve to each connection)
    function bezierCP(x1, y1, x2, y2) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const bend = 0.18;
      return { cpx: mx - dy * bend, cpy: my + dx * bend };
    }

    // Point along bezier at t ∈ [0,1]
    function bezierPt(x1, y1, cpx, cpy, x2, y2, t) {
      const mt = 1 - t;
      return {
        x: mt * mt * x1 + 2 * mt * t * cpx + t * t * x2,
        y: mt * mt * y1 + 2 * mt * t * cpy + t * t * y2,
      };
    }

    function drawNode(nd, i) {
      const { x, y, r, pal, isCenter, pct } = nd;
      const breathe = 1 + 0.04 * Math.sin(tick * 0.035 + i * 1.1);

      // Outer glow ring (animated)
      const outerR = r * breathe + 7;
      const grd = ctx.createRadialGradient(x, y, r * 0.6, x, y, outerR + 6);
      grd.addColorStop(0, pal.glow);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(x, y, outerR + 6, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();

      // Outer ring (spinning for center)
      if (isCenter) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tick * 0.012);
        ctx.beginPath();
        ctx.arc(0, 0, r + 5, 0, Math.PI * 1.6);
        ctx.strokeStyle = 'rgba(0,212,170,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
      }

      // Mid ring
      ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = pal.base + '55'; ctx.lineWidth = 1; ctx.stroke();

      // Node fill (dark inside with radial light)
      const fill = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      fill.addColorStop(0, isCenter ? '#00d4aa' : pal.base + 'ee');
      fill.addColorStop(0.55, isCenter ? '#006e5a' : pal.base + '88');
      fill.addColorStop(1, '#0a0e1a');
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.shadowColor = pal.base; ctx.shadowBlur = isCenter ? 14 : 8;
      ctx.fill(); ctx.shadowBlur = 0;

      // Outer crisp border
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = pal.base; ctx.lineWidth = isCenter ? 1.8 : 1.2; ctx.stroke();

      // Center icon (hexagon for HQ, dot for neighbors)
      if (isCenter) {
        ctx.save(); ctx.translate(x, y);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 180) * (60 * k - 30);
          const hx = 5.5 * Math.cos(a), hy = 5.5 * Math.sin(a);
          k === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      } else if (pct !== null) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold 6.5px 'SF Mono',monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}%`, x, y);
        ctx.textBaseline = 'alphabetic';
      }

      // Label below/above node
      const labelY = isCenter ? y + r + 12 : (nd.angle !== undefined && nd.angle > 0 ? y + r + 11 : y - r - 5);
      ctx.fillStyle = isCenter ? '#00d4aa' : '#c8c4bc';
      ctx.font = `${isCenter ? '700' : '500'} ${isCenter ? 9 : 8}px 'SF Mono',monospace,system-ui`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText(nd.label, x, labelY);
      ctx.shadowBlur = 0;
    }

    function frame() {
      tick++;
      ctx.clearRect(0, 0, W, H);

      // Background
      const bgGrad = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, Math.max(W, H) * 0.7);
      bgGrad.addColorStop(0, '#0f1520');
      bgGrad.addColorStop(1, '#070a10');
      ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

      drawGrid();

      // Distance rings
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath();
        ctx.arc(cx0, cy0, ring * (Math.min(W, H) * 0.118), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,212,170,${0.055 - ring * 0.013})`; ctx.lineWidth = 0.8; ctx.stroke();
      }

      // Connections + packets
      for (let p = 0; p < packets.length; p++) {
        const pkt = packets[p];
        const nd  = nodes[pkt.ni]; if (!nd) continue;
        const { cpx, cpy } = bezierCP(cx0, cy0, nd.x, nd.y);

        // Connection line (gradient)
        const lineGrad = ctx.createLinearGradient(cx0, cy0, nd.x, nd.y);
        lineGrad.addColorStop(0, 'rgba(0,212,170,0.22)');
        lineGrad.addColorStop(1, nd.pal.base + '18');
        ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(cpx, cpy, nd.x, nd.y);
        ctx.strokeStyle = lineGrad; ctx.lineWidth = 1.1; ctx.stroke();

        // Packet (diamond shape)
        pkt.t = (pkt.t + pkt.speed) % 1;
        const ease = pkt.t < 0.5 ? 2 * pkt.t * pkt.t : 1 - 2 * (1 - pkt.t) ** 2;
        const pp = bezierPt(cx0, cy0, cpx, cpy, nd.x, nd.y, ease);
        const pColor = ease < 0.5 ? '#00d4aa' : nd.pal.base;

        ctx.save();
        ctx.translate(pp.x, pp.y);
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-2.2, -2.2, 4.4, 4.4);
        ctx.fillStyle = pColor;
        ctx.shadowColor = pColor; ctx.shadowBlur = 8;
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.restore();

        // Trail
        for (let tr = 1; tr <= 4; tr++) {
          const tBack = Math.max(pkt.t - tr * 0.025, 0);
          const easeB = tBack < 0.5 ? 2 * tBack * tBack : 1 - 2 * (1 - tBack) ** 2;
          const pb = bezierPt(cx0, cy0, cpx, cpy, nd.x, nd.y, easeB);
          ctx.beginPath(); ctx.arc(pb.x, pb.y, 1.2 - tr * 0.22, 0, Math.PI * 2);
          ctx.fillStyle = `${pColor}${(70 - tr * 15).toString(16).padStart(2,'0')}`; ctx.fill();
        }

        // Arrival pulse
        if (pkt.t > 0.88) {
          const pulseT = (pkt.t - 0.88) / 0.12;
          ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r + pulseT * 14, 0, Math.PI * 2);
          ctx.strokeStyle = `${nd.pal.base}${Math.round((1 - pulseT) * 50).toString(16).padStart(2,'0')}`;
          ctx.lineWidth = 1.5; ctx.stroke();
        }
      }

      // Nodes (center last so it renders on top)
      nodes.slice(1).forEach((nd, i) => drawNode(nd, i + 1));
      drawNode(nodes[0], 0);

      _networkAnimId = requestAnimationFrame(frame);
    }

    _networkAnimId = requestAnimationFrame(frame);
  }

  // Helper: actualizar status de agente + contador de la cabecera IA
  let _agentsDone = 0;
  const _TOTAL_AGENTS = 6;

  function _setAgentStatus(agent, state) {
    const el = document.getElementById(`status-${agent}`);
    if (!el) return;
    el.className = `agent-status agent-status--${state}`;

    if (state === 'done' || state === 'error') {
      _agentsDone++;
      const counter = document.getElementById('agent-bar-count');
      if (counter) counter.textContent = `${_agentsDone} / ${_TOTAL_AGENTS}`;

      if (_agentsDone >= _TOTAL_AGENTS) {
        // Todos completados: actualizar cabecera y detener animaciones
        const label  = document.getElementById('agent-bar-label');
        const cursor = document.getElementById('agent-bar-cursor');
        const icon   = document.getElementById('agent-bar-icon');
        if (label)  label.textContent = 'Análisis completado';
        if (cursor) cursor.style.display = 'none';
        if (icon) {
          icon.style.animation = 'none';
          // Reemplazar hexágono por checkmark
          icon.innerHTML = `<path d="M2 9 L7 14 L18 3" stroke="currentColor" stroke-width="2"
                              stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
        }
        if (counter) counter.textContent = `${_TOTAL_AGENTS} / ${_TOTAL_AGENTS}`;
      }
    }
  }

  // ID del análisis guardado — se actualiza en loadAnalysis y lo usa el botón LLM
  let currentAnalysisId = null;

  // 3. Orquestador de peticiones en paralelo
  async function loadAnalysis(kwh) {
    try {
      // Estado de carga inicial
      document.getElementById('building-name').textContent = 'Escaneando cubierta...';
      document.getElementById('transparency-confidence').textContent = 'Analizando...';

      const AGENT_TIMEOUT_MS = 18000;

      const fetchJson = url => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT_MS);
        return fetch(url, { signal: ctrl.signal })
          .then(r => {
            clearTimeout(timer);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .catch(e => {
            clearTimeout(timer);
            const msg = e.name === 'AbortError' ? 'Timeout (>18s)' : e.message;
            console.warn(`[agente] ${url} → ${msg}`);
            return { status: "error", message: msg };
          });
      };

      const kwhParam = kwh ? `&kwh=${Math.round(kwh)}` : '';
      const kwpParam = kwpFromUrl ? `&kwp=${kwpFromUrl}` : '';

      // Peticiones en paralelo a los 6 Agentes de IA — se renderizan al completarse
      const [geo, climate, symbiosis, regulatory, financial, renewables] = await Promise.all([
        fetchJson(`/api/geo?lat=${lat}&lon=${lon}`),
        fetchJson(`/api/climate?lat=${lat}&lon=${lon}`),
        fetchJson(`/api/symbiosis?lat=${lat}&lon=${lon}${kwpParam}`),
        fetchJson(`/api/regulatory?lat=${lat}&lon=${lon}`),
        fetchJson(`/api/financial?lat=${lat}&lon=${lon}${kwhParam}`),
        fetchJson(`/api/renewables?lat=${lat}&lon=${lon}`)
      ]);

      // 3b. Guardar análisis en BD (silencioso — no bloquea el render)
      fetch('/api/analysis/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat, lon,
          kwh_annual: kwh,
          geo: geo.status !== 'error' ? geo : null,
          climate: climate.status !== 'error' ? climate : null,
          financial: financial.status !== 'error' ? financial : null,
          symbiosis: symbiosis.status !== 'error' ? symbiosis : null,
        }),
      }).then(r => r.json()).then(d => {
        if (d.analysis_id) currentAnalysisId = d.analysis_id;
      }).catch(() => {});

      // 4. Renderizar Agente 1: Geo / LiDAR
      if (geo.status !== 'error') {
        document.getElementById('building-name').textContent = geo.building_name || 'Nave Industrial (Teruel)';

        const loc = geo.location || {};
        const prov = geo.province || {};
        if (loc.municipio || prov.nombre) {
          const badge = document.getElementById('province-badge');
          badge.style.display = 'block';
          const parts = [];
          if (loc.municipio) parts.push(loc.municipio);
          if (prov.nombre) parts.push(prov.nombre);
          document.getElementById('location-display').textContent = parts.join(', ');
        }

        document.getElementById('transparency-source').textContent = geo.data_source || 'Overpass API';

        const confidenceBadge = document.getElementById('transparency-confidence');
        confidenceBadge.textContent = geo.confidence_level || 'alta';
        if (geo.confidence_level && geo.confidence_level.includes('simul')) {
          confidenceBadge.style.background = 'rgba(245, 158, 11, 0.15)';
          confidenceBadge.style.color = 'var(--color-warning)';
        } else {
          confidenceBadge.style.background = 'rgba(16, 185, 129, 0.15)';
          confidenceBadge.style.color = 'var(--color-success)';
        }

        document.getElementById('geo-total-area').textContent = `${numFormatter.format(geo.total_area_m2)} m²`;
        document.getElementById('geo-usable-area').textContent = `${numFormatter.format(geo.usable_area_m2)} m²`;
        document.getElementById('geo-slope').textContent = `${geo.roof_slope_deg}°`;
        document.getElementById('geo-capacity').textContent = `${numFormatter.format(geo.solar_capacity_kwp)} kWp`;
        document.getElementById('geo-height').textContent = geo.building_height_m;

        let orientacionText = 'Sur';
        if (geo.roof_orientation_deg !== 180) {
          orientacionText = `${geo.roof_orientation_deg}°`;
        }
        document.getElementById('geo-orientation').textContent = `${orientacionText} (Óptimo)`;

        // Construir modelo 3D con footprint final (prioridad: Mapbox > sessionStorage > geo API)
        let fp = null;
        // 1. Mapbox footprint — más preciso, capturado al clic sobre el edificio
        if (_mapboxBuildingShape?.footprint?.length >= 3) {
          fp = _mapboxBuildingShape.footprint;
        }
        // 2. Backward compat: sessionStorage (formato antiguo industrial-3d)
        if (!fp) {
          try {
            const stored = sessionStorage.getItem('symbio_footprint');
            if (stored) { fp = JSON.parse(stored); sessionStorage.removeItem('symbio_footprint'); }
          } catch {}
        }
        // 3. Fallback: footprint del agente Geo (Overpass del backend)
        if (!fp && geo.footprint_coords?.length >= 3) {
          fp = geo.footprint_coords;
        }

        const cosLat = Math.cos(lat * Math.PI / 180);
        // Usar kWp recomendado por el financiero (lo que cubre el consumo real),
        // no el máximo físico del tejado. Fallback a geo si financiero falla.
        const _panelKwp = (financial?.status !== 'error' && financial?.recommended_capacity_kwp > 0)
          ? financial.recommended_capacity_kwp
          : (geo.solar_capacity_kwp ?? 0);
        const _buildingData = {
          height:               geo.building_height_m,
          solar_capacity_kwp:   _panelKwp,
          roof_orientation_deg: geo.roof_orientation_deg ?? 180,
        };

        if (fp) {
          const projected = fp.map(pt => [
            (pt.lon - lon) * cosLat * 111320,
            (pt.lat - lat) * 111320,
          ]);
          scene.buildFromFootprint(projected, _buildingData);
        } else if (geo.usable_area_m2 > 0) {
          // Fallback: rectángulo proporcional derivado del área útil (relación 5:3), en metros locales
          const side = Math.sqrt(geo.usable_area_m2 / 1.5);
          const hw = (side * 0.75) / 2, hd = (side * 0.5) / 2;
          const rect = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
          scene.buildFromFootprint(rect, _buildingData);
        } else if (_mapboxBuildingShape?.footprint?.length >= 3) {
          // El edificio ya fue construido desde Mapbox sin datos solares —
          // solo actualizar los paneles ahora que tenemos el kWp real
          scene.updateSolarPanels(
            _buildingData.solar_capacity_kwp,
            _buildingData.roof_orientation_deg
          );
        }
        scene.setLocation(lat, lon);
        if (geo.lidar_point_cloud) {
          scene.loadLidarPointCloud(geo.lidar_point_cloud);
        }

        // ── Leaflet mini-map (geo tab) ──────────────────────────────────────
        // Se guarda la config para inicializar cuando el tab geo sea visible por primera vez,
        // evitando el problema de Leaflet con contenedores display:none (dimensión cero).
        window._geoMapPending = { lat, lon, fp };
        if (window._geoLeafletMap) { window._geoLeafletMap.remove(); window._geoLeafletMap = null; }

        function _initGeoMap() {
          const _geoMapEl = document.getElementById('geo-location-map');
          if (!_geoMapEl || typeof L === 'undefined' || !window._geoMapPending) return;
          const { lat: _lat, lon: _lon, fp: _fp } = window._geoMapPending;
          window._geoMapPending = null;
          const _lmap = L.map('geo-location-map', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false }).setView([_lat, _lon], 17);
          window._geoLeafletMap = _lmap;
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_lmap);
          if (_fp && _fp.length >= 3) {
            const _latlngs = _fp.map(p => [p.lat, p.lon]);
            L.polygon(_latlngs, { color: '#078080', weight: 2, fillColor: '#078080', fillOpacity: 0.25 }).addTo(_lmap);
            _lmap.fitBounds(_latlngs, { padding: [18, 18], maxZoom: 18 });
          } else {
            const _originIcon = L.divIcon({ html: `<div style="background:#078080;border-radius:50%;width:14px;height:14px;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(7,128,128,0.4)"></div>`, className: '', iconSize: [14, 14], iconAnchor: [7, 7] });
            L.marker([_lat, _lon], { icon: _originIcon }).addTo(_lmap);
          }
          document.getElementById('geo-location-caption').textContent = _fp ? 'OSM · Huella del edificio' : 'OpenStreetMap · Coordenadas';
        }
        window._initGeoMap = _initGeoMap;

        // Si el tab Geo ya está activo al terminar el análisis, inicializar ahora
        if (document.getElementById('pane-geo')?.classList.contains('active')) {
          requestAnimationFrame(_initGeoMap);
        }

        // ── Territorio / municipio ──────────────────────────────────────────
        const _loc = geo.location || {};
        if (_loc.municipio || _loc.provincia || _loc.ccaa) {
          const _terr = document.getElementById('geo-territory');
          if (_terr) {
            document.getElementById('geo-municipio').textContent = _loc.municipio || '--';
            document.getElementById('geo-provincia').textContent = _loc.provincia || '--';
            document.getElementById('geo-ccaa').textContent = _loc.ccaa || '--';
            document.getElementById('geo-cp').textContent = _loc.codigo_postal || '--';
            _terr.style.display = 'grid';
          }
        }

        _setAgentStatus('geo', 'done');
        _setTabSub('geo', `${numFormatter.format(geo.usable_area_m2)} m²`);
      } else {
        document.getElementById('building-name').textContent = 'Nave Industrial (Error)';
        document.getElementById('transparency-confidence').textContent = 'Error';
        scene.showFallback();
        _setAgentStatus('geo', 'error');
      }

      // 5. Renderizar Agente 2: Clima
      if (climate.status !== 'error') {
        document.getElementById('climate-yield').textContent = `${numFormatter.format(climate.solar_annual_kwh_per_kwp)} kWh/kWp`;
        document.getElementById('climate-hours').textContent = `${numFormatter.format(climate.annual_hours_sun)} h`;
        document.getElementById('climate-temp').textContent = `${climate.avg_temp_c} °C`;
        document.getElementById('climate-rain').textContent = `${climate.precipitation_days} días`;

        // Renderizar gráfico de irradiación mensual
        if (climate.solar_monthly_kwh_per_kwp) {
          const ctx = document.getElementById('monthlyChart').getContext('2d');
          if (window.myMonthlyChart) {
            window.myMonthlyChart.destroy();
          }
          window.myMonthlyChart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
              datasets: [{
                label: 'Radiación (kWh/kWp)',
                data: climate.solar_monthly_kwh_per_kwp,
                borderColor: '#078080',
                backgroundColor: 'rgba(7, 128, 128, 0.08)',
                borderWidth: 2,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#f45d48',
                pointBorderColor: '#078080',
                pointHoverRadius: 6,
                pointRadius: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: 'rgba(255, 255, 254, 0.98)',
                  titleColor: '#078080',
                  bodyColor: '#232323',
                  borderColor: 'rgba(7, 128, 128, 0.15)',
                  borderWidth: 1
                }
              },
              scales: {
                x: {
                  grid: { color: 'rgba(35, 35, 35, 0.05)' },
                  ticks: { color: '#8c8c8c', font: { family: 'General Sans, system-ui, sans-serif' } }
                },
                y: {
                  grid: { color: 'rgba(35, 35, 35, 0.05)' },
                  ticks: { color: '#8c8c8c', font: { family: 'General Sans, system-ui, sans-serif' } }
                }
              }
            }
          });
        }
        _setAgentStatus('clima', 'done');
        _setTabSub('clima', `${numFormatter.format(climate.solar_annual_kwh_per_kwp)} kWh/kWp`);
      } else {
        _setAgentStatus('clima', 'error');
      }


      // 6. Renderizar Agente 3: Simbiosis
      if (symbiosis.status !== 'error') {
        document.getElementById('simbiosis-shared-potential').textContent = `${numFormatter.format(symbiosis.shared_annual_potential_kwh)} kWh/año`;

        // Guardar vecinos y dibujar canvas de red
        window._lastSimbiosisNeighbors = symbiosis.matching_neighbors || [];
        _drawSimbiosisNetwork(window._lastSimbiosisNeighbors);

        // Cargar lista de vecinos
        const neighborsList = document.getElementById('neighbors-list');
        neighborsList.innerHTML = '';
        if (symbiosis.matching_neighbors && symbiosis.matching_neighbors.length > 0) {
          symbiosis.matching_neighbors.forEach(n => {
            const card = document.createElement('div');
            card.className = 'neighbor-card glassmorphic';
            card.innerHTML = `
              <div class="neighbor-card__header">
                <span class="neighbor-card__name"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h6"/><path d="M3 15h6"/></svg>${n.name}</span>
                <span class="neighbor-card__comp">${n.complementarity}% Afinidad</span>
              </div>
              <div class="neighbor-card__meta">
                <span>Sector: <b>${n.sector}</b></span>
                <span>Distancia: <b>${n.distance_km} km</b></span>
              </div>
              <p class="neighbor-card__notes">${n.notes}</p>
            `;
            neighborsList.appendChild(card);
          });
        } else {
          neighborsList.innerHTML = `<p class="empty-message">No se encontraron naves en un radio de ${symbiosis.max_radius_km} km con perfiles compatibles.</p>`;
          _drawSimbiosisNetwork([]);
        }

        // Cargar score e informe HRIA
        const hria = symbiosis.hria_assessment;
        if (hria) {
          const scoreEl = document.getElementById('hria-score');
          scoreEl.textContent = `${hria.hria_score}/100`;

          if (hria.hria_score >= 85) {
            scoreEl.style.color = 'var(--color-success)';
          } else if (hria.hria_score >= 70) {
            scoreEl.style.color = 'var(--color-warning)';
          } else {
            scoreEl.style.color = 'var(--color-error)';
          }

          const risksList = document.getElementById('hria-risks');
          risksList.innerHTML = '';
          hria.risks_evaluated.forEach(r => {
            const rItem = document.createElement('div');
            rItem.className = 'risk-item';

            let impactClass = 'risk-badge--low';
            if (r.impact.toLowerCase() === 'alto') impactClass = 'risk-badge--high';
            if (r.impact.toLowerCase() === 'medio') impactClass = 'risk-badge--med';

            rItem.innerHTML = `
              <div class="risk-item__title">
                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${r.risk}</span>
                <span class="risk-badge ${impactClass}">${r.impact}</span>
              </div>
              <p class="risk-item__mitigation"><b>Acción correctora:</b> ${r.mitigation}</p>
            `;
            risksList.appendChild(rItem);
          });
        }
        _setAgentStatus('simbiosis', 'done');
        const _nNeighbors = symbiosis.matching_neighbors?.length || 0;
        _setTabSub('simbiosis', `${_nNeighbors} vecino${_nNeighbors !== 1 ? 's' : ''}`);
      } else {
        _setAgentStatus('simbiosis', 'error');
      }

      // 7. Renderizar Agente 4: Normativa (Subvenciones + Proyectos Europeos)
      if (regulatory.status !== 'error') {
        document.getElementById('regulatory-status').textContent = regulatory.regional_status;
        document.getElementById('regulatory-max-cap').textContent = eurFormatter.format(regulatory.max_subsidy_amount_cap_eur);

        // Listar convocatorias nacionales/regionales
        const subsidiesList = document.getElementById('subsidies-list');
        subsidiesList.innerHTML = '';
        const countEl = document.getElementById('subsidies-count');
        if (regulatory.eligible_subsidies && regulatory.eligible_subsidies.length > 0) {
          if (countEl) countEl.textContent = `${regulatory.eligible_subsidies.length} activas`;
          regulatory.eligible_subsidies.forEach(s => {
            const card = document.createElement('div');
            card.className = 'subsidy-card glassmorphic';
            const limitText = s.importe_max ? eurFormatter.format(s.importe_max) : 'Sin límite';
            const openBadge = (s.estado || '').toLowerCase().includes('cerr') ? 'closed' : 'open';
            const pctW = Math.min(s.porcentaje_max || 0, 100);
            card.innerHTML = `
              <div class="subsidy-card__header">
                <span class="subsidy-card__title">${s.nombre}</span>
                <span class="subsidy-card__badge subsidy-card__badge--${openBadge}">${s.estado}</span>
              </div>
              <p class="subsidy-card__desc">${s.descripcion}</p>
              <div class="subsidy-card__footer">
                <span>Cobertura: <b>${s.porcentaje_max}%</b> | Tope: <b>${limitText}</b></span>
                <span class="subsidy-card__source">${s.fuente}</span>
              </div>
              <div class="subsidy-card__pct-bar" style="width:${pctW}%"></div>
            `;
            subsidiesList.appendChild(card);
          });
        }

        // Proyectos europeos
        if (regulatory.european_projects && regulatory.european_projects.length > 0) {
          const euMaxEl = document.getElementById('eu-max-cap');
          if (euMaxEl) euMaxEl.textContent = eurFormatter.format(regulatory.european_max_eur || 0);

          const euList = document.getElementById('eu-projects-list');
          if (euList) {
            euList.innerHTML = '';
            regulatory.european_projects.forEach(p => {
              const card = document.createElement('div');
              card.className = 'eu-card';
              const odsHtml = (p.ods || []).map(o =>
                `<span class="eu-ods-badge">${o}</span>`
              ).join('');
              const limitText = p.importe_max ? `hasta ${eurFormatter.format(p.importe_max)}` : 'Sin límite';
              card.innerHTML = `
                <div class="eu-card__header">
                  <span class="eu-card__name">${p.nombre}</span>
                  <span class="eu-card__pct">${p.porcentaje_max}% · ${limitText}</span>
                </div>
                <p class="eu-card__desc">${p.descripcion}</p>
                <div class="eu-card__footer">
                  <div class="eu-card__ods">${odsHtml}</div>
                  <span class="eu-card__status">${p.estado}</span>
                </div>
              `;
              euList.appendChild(card);
            });
          }
        }

        _setAgentStatus('normativa', 'done');
        _setTabSub('normativa', eurFormatter.format(regulatory.max_subsidy_amount_cap_eur));
      } else {
        _setAgentStatus('normativa', 'error');
      }

      // 8. Renderizar Agente 5: Financiero
      if (financial.status !== 'error') {
        document.getElementById('fin-sizing').textContent = `${numFormatter.format(financial.recommended_capacity_kwp)} kWp`;
        document.getElementById('fin-investment').textContent = eurFormatter.format(financial.total_investment_eur);
        document.getElementById('fin-subsidy').textContent = eurFormatter.format(financial.subsidy_amount_eur);
        document.getElementById('fin-net-investment').textContent = eurFormatter.format(financial.net_investment_eur);

        const paybackYears = financial.payback_years_with_subsidy;
        document.getElementById('fin-payback-with').textContent = `${paybackYears} años`;
        document.getElementById('fin-payback-without').textContent = `${financial.payback_years_without_subsidy} años`;
        document.getElementById('fin-npv').textContent = eurFormatter.format(financial.npv_15_years_eur);
        document.getElementById('fin-irr').textContent = `${financial.irr_15_years_percent}%`;

        // Callout heroes
        document.getElementById('fin-payback-with-hero').textContent = `${paybackYears}a`;
        document.getElementById('fin-savings-hero').textContent = eurFormatter.format(financial.annual_savings_net_eur);

        // Financiación
        const fs = financial.financing_scenario;
        if (fs) {
          document.getElementById('fin-own-cap').textContent = eurFormatter.format(fs.own_capital_eur);
          document.getElementById('fin-loan-amount').textContent = eurFormatter.format(fs.loan_amount_eur);
          document.getElementById('fin-loan-rate').textContent = fs.loan_interest_rate_percent;
          document.getElementById('fin-annual-pay').textContent = eurFormatter.format(fs.annual_loan_payment_eur);
        }

        _setAgentStatus('financiero', 'done');
        _setTabSub('financiero', `${financial.payback_years_with_subsidy}a payback`);
      } else {
        _setAgentStatus('financiero', 'error');
      }

      // 9. Renderizar Agente 6: Renovables
      if (renewables && renewables.status !== 'error') {
        _renderRenewables(renewables);
        _setAgentStatus('renovables', 'done');
        _setTabSub('renovables', renewables.solar?.classification || '');

        // Rellenar KPIs extra del panel Geo con datos de elevación e irradiación (de PVGIS)
        const solar = renewables.solar || {};
        const _el = id => document.getElementById(id);
        if (solar.elevation_m != null) {
          if (_el('geo-elevation')) _el('geo-elevation').textContent = `${numFormatter.format(Math.round(solar.elevation_m))} m`;
          if (_el('geo-location-caption')) _el('geo-location-caption').textContent = `OSM · Alt. ${Math.round(solar.elevation_m)} m s.n.m.`;
        }
        if (solar.irradiation_kwh_m2 != null) {
          if (_el('geo-irrad')) _el('geo-irrad').textContent = `${numFormatter.format(Math.round(solar.irradiation_kwh_m2))} kWh/m²`;
          if (_el('geo-heatmap-caption')) _el('geo-heatmap-caption').textContent = `${Math.round(solar.irradiation_kwh_m2)} kWh/m²·año · ${solar.classification || ''}`;
        }

        // Dibujar mapas una vez que tenemos todos los datos
        _drawSolarHeatmap(solar.irradiation_kwh_m2, (geo.roof_slope_deg || 10) * Math.PI / 180, geo.roof_orientation_deg || 180, solar.monthly_profile);
        _drawTerrainMap(solar.elevation_m, geo.roof_slope_deg || 10, geo.roof_orientation_deg || 180);
      } else {
        _setAgentStatus('renovables', 'error');
        _drawSolarHeatmap(null, (geo.roof_slope_deg || 10) * Math.PI / 180, geo.roof_orientation_deg || 180, null);
        _drawTerrainMap(null, geo.roof_slope_deg || 10, geo.roof_orientation_deg || 180);
      }

      // ── Banner hero de resultados clave ──────────────────────────────────
      _renderHeroBanner(geo, climate, financial);

    } catch (e) {
      console.error('Error orquestando resultados de agentes:', e);
      document.getElementById('building-name').textContent = 'Error de conexión';
    }
  }

  // ── Clasificacion → clase CSS de badge ──────────────────────────────────
  function _classToModifier(cls) {
    const map = {
      'Excelente': 'excellent',
      'Muy Bueno': 'very-good',
      'Bueno': 'good',
      'Moderado': 'moderate',
      'Alto': 'high',
      'Moderado-Alto': 'moderate',
      'Bajo-Moderado': 'low',
      'Bajo': 'low',
    };
    return map[cls] || 'moderate';
  }

  // ── Renderizador del agente Renovables ──────────────────────────────────
  function _renderRenewables(data) {
    const solar = data.solar || {};
    const wind = data.wind || {};
    const biomass = data.biomass || {};
    const miniHydro = data.mini_hydro || {};
    const grid = data.grid || {};
    const mix = data.recommended_mix || [];

    // --- Solar ---
    const solarAnnual = solar.annual_kwh_per_kwp;
    const solarIrrad = solar.irradiation_kwh_m2;
    document.getElementById('renew-solar-class').textContent = solar.classification || '--';
    document.getElementById('renew-solar-class').className =
      `renew-card__badge renew-badge--solar renew-badge--${_classToModifier(solar.classification)}`;
    document.getElementById('renew-solar-annual').textContent =
      solarAnnual != null ? `${numFormatter.format(Math.round(solarAnnual))} kWh/kWp` : '--';
    document.getElementById('renew-solar-irrad').textContent =
      solarIrrad != null ? `${numFormatter.format(Math.round(solarIrrad))} kWh/m²` : '--';
    document.getElementById('renew-solar-angle').textContent =
      solar.optimal_angle_deg != null ? `${solar.optimal_angle_deg}°` : '--';
    document.getElementById('renew-solar-elev').textContent =
      solar.elevation_m != null ? `${numFormatter.format(Math.round(solar.elevation_m))} m` : '--';
    const solarLink = document.getElementById('renew-solar-source-link');
    if (solarLink && solar.data_source) {
      solarLink.textContent = solar.data_source;
    }

    // --- Eolica ---
    document.getElementById('renew-wind-class').textContent = wind.classification || '--';
    document.getElementById('renew-wind-class').className =
      `renew-card__badge renew-badge--wind renew-badge--${_classToModifier(wind.classification)}`;
    document.getElementById('renew-wind-speed').textContent =
      wind.mean_speed_m_s != null ? `${wind.mean_speed_m_s} m/s` : '--';
    document.getElementById('renew-wind-yield').textContent =
      wind.annual_kwh_per_kw != null ? `${numFormatter.format(wind.annual_kwh_per_kw)} kWh/kW` : '--';
    document.getElementById('renew-wind-desc').textContent = wind.description || '--';

    // --- Biomasa ---
    document.getElementById('renew-biomass-class').textContent = biomass.classification || '--';
    document.getElementById('renew-biomass-class').className =
      `renew-card__badge renew-badge--biomass renew-badge--${_classToModifier(biomass.classification)}`;
    document.getElementById('renew-biomass-potential').textContent = biomass.potential || '--';

    // --- Mini-hidro ---
    const hydroViable = miniHydro.viable;
    const hydroClass = hydroViable ? 'Posible' : 'No viable';
    document.getElementById('renew-hydro-class').textContent = hydroClass;
    document.getElementById('renew-hydro-class').className =
      `renew-card__badge renew-badge--${hydroViable ? 'hydro-ok' : 'hydro-no'}`;
    document.getElementById('renew-hydro-notes').textContent = miniHydro.notes || '--';

    // --- Red electrica ---
    document.getElementById('renew-grid-co2').textContent =
      grid.co2_intensity_g_kwh != null ? `${grid.co2_intensity_g_kwh} gCO₂/kWh` : '--';
    document.getElementById('renew-grid-price').textContent =
      grid.electricity_price_eur_mwh != null ? `${grid.electricity_price_eur_mwh} EUR/MWh` : '--';
    document.getElementById('renew-grid-pct').textContent =
      grid.renewable_pct != null ? `${grid.renewable_pct}%` : '--';
    const gridSourceEl = document.getElementById('renew-grid-source');
    if (gridSourceEl && grid.data_source) gridSourceEl.textContent = grid.data_source;

    // --- Mix recomendado ---
    const mixList = document.getElementById('renew-mix-list');
    mixList.innerHTML = '';
    if (mix.length > 0) {
      mix.forEach(item => {
        const card = document.createElement('div');
        card.className = 'renew-mix-card glassmorphic';
        const lcoe = item.estimated_lcoe_eur_kwh != null
          ? `LCOE est.: <b>${item.estimated_lcoe_eur_kwh.toFixed(3)} EUR/kWh</b>`
          : '';
        card.innerHTML = `
          <div class="renew-mix-card__header">
            <span class="renew-mix-card__priority">#${item.priority}</span>
            <span class="renew-mix-card__tech">${item.technology}</span>
          </div>
          <p class="renew-mix-card__rationale">${item.rationale}</p>
          ${lcoe ? `<div class="renew-mix-card__lcoe">${lcoe}</div>` : ''}
        `;
        mixList.appendChild(card);
      });
    } else {
      mixList.innerHTML = '<p class="empty-message">No hay datos suficientes para recomendar un mix.</p>';
    }
  }

  function _renderHeroBanner(geo, climate, financial) {
    const existing = document.getElementById('analysis-hero');
    if (existing) existing.remove();

    const savings = financial?.annual_savings_net_eur;
    const payback = financial?.payback_years_with_subsidy;
    const capacity = financial?.recommended_capacity_kwp;
    const co2 = geo?.co2_savings_t_year ?? climate?.co2_savings_t_year ?? null;

    if (!savings && !payback) return;

    const fmtEur = n => n != null ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '—';
    const fmtN = n => n != null ? new Intl.NumberFormat('es-ES').format(Math.round(n)) : '—';

    const banner = document.createElement('div');
    banner.id = 'analysis-hero';
    banner.className = 'analysis-hero glassmorphic';
    banner.innerHTML = `
      <div class="analysis-hero__kpi">
        <span class="analysis-hero__value">${fmtEur(savings)}</span>
        <span class="analysis-hero__label">Ahorro anual</span>
      </div>
      <div class="analysis-hero__divider"></div>
      <div class="analysis-hero__kpi">
        <span class="analysis-hero__value">${payback != null ? payback + ' años' : '—'}</span>
        <span class="analysis-hero__label">Payback c/subvención</span>
      </div>
      <div class="analysis-hero__divider"></div>
      <div class="analysis-hero__kpi">
        <span class="analysis-hero__value">${capacity != null ? fmtN(capacity) + ' kWp' : '—'}</span>
        <span class="analysis-hero__label">Capacidad instalada</span>
      </div>
      ${co2 != null ? `<div class="analysis-hero__divider"></div>
      <div class="analysis-hero__kpi">
        <span class="analysis-hero__value">${fmtN(co2)} t</span>
        <span class="analysis-hero__label">CO₂ evitado/año</span>
      </div>` : ''}
    `;

    // Insertar encima del sidebar
    const sidebar = document.querySelector('.analysis-sidebar');
    if (sidebar) sidebar.insertAdjacentElement('beforebegin', banner);
  }

  // ── Renderer de informe IA estructurado ──────────────────────────────────
  const SECTION_META = {
    resumen:         { label: 'Diagnóstico',     color: 'teal'   },
    solar:           { label: 'Solar',           color: 'teal'   },
    financiero:      { label: 'Financiero',      color: 'coral'  },
    recomendaciones: { label: 'Acciones',        color: 'teal'   },
    subvenciones:    { label: 'Subvenciones',    color: 'coral'  },
    riesgos:         { label: 'Riesgos',         color: 'amber'  },
  };

  function buildAiReport(report) {
    const nivel = report.nivel_oportunidad || 'MEDIO';
    const nivelClass = { ALTO: 'alto', MEDIO: 'medio', BAJO: 'bajo' }[nivel] || 'medio';

    const seccionesHtml = (report.secciones || []).map(s => {
      const meta = SECTION_META[s.tipo] || { label: s.tipo, color: 'teal' };
      const destacadoHtml = s.destacado
        ? `<div class="ai-section__destacado">${s.destacado}</div>`
        : '';
      const textoHtml = s.texto
        ? `<p class="ai-section__texto">${s.texto}</p>`
        : '';
      const itemsHtml = Array.isArray(s.items) && s.items.length
        ? `<ul class="ai-section__items">${s.items.map(i => `<li>${i}</li>`).join('')}</ul>`
        : '';
      return `
        <div class="ai-section ai-section--${meta.color}">
          <span class="ai-section__label">${meta.label}</span>
          <h4 class="ai-section__title">${s.titulo}</h4>
          ${destacadoHtml}${textoHtml}${itemsHtml}
        </div>`;
    }).join('');

    const conclusionHtml = report.conclusion
      ? `<div class="ai-conclusion">${report.conclusion}</div>`
      : '';

    return `
      <div class="ai-report">
        <div class="ai-report__header">
          <span class="ai-report__titulo">${report.titulo || 'Informe IA'}</span>
          <span class="ai-report__nivel ai-nivel--${nivelClass}">${nivel}</span>
        </div>
        <div class="ai-report__sections">${seccionesHtml}</div>
        ${conclusionHtml}
      </div>`;
  }

  function buildFallbackReport(text) {
    return `<div class="ai-report ai-report--plain"><p>${text.replace(/\n/g, '<br>')}</p></div>`;
  }

  // 9b. Botón Generar informe IA
  document.getElementById('btn-llm-report-geo')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-llm-report-geo');
    const container = document.getElementById('llm-report-geo');
    btn.disabled = true;
    btn.textContent = 'Generando...';
    container.classList.remove('hidden');
    container.innerHTML = '<div class="ai-loading"><span class="ai-loading__dot"></span>Consultando SymbioBot...</div>';
    try {
      const locationData = {
        lat, lon,
        municipio: document.getElementById('location-display')?.textContent || 'Desconocido',
        superficie_total:  document.getElementById('geo-total-area')?.textContent || '',
        superficie_util:   document.getElementById('geo-usable-area')?.textContent || '',
        capacidad_solar:   document.getElementById('geo-capacity')?.textContent || '',
        pendiente:         document.getElementById('geo-slope')?.textContent || '',
        sizing_recomendado: document.getElementById('fin-sizing')?.textContent || '',
        payback_con_ayuda:  document.getElementById('fin-payback-with')?.textContent || '',
        inversion_neta:     document.getElementById('fin-net-investment')?.textContent || '',
      };
      const res = await fetch('/api/llm/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_type: 'informe_ejecutivo', location_data: locationData, analysis_id: currentAnalysisId })
      });
      const data = await res.json();
      if (data.structured && data.report) {
        container.innerHTML = buildAiReport(data.report);
      } else {
        container.innerHTML = buildFallbackReport(data.response || 'Error al generar informe.');
      }
    } catch (e) {
      container.innerHTML = `<div class="ai-report ai-report--plain ai-error">Error de conexión: ${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Regenerar informe IA';
    }
  });

  // ── Persistencia localStorage — "Mi Empresa" ──────────────────────────────
  const STORAGE_KEY = 'symbioenergía_empresa';

  function _loadSavedCompany() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function _updateSaveBar(saved) {
    const btn = document.getElementById('btn-save-company');
    const lbl = document.getElementById('save-company-label');
    if (!btn || !lbl) return;
    if (saved) {
      btn.textContent = 'Empresa guardada';
      btn.className = 'save-company-btn save-company-btn--saved';
      lbl.textContent = `Guardada: ${saved.nombre || 'Esta ubicación'} · ${saved.lat?.toFixed(4)}, ${saved.lon?.toFixed(4)}`;
    } else {
      btn.textContent = 'Guardar como Mi Empresa';
      btn.className = 'save-company-btn';
      lbl.textContent = '';
    }
  }

  // Solo mostrar "guardada" si las coordenadas coinciden con el edificio actual
  const _initialSaved = _loadSavedCompany();
  const _savedMatchesCurrent = _initialSaved &&
    Math.abs((_initialSaved.lat || 0) - lat) < 0.0005 &&
    Math.abs((_initialSaved.lon || 0) - lon) < 0.0005;
  _updateSaveBar(_savedMatchesCurrent ? _initialSaved : null);

  document.getElementById('btn-save-company')?.addEventListener('click', async () => {
    const current = _loadSavedCompany();
    if (current && current.lat === lat && current.lon === lon) {
      localStorage.removeItem(STORAGE_KEY);
      _updateSaveBar(null);
      return;
    }
    const nombre = document.getElementById('building-name')?.textContent || 'Empresa';

    // Extraer capacidad solar (ej: "847 kWp" → 847)
    const capacidadText = document.getElementById('geo-capacity')?.textContent || '';
    const capacidadNum = parseFloat(capacidadText.replace(/[^\d.,]/g, '').replace(',', '.')) || null;

    const data = {
      nombre,
      lat,
      lon,
      savedAt: new Date().toISOString(),
      superficie: document.getElementById('geo-total-area')?.textContent || '',
      capacidad: capacidadText,
      payback: document.getElementById('fin-payback-with')?.textContent || '',
      subvencion: document.getElementById('fin-subsidy')?.textContent || ''
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    _updateSaveBar(data);
    document.getElementById('save-company-label').innerHTML +=
      ' · <a href="/mi-empresa" style="color:var(--leaf);text-decoration:underline;font-size:0.8rem">Ver mi panel →</a>';

    // Registrar en la red SymbioEnergia (BD pública)
    try {
      const payload = {
        name: nombre,
        lat,
        lon,
        annual_kwh: null,
        solar_capacity_kwp: capacidadNum,
      };
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const result = await res.json();
        console.info('[SymbioEnergia] Empresa registrada en la red, id:', result.id);
      }
    } catch (err) {
      console.warn('[SymbioEnergia] Error al registrar en la red:', err.message);
    }

    // Sincronizar datos con el perfil del usuario autenticado
    try {
      const savingsText = document.getElementById('fin-savings-hero')?.textContent || '';
      const _parseEur = s => parseFloat(s.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) || null;
      const savingsNum = _parseEur(savingsText);
      const paybackText = document.getElementById('fin-payback-with')?.textContent || '';
      const paybackNum = parseFloat(paybackText.replace(/[^\d.,]/g, '').replace(',', '.')) || null;
      const subsidyText = document.getElementById('fin-subsidy')?.textContent || '';
      const subsidyNum = _parseEur(subsidyText);
      const surfaceText = document.getElementById('geo-total-area')?.textContent || '';
      const surfaceNum = _parseEur(surfaceText);

      const profilePayload = {
        company_name: nombre,
        lat,
        lon,
        solar_capacity_kwp: capacidadNum,
        annual_savings_eur: savingsNum,
        payback_years: paybackNum,
        subsidy_eur: subsidyNum,
        surface_m2: surfaceNum,
      };
      await fetch('/api/user/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload),
      });
    } catch (err) {
      // No autenticado o error — silencioso
    }
  });

  // La carga la dispara el wizard al cerrarse (closeWizard → loadAnalysis(kwh))

  // ── IA Gestora de Trámites (simulación) ─────────────────────────────────
  const _tramitesTemplates = {
    ayuntamiento: {
      to: 'Secretaría General · Ayuntamiento',
      subject: 'Solicitud de información sobre licencia de obra menor — instalación solar fotovoltaica',
      body: (lat, lon, capacity) => `Estimada Secretaría,

En nombre de la empresa titular del inmueble situado en las coordenadas ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°O, nos dirigimos a ese Ayuntamiento para solicitar información sobre los requisitos y trámites necesarios para la obtención de licencia de obra menor correspondiente a la instalación de un sistema solar fotovoltaico de aproximadamente ${capacity || 'XX'} kWp de potencia instalada en cubierta.

Agradecemos de antemano cualquier indicación sobre:
• Documentación técnica requerida
• Tasas municipales aplicables
• Plazos de resolución estimados
• Posibles bonificaciones fiscales en IBI por instalación renovable

Quedamos a su disposición para cualquier aclaración.

Atentamente,
[Nombre de la empresa] — Generado por SymbioEnergia IA`
    },
    idae: {
      to: 'Oficina de Registro · IDAE (Instituto para la Diversificación y Ahorro de la Energía)',
      subject: 'Solicitud de subvención — Programa de ayudas para autoconsumo fotovoltaico industrial',
      body: (lat, lon, capacity) => `Estimado equipo del IDAE,

Nos ponemos en contacto para iniciar el proceso de solicitud de ayudas económicas del Programa de Autoconsumo en el marco del Plan de Recuperación, Transformación y Resiliencia (PRTR), correspondientes a la instalación solar fotovoltaica de ${capacity || 'XX'} kWp prevista en nuestras instalaciones industriales (${lat.toFixed(5)}°N, ${lon.toFixed(5)}°O).

Según el análisis realizado por nuestra plataforma, el proyecto puede acogerse a:
• Subvención directa de hasta el 40% de la inversión elegible
• Préstamo reembolsable complementario

Solicitamos confirmación de los plazos de la convocatoria vigente y la documentación necesaria para la presentación de la solicitud completa.

Un saludo,
[Nombre de la empresa] — Generado por SymbioEnergia IA`
    },
    licencia: {
      to: 'Delegación Territorial de Industria y Energía · Comunidad Autónoma',
      subject: 'Notificación previa e inscripción en el Registro de Instalaciones de Producción de Energía Eléctrica (RIPRE)',
      body: (lat, lon, capacity) => `Estimada Delegación,

Por medio de la presente, y de conformidad con el Real Decreto 244/2019 y la normativa autonómica aplicable, procedemos a notificar la instalación de autoconsumo fotovoltaico de potencia nominal ${capacity || 'XX'} kWp sin excedentes (modalidad de autoconsumo individual tipo 1) en el inmueble ubicado en ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°O.

Documentación que acompañará a la solicitud definitiva:
• Proyecto técnico firmado por ingeniero competente
• Certificado de instalación eléctrica (CIE)
• Seguro de responsabilidad civil de la instalación
• Plano de situación catastral

Solicitamos confirmación de recepción e instrucciones para la presentación telemática a través de la sede electrónica.

Atentamente,
[Nombre de la empresa] — Generado por SymbioEnergia IA`
    }
  };

  document.querySelectorAll('.ia-tramites__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.tramite;
      const tpl = _tramitesTemplates[tipo];
      if (!tpl) return;

      const output = document.getElementById('ia-tramites-output');
      if (!output) return;

      // Obtener capacidad del DOM si ya está disponible
      const capacityText = document.getElementById('fin-sizing')?.textContent || '';
      const capacity = capacityText.replace(/[^\d.,]/g, '').replace(',', '.') || null;

      const body = tpl.body(lat, lon, capacity);

      output.innerHTML = `
        <div class="ia-email-draft">
          <div class="ia-email-draft__header">
            <span class="ia-email-draft__badge">Borrador IA · ${new Date().toLocaleDateString('es-ES')}</span>
            <button class="ia-email-draft__copy" title="Copiar al portapapeles">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copiar
            </button>
          </div>
          <div class="ia-email-draft__field"><span>Para:</span><strong>${tpl.to}</strong></div>
          <div class="ia-email-draft__field"><span>Asunto:</span><strong>${tpl.subject}</strong></div>
          <pre class="ia-email-draft__body">${body}</pre>
          <p class="ia-email-draft__note">Revisa y personaliza antes de enviar. SymbioEnergia IA puede integrarse con tu gestor de correo para el envío automático.</p>
        </div>
      `;
      output.classList.remove('hidden');

      output.querySelector('.ia-email-draft__copy')?.addEventListener('click', () => {
        navigator.clipboard.writeText(`Para: ${tpl.to}\nAsunto: ${tpl.subject}\n\n${body}`)
          .then(() => { output.querySelector('.ia-email-draft__copy').textContent = '✓ Copiado'; })
          .catch(() => {});
      });
    });
  });
  // ────────────────────────────────────────────────────────────────────────────

  // 9. Controlador de Pestañas (Tabs Sidebar)
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Remover activo de botones
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Ocultar todas las pestañas y mostrar la deseada
      tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `pane-${targetTab}`) {
          pane.classList.add('active');
        }
      });

      // Leaflet: inicializar si pendiente, o recalcular tamaño si ya existe
      if (targetTab === 'geo') {
        requestAnimationFrame(() => {
          if (window._geoMapPending && window._initGeoMap) window._initGeoMap();
          else if (window._geoLeafletMap) window._geoLeafletMap.invalidateSize();
        });
      }

      // Red polígono: pausar animación fuera del tab, reanudar al entrar
      if (targetTab === 'simbiosis') {
        if (!_networkAnimId) _drawSimbiosisNetwork(window._lastSimbiosisNeighbors || []);
      } else {
        if (_networkAnimId) { cancelAnimationFrame(_networkAnimId); _networkAnimId = null; }
      }
    });
  });

  // ── Selector de edificios del historial ──────────────────────────────────
  const _bsToggle   = document.getElementById('building-switcher-toggle');
  const _bsDropdown = document.getElementById('building-switcher-dropdown');
  const _bsLoading  = document.getElementById('building-switcher-loading');

  if (_bsToggle && _bsDropdown) {
    let _bsLoaded = false;

    _bsToggle.addEventListener('click', async () => {
      const open = !_bsDropdown.classList.contains('hidden');
      _bsDropdown.classList.toggle('hidden', open);
      if (open || _bsLoaded) return;

      try {
        const res  = await fetch('/api/user/companies');
        const data = await res.json();
        const list = data.companies || [];
        _bsLoading?.remove();

        if (!list.length) {
          _bsDropdown.innerHTML = '<p class="building-switcher__empty">Aún no has guardado ningún edificio. Usa "Guardar como Mi Empresa" en un análisis.</p>';
        } else {
          _bsDropdown.innerHTML = list.map(c => {
            const nombre = c.building_name || c.name || 'Edificio';
            const kwpLabel = c.solar_capacity_kwp ? ` · ${Math.round(c.solar_capacity_kwp)} kWp` : '';
            const lugar = `${c.lat?.toFixed(4)}, ${c.lon?.toFixed(4)}${kwpLabel}`;
            const cls = c.active ? ' building-switcher__item--active' : '';
            return `<div class="building-switcher__item${cls}" data-id="${c.id}" data-lat="${c.lat}" data-lon="${c.lon}" data-kwp="${c.solar_capacity_kwp || ''}">
              <div class="building-switcher__item-main">
                <span class="building-switcher__item-name">${nombre}</span>
                <span class="building-switcher__item-date">${lugar}</span>
              </div>
              <button class="building-switcher__btn-select" data-id="${c.id}">${c.active ? 'Activo' : 'Seleccionar'}</button>
            </div>`;
          }).join('');
        }
        _bsLoaded = true;
      } catch {
        if (_bsLoading) _bsLoading.textContent = 'Error al cargar empresas.';
      }
    });

    _bsDropdown.addEventListener('click', async (e) => {
      const btn = e.target.closest('.building-switcher__btn-select');
      if (!btn) return;
      const item = btn.closest('.building-switcher__item');
      if (!item) return;
      const id = item.dataset.id;
      if (!id || btn.textContent === 'Activo') return;
      btn.textContent = '...';
      try {
        const res = await fetch('/api/user/select-building', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: parseInt(id) }),
        });
        if (res.ok) {
          const lat = item.dataset.lat;
          const lon = item.dataset.lon;
          const kwp = item.dataset.kwp;
          const kwpSuffix = kwp ? `&kwp=${kwp}` : '';
          window.location.href = `/estudio?lat=${lat}&lon=${lon}${kwpSuffix}`;
        } else {
          btn.textContent = 'Error';
        }
      } catch {
        btn.textContent = 'Error';
      }
    });

    // Cerrar al hacer clic fuera
    document.addEventListener('click', e => {
      if (!e.target.closest('#building-switcher')) _bsDropdown.classList.add('hidden');
    });
  }
  // ────────────────────────────────────────────────────────────────────────────

  // 10. Controlador de Modos Visuales del Visor 3D
  const modeButtons = document.querySelectorAll('.mode-btn');
  const lidarLegend = document.getElementById('lidar-legend');

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedMode = btn.getAttribute('data-mode');
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scene.setMode(selectedMode, {});
      if (lidarLegend) {
        lidarLegend.style.display = selectedMode === 'lidar' ? 'flex' : 'none';
      }
    });
  });
});
