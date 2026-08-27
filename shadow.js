(() => {
  const panel = document.createElement('section');
  panel.id = 'shadow-theater';
  panel.innerHTML = `
    <div class="shadow-title">影絵コーナー</div>
    <div class="shadow-buttons">
      <button data-shape="human" title="human.json">🧑</button>
      <button data-shape="robot" title="robot.json">🤖</button>
      <button data-shape="cube" title="cube.json">⬛</button>
      <button data-shape="dots" title="dots.json">⠿</button>
      <button data-shape="rainbow-beam" title="rainbow-beam.json">🌈</button>
    </div>
    <div class="shadow-label" id="shadow-label">Human</div>
    <canvas id="shadow-canvas" width="220" height="220"></canvas>`;
  document.body.appendChild(panel);

  const canvas = panel.querySelector('#shadow-canvas');
  const ctx = canvas.getContext('2d');
  const label = panel.querySelector('#shadow-label');
  const files = ['human','robot','cube','dots','rainbow-beam'];
  const shapes = {};
  let selected = 'human';
  let angle = 0;

  async function load() {
    await Promise.all(files.map(async name => {
      const r = await fetch(`shapes/${name}.json?${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
      shapes[name] = await r.json();
    }));
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = shapes[selected];
    if (!s) return;
    ctx.save();
    ctx.translate(110, 112);
    ctx.rotate(angle);
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 5;

    if (s.joints && s.bones) {
      const p = Object.fromEntries(s.joints.map(j => [j.id, j]));
      for (const [a,b] of s.bones) {
        if (!p[a] || !p[b]) continue;
        ctx.beginPath(); ctx.moveTo(p[a].x*.65,p[a].y*.65); ctx.lineTo(p[b].x*.65,p[b].y*.65); ctx.stroke();
      }
      for (const j of s.joints) {
        ctx.beginPath(); ctx.arc(j.x*.65,j.y*.65,Math.max(2.5,(j.size||1)*2.2),0,Math.PI*2); ctx.fill();
      }
    } else if (s.grid) {
      const scale=16;
      for(let z=0;z<s.grid.z;z++) for(let y=0;y<s.grid.y;y++) for(let x=0;x<s.grid.x;x++) {
        ctx.beginPath(); ctx.arc((x-(s.grid.x-1)/2)*scale,(y-(s.grid.y-1)/2)*scale,2.5,0,Math.PI*2); ctx.fill();
      }
    } else if (s.beams) {
      for(const b of s.beams){
        const a=b.angle*Math.PI/180;
        ctx.lineWidth=b.width||4; ctx.strokeStyle=b.color||'white';
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*b.length*.65,Math.sin(a)*b.length*.65);ctx.stroke();
      }
    }
    ctx.restore();
    angle += .003;
    requestAnimationFrame(draw);
  }

  panel.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    selected = btn.dataset.shape;
    label.textContent = `${shapes[selected]?.label || selected} / ${selected}.json`;
    panel.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === btn));
    document.dispatchEvent(new CustomEvent('shadowshapechange', {detail:{shape:selected}}));
  }));
  panel.querySelector('[data-shape="human"]').classList.add('selected');
  load().catch(e => label.textContent = `JSON読み込み失敗: ${e.message}`);
})();