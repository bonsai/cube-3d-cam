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

// --- Wayang puppet skeleton ---
// Puppet joints with rest positions
// Control rods: wrist→body, thumb→left hand, index→right hand, middle→head
const PUPPET_JOINTS = {
  head:     { bx: 0, by: -130, bz: 0 },
  neck:     { bx: 0,   by: -100, bz: 0 },
  lShoulder:{ bx: -40, by: -90,  bz: 0 },
  rShoulder:{ bx: 40,  by: -90,  bz: 0 },
  lElbow:   { bx: -80, by: -50,  bz: 0 },
  rElbow:   { bx: 80,  by: -50,  bz: 0 },
  lWrist:   { bx: -110,by: -10,  bz: 0 },
  rWrist:   { bx: 110, by: -10,  bz: 0 },
  lFinger:  { bx: -130,by: 10,   bz: 0 },
  rFinger:  { bx: 130, by: 10,   bz: 0 },
  chest:    { bx: 0,   by: -60,  bz: 0 },
  hip:      { bx: 0,   by: 20,   bz: 0 },
  lHip:     { bx: -25, by: 20,   bz: 0 },
  rHip:     { bx: 25,  by: 20,   bz: 0 },
  lKnee:    { bx: -30, by: 80,   bz: 0 },
  rKnee:    { bx: 30,  by: 80,   bz: 0 },
  lAnkle:   { bx: -35, by: 140,  bz: 0 },
  rAnkle:   { bx: 35,  by: 140,  bz: 0 },
};

const PUPPET_BONES = [
  ["head","neck"],
  ["neck","lShoulder"],["neck","rShoulder"],
  ["lShoulder","lElbow"],["rShoulder","rElbow"],
  ["lElbow","lWrist"],["rElbow","rWrist"],
  ["lWrist","lFinger"],["rWrist","rFinger"],
  ["neck","chest"],
  ["chest","hip"],
  ["hip","lHip"],["hip","rHip"],
  ["lHip","lKnee"],["rHip","rKnee"],
  ["lKnee","lAnkle"],["rKnee","rAnkle"],
];

const JOINT_NAMES = Object.keys(PUPPET_JOINTS);
const JOINT_REST = {};
for (const name of JOINT_NAMES) {
  JOINT_REST[name] = { ...PUPPET_JOINTS[name] };
}

// Puppet state (current positions, spring-animated)
const puppet = {};
for (const name of JOINT_NAMES) {
  puppet[name] = { x: PUPPET_JOINTS[name].bx, y: PUPPET_JOINTS[name].by, z: 0, vx: 0, vy: 0 };
}

// Control rod targets (set by hand tracking)
const rodTarget = {
  body:  { x: 0, y: 0 },
  head:  { x: 0, y: 0 },
  lHand: { x: 0, y: 0 },
  rHand: { x: 0, y: 0 },
  lFoot: { x: 0, y: 0 },
  rFoot: { x: 0, y: 0 },
};

function makeHuman() {
  const points = JOINT_NAMES.map((n) => ({
    bx: PUPPET_JOINTS[n].bx,
    by: PUPPET_JOINTS[n].by,
    bz: 0,
  }));
  const edges = PUPPET_BONES.map(([a, b]) => [
    JOINT_NAMES.indexOf(a),
    JOINT_NAMES.indexOf(b),
  ]);
  return { points, edges };
}

const shapes = { dots: makeDots(), cube: makeCube(), human: makeHuman() };

// --- Spring physics for puppet ---
const SPRING_K = 0.12;   // stiffness
const SPRING_DAMP = 0.7; // damping
const GRAVITY = 0.3;

function updatePuppet() {
  const B = 40; // control sensitivity

  // Map hand tracking to rod targets
  // body rod: wrist position controls torso
  rodTarget.body.x = handX * B;
  rodTarget.body.y = handY * B * 0.5;

  // head rod: index finger tip (lm[8]) relative to wrist
  rodTarget.head.x = (headTipX - handX_raw) * B * 2;
  rodTarget.head.y = (headTipY - handY_raw) * B * 2;

  // left hand rod: thumb (lm[4])
  rodTarget.lHand.x = (lThumbX - 0.5) * -B * 3;
  rodTarget.lHand.y = (lThumbY - 0.5) * -B * 3;

  // right hand rod: index (lm[8])
  rodTarget.rHand.x = (rIndexX - 0.5) * -B * 3;
  rodTarget.rHand.y = (rIndexY - 0.5) * -B * 3;

  // Apply springs to each joint
  for (const name of JOINT_NAMES) {
    const rest = JOINT_REST[name];
    const p = puppet[name];

    let targetX = rest.bx;
    let targetY = rest.by;

    // Which rod influences this joint?
    if (name === "head" || name === "neck") {
      targetX += rodTarget.body.x * 0.6 + rodTarget.head.x * 0.4;
      targetY += rodTarget.body.y * 0.4 + rodTarget.head.y * 0.6;
    } else if (name === "chest" || name === "hip") {
      targetX += rodTarget.body.x;
      targetY += rodTarget.body.y;
    } else if (name.startsWith("l") && (name.includes("Shoulder") || name.includes("Elbow") || name.includes("Wrist") || name.includes("Finger"))) {
      const t = name.includes("Finger") ? 1.0 : name.includes("Wrist") ? 0.9 : name.includes("Elbow") ? 0.5 : 0.2;
      targetX += rodTarget.body.x * (1 - t) + rodTarget.lHand.x * t;
      targetY += rodTarget.body.y * (1 - t) + rodTarget.lHand.y * t;
    } else if (name.startsWith("r") && (name.includes("Shoulder") || name.includes("Elbow") || name.includes("Wrist") || name.includes("Finger"))) {
      const t = name.includes("Finger") ? 1.0 : name.includes("Wrist") ? 0.9 : name.includes("Elbow") ? 0.5 : 0.2;
      targetX += rodTarget.body.x * (1 - t) + rodTarget.rHand.x * t;
      targetY += rodTarget.body.y * (1 - t) + rodTarget.rHand.y * t;
    } else {
      // legs follow body with some lag
      targetX += rodTarget.body.x * 0.8;
      targetY += rodTarget.body.y * 0.5;
    }

    // Spring force
    const dx = targetX - p.x;
    const dy = targetY - p.y;
    p.vx = (p.vx + dx * SPRING_K) * SPRING_DAMP;
    p.vy = (p.vy + dy * SPRING_K + GRAVITY) * SPRING_DAMP;
    p.x += p.vx;
    p.y += p.vy;
  }
}

