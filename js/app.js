// Configuración y Estado
const points = []; // Guardará objetos: [{x: 0, y: 0}, {x: 2.5, y: 0}, ...]
const canvas = document.getElementById('measureCanvas');
const ctx = canvas.getContext('2d');

// Redimensionar Canvas a resolución de pantalla real
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.parentElement.clientHeight * window.devicePixelRatio;
  draw();
}
window.addEventListener('resize', resizeCanvas);

// ----------------------------------------------------------------
// 1. RENDERIZADO DE PUNTOS Y LÍNEAS (CANVAS)
// ----------------------------------------------------------------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (points.length === 0) return;

  // Calculamos límites para autoescalar el dibujo en la pantalla
  let minX = Math.min(...points.map(p => p.x));
  let maxX = Math.max(...points.map(p => p.x));
  let minY = Math.min(...points.map(p => p.y));
  let maxY = Math.max(...points.map(p => p.y));

  // Margen mínimo si solo hay un punto
  const rangeX = (maxX - minX) || 2;
  const rangeY = (maxY - minY) || 2;

  const padding = 60; // Margen en píxeles alrededor del dibujo
  const scaleX = (canvas.width - padding * 2) / rangeX;
  const scaleY = (canvas.height - padding * 2) / rangeY;
  const scale = Math.min(scaleX, scaleY); // Mantener relación de aspecto

  // Función interna para convertir metros (X,Y) a píxeles pantalla
  const toScreenCoords = (pt) => {
    const screenX = padding + (pt.x - minX) * scale;
    // En Canvas la 'Y' crece hacia abajo, por eso invertimos la resta
    const screenY = canvas.height - (padding + (pt.y - minY) * scale);
    return { x: screenX, y: screenY };
  };

  // --- DIBUJAR LÍNEAS ---
  if (points.length > 1) {
    ctx.beginPath();
    ctx.lineWidth = 3 * window.devicePixelRatio;
    ctx.strokeStyle = '#4caf50';
    ctx.setLineDash([]); // Línea continua

    const start = toScreenCoords(points[0]);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < points.length; i++) {
      const pt = toScreenCoords(points[i]);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  // --- DIBUJAR PUNTOS Y NODOS ---
  points.forEach((p, index) => {
    const screenPt = toScreenCoords(p);

    ctx.beginPath();
    ctx.arc(screenPt.x, screenPt.y, 6 * window.devicePixelRatio, 0, Math.PI * 2);
    ctx.fillStyle = index === points.length - 1 ? '#ff9800' : '#2196f3'; // El último destaca
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
}

// ----------------------------------------------------------------
// 2. RECEPCIÓN Y MENSARÍA DE PUNTOS
// ----------------------------------------------------------------
function addPoint(x, y) {
  points.push({ x, y });
  updateUI();
  draw();
}

function updateUI() {
  document.getElementById('lbl-points').innerText = points.length;
  
  if (points.length < 2) return;

  // Distancia del último tramo
  const p1 = points[points.length - 2];
  const p2 = points[points.length - 1];
  const lastSegment = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  document.getElementById('lbl-last').innerText = lastSegment.toFixed(2) + ' m';

  // Perímetro total acumulado
  let totalDist = 0;
  for (let i = 1; i < points.length; i++) {
    totalDist += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
  }
  document.getElementById('lbl-total').innerText = totalDist.toFixed(2) + ' m';
}

function clearPoints() {
  points.length = 0;
  document.getElementById('lbl-points').innerText = '0';
  document.getElementById('lbl-last').innerText = '0.00 m';
  document.getElementById('lbl-total').innerText = '0.00 m';
  draw();
}

// ----------------------------------------------------------------
// 3. CONEXIÓN WEB BLUETOOTH API
// ----------------------------------------------------------------
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"; // Reemplaza con tus UUIDs del ESP32
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

async function connectBLE() {
  try {
    console.log("Buscando dispositivo...");
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'MoasureESP32' }],
      optionalServices: [SERVICE_UUID]
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    // Suscribirse a las notificaciones cuando se presiona el botón físico
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleBLEReceive);

    alert("¡Conectado exitosamente con el dispositivo!");
  } catch (error) {
    console.error("Error al conectar Bluetooth:", error);
  }
}

// Procesar tiques entrantes desde el ESP32 (Formato esperado: JSON "{"x": 1.2, "y": 0.5}")
function handleBLEReceive(event) {
  const decoder = new TextDecoder('utf-8');
  const jsonString = decoder.decode(event.target.value);
  
  try {
    const data = JSON.parse(jsonString);
    addPoint(data.x, data.y);
  } catch (err) {
    console.error("Error al parsear datos BLE:", err);
  }
}

// Inicializar resolución Canvas
resizeCanvas();