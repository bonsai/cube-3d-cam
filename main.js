const { Hands } = window;
const { Camera } = window;

const FOCAL = 400;
const MODES = ["dots", "cube", "human"];
let modeIndex = 0;

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
const video = document.getElementById("webcam");
const statusEl = document.getElementById("status");
const coordsEl = document.getElementById("coords");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const CX = canvas.width / 2;
const CY = canvas.height / 2;

// --- Shape definitions ---

function makeDots() {
  const GRID = 4, SCALE = 30;
  const points = [];
  for (let z = 0; z < GRID; z++)
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++)
        points.push({
          bx: (x - (GRID - 1) / 2) * SCALE,
          by: (y - (GRID - 1) / 2) * SCALE,
          bz: (z - (GRID - 1) / 2) * SCALE,
        });
  return { points, edges: [] };
}

function makeCube() {
  const S = 60;
  const corners = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
  ].map(([x,y,z]) => ({ bx: x*S, by: y*S, bz: z*S }));

  const edges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7],
  ];
  return { points: corners, edges };
}

function makeHuman() {
  const S = 25;
  const joint = (x, y, z) => ({ bx: x * S, by: y * S, bz: z * S });

  const points = [
    joint(0, -6, 0),    // 0 head
    joint(0, -4.5, 0),  // 1 neck
    joint(-2, -4, 0),   // 2 left shoulder
    joint(2, -4, 0),    // 3 right shoulder
    joint(-3.5, -2, 0), // 4 left elbow
    joint(3.5, -2, 0),  // 5 right elbow
    joint(-4.5, 0, 0),  // 6 left wrist
    joint(4.5, 0, 0),   // 7 right wrist
    joint(0, -1, 0),    // 8 chest
    joint(0, 1.5, 0),   // 9 hip
    joint(-1.5, 1.5, 0),// 10 left hip
    joint(1.5, 1.5, 0), // 11 right hip
    joint(-1.8, 4, 0),  // 12 left knee
    joint(1.8, 4, 0),   // 13 right knee
    joint(-2, 6.5, 0),  // 14 left ankle
    joint(2, 6.5, 0),   // 15 right ankle
    joint(-5, 0.5, 0),  // 16 left finger
    joint(5, 0.5, 0),   // 17 right finger
  ];

  const edges = [
    [0,1],       // head-neck
    [1,2],[1,3], // shoulders
    [2,4],[3,5], // upper arms
    [4,6],[5,7], // forearms
    [6,16],[7,17],// fingers
    [1,8],       // neck-chest
    [8,9],       // chest-hip
    [9,10],[9,11],// hips
    [10,12],[11,13],// thighs
    [12,14],[13,15],// shins
  ];

  return { points, edges };
}

const shapes = { dots: makeDots(), cube: makeCube(), human: makeHuman() };

// --- State ---
let handX = 0, handY = 0, handPinch = 1;
let smoothX = 0, smoothY = 0, smoothPinch = 1;
let rainbowMode = false;
let clapCount = 0, lastClapTime = 0;
let hue = 0, clapFlash = 0;

// --- Audio ---
let analyser = null;

async function initAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    detectClap();
  } catch (e) {
    console.warn("mic not available:", e.message);
  }
}

function detectClap() {
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const volume = data.reduce((a, b) => a + b, 0) / data.length;
  const now = performance.now();

  if (volume > 80 && now - lastClapTime > 400) {
    lastClapTime = now;
    clapCount++;
    clapFlash = 1;

    if (clapCount >= 3) {
      modeIndex = (modeIndex + 1) % MODES.length;
      clapCount = 0;
    } else if (clapCount >= 2 && now - lastClapTime < 1200) {
      // double clap = rainbow (but triple takes priority, so we defer)
    }
  }

  // resolve double clap after timeout
  if (clapCount === 2 && now - lastClapTime > 800 && now - lastClapTime < 1500) {
    rainbowMode = !rainbowMode;
    clapCount = 0;
  }

  if (now - lastClapTime > 1500) clapCount = 0;
  requestAnimationFrame(detectClap);
}

// --- 3D ---
function rotateAll(dot, ax, ay) {
  let { x, y, z } = dot;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const cy = Math.cos(ay), sy = Math.sin(ay);

  let ty = y * cx - z * sx;
  let tz = y * sx + z * cx;
  y = ty; z = tz;

  let tx = x * cy + z * sy;
  z = -x * sy + z * cy;
  x = tx;

  dot.x = x; dot.y = y; dot.z = z;
}

