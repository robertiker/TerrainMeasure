import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Delaunay } from 'd3-delaunay';
import { jsPDF } from 'jspdf';

// --- 1. GENERADOR DE LOGO HD ---
function buildDetailedLogo() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const bgGrad = ctx.createLinearGradient(0, 0, 256, 256);
  bgGrad.addColorStop(0, '#42a5f5'); bgGrad.addColorStop(1, '#1565c0');
  ctx.beginPath(); ctx.roundRect(0, 0, 256, 256, 56); ctx.fillStyle = bgGrad; ctx.fill();

  const radarGrad = ctx.createRadialGradient(128, 128, 10, 128, 128, 90);
  radarGrad.addColorStop(0, '#0d47a1'); radarGrad.addColorStop(1, '#0a2463');
  ctx.beginPath(); ctx.arc(128, 128, 92, 0, Math.PI * 2); ctx.fillStyle = radarGrad; ctx.fill();
  ctx.strokeStyle = '#1e88e5'; ctx.lineWidth = 3; ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(128, 128, 60, 0, Math.PI * 2); ctx.arc(128, 128, 30, 0, Math.PI * 2);
  ctx.moveTo(128, 36); ctx.lineTo(128, 220); ctx.moveTo(36, 128); ctx.lineTo(220, 128);
  ctx.stroke();

  const polyGrad = ctx.createLinearGradient(80, 80, 180, 180);
  polyGrad.addColorStop(0, '#76ff03'); polyGrad.addColorStop(1, '#00c853');
  ctx.beginPath();
  ctx.moveTo(120, 75); ctx.lineTo(170, 85); ctx.lineTo(150, 165);
  ctx.lineTo(85, 175); ctx.lineTo(100, 130); ctx.lineTo(135, 120);
  ctx.closePath(); ctx.fillStyle = polyGrad; ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.stroke();

  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(100, 80, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#76ff03'; ctx.beginPath(); ctx.arc(100, 80, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(110, 82, 16, 8);

  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.beginPath();
  ctx.moveTo(178, 85); ctx.lineTo(158, 165); ctx.stroke();

  ctx.fillStyle = '#ffffff';
  [{x:178, y:85}, {x:168, y:125}, {x:158, y:165}].forEach(pt => {
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2); ctx.fill();
  });

  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(165, 115, 62, 22, 6); ctx.fill();
  ctx.fillStyle = '#0d47a1'; ctx.font = 'Bold 10px system-ui, sans-serif'; ctx.fillText('4.2 KM²', 173, 130);
  return c.toDataURL('image/png');
}

const highResLogo = buildDetailedLogo();
document.getElementById('app-logo').src = highResLogo;
document.getElementById('app-favicon').href = highResLogo;
document.getElementById('apple-icon').href = highResLogo;

function createTextSprite(text, colorStr = '#ffffff') {
  const canvasText = document.createElement('canvas');
  canvasText.width = 128; canvasText.height = 64;
  const ctx = canvasText.getContext('2d');
  ctx.fillStyle = colorStr;
  ctx.font = 'Bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);

  const texture = new THREE.CanvasTexture(canvasText);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.8, 0.4, 1);
  return sprite;
}

function createRulerAxes(size = 20) {
  const group = new THREE.Group();
  const axesHelper = new THREE.AxesHelper(size);
  group.add(axesHelper);

  for (let i = 1; i <= size; i += 2) {
    const spX = createTextSprite(`${i}m`, '#ff5252');
    spX.position.set(i, -0.2, 0); group.add(spX);

    const spY = createTextSprite(`${i}m`, '#69f0ae');
    spY.position.set(-0.3, i, 0); group.add(spY);

    const spZ = createTextSprite(`${i}m`, '#448aff');
    spZ.position.set(0, -0.2, i); group.add(spZ);
  }
  return group;
}

// --- 2. ESTADO GLOBAL Y MODOS ---
let currentMode = 'polygon';
const points = [];
const innerPoints = [];
let selectedIndex = -1;
let selectedType = 'outer';
let isClosed = false;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const welcomeModal = document.getElementById('welcome-modal');
const infoModal = document.getElementById('info-modal');
const modeTag = document.getElementById('mode-tag');

// --- 3. EVENTOS ---
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('.mode-btn');
    const selected = targetBtn.getAttribute('data-mode');
    setMeasurementMode(selected);
    welcomeModal.style.display = 'none';
  });
});

document.getElementById('btnChangeMode').addEventListener('click', () => {
  welcomeModal.style.display = 'flex';
});

document.getElementById('btn-info').addEventListener('click', () => {
  infoModal.style.display = 'flex';
  setTimeout(() => {
    renderInfoModal();
  }, 50);
});

document.getElementById('btnCloseInfo').addEventListener('click', () => {
  infoModal.style.display = 'none';
  if (infoControls) {
    infoControls.dispose();
    infoControls = null;
  }
});

document.getElementById('btnExportPDF').addEventListener('click', exportReportPDF);

function setMeasurementMode(mode) {
  currentMode = mode;
  resetData();

  if (mode === 'polygon') {
    modeTag.innerText = 'Modo: Terreno / Plano';
    document.getElementById('lbl-m1-title').innerText = 'Puntos Ext';
    document.getElementById('lbl-m2-title').innerText = 'Puntos Int';
    document.getElementById('lbl-m3-title').innerText = 'Perímetro 3D';
    document.getElementById('lbl-m4-title').innerText = 'Área Planta';
  } else if (mode === 'distance') {
    modeTag.innerText = 'Modo: Distancias Lineales';
    document.getElementById('lbl-m1-title').innerText = 'Tramos';
    document.getElementById('lbl-m2-title').innerText = 'Último Tramo';
    document.getElementById('lbl-m3-title').innerText = 'Dist. Acumulada';
    document.getElementById('lbl-m4-title').innerText = 'Dist. Directa A-B';
  } else if (mode === 'elevation') {
    modeTag.innerText = 'Modo: Elevaciones (ΔZ)';
    document.getElementById('lbl-m1-title').innerText = 'Cotas';
    document.getElementById('lbl-m2-title').innerText = 'Desnivel ΔZ';
    document.getElementById('lbl-m3-title').innerText = 'Cota Max';
    document.getElementById('lbl-m4-title').innerText = 'Cota Min';
  }
  updateMetrics();
  update3DScene();
}

