import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/controls/OrbitControls.js';

export class SymbioScene {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    // ── Escena ──────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1814);
    this.scene.fog = new THREE.FogExp2(0x1a1814, 0.005);

    // ── Cámara ──────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      48, this.container.clientWidth / this.container.clientHeight, 0.1, 800
    );
    this.camera.position.set(45, 32, 55);

    // ── Renderer ─────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // ── Controles ────────────────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI / 3.2;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 180;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.45;

    // ── Iluminación ──────────────────────────────────────────────────────────
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfde9c8, 0x2d2820, 0.4);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sunLight.position.set(35, 50, 25);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width  = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near   = 0.5;
    this.sunLight.shadow.camera.far    = 220;
    const sd = 65;
    this.sunLight.shadow.camera.left   = -sd;
    this.sunLight.shadow.camera.right  =  sd;
    this.sunLight.shadow.camera.top    =  sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.0004;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.fillLight = new THREE.DirectionalLight(0x9ecdf2, 0.3);
    this.fillLight.position.set(-30, 20, -25);
    this.scene.add(this.fillLight);

    // ── Esfera solar (representación visual del sol) ──────────────────────────
    this._sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff176 })
    );
    this._sunSphere.position.copy(this.sunLight.position);
    this.scene.add(this._sunSphere);

    // ── Suelo ────────────────────────────────────────────────────────────────
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: 0x1a1710, roughness: 0.95, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.grid = new THREE.GridHelper(200, 80, 0x3d3830, 0x2a261f);
    this.grid.material.opacity = 0.4;
    this.grid.material.transparent = true;
    this.grid.position.y = 0.01;
    this.scene.add(this.grid);

    // ── Materiales compartidos ────────────────────────────────────────────────
    this._buildMaterials();

    // ── Grupos de escena ──────────────────────────────────────────────────────
    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);
    this.detailsGroup = new THREE.Group();
    this.scene.add(this.detailsGroup);
    this.panelsGroup = new THREE.Group();
    this.scene.add(this.panelsGroup);

    // ── Estado ────────────────────────────────────────────────────────────────
    this.lidarPoints      = null;
    this.currentMode      = 'general';
    this.buildingMesh     = null;
    this.roofMesh         = null;
    this.edgeLine         = null;
    this._footprintMats   = null;
    this._defaultBuilding = null;
    // ── Simulación solar ──────────────────────────────────────────────────────
    // _simTime ∈ [0,1]: 0 = 06:00 (amanecer), 1 = 20:00 (ocaso)
    this._simTime       = 0.38;   // ≈ 11:19 — sol alto para la demo
    this._lastFrameTime = Date.now();
    this._maxKwp        = 0;
    this._buildingLat   = null;
    this._buildingLon   = null;

    // ── HUD flotante ──────────────────────────────────────────────────────────
    this._createSolarHUD();

    // ── Bucle de animación ────────────────────────────────────────────────────
    this.animate = this.animate.bind(this);
    this.animate();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  // ── HUD flotante de generación solar ──────────────────────────────────────
  _createSolarHUD() {
    const old = document.getElementById('symbiohud');
    if (old) old.remove();

    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    const hud = document.createElement('div');
    hud.id = 'symbiohud';
    hud.style.cssText = [
      'position:absolute', 'top:12px', 'left:12px',
      'font-family:"Courier New",Courier,monospace',
      'font-size:11px', 'color:#e8e4dc',
      'background:rgba(14,12,10,0.80)',
      'backdrop-filter:blur(6px)',
      'padding:11px 15px', 'border-radius:7px',
      'border:1px solid rgba(255,255,255,0.07)',
      'line-height:1.8', 'pointer-events:none',
      'z-index:10', 'min-width:155px',
    ].join(';');

    hud.innerHTML = `
      <div style="color:#666;font-size:8.5px;letter-spacing:0.14em;margin-bottom:5px;text-transform:uppercase">
        SymbioEnergía · Live
      </div>
      <div id="shud-time"
           style="font-size:22px;font-weight:700;letter-spacing:0.04em;color:#fff;line-height:1.1">
        --:--
      </div>
      <div id="shud-gen"
           style="color:#6dcc84;margin-top:4px;font-size:12px">
        GEN &nbsp;-- kW
      </div>
      <div id="shud-cap" style="color:#666;font-size:9.5px">CAP -- kWp</div>
      <div id="shud-coords"
           style="color:#555;font-size:9px;margin-top:3px;letter-spacing:0.03em">
      </div>`;

    this.container.appendChild(hud);
    this._hud = hud;
  }

  // ── Materiales compartidos ────────────────────────────────────────────────
  _buildMaterials() {
    // Paredes: blanco cálido, maqueta arquitectónica
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f3ee, roughness: 0.8, metalness: 0.0,
    });

    // Tejado: gris técnico, bien visible incluso con poca luz
    this.roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555, roughness: 0.9, metalness: 0.0, side: THREE.FrontSide,
    });

    this.bandMaterial = new THREE.MeshStandardMaterial({
      color: 0xd0cdc5, roughness: 0.9, metalness: 0.0,
    });

    this.windowFrameMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a, roughness: 0.3, metalness: 0.5,
    });

    this.windowGlassMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a4a, roughness: 0.05, metalness: 0.1,
      emissive: new THREE.Color(0x0a1a2a), emissiveIntensity: 0.2,
      transparent: true, opacity: 0.7,
    });

    this.darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x555555, roughness: 0.6, metalness: 0.4,
    });

    this.irradiationMaterial = new THREE.MeshStandardMaterial({
      color: 0xf45d48, roughness: 0.35, metalness: 0.1,
      emissive: new THREE.Color(0xf45d48), emissiveIntensity: 0.18,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    });

    // Panel solar: azul oscuro con brillo metálico
    this.panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2a4a, roughness: 0.15, metalness: 0.6,
      emissive: new THREE.Color(0x0a1525), emissiveIntensity: 0.08,
    });
    // Marco de aluminio del panel
    this.panelFrameMat = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa, roughness: 0.4, metalness: 0.7,
    });
  }

  // ── Edificio por defecto (sin footprint) ──────────────────────────────────
  _buildDefaultBuilding() {
    const w = 40, d = 24, h = 6;
    const group = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.wallMaterial);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    this.buildingMesh = body;

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.4, d + 0.5), this.roofMaterial);
    roof.position.y = h + 0.2;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    edgeGeo.translate(0, h / 2, 0);
    group.add(new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: 0x078080, transparent: true, opacity: 0.35 })
    ));


    this._maxKwp = 0;
    this._defaultBuilding = group;
    this.buildingGroup.add(group);

    this.controls.target.set(0, h / 4, 0);
    this.camera.position.set(42, 18, 50);
    this.controls.update();
  }

  // ── Construcción desde footprint real ─────────────────────────────────────
  /**
   * @param {number[][]} polygonCoords  [[x,z], ...] en metros locales
   * @param {object}     buildingData   {
   *   height,              // altura del edificio en metros
   *   solar_capacity_kwp,  // capacidad solar total (de /api/geo)
   *   roof_orientation_deg // orientación del tejado en grados (180=sur)
   *   lat?, lon?
   * }
   */
  buildFromFootprint(polygonCoords, buildingData) {
    this.controls.autoRotate = false;
    this._clearScene();

    if (!polygonCoords || polygonCoords.length < 3) return;

    const height      = buildingData.height               ?? 9;
    const solarKwp    = buildingData.solar_capacity_kwp   ?? 0;
    const orientDeg   = buildingData.roof_orientation_deg ?? 180;

    this._maxKwp        = 0;
    this._buildingLat   = buildingData.lat ?? null;
    this._buildingLon   = buildingData.lon ?? null;

    // ── 1. Shape con moveTo / lineTo explícitos ──────────────────────────────
    const shape = new THREE.Shape();
    shape.moveTo(polygonCoords[0][0], polygonCoords[0][1]);
    for (let i = 1; i < polygonCoords.length; i++) {
      shape.lineTo(polygonCoords[i][0], polygonCoords[i][1]);
    }
    shape.closePath();
    this._lastShape = shape;   // guardado para updateSolarPanels

    // ── 2. ExtrudeGeometry multimaterial ────────────────────────────────────
    // Grupos: 0 = lados/paredes, 1 = tapa inferior (z=0 → suelo tras rotX),
    //         2 = tapa superior (z=depth → tejado tras rotX)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
    this._footprintMats = [wallMat, wallMat, roofMat];

    const bodyGeom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    bodyGeom.rotateX(-Math.PI / 2);

    this.buildingMesh = new THREE.Mesh(bodyGeom, this._footprintMats);
    this.buildingMesh.castShadow    = true;
    this.buildingMesh.receiveShadow = true;
    this.buildingGroup.add(this.buildingMesh);

    // Aristas arquitectónicas sutiles
    this.edgeLine = new THREE.LineSegments(
      new THREE.EdgesGeometry(bodyGeom, 15),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
    );
    this.buildingGroup.add(this.edgeLine);

    // Overlay de cubierta para modo irradiación (oculto por defecto)
    const roofGeom = new THREE.ShapeGeometry(shape);
    roofGeom.rotateX(-Math.PI / 2);
    this.roofMesh = new THREE.Mesh(roofGeom, this.irradiationMaterial);
    this.roofMesh.position.y = height + 0.02;
    this.roofMesh.visible    = false;
    this.buildingGroup.add(this.roofMesh);

    // ── 3. Bounding box ──────────────────────────────────────────────────────
    bodyGeom.computeBoundingBox();
    const bbox = bodyGeom.boundingBox;

    // Centrar el target de sombras en el edificio
    const bCenter = new THREE.Vector3();
    bbox.getCenter(bCenter);
    this.sunLight.target.position.set(bCenter.x, 0, bCenter.z);
    this.sunLight.target.updateMatrixWorld();

    // ── 4. Paneles solares ────────────────────────────────────────────────────
    if (solarKwp > 0) {
      this._placeSolarPanels(shape, bbox, height, solarKwp, orientDeg);
    }

    // ── 5. Cámara ────────────────────────────────────────────────────────────
    this.controls.target.set(bCenter.x, height / 4, bCenter.z);
    const diag    = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z);
    const camDist = diag * 1.5 + 25;
    this.camera.position.set(bCenter.x, height + camDist * 0.35, bCenter.z + camDist * 0.8);
    this.controls.update();
  }

  // ── Simulación de arco solar ──────────────────────────────────────────────
  // t ∈ [0,1]: 0 = 06:00 (este), 1 = 20:00 (oeste)
  _animateSun(t) {
    const angle = Math.PI * t;      // 0..PI
    const elev  = Math.sin(angle);  // 0 en horizonte, 1 al mediodía

    // Arco este→oeste: el sol parte de x=-R (este) y llega a x=+R (oeste).
    // Hmin garantiza que nunca entre en el edificio ni en el suelo.
    const R    = 90;
    const Hmin = 18;   // mínimo 18 m — siempre por encima de cualquier nave
    const Hmax = 60;

    const x = -R * Math.cos(angle);            // -90 al amanecer, 0 al mediodía, +90 al atardecer
    const y =  Hmin + elev * (Hmax - Hmin);   // 18 m en horizonte, 60 m al mediodía
    const z = -R * Math.sin(angle) * 0.35;    // ligeramente al sur al mediodía

    this.sunLight.position.set(x, y, z);
    this._sunSphere.position.set(x, y, z);

    // Esfera más grande cerca del horizonte (efecto atmósfera)
    this._sunSphere.scale.setScalar(1 + (1 - elev) * 0.8);
    this._sunSphere.visible = true;

    // Color: naranja en horizonte → blanco amarillo al mediodía
    const noon = Math.max(0, elev);
    const hue  = 0.09 - noon * 0.04;
    const sat  = 0.95 - noon * 0.5;
    const lit  = 0.62 + noon * 0.28;
    this.sunLight.color.setHSL(hue, sat, lit);
    this.sunLight.intensity = noon * 1.6 + 0.1;

    // Igualar color en esfera
    this._sunSphere.material.color.copy(this.sunLight.color);

    // Fondo / niebla se calienta ligeramente con el sol
    const bgR = 0.10 + noon * 0.04;
    const bgG = 0.09 + noon * 0.06;
    const bgB = 0.08 + noon * 0.10;
    this.scene.background.setRGB(bgR, bgG, bgB);
    this.scene.fog.color.setRGB(bgR, bgG, bgB);
  }

  // ── Actualizar HUD de generación ──────────────────────────────────────────
  _updateSolarHUD() {
    if (!this._hud) return;

    // Hora simulada (06:00 → 20:00)
    const totalMin = 6 * 60 + this._simTime * 14 * 60;
    const h = Math.floor(totalMin / 60) % 24;
    const m = Math.floor(totalMin % 60);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // Generación: capacidad × sin(ángulo_solar)
    const elev  = Math.max(0, Math.sin(Math.PI * this._simTime));
    const genKw = this._maxKwp * elev;

    // Color generación: rojo en 0, verde al máximo
    const pct    = elev;
    const genR   = Math.round(255 * (1 - pct));
    const genG   = Math.round(180 * pct + 75);
    const genCol = `rgb(${genR},${genG},80)`;

    const timeEl   = document.getElementById('shud-time');
    const genEl    = document.getElementById('shud-gen');
    const capEl    = document.getElementById('shud-cap');
    const coordsEl = document.getElementById('shud-coords');

    if (timeEl) timeEl.textContent = timeStr;
    if (genEl) {
      genEl.textContent = `GEN  ${genKw.toFixed(1)} kW`;
      genEl.style.color = genCol;
    }
    if (capEl) capEl.textContent = `CAP  ${this._maxKwp.toFixed(1)} kWp`;
    if (coordsEl && this._buildingLat != null) {
      const latStr = `${Math.abs(this._buildingLat).toFixed(4)}° ${this._buildingLat >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(this._buildingLon).toFixed(4)}° ${this._buildingLon >= 0 ? 'E' : 'W'}`;
      coordsEl.textContent = `${latStr}  ${lonStr}`;
    }
  }

  /** Muestra el edificio genérico solo si la API falla y no hay footprint real */
  showFallback() {
    if (this.buildingMesh || this._defaultBuilding) return; // ya hay edificio
    this._buildDefaultBuilding();
  }

  /** Permite inyectar lat/lon desde estudio.js para mostrar en el HUD */
  setLocation(lat, lon) {
    this._buildingLat = lat;
    this._buildingLon = lon;
  }

  /**
   * Actualiza los paneles solares cuando llegan los datos de la API.
   * Se llama desde estudio.js tras el Promise.all si el edificio ya fue
   * construido desde localStorage (Mapbox footprint) antes de la API.
   * @param {number} solarKwp    - Capacidad solar total en kWp
   * @param {number} orientDeg   - Orientación del tejado en grados
   */
  updateSolarPanels(solarKwp, orientDeg = 180) {
    if (!this.buildingMesh || solarKwp <= 0) return;
    // Limpiar paneles anteriores (si existían con kWp=0)
    this.panelsGroup.clear();
    this._maxKwp = 0;
    // Necesitamos el shape y el bbox del edificio actual
    // Los reconstruimos desde la geometría existente
    const geo = this.buildingMesh.geometry;
    geo.computeBoundingBox();
    const bbox   = geo.boundingBox;
    const height = bbox.max.y;
    // Reconstruir shape desde los coords del grupo de edificio
    // Solo podemos hacerlo si guardamos el shape — lo guardamos ahora
    if (this._lastShape) {
      this._placeSolarPanels(this._lastShape, bbox, height, solarKwp, orientDeg);
    }
  }

  // ── Ventanas fachada (footprint) ─────────────────────────────────────────
  _addFacadeWindows(pts2D, height) {
    const nRows = Math.max(1, Math.floor(height / 2.5));
    const winW = 1.2, winH = 1.4, depth = 0.06;

    for (let i = 0; i < pts2D.length; i++) {
      const p1 = pts2D[i];
      const p2 = pts2D[(i + 1) % pts2D.length];
      const edgeLen = p1.distanceTo(p2);
      if (edgeLen < 2) continue;

      const dir   = new THREE.Vector2().copy(p2).sub(p1).normalize();
      const angle = Math.atan2(dir.x, dir.y);
      const cols  = Math.max(1, Math.floor((edgeLen - 2) / 3.2));

      for (let r = 0; r < nRows; r++) {
        const y = 0.6 + r * (height / (nRows + 0.5));
        if (y > height - 0.8) continue;
        for (let c = 0; c < cols; c++) {
          const t  = (c + 0.5) / cols;
          const px = p1.x + (p2.x - p1.x) * t;
          const pz = p1.y + (p2.y - p1.y) * t;

          const frame = new THREE.Mesh(
            new THREE.BoxGeometry(winW + 0.15, winH + 0.15, depth),
            this.windowFrameMat
          );
          frame.position.set(px, y, pz);
          frame.rotation.y = -angle;
          this.detailsGroup.add(frame);

          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(winW, winH, depth * 0.6),
            this.windowGlassMat
          );
          glass.position.set(px, y, pz);
          glass.rotation.y = -angle;
          this.detailsGroup.add(glass);
        }
      }
    }
  }

  // ── Ventanas edificio por defecto ─────────────────────────────────────────
  _addWindowsToBox(group, w, h, d) {
    const rows = Math.floor(h / 2.5);
    if (rows < 1) return;
    const winW = 1.2, winH = 1.5, winD = 0.08, gap = 0.15;

    const place = (cx, cy, cz, angle) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + gap, winH + gap, winD), this.windowFrameMat);
      frame.position.set(cx, cy, cz);
      frame.rotation.y = angle;
      group.add(frame);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, winD * 0.6), this.windowGlassMat);
      glass.position.set(cx, cy, cz);
      glass.rotation.y = angle;
      group.add(glass);
    };

    const colsL = Math.floor(w / 3.5), colsS = Math.floor(d / 3.5);
    const zF = -d / 2 - 0.01, zB = d / 2 + 0.01;
    for (let r = 0; r < rows; r++) {
      const y = 0.8 + r * 2.3;
      for (let c = 0; c < colsL; c++) {
        const x = -w / 2 + 2.5 + c * ((w - 4) / Math.max(colsL - 1, 1));
        place(x, y, zF, 0);
        place(x, y, zB, Math.PI);
      }
    }
    for (let r = 0; r < rows; r++) {
      const y = 0.8 + r * 2.3;
      for (let c = 0; c < colsS; c++) {
        const z = -d / 2 + 2.5 + c * ((d - 4) / Math.max(colsS - 1, 1));
        place(-w / 2 - 0.01, y, z,  Math.PI / 2);
        place( w / 2 + 0.01, y, z, -Math.PI / 2);
      }
    }
  }

  _addBandsToBox(group, w, d, h) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.08, d + 0.2), this.bandMaterial);
    band.position.y = h * 0.45;
    group.add(band);
    const band2 = band.clone();
    band2.position.y = h * 0.95;
    group.add(band2);
  }

  // ── Detalles cubierta (default) ───────────────────────────────────────────
  _addRoofBoxDetails(group, minX, maxX, minZ, maxZ, h) {
    for (let i = 0; i < 3; i++) {
      const ax = minX + 2 + Math.random() * (maxX - minX - 4);
      const az = minZ + 2 + Math.random() * (maxZ - minZ - 4);
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), this.darkMetalMat);
      ac.position.set(ax, h + 0.45, az);
      ac.castShadow = true;
      group.add(ac);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), this.darkMetalMat);
      vent.position.set(ax, h + 0.85, az);
      group.add(vent);
    }
  }

  // ── Detalles cubierta (footprint) ─────────────────────────────────────────
  _addRoofTopDetails(bbox, shape, height) {
    const { min, max } = bbox;
    for (let i = 0; i < 4; i++) {
      const ax = min.x + 2 + Math.random() * (max.x - min.x - 4);
      const az = min.z + 2 + Math.random() * (max.z - min.z - 4);
      if (!this._pointInShape(shape, ax, az)) continue;
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), this.darkMetalMat);
      ac.position.set(ax, height + 0.45, az);
      ac.castShadow = true;
      this.detailsGroup.add(ac);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), this.darkMetalMat);
      vent.position.set(ax, height + 0.85, az);
      this.detailsGroup.add(vent);
    }
    const skyMat = new THREE.MeshStandardMaterial({
      color: 0x224466, roughness: 0.1, transparent: true, opacity: 0.6,
    });
    for (let i = 0; i < 2; i++) {
      const sx = min.x + 3 + Math.random() * (max.x - min.x - 6);
      const sz = min.z + 3 + Math.random() * (max.z - min.z - 6);
      if (!this._pointInShape(shape, sx, sz)) continue;
      const sky = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.8), skyMat);
      sky.position.set(sx, height + 0.15, sz);
      this.detailsGroup.add(sky);
    }
  }

  // ── Paneles solares sobre cubierta real ───────────────────────────────────
  /**
   * Coloca paneles solares sobre el footprint real del edificio.
   *
   * Estrategia de distribución:
   *   1. Calcular el bounding box del polígono en metros locales.
   *   2. Barrer la cubierta en filas (eje Z) y columnas (eje X) con la
   *      separación correcta entre paneles.
   *   3. Para cada celda, verificar point-in-polygon antes de colocar.
   *   4. Parar cuando se alcance el número máximo de paneles derivado de kWp.
   *
   * Cada panel:
   *   - Tamaño físico real: 1.70 m (largo, eje X) × 1.00 m (ancho, eje Z)
   *   - Potencia por panel: 400 Wp = 0.4 kWp  (monocristalino estándar)
   *   - Inclinación: 15° hacia el sur (rotación en X)  — óptimo para España
   *   - Orientación: sur (sin rotación Y)
   *   - Margen perimetral: 1 m (seguridad de cubierta)
   *   - Separación entre filas: 0.6 m (para evitar sombras entre paneles)
   *
   * @param {THREE.Shape} shape        - Polígono de la cubierta (XZ en local)
   * @param {THREE.Box3}  bbox         - Bounding box del extruded building
   * @param {number}      roofY        - Altura Y de la cubierta (= height del edificio)
   * @param {number}      solarKwp     - Capacidad solar del edificio en kWp (de /api/geo)
   * @param {number}      orientDeg    - Orientación del tejado en grados (180 = sur)
   */
  _placeSolarPanels(shape, bbox, roofY, solarKwp, orientDeg = 180) {
    const PANEL_W     = 1.70;   // metros, eje X (largo del panel)
    const PANEL_D     = 1.00;   // metros, eje Z (ancho del panel)
    const PANEL_KWP   = 0.40;   // kWp por panel (400 Wp)
    const TILT_DEG    = 15;     // inclinación hacia el sur
    const MARGIN      = 1.0;    // margen perimetral en cubierta
    const GAP_X       = 0.20;   // separación entre columnas
    const GAP_Z       = 0.60;   // separación entre filas (anti-sombra)
    const HEIGHT_OFFSET = 0.08; // altura sobre el tejado

    const maxPanels = Math.max(1, Math.round(solarKwp / PANEL_KWP));

    // Calcular bounding box en el plano XZ
    const minX = bbox.min.x + MARGIN;
    const maxX = bbox.max.x - MARGIN;
    const minZ = bbox.min.z + MARGIN;
    const maxZ = bbox.max.z - MARGIN;

    // Paso en cada eje incluyendo el panel + separación
    const stepX = PANEL_W + GAP_X;
    const stepZ = PANEL_D + GAP_Z;

    // ── Centrado de la rejilla en el área disponible ──────────────────────
    // Número de columnas y filas que caben dentro del área con margen
    const availW = maxX - minX;
    const availD = maxZ - minZ;
    const nCols  = Math.max(1, Math.floor((availW + GAP_X) / stepX));
    const nRows  = Math.max(1, Math.floor((availD + GAP_Z) / stepZ));
    // Espacio real que ocupa la rejilla completa
    const gridW  = nCols * stepX - GAP_X;
    const gridD  = nRows * stepZ - GAP_Z;
    // Origen desplazado para que la rejilla quede centrada en el área
    const startX = minX + (availW - gridW) / 2;
    const startZ = minZ + (availD - gridD) / 2;

    // Inclinación: el panel se eleva por el lado norte y apoya por el sur.
    // Con tilt 15°, el extremo norte sube: sin(15°) × PANEL_D / 2 ≈ 0.13 m
    const tiltRad = (TILT_DEG * Math.PI) / 180;

    // Rotación del panel según orientación del tejado
    // 180° = sur → sin rotación Y adicional; ajustar si orientDeg difiere
    const panelRotY = ((orientDeg - 180) * Math.PI) / 180;

    let placed = 0;

    for (let row = 0; row < nRows && placed < maxPanels; row++) {
      for (let col = 0; col < nCols && placed < maxPanels; col++) {
        // Centro del panel en XZ
        const cx = startX + col * stepX + PANEL_W / 2;
        const cz = startZ + row * stepZ + PANEL_D / 2;

        // shape.y = -3D.z tras rotateX(-π/2), por eso se invierte cz
        if (!this._pointInShape(shape, cx, -cz)) continue;

        // ── Geometría del panel ────────────────────────────────────────────
        // Plano fino con relieve de marco (espesor 0.04 m)
        const panelGeo = new THREE.BoxGeometry(PANEL_W - 0.05, 0.03, PANEL_D - 0.05);
        const panel    = new THREE.Mesh(panelGeo, this.panelMaterial);

        // Marco de aluminio: caja ligeramente más grande, más delgada
        const frameGeo = new THREE.BoxGeometry(PANEL_W, 0.025, PANEL_D);
        const frame    = new THREE.Mesh(frameGeo, this.panelFrameMat);

        // Grupo que agrupa panel + marco para aplicarles la misma transformación
        const group = new THREE.Group();
        group.add(panel);
        group.add(frame);

        // ── Posición sobre la cubierta ─────────────────────────────────────
        // Y base = roofY + offset + ajuste por inclinación
        const yBase = roofY + HEIGHT_OFFSET;
        group.position.set(cx, yBase, cz);

        // ── Inclinación hacia el sur ───────────────────────────────────────
        // rotateX(+tiltRad): eleva el lado norte (-Z) y baja el sur (+Z)
        // → cara del panel apunta al Sur (+Z) — óptimo para España
        group.rotation.x = tiltRad;

        // ── Orientación del tejado ─────────────────────────────────────────
        if (Math.abs(panelRotY) > 0.01) {
          group.rotation.y = panelRotY;
        }

        group.castShadow    = true;
        group.receiveShadow = true;

        this.panelsGroup.add(group);
        placed++;
      }
    }

    // Actualizar kWp real instalado en el HUD (puede ser menor que el teórico
    // si el polígono es irregular y no caben todos los paneles)
    this._maxKwp = placed * PANEL_KWP;
  }

  // ── Point-in-polygon (ray-casting 2D) ────────────────────────────────────
  _pointInShape(shape, x, z) {
    const pts = shape.getPoints();
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, zi = pts[i].y;
      const xj = pts[j].x, zj = pts[j].y;
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ── Limpiar escena ────────────────────────────────────────────────────────
  _clearScene() {
    this.buildingGroup.clear();
    this.detailsGroup.clear();
    this.panelsGroup.clear();
    if (this.lidarPoints) {
      this.scene.remove(this.lidarPoints);
      this.lidarPoints = null;
    }
    this.buildingMesh     = null;
    this.roofMesh         = null;
    this.edgeLine         = null;
    this._footprintMats   = null;
    this._defaultBuilding = null;
    this._lastShape       = null;
  }

  // ── Nube de puntos LiDAR ──────────────────────────────────────────────────
  loadLidarPointCloud(pointCloud) {
    if (!pointCloud || pointCloud.length === 0) return;

    const positions = [], colors = [];
    const cRoof   = new THREE.Color(0xf45d48);
    const cWall   = new THREE.Color(0x078080);
    const cGround = new THREE.Color(0x7a6e62);

    pointCloud.forEach(([x, y, z, intensity]) => {
      positions.push(x, z, -y);
      const c = intensity > 110 ? cRoof : intensity > 50 ? cWall : cGround;
      colors.push(c.r, c.g, c.b);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));

    this.lidarPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.45, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true,
    }));
    this.scene.add(this.lidarPoints);
    if (this.currentMode !== 'lidar') this.lidarPoints.visible = false;
  }

  // ── Cambio de modo visual ─────────────────────────────────────────────────
  setMode(mode, data = {}) {
    this.currentMode = mode;

    this.buildingGroup.visible = mode !== 'lidar';
    this.detailsGroup.visible  = mode !== 'lidar';
    this.panelsGroup.visible   = mode === 'paneles';

    if (this.lidarPoints) this.lidarPoints.visible = mode === 'lidar';

    if (this.buildingMesh) {
      if (mode === 'irradiacion') {
        this.buildingMesh.material = this.irradiationMaterial;
        if (this.roofMesh) { this.roofMesh.material = this.irradiationMaterial; this.roofMesh.visible = true; }
        if (this.edgeLine) this.edgeLine.material.color.setHex(0xffaa00);
      } else {
        this.buildingMesh.material = this._footprintMats ?? this.wallMaterial;
        if (this.roofMesh) this.roofMesh.visible = false;
        if (this.edgeLine) this.edgeLine.material.color.setHex(0x000000);
      }
    }
  }

  // ── Bucle de animación ────────────────────────────────────────────────────
  animate() {
    requestAnimationFrame(this.animate);
    this.controls.update();

    // Avanzar tiempo simulado: 20 s reales = día completo (06:00 → 20:00)
    const now = Date.now();
    const dt  = Math.min((now - this._lastFrameTime) / 1000, 0.1);
    this._lastFrameTime = now;
    this._simTime = (this._simTime + dt / 20) % 1.0;

    this._animateSun(this._simTime);
    this._updateSolarHUD();

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
}