// --- State ---
let handX = 0, handY = 0, handPinch = 1;
let handX_raw = 0, handY_raw = 0;
let headTipX = 0.5, headTipY = 0.5;
let lThumbX = 0.5, lThumbY = 0.5;
let rIndexX = 0.5, rIndexY = 0.5;
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
      document.querySelectorAll(".mode-btn").forEach((b, i) => {
        b.classList.toggle("active", i === modeIndex);
      });
      clapCount = 0;
    }
  }

  if (clapCount === 2 && now - lastClapTime > 800 && now - lastClapTime < 1500) {
    rainbowMode = !rainbowMode;
    document.getElementById("rainbow-btn").classList.toggle("on", rainbowMode);
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

// --- Hand tracking ---
function onResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    statusEl.textContent = "no hand detected";
    return;
  }

  const lm = results.multiHandLandmarks[0];

  // Raw positions for puppet control
  handX_raw = (lm[0].x - 0.5) * -2;
  handY_raw = (lm[0].y - 0.5) * -2;

  handX = handX_raw;
  handY = handY_raw;

  const dx = lm[8].x - lm[4].x;
  const dy = lm[8].y - lm[4].y;
  handPinch = Math.sqrt(dx * dx + dy * dy);

  // Puppet rod control points
  headTipX = lm[8].x;  // index tip → head direction
  headTipY = lm[8].y;
  lThumbX = lm[4].x;   // thumb → left hand rod
  lThumbY = lm[4].y;
  rIndexX = lm[8].x;   // index → right hand rod
  rIndexY = lm[8].y;

  const m = MODES[modeIndex];
  statusEl.textContent = `hand ✓  |  mode: ${m}`;
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
  const zoom = mode === "human" ? 1.0 : (0.5 + smoothPinch * 2);

  hue = (hue + 0.5) % 360;
  clapFlash *= 0.92;

  // Update puppet physics
  if (mode === "human") {
    updatePuppet();
  }

  const shape = shapes[mode];
  const projected = [];

  for (let i = 0; i < shape.points.length; i++) {
    const p = shape.points[i];

    if (mode === "human") {
      // Use spring-animated puppet positions
      const name = JOINT_NAMES[i];
      const pp = puppet[name];
      const v = { x: pp.x, y: pp.y, z: pp.z };
      rotateAll(v, angleX, angleY);
      projected.push(v);
    } else {
      const v = { x: p.bx * zoom, y: p.by * zoom, z: p.bz * zoom };
      rotateAll(v, angleX, angleY);
      projected.push(v);
    }
  }

  // Draw edges
  if (shape.edges.length > 0) {
    ctx.lineWidth = mode === "human" ? 2.5 : 2;
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

    // Draw control rods in human mode
    if (mode === "human") {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,100,0.3)";

      // Rod from top to head
      const headP = projected[JOINT_NAMES.indexOf("head")];
      if (headP.z > 10) {
        const d = FOCAL / (headP.z + FOCAL);
        ctx.beginPath();
        ctx.moveTo(CX + headP.x * d, CY + headP.y * d - 80);
        ctx.lineTo(CX + headP.x * d, CY + headP.y * d);
        ctx.stroke();
      }

      // Rod from left to lWrist
      const lwP = projected[JOINT_NAMES.indexOf("lWrist")];
      if (lwP.z > 10) {
        const d = FOCAL / (lwP.z + FOCAL);
        ctx.beginPath();
        ctx.moveTo(CX + lwP.x * d - 60, CY + lwP.y * d);
        ctx.lineTo(CX + lwP.x * d, CY + lwP.y * d);
        ctx.stroke();
      }

      // Rod from right to rWrist
      const rwP = projected[JOINT_NAMES.indexOf("rWrist")];
      if (rwP.z > 10) {
        const d = FOCAL / (rwP.z + FOCAL);
        ctx.beginPath();
        ctx.moveTo(CX + rwP.x * d + 60, CY + rwP.y * d);
        ctx.lineTo(CX + rwP.x * d, CY + rwP.y * d);
        ctx.stroke();
      }

      ctx.setLineDash([]);
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
      const name = JOINT_NAMES[i];
      size = name === "head" ? 10 * depth : name.includes("Finger") ? 3 * depth : 5 * depth;
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

    // UI button handlers
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        modeIndex = MODES.indexOf(btn.dataset.mode);
        document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    document.getElementById("rainbow-btn").addEventListener("click", () => {
      rainbowMode = !rainbowMode;
      document.getElementById("rainbow-btn").classList.toggle("on", rainbowMode);
    });

    statusEl.textContent = "camera + mic ready";
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