function resetData() {
  points.length = 0;
  innerPoints.length = 0;
  selectedIndex = -1;
  isClosed = false;
  simIdx = 0;
  showSelectionCard(false);
}

// --- 4. ESCENA PRINCIPAL THREE.JS ---
const canvas = document.getElementById('canvas3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121212);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(6, 6, 8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

scene.add(new THREE.GridHelper(20, 20, 0x444444, 0x222222));
scene.add(createRulerAxes(20));
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const lineGroup = new THREE.Group();
const nodeGroup = new THREE.Group();
const projectionGroup = new THREE.Group();
let meshSurface3D = null;
let meshSurface2D = null;

scene.add(lineGroup);
scene.add(nodeGroup);
scene.add(projectionGroup);

// --- 5. VIEWCUBE ---
const cubeContainer = document.getElementById('viewcube-container');
const cubeScene = new THREE.Scene();
const cubeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
cubeCamera.position.set(0, 0, 4);

const cubeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
cubeRenderer.setSize(100, 100);
cubeContainer.appendChild(cubeRenderer.domElement);

cubeScene.add(new THREE.AmbientLight(0xffffff, 0.8));

function createCubeFaceTexture(text) {
  const canvasText = document.createElement('canvas');
  canvasText.width = 128; canvasText.height = 128;
  const ctx = canvasText.getContext('2d');
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff'; ctx.font = 'Bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 64);
  return new THREE.CanvasTexture(canvasText);
}

const materials = [
  new THREE.MeshBasicMaterial({ map: createCubeFaceTexture('Derecha'), userData: 'right' }),
  new THREE.MeshBasicMaterial({ map: createCubeFaceTexture('Izquierda'), userData: 'left' }),
  new THREE.MeshBasicMaterial({ map: createCubeFaceTexture('Superior'), userData: 'top' }),
  new THREE.MeshBasicMaterial({ map: createCubeFaceTexture('Inferior'), userData: 'bottom' }),
  new THREE.MeshBasicMaterial({ map: createCubeFaceTexture('Frontal'), userData: 'front' }),
  new THREE.MeshBasicMaterial({ map: createCubeFaceTexture('Posterior'), userData: 'back' })
];

const viewCubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), materials);
cubeScene.add(viewCubeMesh);

let isDraggingCube = false;
let cubeDragDistance = 0;
let previousPointerPosition = { x: 0, y: 0 };
const cubeRaycaster = new THREE.Raycaster();
const cubeMouse = new THREE.Vector2();

cubeContainer.addEventListener('pointerdown', (e) => {
  isDraggingCube = true; cubeDragDistance = 0;
  previousPointerPosition = { x: e.clientX, y: e.clientY };
  cubeContainer.setPointerCapture(e.pointerId);
});

cubeContainer.addEventListener('pointermove', (e) => {
  if (!isDraggingCube) return;
  const deltaX = e.clientX - previousPointerPosition.x;
  const deltaY = e.clientY - previousPointerPosition.y;
  cubeDragDistance += Math.hypot(deltaX, deltaY);

  if (cubeDragDistance > 3) {
    const rotateSpeed = 0.008;
    const offset = camera.position.clone().sub(controls.target);
    let spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= deltaX * rotateSpeed;
    spherical.phi -= deltaY * rotateSpeed;
    spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }
  previousPointerPosition = { x: e.clientX, y: e.clientY };
});

cubeContainer.addEventListener('pointerup', (e) => {
  if (!isDraggingCube) return;
  isDraggingCube = false;
  cubeContainer.releasePointerCapture(e.pointerId);

  if (cubeDragDistance <= 5) {
    const rect = cubeContainer.getBoundingClientRect();
    cubeMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    cubeMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    cubeRaycaster.setFromCamera(cubeMouse, cubeCamera);
    const intersects = cubeRaycaster.intersectObject(viewCubeMesh);

    if (intersects.length > 0) {
      const faceIndex = intersects[0].face.materialIndex;
      setCameraView(materials[faceIndex].userData);
    }
  }
});

function setCameraView(view) {
  const target = controls.target.clone();
  const dist = 12;
  switch (view) {
    case 'top': camera.position.set(target.x, target.y + dist, target.z + 0.001); break;
    case 'front': camera.position.set(target.x, target.y, target.z + dist); break;
    case 'back': camera.position.set(target.x, target.y, target.z - dist); break;
    case 'right': camera.position.set(target.x + dist, target.y, target.z); break;
    case 'left': camera.position.set(target.x - dist, target.y, target.z); break;
    case 'bottom': camera.position.set(target.x, target.y - dist, target.z + 0.001); break;
  }
  controls.update();
}

document.getElementById('btn-home').addEventListener('click', () => setCameraView('top'));

