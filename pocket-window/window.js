import { clamp, createRig } from './rig.js';
import { createGarden } from './garden.js';

const $ = id => document.getElementById(id);
const canvas = $('world'), rig = createRig(), garden = createGarden(canvas);
const { pointer, motion, head } = rig.inputs;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
$('still').checked = reduced.matches;
const status = message => { $('status').textContent = message; };
let active = false, last = performance.now(), time = 0;
function explore() { active = true; document.body.classList.add('exploring'); }
function point(x, y) {
  pointer.x = clamp((x / innerWidth - .5) * 2, -1, 1);
  pointer.y = clamp((.5 - y / innerHeight) * 2, -1, 1);
  explore();
}
const touches = new Map();
let pinchStart = null, pinchDepth = 0;
canvas.addEventListener('pointerdown', e => {
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
  point(e.clientX, e.clientY);
  if (touches.size === 2) { pinchStart = pinchDistance(); pinchDepth = pointer.z; }
});
function pinchDistance() {
  const [a,b] = [...touches.values()];
  return Math.hypot(a.x-b.x,a.y-b.y);
}
canvas.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (touches.size === 2 && pinchStart) pointer.z = clamp(pinchDepth + (pinchDistance()-pinchStart)/180, -1.7, 1);
  else if (e.pointerType === 'mouse' || touches.has(e.pointerId)) point(e.clientX,e.clientY);
});
function release(e) { touches.delete(e.pointerId); pinchStart=null; }
canvas.addEventListener('pointerup',release);
canvas.addEventListener('pointercancel',release);
canvas.addEventListener('lostpointercapture',release);
canvas.addEventListener('wheel', e => {
  e.preventDefault(); explore();
  pointer.z = clamp(pointer.z - e.deltaY*.002, -1.7,1);
},{passive:false});
let motionBase=null, motionLatest=null, motionEnabled=false, motionTimer;
function recenter() {
  rig.center(); motionBase=motionLatest ? {...motionLatest}:null;
  explore(); status('Centered. Lean, drag or pinch to peek again.');
}
$('center').onclick=recenter;
addEventListener('keydown',e=>{
  if(e.key==='Escape') { recenter(); $('panel').hidden=true; $('settings').setAttribute('aria-expanded','false'); return; }
  if(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
  const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'];
  if(!keys.includes(e.key))return;
  e.preventDefault(); explore();
  if(e.key==='ArrowLeft')pointer.x=clamp(pointer.x-.15,-1,1);
  if(e.key==='ArrowRight')pointer.x=clamp(pointer.x+.15,-1,1);
  if(e.key==='ArrowUp')pointer.y=clamp(pointer.y+.15,-1,1);
  if(e.key==='ArrowDown')pointer.y=clamp(pointer.y-.15,-1,1);
  if(e.key==='+'||e.key==='=')pointer.z=clamp(pointer.z+.15,-1.7,1);
  if(e.key==='-')pointer.z=clamp(pointer.z-.15,-1.7,1);
});
$('settings').onclick=()=>{
  $('panel').hidden=!$('panel').hidden;
  $('settings').setAttribute('aria-expanded',String(!$('panel').hidden));
};
$('fullscreen').onclick=async()=>{
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    else status('Full screen is unavailable here. The garden still fills your browser.');
  }catch { status('Full screen is unavailable; the garden still works.'); }
};
$('motion').onclick=async()=>{
  if(motionEnabled) {
    motionEnabled=false;motionBase=null;Object.assign(motion,{x:0,y:0});
    $('motion').textContent='Enable Motion';$('motion').classList.remove('on');clearTimeout(motionTimer);
    status('Tilt off. Touch and camera still work.');return;
  }
  try {
    if(!('DeviceOrientationEvent' in window))throw new Error('unavailable');
    if(typeof DeviceOrientationEvent.requestPermission==='function') {
      const permission=await DeviceOrientationEvent.requestPermission();
      if(permission!=='granted')throw new Error('denied');
    }
    motionEnabled=true;motionBase=null;
    $('motion').textContent='Disable Motion';$('motion').classList.add('on');
    status('Waiting for tilt. Hold the device comfortably; first reading becomes center.');
    motionTimer=setTimeout(()=>{
      if(motionEnabled&&!motionBase)status('No tilt readings yet. Drag or pinch still works.');
    },2500);
  }catch { status('Tilt unavailable or permission declined. Drag, pinch or use the arrows.'); }
};
addEventListener('deviceorientation',e=>{
  if(!motionEnabled||e.gamma==null||e.beta==null)return;
  motionLatest={x:e.gamma,y:e.beta};
  if(!motionBase){motionBase={...motionLatest};status('Tilt ready. Center resets your comfortable holding angle.');}
  const x=clamp((e.gamma-motionBase.x)/28,-1,1);
  const y=clamp((e.beta-motionBase.y)/35,-1,1);
  const angle=(screen.orientation?.angle??window.orientation??0)*Math.PI/180;
  motion.x=x*Math.cos(angle)+y*Math.sin(angle);
  motion.y=-y*Math.cos(angle)+x*Math.sin(angle);
  explore();
});
addEventListener('orientationchange',()=>{motionBase=null;});

