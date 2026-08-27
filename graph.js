/* Knowledge graph layer: pioneers -> ideas -> systems.
 * MediaPipe Hands is reused from the global CDN build. The main camera owns the
 * video stream; this layer samples the same video only while GRAPH mode is active.
 */
(() => {
  const canvas = document.getElementById('knowledge-graph');
  const ctx = canvas.getContext('2d');
  const video = document.getElementById('webcam');
  const status = document.getElementById('graph-status');
  const screen = document.getElementById('screen');
  const graphButton = document.querySelector('[data-mode="graph"]');

  const nodes = [
    { id:'boole', label:'George Boole', sub:'Boolean algebra', x:-240,y:-120,z:0, r:22 },
    { id:'shannon', label:'Claude Shannon', sub:'logic circuits', x:-80,y:-150,z:0,r:22 },
    { id:'turing', label:'Alan Turing', sub:'computation', x:100,y:-170,z:0,r:22 },
    { id:'mauchly', label:'Mauchly / Eckert', sub:'ENIAC', x:270,y:-80,z:0,r:22 },
    { id:'vonneumann', label:'John von Neumann', sub:'stored program', x:300,y:100,z:0,r:22 },
    { id:'backus', label:'John Backus', sub:'FORTRAN', x:130,y:180,z:0,r:22 },
    { id:'dijkstra', label:'E. Dijkstra', sub:'structured programming', x:-70,y:160,z:0,r:22 },
    { id:'hoare', label:'C. A. R. Hoare', sub:'Hoare logic / quicksort', x:-250,y:130,z:0,r:22 },
    { id:'dahl', label:'Ole-Johan Dahl', sub:'Simula / OO', x:-360,y:10,z:0,r:22 },
    { id:'wirth', label:'Niklaus Wirth', sub:'Pascal / algorithms', x:-90,y:20,z:0,r:22 },
    { id:'kay', label:'Alan Kay', sub:'Dynabook / Smalltalk', x:70,y:30,z:0,r:22 },
    { id:'codd', label:'E. F. Codd', sub:'relational model', x:250,y:230,z:0,r:22 },
    { id:'ritchie', label:'Dennis Ritchie', sub:'C / UNIX', x:420,y:20,z:0,r:22 },
    { id:'thompson', label:'Ken Thompson', sub:'UNIX', x:500,y:130,z:0,r:22 },
    { id:'gosling', label:'James Gosling', sub:'Java', x:430,y:-210,z:0,r:22 },
    { id:'mats', label:'Matz', sub:'Ruby', x:520,y:-80,z:0,r:22 },
    { id:'guido', label:'Guido van Rossum', sub:'Python', x:350,y:300,z:0,r:22 },
  ];

  const edges = [
    ['boole','shannon'],['shannon','turing'],['turing','mauchly'],
    ['mauchly','vonneumann'],['vonneumann','backus'],['vonneumann','ritchie'],
    ['backus','wirth'],['dijkstra','hoare'],['dijkstra','wirth'],
    ['dahl','kay'],['dahl','wirth'],['wirth','kay'],['wirth','guido'],
    ['ritchie','thompson'],['ritchie','gosling'],['gosling','mats'],
    ['gosling','guido'],['kay','gosling'],['kay','mats'],['kay','guido'],
    ['codd','guido'],['codd','ritchie'],['hoare','wirth']
  ];

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id,n]));
  let active = false;
  let selected = null;
  let yaw = 0, pitch = 0, scale = 1;
  let targetYaw = 0, targetPitch = 0, targetScale = 1;
  let lastHandX = null, lastHandY = null;
  let handLoop = false;

  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  addEventListener('resize', resize);
  resize();

  function project(n) {
    let x=n.x, y=n.y, z=n.z;
    const cy=Math.cos(yaw), sy=Math.sin(yaw);
    const cp=Math.cos(pitch), sp=Math.sin(pitch);
    const x1=x*cy-z*sy, z1=x*sy+z*cy;
    const y1=y*cp-z1*sp, z2=y*sp+z1*cp;
    const d=700/(700+z2);
    return {x:canvas.width/2+x1*scale*d, y:canvas.height/2+y1*scale*d, d, z:z2};
  }

  function draw() {
    requestAnimationFrame(draw);
    if (!active) return;
    yaw += (targetYaw-yaw)*0.08;
    pitch += (targetPitch-pitch)*0.08;
    scale += (targetScale-scale)*0.08;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='rgba(5,8,14,0.96)';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const P={}; nodes.forEach(n=>P[n.id]=project(n));
    edges.forEach(([a,b])=>{
      const A=P[a],B=P[b];
      ctx.strokeStyle='rgba(90,220,255,0.22)';
      ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
    });

    [...nodes].sort((a,b)=>P[a.id].z-P[b.id].z).forEach(n=>{
      const p=P[n.id], hit=selected===n.id;
      ctx.beginPath();ctx.arc(p.x,p.y,n.r*(0.8+p.d*0.35)*(hit?1.35:1),0,Math.PI*2);
      ctx.fillStyle=hit?'rgba(255,230,80,0.95)':'rgba(51,255,160,0.82)';ctx.fill();
      ctx.strokeStyle=hit?'#fff':'rgba(51,255,160,0.7)';ctx.stroke();
      ctx.font=hit?'bold 15px monospace':'13px monospace';ctx.fillStyle='#e8fff4';
      ctx.fillText(n.label,p.x+n.r+7,p.y-2);
      ctx.font='11px monospace';ctx.fillStyle='rgba(220,240,235,.62)';
      ctx.fillText(n.sub,p.x+n.r+7,p.y+14);
    });

    ctx.font='bold 18px monospace';ctx.fillStyle='#33ff99';
    ctx.fillText('COMPUTER HISTORY — KNOWLEDGE GRAPH',24,36);
    ctx.font='12px monospace';ctx.fillStyle='rgba(220,255,240,.65)';
    ctx.fillText('Boole → Shannon → Turing → Computer → Languages / Data / OO / AI',24,58);
  }

  function nearest(x,y) {
    let best=null, bd=70;
    for(const n of nodes){const p=project(n),d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best=n.id;}}
    return best;
  }

  function setActive(v){
    active=v;
    canvas.style.display=v?'block':'none';
    screen.style.opacity=v?'0':'1';
    status.textContent=v?'GRAPH: hand control active':'GRAPH: off';
    if(!v) selected=null;
  }

  graphButton.addEventListener('click',(e)=>{
    e.stopImmediatePropagation();
    e.preventDefault();
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    graphButton.classList.add('active');
    setActive(true);
  }, true);

  document.querySelectorAll('.mode-btn:not([data-mode="graph"])').forEach(btn=>
    btn.addEventListener('click',()=>setActive(false),true)
  );

  document.addEventListener('keydown',e=>{
    if(e.key.toLowerCase()==='g'){
      document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
      graphButton.classList.add('active');setActive(true);
    }
  });

  async function processHands(){
    if(handLoop || !window.Hands) return;
    handLoop=true;
    const hands=new Hands({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    hands.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:.65,minTrackingConfidence:.55});
    hands.onResults(results=>{
      if(!active || !results.multiHandLandmarks?.length) return;
      const lm=results.multiHandLandmarks[0];
      const wrist=lm[0], index=lm[8], thumb=lm[4];
      const hx=(wrist.x-.5)*-2, hy=(wrist.y-.5)*-2;
      targetYaw += (hx-(lastHandX??hx))*1.7;
      targetPitch += (hy-(lastHandY??hy))*1.2;
      lastHandX=hx;lastHandY=hy;
      const pinch=Math.hypot(index.x-thumb.x,index.y-thumb.y);
      targetScale=Math.max(.55,Math.min(1.8,.55+pinch*7));
      const px=(1-index.x)*canvas.width, py=index.y*canvas.height;
      const hit=nearest(px,py);
      if(hit) selected=hit;
      if(selected) status.textContent=`GRAPH: ${nodeMap[selected].label} — ${nodeMap[selected].sub}`;
    });
    async function tick(){
      if(active && video.readyState>=2){try{await hands.send({image:video});}catch(e){}} 
      requestAnimationFrame(tick);
    }
    tick();
  }

  processHands();
  setActive(false);
  draw();
})();