function isPointInPolygon(pt, polygon) {
  const x = pt[0], z = pt[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    const intersect = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// --- 6. RENDERIZADO DE LA ESCENA ---
function update3DScene() {
  lineGroup.clear(); nodeGroup.clear(); projectionGroup.clear();

  if (meshSurface3D) { scene.remove(meshSurface3D); meshSurface3D.geometry.dispose(); meshSurface3D.material.dispose(); meshSurface3D = null; }
  if (meshSurface2D) { scene.remove(meshSurface2D); meshSurface2D.geometry.dispose(); meshSurface2D.material.dispose(); meshSurface2D = null; }

  if (points.length === 0) return;

  const sphereGeo = new THREE.SphereGeometry(0.12, 16, 16);

  points.forEach((p, index) => {
    let color = 0x2196f3;
    if (currentMode === 'elevation') color = 0x9c27b0;
    let scale = (selectedType === 'outer' && index === selectedIndex) ? (color = 0xff9800, 1.5) : 1.0;
    if (index === 0) color = 0xf44336;

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.copy(p);
    sphere.scale.setScalar(scale);
    sphere.userData = { pointIndex: index, type: 'outer' };
    nodeGroup.add(sphere);

    const dropPoints = [p.clone(), new THREE.Vector3(p.x, 0, p.z)];
    const dropGeo = new THREE.BufferGeometry().setFromPoints(dropPoints);
    const dropMat = new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 0.1, gapSize: 0.1 });
    const dropLine = new THREE.Line(dropGeo, dropMat);
    dropLine.computeLineDistances();
    projectionGroup.add(dropLine);
  });

  innerPoints.forEach((p, index) => {
    let color = 0xff9800;
    let scale = (selectedType === 'inner' && index === selectedIndex) ? (color = 0xffeb3b, 1.6) : 1.1;

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2 });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.copy(p);
    sphere.scale.setScalar(scale);
    sphere.userData = { pointIndex: index, type: 'inner' };
    nodeGroup.add(sphere);

    const dropPoints = [p.clone(), new THREE.Vector3(p.x, 0, p.z)];
    const dropGeo = new THREE.BufferGeometry().setFromPoints(dropPoints);
    const dropMat = new THREE.LineDashedMaterial({ color: 0xff9800, dashSize: 0.08, gapSize: 0.08 });
    const dropLine = new THREE.Line(dropGeo, dropMat);
    dropLine.computeLineDistances();
    projectionGroup.add(dropLine);
  });

  if (points.length > 1) {
    const linePoints = [...points];
    if (isClosed && currentMode === 'polygon') linePoints.push(points[0]);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: isClosed ? 0x00e676 : 0x2196f3,
      linewidth: 3
    });
    lineGroup.add(new THREE.Line(lineGeo, lineMat));
  }

  if (currentMode === 'polygon' && isClosed && points.length >= 3) {
    const shape2D = new THREE.Shape();
    shape2D.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) shape2D.lineTo(points[i].x, points[i].z);
    const shapeGeo2D = new THREE.ShapeGeometry(shape2D);
    shapeGeo2D.rotateX(Math.PI / 2);

    const fillMat2D = new THREE.MeshBasicMaterial({ color: 0x2e7d32, side: THREE.DoubleSide, transparent: true, opacity: 0.25 });
    meshSurface2D = new THREE.Mesh(shapeGeo2D, fillMat2D);
    meshSurface2D.position.y = 0.001;
    scene.add(meshSurface2D);

    const allPoints = [...points, ...innerPoints];
    const coords2D = allPoints.map(p => [p.x, p.z]);
    const delaunay = Delaunay.from(coords2D);
    const rawTriangles = delaunay.triangles;

    const validIndices = [];
    for (let i = 0; i < rawTriangles.length; i += 3) {
      const ia = rawTriangles[i], ib = rawTriangles[i+1], ic = rawTriangles[i+2];
      const pa = allPoints[ia], pb = allPoints[ib], pc = allPoints[ic];
      const cx = (pa.x + pb.x + pc.x) / 3;
      const cz = (pa.z + pb.z + pc.z) / 3;

      if (isPointInPolygon([cx, cz], points)) validIndices.push(ia, ib, ic);
    }

    const vertices = [];
    allPoints.forEach(p => vertices.push(p.x, p.y, p.z));

    const geo3D = new THREE.BufferGeometry();
    geo3D.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo3D.setIndex(validIndices);
    geo3D.computeVertexNormals();

    const wireframeGeo = new THREE.WireframeGeometry(geo3D);
    const wireframeMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2, transparent: true, opacity: 0.85 });
    const wireframeMesh = new THREE.LineSegments(wireframeGeo, wireframeMat);

    const fillMat3D = new THREE.MeshStandardMaterial({ color: 0x1b5e20, side: THREE.DoubleSide, transparent: true, opacity: 0.45, roughness: 0.5 });
    meshSurface3D = new THREE.Mesh(geo3D, fillMat3D);
    meshSurface3D.add(wireframeMesh);
    scene.add(meshSurface3D);
  }
}

// --- 7. RENDER DEL GRÁFICO Y DATOS EN EL MODAL "i" ---
let infoRenderer = null;
let infoScene = null;
let infoCamera = null;
let infoControls = null;