let stream=null, detector=null, trackingFrame=0, previous=null, cameraGeneration=0, cameraBusy=false;
const video=$('video'), vision=document.createElement('canvas');
vision.width=40;vision.height=30;
const visionContext=vision.getContext('2d',{willReadFrequently:true});
function stopCamera() {
  cameraGeneration++;cancelAnimationFrame(trackingFrame);
  stream?.getTracks().forEach(track=>track.stop());
  stream=null;video.srcObject=null;previous=null;detector=null;
  Object.assign(head,{x:0,y:0,z:0});rig.center();
  $('cam').textContent='Enable Camera';$('cam').classList.remove('on');
}
$('cam').onclick=async()=>{
  if(cameraBusy)return;
  if(stream){stopCamera();status('Camera off. Drag, pinch or tilt still works.');return;}
  cameraBusy=true;$('cam').disabled=true;
  const generation=++cameraGeneration;
  try {
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('unavailable');
    const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:320},height:{ideal:240}},audio:false});
    if(generation!==cameraGeneration){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;video.srcObject=stream;await video.play();
    if(generation!==cameraGeneration)return;
    if('FaceDetector' in window) {
      try{detector=new FaceDetector({fastMode:true,maxDetectedFaces:1});}catch{detector=null;}
    }
    $('cam').textContent='Disable Camera';$('cam').classList.add('on');
    status(detector?'Local face tracking ready. Lean and move closer.':'Local camera-motion fallback ready. This estimates movement, not head distance.');
    let firstFace=true, detectedAt=0;
    async function track(now) {
      if(!stream||generation!==cameraGeneration)return;
      if(now-detectedAt>80&&!document.hidden) {
        detectedAt=now;
        try {
          if(detector) {
            const faces=await detector.detect(video);
            if(generation!==cameraGeneration)return;
            if(faces[0]) {
              const b=faces[0].boundingBox;
              head.x=(.5-(b.x+b.width/2)/video.videoWidth)*4.8;
              head.y=(.5-(b.y+b.height/2)/video.videoHeight)*3.6;
              head.z=clamp(b.width/video.videoWidth-.28,-.2,.35)*4;
              if(firstFace){rig.center();firstFace=false;}
            }
          }else if(visionContext&&video.readyState>=2) {
            visionContext.drawImage(video,0,0,40,30);
            const d=visionContext.getImageData(0,0,40,30).data;
            if(previous) {
              let sx=0,sy=0,weight=0;
              for(let y=0;y<30;y+=2)for(let x=0;x<40;x+=2) {
                const i=(y*40+x)*4,diff=Math.abs(d[i]-previous[i])+Math.abs(d[i+1]-previous[i+1])+Math.abs(d[i+2]-previous[i+2]);
                if(diff>55){sx+=x*diff;sy+=y*diff;weight+=diff;}
              }
              if(weight>500){head.x+=( (.5-sx/weight/40)*1.6-head.x)*.12;head.y+=( (.5-sy/weight/30)*1.2-head.y)*.12;}
            }
            previous=new Uint8ClampedArray(d);
          }
        }catch {
          if(detector){detector=null;previous=null;status('Face tracking unavailable; local camera-motion fallback active.');}
        }
      }
      if(stream&&generation===cameraGeneration)trackingFrame=requestAnimationFrame(track);
    }
    trackingFrame=requestAnimationFrame(track);explore();
  }catch{stopCamera();status('Camera unavailable or permission declined. Drag, pinch or tilt still works.');}
  finally{cameraBusy=false;$('cam').disabled=false;}
};
addEventListener('pagehide',stopCamera);
addEventListener('visibilitychange',()=>{if(document.hidden&&stream){stopCamera();status('Camera paused while away. Enable Camera to resume.');}});

if(!garden)$('fallback').hidden=false;
else garden.render(rig.eye,0);
function animate(now) {
  const dt=(now-last)/1000;last=now;
  const still=$('still').checked;
  if(!still)time+=Math.min(dt,.05);
  // A brief automatic lean demonstrates occlusion before any permissions.
  if(!active&&!still) {
    pointer.x=Math.sin(time*1.15)*.18;
    pointer.y=Math.sin(time*.7)*.1;
    if(time>6){active=true;document.body.classList.add('exploring');pointer.x=0;pointer.y=0;}
  }
  const eye=rig.update(dt,Number($('intensity').value));
  if(garden&&!document.hidden)garden.render(eye,time);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
