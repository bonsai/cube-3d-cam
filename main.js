import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

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

  statusEl.textContent = "hand detected";
  coordsEl.textContent = `x:${handX.toFixed(2)} y:${handY.toFixed(2)} pinch:${handPinch.toFixed(2)}`;
}

function render() {
  ctx.fillStyle = "rgba(10,10,10,0.25)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  smoothX += (handX - smoothX) * 0.08;
  smoothY += (handY - smoothY) * 0.08;
  smoothPinch += (handPinch - smoothPinch) * 0.06;

  const angleX = smoothY * Math.PI;
  const angleY = smoothX * Math.PI;
  const zoom = 0.5 + smoothPinch * 2;

  for (const dot of dots) {
    dot.x = dot.bx * zoom;
    dot.y = dot.by * zoom;
    dot.z = dot.bz * zoom;
    rotateAll(dot, angleX, angleY);

    if (dot.z < 10) continue;

    const depth = FOCAL / (dot.z + FOCAL);
    const sx = CX + dot.x * depth;
    const sy = CY + dot.y * depth;
    const size = Math.max(1.5, 4 * depth);
    const alpha = 0.3 + 0.7 * depth;

    ctx.fillStyle = `rgba(51,255,51,${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(render);
}

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
    statusEl.textContent = "camera started — move your hand";
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