function renderInfoModal() {
  const title = document.getElementById('info-title');
  const statsContainer = document.getElementById('info-stats-container');
  const container = document.querySelector('.canvas-preview-container');

  if (infoRenderer) {
    infoRenderer.dispose();
    infoRenderer = null;
  }
  if (infoControls) {
    infoControls.dispose();
    infoControls = null;
  }

  container.innerHTML = '<canvas id="previewCanvas" style="width:100%; height:220px; display:block; cursor:grab;"></canvas>';
  const pCanvas = document.getElementById('previewCanvas');

  if (points.length === 0) {
    const ctx = pCanvas.getContext('2d');
    pCanvas.width = 800; pCanvas.height = 440;
    ctx.fillStyle = '#666';
    ctx.font = '24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos de medición aún', 400, 220);
    statsContainer.innerHTML = `<div class="stat-box" style="grid-column: span 2;"><label>Estado</label><span>Añade puntos para ver el informe</span></div>`;
    return;
  }

  if (currentMode === 'polygon') {
    title.innerText = 'Perspectiva Diédrica Topográfica (3D Rotable)';
    drawDihedral3DPreview(pCanvas);

    let area = 0;
    if (isClosed && points.length >= 3) {
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i], p2 = points[(i + 1) % points.length];
        area += (p1.x * p2.z) - (p2.x * p1.z);
      }
      area = Math.abs(area) / 2;
    }

    let perim3D = 0;
    for (let i = 1; i < points.length; i++) perim3D += points[i].distanceTo(points[i - 1]);
    if (isClosed && points.length > 2) perim3D += points[points.length - 1].distanceTo(points[0]);

    let perim2D = 0;
    for (let i = 1; i < points.length; i++) perim2D += Math.hypot(points[i].x - points[i-1].x, points[i].z - points[i-1].z);
    if (isClosed && points.length > 2) perim2D += Math.hypot(points[points.length-1].x - points[0].x, points[points.length-1].z - points[0].z);

    const avgY = points.reduce((acc, p) => acc + p.y, 0) / points.length;
    const volumeEst = area * Math.max(Math.abs(avgY), 0.3);

    statsContainer.innerHTML = `
      <div class="stat-box"><label>Área Planta</label><span>${area.toFixed(2)} m²</span></div>
      <div class="stat-box"><label>Volumen Est.</label><span>${volumeEst.toFixed(2)} m³</span></div>
      <div class="stat-box"><label>Perímetro 3D</label><span>${perim3D.toFixed(2)} m</span></div>
      <div class="stat-box"><label>Perímetro 2D</label><span>${perim2D.toFixed(2)} m</span></div>
      <div class="stat-box"><label>Puntos Ext</label><span>${points.length} pts</span></div>
      <div class="stat-box"><label>Puntos Int</label><span>${innerPoints.length} pts</span></div>
    `;
  }
  else if (currentMode === 'distance') {
    title.innerText = 'Informe de Distancias Lineales';
    drawDistancePreview2D(pCanvas);

    let totalDist = 0;
    for (let i = 1; i < points.length; i++) totalDist += points[i].distanceTo(points[i - 1]);
    let directDist = points.length > 1 ? points[0].distanceTo(points[points.length - 1]) : 0;

    statsContainer.innerHTML = `
      <div class="stat-box"><label>Dist. Acumulada</label><span>${totalDist.toFixed(2)} m</span></div>
      <div class="stat-box"><label>Dist. Directa A-B</label><span>${directDist.toFixed(2)} m</span></div>
      <div class="stat-box"><label>Número Tramos</label><span>${points.length > 1 ? points.length - 1 : 0}</span></div>
      <div class="stat-box"><label>Puntos Clicados</label><span>${points.length}</span></div>
    `;
  }
  else if (currentMode === 'elevation') {
    title.innerText = 'Perfil Altimétrico (Elevación)';
    drawElevationPreview2D(pCanvas);

    let deltaY = points.length > 1 ? points[points.length - 1].y - points[0].y : 0;
    let maxY = Math.max(...points.map(p => p.y));
    let minY = Math.min(...points.map(p => p.y));

    statsContainer.innerHTML = `
      <div class="stat-box"><label>Desnivel Total ΔZ</label><span>${(deltaY >= 0 ? '+' : '') + deltaY.toFixed(2)} m</span></div>
      <div class="stat-box"><label>Cota Máxima Z</label><span>${maxY.toFixed(2)} m</span></div>
      <div class="stat-box"><label>Cota Mínima Z</label><span>${minY.toFixed(2)} m</span></div>
      <div class="stat-box"><label>Cotas Medidas</label><span>${points.length}</span></div>
    `;
  }
}

