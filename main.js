const { Hands } = window;
const { Camera } = window;

const GRID = 4;
const SCALE = 30;
const FOCAL = 400;

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
const video = document.getElementById("webcam");
const statusEl = document.getElementById("status");
const coordsEl = document.getElementById("coords");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const CX = canvas.width / 2;
const CY = canvas.height / 2;

const dots = [];

for (let z = 0; z < GRID; z++) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      dots.push({
        bx: (x - (GRID - 1) / 2) * SCALE,
        by: (y - (GRID - 1) / 2) * SCALE,
        bz: (z - (GRID - 1) / 2) * SCALE,
        x: 0, y: 0, z: 0,
      });
    }
  }
}

let handX = 0;
let handY = 0;
let handPinch = 1;
let smoothX = 0;
let smoothY = 0;
let smoothPinch = 1;

let rainbowMode = false;
let clapCount = 0;
let lastClapTime = 0;
let hue = 0;
let clapFlash = 0;

// --- Audio clap detection ---
let audioCtx = null;
let analyser = null;

async function initAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
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

    if (clapCount >= 2) {
      rainbowMode = !rainbowMode;
      clapCount = 0;
    }
  }

  if (now - lastClapTime > 1500) clapCount = 0;

  requestAnimationFrame(detectClap);
}

// --- Hand tracking ---
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

function onResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    statusEl.textContent = "no hand detected";
    return;
  }

  const lm = results.multiHandLandmarks[0];
  const wrist = lm[0];
  const indexTip = lm[8];
  const thumbTip = lm[4];

  handX = (wrist.x - 0.5) * -2;
  handY = (wrist.y - 0.5) * -2;

  const dx = indexTip.x - thumbTip.x;
  const dy = indexTip.y - thumbTip.y;
  handPinch = Math.sqrt(dx * dx + dy * dy);

  statusEl.textContent = `hand ✓  |  rainbow: ${rainbowMode ? "ON" : "OFF"}  |  clap x2 to toggle`;
  coordsEl.textContent = `x:${handX.toFixed(2)} y:${handY.toFixed(2)} pinch:${handPinch.toFixed(2)}`;
}

// --- Render ---
function render() {
  ctx.fillStyle = rainbowMode
    ? "rgba(5,5,15,0.3)"
    : "rgba(10,10,10,0.25)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  smoothX += (handX - smoothX) * 0.08;
  smoothY += (handY - smoothY) * 0.08;
  smoothPinch += (handPinch - smoothPinch) * 0.06;

  const angleX = smoothY * Math.PI;
  const angleY = smoothX * Math.PI;
  const zoom = 0.5 + smoothPinch * 2;

  hue = (hue + 0.5) % 360;
  clapFlash *= 0.92;

  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];
    dot.x = dot.bx * zoom;
    dot.y = dot.by * zoom;
    dot.z = dot.bz * zoom;
    rotateAll(dot, angleX, angleY);

    if (dot.z < 10) continue;

    const depth = FOCAL / (dot.z + FOCAL);
    const sx = CX + dot.x * depth;
    const sy = CY + dot.y * depth;
    const size = Math.max(1.5, (4 + clapFlash * 8) * depth);
    const alpha = 0.3 + 0.7 * depth;

    if (rainbowMode) {
      const h = (hue + i * 8) % 360;
      const s = 80 + clapFlash * 20;
      const l = 50 + depth * 30 + clapFlash * 20;
      ctx.fillStyle = `hsla(${h},${s}%,${l}%,${alpha})`;
    } else {
      ctx.fillStyle = `rgba(51,255,51,${alpha})`;
    }

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
    statusEl.textContent = "camera + mic ready — clap x2 for rainbow";
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
