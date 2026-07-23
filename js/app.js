import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Delaunay } from 'd3-delaunay';

// --- 1. GENERACIÓN DEL LOGO HD Y CONFIGURACIÓN PWA ---
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

// --- 2. ESTADO GLOBAL ---
const points = [];
const innerPoints = [];
let selectedIndex = -1;
let selectedType = 'outer';
let isClosed = false;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// --- 3. ESCENA PRINCIPAL THREE.JS ---
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

// --- 4. ESCENA VIEWCUBE ---
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

// --- 5. VIEWCUBE DRAG / CLICK ---
let isDraggingCube = false;
let cubeDragDistance = 0;
let previousPointerPosition = { x: 0, y: 0 };
const cubeRaycaster = new THREE.Raycaster();
const cubeMouse = new THREE.Vector2();

cubeContainer.addEventListener('pointerdown', (e) => {
  isDraggingCube = true;
  cubeDragDistance = 0;
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

// --- 6. ALGORITMO PUNTO EN POLÍGONO (Para Filtrar Triángulos Internos) ---
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

// --- 7. RENDERIZADO DE LA ESCENA Y MALLA DELAUNAY UNIFICADA ---
function update3DScene() {
  lineGroup.clear();
  nodeGroup.clear();
  projectionGroup.clear();

  if (meshSurface3D) {
    scene.remove(meshSurface3D);
    meshSurface3D.geometry.dispose();
    meshSurface3D.material.dispose();
    meshSurface3D = null;
  }
  if (meshSurface2D) {
    scene.remove(meshSurface2D);
    meshSurface2D.geometry.dispose();
    meshSurface2D.material.dispose();
    meshSurface2D = null;
  }

  if (points.length === 0) return;

  const sphereGeo = new THREE.SphereGeometry(0.12, 16, 16);

  // Nodos Perímetro
  points.forEach((p, index) => {
    let color = 0x2196f3;
    let scale = (selectedType === 'outer' && index === selectedIndex) ? (color = 0xff9800, 1.5) : 1.0;
    if (index === 0) color = 0xf44336;

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.copy(p);
    sphere.scale.setScalar(scale);
    sphere.userData = { pointIndex: index, type: 'outer' };
    nodeGroup.add(sphere);

    if (Math.abs(p.y) > 0.05) {
      const dropPoints = [p.clone(), new THREE.Vector3(p.x, 0, p.z)];
      const dropGeo = new THREE.BufferGeometry().setFromPoints(dropPoints);
      const dropMat = new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 0.1, gapSize: 0.1 });
      const dropLine = new THREE.Line(dropGeo, dropMat);
      dropLine.computeLineDistances();
      projectionGroup.add(dropLine);
    }
  });

  // Nodos Interiores
  innerPoints.forEach((p, index) => {
    let color = 0xff9800;
    let scale = 1.1;
    if (selectedType === 'inner' && index === selectedIndex) {
      color = 0xffeb3b; scale = 1.6;
    }

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

  // Contorno Exterior 3D
  if (points.length > 1) {
    const linePoints = [...points];
    if (isClosed) linePoints.push(points[0]);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: isClosed ? 0x00e676 : 0x2196f3, linewidth: 3 });
    lineGroup.add(new THREE.Line(lineGeo, lineMat));
  }

  // Proyección Suelo 2D
  if (points.length > 1) {
    const projPoints = points.map(p => new THREE.Vector3(p.x, 0, p.z));
    if (isClosed) projPoints.push(projPoints[0]);
    const projLineGeo = new THREE.BufferGeometry().setFromPoints(projPoints);
    const projLineMat = new THREE.LineBasicMaterial({ color: 0x555555, linewidth: 1.5 });
    projectionGroup.add(new THREE.Line(projLineGeo, projLineMat));
  }

  // Malla Delaunay Unificada
  if (isClosed && points.length >= 3) {
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
      const ia = rawTriangles[i];
      const ib = rawTriangles[i+1];
      const ic = rawTriangles[i+2];

      const pa = allPoints[ia];
      const pb = allPoints[ib];
      const pc = allPoints[ic];

      const cx = (pa.x + pb.x + pc.x) / 3;
      const cz = (pa.z + pb.z + pc.z) / 3;

      if (isPointInPolygon([cx, cz], points)) {
        validIndices.push(ia, ib, ic);
      }
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

// --- 8. EXPORTACIÓN A ARCHIVO DXF ---
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
  if (closed) loop3D.push(perimeterPts[0]);
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
  link.download = `GeoMeasure_Terreno_${new Date().toISOString().slice(0,10)}.dxf`;
  link.click();
  URL.revokeObjectURL(link.href);
});

// --- 9. EVENTOS DE INTERACCIÓN Y MÉTRICAS ---
function onPointerDown(event) {
  if (event.target.tagName === 'BUTTON' || 
      event.target.closest('#metrics') || 
      event.target.closest('#app-header') ||
      event.target.closest('#nav-widget') ||
      event.target.closest('#controls-wrapper')) return;

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
    document.getElementById('lbl-selected-info').innerText = `Punto ${selectedType === 'outer' ? 'Perímetro' : 'Interior'} #${selectedIndex + 1}`;
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
  update3DScene();
});

function updateMetrics() {
  document.getElementById('lbl-pts').innerText = points.length + ' pts';
  document.getElementById('lbl-inner-pts').innerText = innerPoints.length + ' pts';
  document.getElementById('btnClose').disabled = points.length < 3 || isClosed;
  document.getElementById('btnAddManual').disabled = !isClosed;
  document.getElementById('btnExportDXF').disabled = points.length < 2;

  let perimeter = 0;
  for (let i = 1; i < points.length; i++) perimeter += points[i].distanceTo(points[i - 1]);
  if (isClosed && points.length > 2) perimeter += points[points.length - 1].distanceTo(points[0]);
  document.getElementById('lbl-per').innerText = perimeter.toFixed(2) + ' m';

  if (isClosed && points.length >= 3) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i], p2 = points[(i + 1) % points.length];
      area += (p1.x * p2.z) - (p2.x * p1.z);
    }
    document.getElementById('lbl-area').innerText = (Math.abs(area) / 2).toFixed(2) + ' m²';
  } else {
    document.getElementById('lbl-area').innerText = '-- m²';
  }
}

const demoPath3D = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(4, 0.8, 0),
  new THREE.Vector3(4, 1.5, -3),
  new THREE.Vector3(1, 0.4, -3),
  new THREE.Vector3(0, 0, -5)
];
let simIdx = 0;

document.getElementById('btnAdd').addEventListener('click', () => {
  if (isClosed) return;
  if (simIdx < demoPath3D.length) {
    points.push(demoPath3D[simIdx++].clone());
  } else {
    const last = points[points.length - 1];
    points.push(new THREE.Vector3(last.x + (Math.random() - 0.3) * 2, last.y + (Math.random() - 0.4) * 0.6, last.z + (Math.random() - 0.3) * 2));
  }
  updateMetrics();
  update3DScene();
});

document.getElementById('btnClose').addEventListener('click', () => {
  if (points.length < 3) return;
  isClosed = true;
  updateMetrics();
  update3DScene();
});

document.getElementById('btnAddManual').addEventListener('click', () => {
  if (!isClosed) return;
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
  points.length = 0;
  innerPoints.length = 0;
  selectedIndex = -1;
  isClosed = false;
  simIdx = 0;
  showSelectionCard(false);
  updateMetrics();
  update3DScene();
});

// --- 10. BUCLE ANIMACIÓN ---
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