function drawDihedral3DPreview(canvasEl) {
  const width = canvasEl.clientWidth || 400;
  const height = canvasEl.clientHeight || 220;

  infoRenderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, preserveDrawingBuffer: true });
  infoRenderer.setSize(width, height, false);
  infoRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  infoScene = new THREE.Scene();
  infoScene.background = new THREE.Color(0x181818);

  const allPoints = [...points, ...innerPoints];
  if (allPoints.length === 0) return;

  const box = new THREE.Box3();
  allPoints.forEach(p => box.expandByPoint(p));
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z, 2);
  const aspect = width / height;

  infoCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  infoCamera.position.set(center.x + maxDim * 1.5, center.y + maxDim * 1.4, center.z + maxDim * 1.5);

  infoControls = new OrbitControls(infoCamera, infoRenderer.domElement);
  infoControls.enableDamping = true;
  infoControls.dampingFactor = 0.05;
  infoControls.target.copy(center);
  infoControls.update();

  const gridSize = Math.max(maxDim * 2.5, 12);
  const grid = new THREE.GridHelper(gridSize, 16, 0x666666, 0x333333);
  grid.position.set(center.x, 0, center.z);
  infoScene.add(grid);

  const ruler = createRulerAxes(gridSize / 2);
  infoScene.add(ruler);

  infoScene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(center.x + 10, center.y + 20, center.z + 10);
  infoScene.add(dirLight);

  const sphereGeo = new THREE.SphereGeometry(maxDim * 0.025 || 0.12, 16, 16);
  points.forEach((p, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: i === 0 ? 0xf44336 : 0x2196f3 });
    const sp = new THREE.Mesh(sphereGeo, mat);
    sp.position.copy(p);
    infoScene.add(sp);
  });

  innerPoints.forEach(p => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff9800 });
    const sp = new THREE.Mesh(sphereGeo, mat);
    sp.position.copy(p);
    infoScene.add(sp);
  });

  if (points.length > 1) {
    const linePts = [...points];
    if (isClosed) linePts.push(points[0]);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    const lineMat = new THREE.LineBasicMaterial({ color: isClosed ? 0x00e676 : 0x2196f3, linewidth: 3 });
    infoScene.add(new THREE.Line(lineGeo, lineMat));
  }

  if (points.length >= 3) {
    const coords2D = allPoints.map(p => [p.x, p.z]);
    const delaunay = Delaunay.from(coords2D);
    const rawTriangles = delaunay.triangles;

    const validIndices = [];
    for (let i = 0; i < rawTriangles.length; i += 3) {
      const ia = rawTriangles[i], ib = rawTriangles[i+1], ic = rawTriangles[i+2];
      const pa = allPoints[ia], pb = allPoints[ib], pc = allPoints[ic];
      const cx = (pa.x + pb.x + pc.x) / 3;
      const cz = (pa.z + pb.z + pc.z) / 3;

      if (!isClosed || isPointInPolygon([cx, cz], points)) {
        validIndices.push(ia, ib, ic);
      }
    }

    if (validIndices.length > 0) {
      let minY = Math.min(...allPoints.map(p => p.y));
      let maxY = Math.max(...allPoints.map(p => p.y));
      const rangeY = (maxY - minY) || 1;

      function getHeatmapColor(y) {
        const t = (y - minY) / rangeY;
        const color = new THREE.Color();
        if (t < 0.33) {
          color.setHSL(0.66 - (t / 0.33) * 0.33, 1, 0.5);
        } else if (t < 0.66) {
          color.setHSL(0.33 - ((t - 0.33) / 0.33) * 0.16, 1, 0.5);
        } else {
          color.setHSL(0.17 - ((t - 0.66) / 0.34) * 0.17, 1, 0.5);
        }
        return color;
      }

      const vertices = [];
      const colors = [];

      allPoints.forEach(p => {
        vertices.push(p.x, p.y, p.z);
        const c = getHeatmapColor(p.y);
        colors.push(c.r, c.g, c.b);
      });

      const topGeo = new THREE.BufferGeometry();
      topGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      topGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      topGeo.setIndex(validIndices);
      topGeo.computeVertexNormals();

      const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.4 });
      const topMesh = new THREE.Mesh(topGeo, topMat);

      const wireframeGeo = new THREE.WireframeGeometry(topGeo);
      const wireframeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1.5 });
      const wireframeMesh = new THREE.LineSegments(wireframeGeo, wireframeMat);
      topMesh.add(wireframeMesh);

      infoScene.add(topMesh);

      if (isClosed) {
        const sideVertices = [];
        const sideIndices = [];
        let sIdx = 0;

        for (let i = 0; i < points.length; i++) {
          const nextI = (i + 1) % points.length;
          const p1 = points[i];
          const p2 = points[nextI];

          sideVertices.push(p1.x, p1.y, p1.z);
          sideVertices.push(p2.x, p2.y, p2.z);
          sideVertices.push(p1.x, 0, p1.z);
          sideVertices.push(p2.x, 0, p2.z);

          sideIndices.push(sIdx, sIdx + 2, sIdx + 1);
          sideIndices.push(sIdx + 1, sIdx + 2, sIdx + 3);

          sIdx += 4;
        }

        const sideGeo = new THREE.BufferGeometry();
        sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sideVertices, 3));
        sideGeo.setIndex(sideIndices);
        sideGeo.computeVertexNormals();

        const sideMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide, roughness: 0.6 });
        const sideMesh = new THREE.Mesh(sideGeo, sideMat);

        const sideWireGeo = new THREE.WireframeGeometry(sideGeo);
        const sideWireMesh = new THREE.LineSegments(sideWireGeo, wireframeMat);
        sideMesh.add(sideWireMesh);

        infoScene.add(sideMesh);
      }
    }
  }

  function animateInfo() {
    if (!infoRenderer) return;
    requestAnimationFrame(animateInfo);
    infoControls.update();
    infoRenderer.render(infoScene, infoCamera);
  }
  animateInfo();
}