function project(dot, zoom) {
  const x = dot.bx * zoom;
  const y = dot.by * zoom;
  const z = dot.bz * zoom;
  return { x, y, z };
}

// --- Hand tracking ---
function onResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    statusEl.textContent = "no hand detected";
    return;
  }

  const lm = results.multiHandLandmarks[0];
  handX = (lm[0].x - 0.5) * -2;
  handY = (lm[0].y - 0.5) * -2;

  const dx = lm[8].x - lm[4].x;
  const dy = lm[8].y - lm[4].y;
  handPinch = Math.sqrt(dx * dx + dy * dy);

  const m = MODES[modeIndex];
  statusEl.textContent = `hand ✓  |  mode: ${m}  |  clap x2: rainbow  x3: mode`;
  coordsEl.textContent = `x:${handX.toFixed(2)} y:${handY.toFixed(2)} pinch:${handPinch.toFixed(2)}`;
}

// --- Render ---
function getColor(i, depth, alpha) {
  if (rainbowMode) {
    const h = (hue + i * 8) % 360;
    const s = 80 + clapFlash * 20;
    const l = 50 + depth * 30 + clapFlash * 20;
    return `hsla(${h},${s}%,${l}%,${alpha})`;
  }
  return `rgba(51,255,51,${alpha})`;
}

function render() {
  const mode = MODES[modeIndex];
  ctx.fillStyle = rainbowMode ? "rgba(5,5,15,0.3)" : "rgba(10,10,10,0.25)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  smoothX += (handX - smoothX) * 0.08;
  smoothY += (handY - smoothY) * 0.08;
  smoothPinch += (handPinch - smoothPinch) * 0.06;

  const angleX = smoothY * Math.PI;
  const angleY = smoothX * Math.PI;
  const zoom = 0.5 + smoothPinch * 2;

  hue = (hue + 0.5) % 360;
  clapFlash *= 0.92;

  const shape = shapes[mode];
  const projected = [];

  for (let i = 0; i < shape.points.length; i++) {
    const p = shape.points[i];
    const v = project(p, zoom);
    rotateAll(v, angleX, angleY);
    projected.push(v);
  }

  // Draw edges
  if (shape.edges.length > 0) {
    ctx.lineWidth = 2;
    for (let e = 0; e < shape.edges.length; e++) {
      const [a, b] = shape.edges[e];
      const pa = projected[a];
      const pb = projected[b];
      if (pa.z < 10 || pb.z < 10) continue;

      const da = FOCAL / (pa.z + FOCAL);
      const db = FOCAL / (pb.z + FOCAL);
      const sxa = CX + pa.x * da;
      const sya = CY + pa.y * da;
      const sxb = CX + pb.x * db;
      const syb = CY + pb.y * db;

      const avgDepth = (da + db) / 2;
      const alpha = 0.2 + 0.6 * avgDepth;
      ctx.strokeStyle = getColor(e, avgDepth, alpha);
      ctx.beginPath();
      ctx.moveTo(sxa, sya);
      ctx.lineTo(sxb, syb);
      ctx.stroke();
    }
  }

  // Draw joints
  for (let i = 0; i < projected.length; i++) {
    const v = projected[i];
    if (v.z < 10) continue;

    const depth = FOCAL / (v.z + FOCAL);
    const sx = CX + v.x * depth;
    const sy = CY + v.y * depth;

    let size;
    if (mode === "human") {
      size = Math.max(3, (i === 0 ? 8 : 5) * depth);
    } else {
      size = Math.max(1.5, (4 + clapFlash * 8) * depth);
    }

    const alpha = 0.3 + 0.7 * depth;
    ctx.fillStyle = getColor(i, depth, alpha);
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(render);
}

// --- Init ---
async function init() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    video.srcObject = stream;

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onResults);

    const camera = new Camera(video, {
      onFrame: async () => await hands.send({ image: video }),
      width: 640,
      height: 480,
    });

    await camera.start();
    await initAudio();
    statusEl.textContent = "camera + mic ready — clap x2: rainbow  x3: mode";
    render();
  } catch (e) {
    statusEl.textContent = `error: ${e.message}`;
    console.error(e);
  }
}

init();

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