function drawDistancePreview2D(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  const rect = canvasEl.getBoundingClientRect();
  canvasEl.width = (rect.width || 400) * 2;
  canvasEl.height = 220 * 2;
  const w = canvasEl.width;
  const h = canvasEl.height;

  ctx.clearRect(0, 0, w, h);

  let minX = Math.min(...points.map(p=>p.x)), maxX = Math.max(...points.map(p=>p.x));
  let minZ = Math.min(...points.map(p=>p.z)), maxZ = Math.max(...points.map(p=>p.z));

  const pad = 60;
  const rangeX = (maxX - minX) || 1;
  const rangeZ = (maxZ - minZ) || 1;
  const scale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeZ);

  const toScreen = (p) => ({
    x: w / 2 + (p.x - (minX + maxX) / 2) * scale,
    y: h / 2 + (p.z - (minZ + maxZ) / 2) * scale
  });

  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.fillStyle = '#888'; ctx.font = '20px system-ui';
  for(let x = pad; x < w - pad; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
    const meterVal = ((x - pad) / scale).toFixed(1);
    ctx.fillText(`${meterVal}m`, x - 15, h - pad + 30);
  }

  if (points.length > 1) {
    ctx.beginPath();
    const p0 = toScreen(points[0]);
    ctx.moveTo(p0.x, p0.y);
    for(let i = 1; i < points.length; i++) {
      const pt = toScreen(points[i]);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = '#2196f3'; ctx.lineWidth = 5; ctx.stroke();
  }

  points.forEach((p, i) => {
    const pt = toScreen(p);
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#f44336' : '#2196f3'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  });
}

function drawElevationPreview2D(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  const rect = canvasEl.getBoundingClientRect();
  canvasEl.width = (rect.width || 400) * 2;
  canvasEl.height = 220 * 2;
  const w = canvasEl.width;
  const h = canvasEl.height;

  ctx.clearRect(0, 0, w, h);

  const pad = 60;
  let distances = [0];
  let acc = 0;
  for(let i = 1; i < points.length; i++) {
    acc += Math.hypot(points[i].x - points[i-1].x, points[i].z - points[i-1].z);
    distances.push(acc);
  }

  let minY = Math.min(...points.map(p=>p.y)), maxY = Math.max(...points.map(p=>p.y));
  let maxD = distances[distances.length - 1] || 1;
  let rangeY = (maxY - minY) || 1;

  const scaleX = (w - pad * 2) / maxD;
  const scaleY = (h - pad * 2) / rangeY;

  ctx.strokeStyle = '#666'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, h - pad); ctx.lineTo(w - pad, h - pad);
  ctx.moveTo(pad, pad); ctx.lineTo(pad, h - pad);
  ctx.stroke();

  ctx.fillStyle = '#ffeb3b'; ctx.font = '18px system-ui';
  ctx.fillText(`${maxY.toFixed(1)}m`, 10, pad + 10);
  ctx.fillText(`${minY.toFixed(1)}m`, 10, h - pad);

  ctx.beginPath();
  points.forEach((p, i) => {
    const sx = pad + distances[i] * scaleX;
    const sy = (h - pad) - (p.y - minY) * scaleY;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 5; ctx.stroke();

  const lastX = pad + distances[distances.length - 1] * scaleX;
  ctx.lineTo(lastX, h - pad);
  ctx.lineTo(pad, h - pad);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 235, 59, 0.2)';
  ctx.fill();

  points.forEach((p, i) => {
    const sx = pad + distances[i] * scaleX;
    const sy = (h - pad) - (p.y - minY) * scaleY;
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#9c27b0'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  });
}

// --- 8. EXPORTACIÓN A PDF CON NORMATIVA TOPOGRÁFICA (Z = ELEVACIÓN) ---
function exportReportPDF() {
  if (points.length === 0) {
    alert("No hay datos de medición para generar el PDF.");
    return;
  }

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pCanvas = document.getElementById('previewCanvas');

  // Encabezado
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(0, 230, 118);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text("GeoMeasure 3D - Informe Técnico Topográfico", 14, 18);

  const dateStr = new Date().toLocaleString('es-ES');
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${dateStr}`, 145, 18);

  // Modo de Trabajo
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const modeTitle = currentMode === 'polygon' ? 'PLANO CERRADO / TERRENO' :
                   (currentMode === 'distance' ? 'DISTANCIAS LINEALES' : 'ELEVACIONES / ALTIMETRÍA');
  doc.text(`TRABAJO: ${modeTitle}`, 14, 38);

  // Captura del Canvas del Modal
  try {
    const imgData = pCanvas.toDataURL('image/png');
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 42, 182, 95, 'F');
    doc.addImage(imgData, 'PNG', 15, 43, 180, 93);
  } catch (err) {
    console.error("Error al capturar la imagen para el PDF:", err);
  }

  // Resumen de Métricas
  doc.setFontSize(12);
  doc.setTextColor(0, 150, 136);
  doc.text("Resumen de Métricas", 14, 146);

  doc.setLineWidth(0.5);
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 148, 196, 148);

  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.setFont('helvetica', 'normal');

  let yPos = 156;
  if (currentMode === 'polygon') {
    let area = 0;
    if (isClosed && points.length >= 3) {
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i], p2 = points[(i + 1) % points.length];
        area += (p1.x * p2.z) - (p2.x * p1.z);
      }
      area = Math.abs(area) / 2;
    }
    let perim3D = 0;
    for (let i = 1; i < points.length; i++) perim3D += points[i].distanceTo(points[i - 1]);
    if (isClosed && points.length > 2) perim3D += points[points.length - 1].distanceTo(points[0]);

    const avgY = points.reduce((acc, p) => acc + p.y, 0) / points.length;
    const volumeEst = area * Math.max(Math.abs(avgY), 0.3);

    doc.text(`• Área en Planta: ${area.toFixed(2)} m²`, 16, yPos);
    doc.text(`• Volumen Estimado: ${volumeEst.toFixed(2)} m³`, 110, yPos); yPos += 7;
    doc.text(`• Perímetro 3D: ${perim3D.toFixed(2)} m`, 16, yPos);
    doc.text(`• Vértices Exterior / Interior: ${points.length} / ${innerPoints.length}`, 110, yPos); yPos += 10;
  }
  else if (currentMode === 'distance') {
    let totalDist = 0;
    for (let i = 1; i < points.length; i++) totalDist += points[i].distanceTo(points[i - 1]);
    let directDist = points.length > 1 ? points[0].distanceTo(points[points.length - 1]) : 0;

    doc.text(`• Distancia Acumulada: ${totalDist.toFixed(2)} m`, 16, yPos);
    doc.text(`• Distancia Directa A-B: ${directDist.toFixed(2)} m`, 110, yPos); yPos += 7;
    doc.text(`• Número de Tramos: ${points.length > 1 ? points.length - 1 : 0}`, 16, yPos); yPos += 10;
  }
  else if (currentMode === 'elevation') {
    let deltaZ = points.length > 1 ? points[points.length - 1].y - points[0].y : 0; // Cota de elevación
    let maxZ = Math.max(...points.map(p => p.y));
    let minZ = Math.min(...points.map(p => p.y));

    doc.text(`• Desnivel Total (ΔZ): ${(deltaZ >= 0 ? '+' : '') + deltaZ.toFixed(2)} m`, 16, yPos);
    doc.text(`• Cota Máxima Z: ${maxZ.toFixed(2)} m`, 110, yPos); yPos += 7;
    doc.text(`• Cota Mínima Z: ${minZ.toFixed(2)} m`, 16, yPos);
    doc.text(`• Cotas Medidas: ${points.length}`, 110, yPos); yPos += 10;
  }

  // TABLA DE COORDENADAS CON NORMATIVA CAD (Z = ELEVACIÓN / COTA)
  doc.setFontSize(12);
  doc.setTextColor(0, 150, 136);
  doc.setFont('helvetica', 'bold');
  doc.text("Coordenadas Topográficas (Z = Elevación / Cota)", 14, yPos); yPos += 3;

  doc.setFillColor(230, 230, 230);
  doc.rect(14, yPos, 182, 7, 'F');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Punto / Tipo", 18, yPos + 5);
  doc.text("Eje X - Este (m)", 65, yPos + 5);
  doc.text("Eje Y - Norte (m)", 110, yPos + 5);
  doc.text("Eje Z - Elevación (m)", 155, yPos + 5);
  yPos += 8;

  // MAPEADO: 
  // p.x -> Coord X
  // p.z -> Coord Y (Plano Planta Topográfico)
  // p.y -> Coord Z (Cota de Elevación Topográfica)
  const allPts = [
    ...points.map((p, i) => ({ name: `P${i+1} Ext`, x: p.x, y: p.z, z: p.y })),
    ...innerPoints.map((p, i) => ({ name: `P${i+1} Int`, x: p.x, y: p.z, z: p.y }))
  ];
  
  doc.setFont('helvetica', 'normal');
  allPts.slice(0, 15).forEach((item) => {
    doc.text(item.name, 18, yPos);
    doc.text(item.x.toFixed(3), 65, yPos);
    doc.text(item.y.toFixed(3), 110, yPos);
    doc.text(item.z.toFixed(3), 155, yPos);
    yPos += 6;
  });

  // Pie de Página
  doc.setFontSize(8);
  doc.setTextColor(150, 180, 150);
  doc.text("Generado por GeoMeasure 3D - Aplicación Topográfica PWA", 14, 285);

  doc.save(`GeoMeasure_Informe_${currentMode}_${new Date().toISOString().slice(0,10)}.pdf`);
}

// --- 9. ACTUALIZACIÓN DE MÉTRICAS ---
function updateMetrics() {
  document.getElementById('btnClose').disabled = currentMode !== 'polygon' || points.length < 3 || isClosed;
  document.getElementById('btnAddManual').disabled = currentMode !== 'polygon' || !isClosed;
  document.getElementById('btnExportDXF').disabled = points.length < 2;

  if (currentMode === 'polygon') {
    document.getElementById('lbl-m1-val').innerText = points.length + ' pts';
    document.getElementById('lbl-m2-val').innerText = innerPoints.length + ' pts';

    let perimeter = 0;
    for (let i = 1; i < points.length; i++) perimeter += points[i].distanceTo(points[i - 1]);
    if (isClosed && points.length > 2) perimeter += points[points.length - 1].distanceTo(points[0]);
    document.getElementById('lbl-m3-val').innerText = perimeter.toFixed(2) + ' m';

    if (isClosed && points.length >= 3) {
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i], p2 = points[(i + 1) % points.length];
        area += (p1.x * p2.z) - (p2.x * p1.z);
      }
      document.getElementById('lbl-m4-val').innerText = (Math.abs(area) / 2).toFixed(2) + ' m²';
    } else {
      document.getElementById('lbl-m4-val').innerText = '-- m²';
    }
  } 
  else if (currentMode === 'distance') {
    const tramos = points.length > 1 ? points.length - 1 : 0;
    document.getElementById('lbl-m1-val').innerText = tramos + ' tramos';

    let lastDist = 0;
    if (points.length > 1) {
      lastDist = points[points.length - 1].distanceTo(points[points.length - 2]);
    }
    document.getElementById('lbl-m2-val').innerText = lastDist.toFixed(2) + ' m';

    let totalDist = 0;
    for (let i = 1; i < points.length; i++) totalDist += points[i].distanceTo(points[i - 1]);
    document.getElementById('lbl-m3-val').innerText = totalDist.toFixed(2) + ' m';

    let directDist = 0;
    if (points.length > 1) directDist = points[0].distanceTo(points[points.length - 1]);
    document.getElementById('lbl-m4-val').innerText = directDist.toFixed(2) + ' m';
  } 
  else if (currentMode === 'elevation') {
    document.getElementById('lbl-m1-val').innerText = points.length + ' cotas';

    let deltaY = 0;
    if (points.length > 1) {
      deltaY = points[points.length - 1].y - points[0].y;
    }
    document.getElementById('lbl-m2-val').innerText = (deltaY >= 0 ? '+' : '') + deltaY.toFixed(2) + ' m';

    let maxY = points.length > 0 ? Math.max(...points.map(p => p.y)) : 0;
    let minY = points.length > 0 ? Math.min(...points.map(p => p.y)) : 0;

    document.getElementById('lbl-m3-val').innerText = maxY.toFixed(2) + ' m';
    document.getElementById('lbl-m4-val').innerText = minY.toFixed(2) + ' m';
  }
}

// --- 10. EXPORTAR A DXF ---
function generateDXF(perimeterPts, innerPts, closed) {
  let dxf = [];
  dxf.push("0", "SECTION", "2", "HEADER", "0", "ENDSEC");
  dxf.push("0", "SECTION", "2", "TABLES");
  dxf.push("0", "TABLE", "2", "LAYER");
  dxf.push("0", "LAYER", "2", "PLANTA_2D", "70", "0", "62", "4");
  dxf.push("0", "LAYER", "2", "RELIEVE_3D", "70", "0", "62", "3");
  dxf.push("0", "LAYER", "2", "PUNTOS", "70", "0", "62", "1");
  dxf.push("0", "ENDTAB", "0", "ENDSEC");
  dxf.push("0", "SECTION", "2", "ENTITIES");

  [...perimeterPts, ...innerPts].forEach(p => {
    dxf.push("0", "POINT", "8", "PUNTOS");
    dxf.push("10", p.x.toFixed(4), "20", p.z.toFixed(4), "30", p.y.toFixed(4));
  });

  const loop3D = [...perimeterPts];
  if (closed && currentMode === 'polygon') loop3D.push(perimeterPts[0]);
  for (let i = 0; i < loop3D.length - 1; i++) {
    dxf.push("0", "LINE", "8", "RELIEVE_3D");
    dxf.push("10", loop3D[i].x.toFixed(4), "20", loop3D[i].z.toFixed(4), "30", loop3D[i].y.toFixed(4));
    dxf.push("11", loop3D[i+1].x.toFixed(4), "21", loop3D[i+1].z.toFixed(4), "31", loop3D[i+1].y.toFixed(4));
  }

  dxf.push("0", "ENDSEC", "0", "EOF");
  return dxf.join("\n");
}

document.getElementById('btnExportDXF').addEventListener('click', () => {
  if (points.length < 2) return;
  const dxfContent = generateDXF(points, innerPoints, isClosed);
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `GeoMeasure_${currentMode}_${new Date().toISOString().slice(0,10)}.dxf`;
  link.click();
  URL.revokeObjectURL(link.href);
});

// --- 11. INTERACCIÓN Y EVENTOS DE SELECCIÓN ---
function onPointerDown(event) {
  if (event.target.tagName === 'BUTTON' || 
      event.target.closest('#metrics') || 
      event.target.closest('#app-header') ||
      event.target.closest('#nav-widget') ||
      event.target.closest('#controls-wrapper') ||
      event.target.closest('#welcome-modal') ||
      event.target.closest('#info-modal')) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(nodeGroup.children);

  if (intersects.length > 0) {
    const hitObject = intersects[0].object;
    selectedIndex = hitObject.userData.pointIndex;
    selectedType = hitObject.userData.type;
    showSelectionCard(true);
  } else {
    selectedIndex = -1;
    showSelectionCard(false);
  }

  update3DScene();
}
window.addEventListener('pointerdown', onPointerDown);

function showSelectionCard(visible) {
  const card = document.getElementById('selection-card');
  if (visible && selectedIndex !== -1) {
    document.getElementById('lbl-selected-info').innerText = `Punto ${selectedType === 'outer' ? 'Trazado' : 'Interior'} #${selectedIndex + 1}`;
    card.style.display = 'flex';
  } else {
    card.style.display = 'none';
  }
}

document.getElementById('btnDeletePoint').addEventListener('click', () => {
  if (selectedIndex === -1) return;
  if (selectedType === 'outer') {
    points.splice(selectedIndex, 1);
    if (points.length < 3) isClosed = false;
  } else {
    innerPoints.splice(selectedIndex, 1);
  }
  selectedIndex = -1;
  showSelectionCard(false);
  updateMetrics();
  update3DScene();
});

document.getElementById('btnDeselectPoint').addEventListener('click', () => {
  selectedIndex = -1;
  showSelectionCard(false);
  updateMetrics();
});

const demoPath3D = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(4, 0.8, 0),
  new THREE.Vector3(4, 1.5, -3),
  new THREE.Vector3(1, 0.4, -3),
  new THREE.Vector3(0, 0, -5)
];
let simIdx = 0;

document.getElementById('btnAdd').addEventListener('click', () => {
  if (currentMode === 'polygon' && isClosed) return;

  if (simIdx < demoPath3D.length) {
    points.push(demoPath3D[simIdx++].clone());
  } else {
    const last = points[points.length - 1];
    points.push(new THREE.Vector3(
      last.x + (Math.random() - 0.3) * 2,
      last.y + (Math.random() - 0.4) * 0.6,
      last.z + (Math.random() - 0.3) * 2
    ));
  }

  updateMetrics();
  update3DScene();
});

document.getElementById('btnClose').addEventListener('click', () => {
  if (points.length < 3 || currentMode !== 'polygon') return;
  isClosed = true;
  updateMetrics();
  update3DScene();
});

document.getElementById('btnAddManual').addEventListener('click', () => {
  if (!isClosed || currentMode !== 'polygon') return;
  const center = new THREE.Vector3();
  points.forEach(p => center.add(p));
  center.divideScalar(points.length);

  const newInnerPoint = new THREE.Vector3(
    center.x + (Math.random() - 0.5) * 2.5,
    (Math.random() - 0.2) * 1.5,
    center.z + (Math.random() - 0.5) * 2.5
  );
  innerPoints.push(newInnerPoint);
  updateMetrics();
  update3DScene();
});

document.getElementById('btnClear').addEventListener('click', () => {
  resetData();
  updateMetrics();
  update3DScene();
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  viewCubeMesh.quaternion.copy(camera.quaternion).invert();
  renderer.render(scene, camera);
  cubeRenderer.render(cubeScene, cubeCamera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});