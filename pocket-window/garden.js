import { project } from './rig.js';

export function createGarden(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let width = 1, height = 1;
  function resize() {
    width = innerWidth; height = innerHeight;
    // Keep the spatial scene responsive on phones and large software-rendered screens.
    // HUD text stays at native CSS resolution.
    const dpr = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(1000000 / (width * height)));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  }
  resize();
  addEventListener('resize', resize);
  const stars = Array.from({ length: 70 }, (_, i) => ({
    x: Math.sin(i * 78.233) * 12, y: Math.cos(i * 17.19) * 8,
    z: 2 + (i % 17), radius: .018 + (i % 3) * .008
  }));
  function render(eye, time) {
    const bg = ctx.createRadialGradient(width * .5, height * .42, 0, width * .5, height * .42, Math.max(width, height));
    bg.addColorStop(0, '#654578'); bg.addColorStop(.4, '#292849'); bg.addColorStop(1, '#11172c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    const commands = [];
    const p = point => project(point, eye, width, height);
    function polygon(points, fill, stroke, line = 1) {
      commands.push({ z: points.reduce((s, v) => s + v.z, 0) / points.length, draw() {
        const projected = points.map(p);
        if (projected.some(v => !v)) return;
        ctx.beginPath(); projected.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
        ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
      } });
    }
    function sprite(x, y, z, radius, draw) {
      commands.push({ z, draw() {
        const pos = p({ x, y, z }); if (!pos) return;
        ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(pos.scale * radius, pos.scale * radius);
        draw(); ctx.restore();
      } });
    }
    const ellipse = (x, y, rx, ry, color) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    };
    function halo(color, radius = 2) {
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      glow.addColorStop(0, color); glow.addColorStop(1, color + '00');
      ctx.fillStyle = glow; ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    }
    // Low-poly ellipsoids give Moonbun real volume when the viewer peeks sideways.
    function ellipsoid(cx, cy, cz, rx, ry, rz, pink = false) {
      const rows = 8, columns = 16;
      const vertex = (row, col) => {
        const latitude = row / rows * Math.PI, longitude = col / columns * Math.PI * 2;
        return { x: cx + Math.sin(latitude) * Math.cos(longitude) * rx,
          y: cy + Math.cos(latitude) * ry,
          z: cz + Math.sin(latitude) * Math.sin(longitude) * rz };
      };
      for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        const latitude = (r + .5) / rows * Math.PI, longitude = (c + .5) / columns * Math.PI * 2;
        const light = .65 + .22 * Math.cos(latitude) - .16 * Math.sin(latitude) * Math.cos(longitude) - .12 * Math.sin(latitude) * Math.sin(longitude);
        const value = Math.max(50, Math.min(96, light * 100));
        const color = 'hsl(' + (pink ? 333 : 326) + ' 46% ' + value + '%)';
        polygon([vertex(r,c),vertex(r+1,c),vertex(r+1,c+1),vertex(r,c+1)],color);
      }
    }
    // A real floor and receding portal geometry, all in the same world space.
    polygon([{ x:-14,y:-1.2,z:-1 },{ x:14,y:-1.2,z:-1 },{ x:14,y:-1.2,z:26 },{ x:-14,y:-1.2,z:26 }], '#2d354d');
    for (let z = 22; z >= .3; z -= 2) {
      const a = 1.42;
      const colors = ['#ffa9c8', '#c6afff', '#82e1d1'];
      polygon([{x:-a,y:-1.2,z},{x:-a,y:1.7,z},{x:a,y:1.7,z},{x:a,y:-1.2,z}], null, colors[Math.round(z) % 3] + 'aa', Math.max(1, 5 * eye.distance / (eye.distance + z)));
      polygon([{x:-9,y:-1.19,z},{x:9,y:-1.19,z},{x:9,y:-1.19,z:.02 + z},{x:-9,y:-1.19,z:.02 + z}], '#a3ddcf44');
    }
    for (let x = -7; x <= 7; x += .7) polygon([{x,y:-1.19,z:-.8},{x:x+.012,y:-1.19,z:-.8},{x:x+.012,y:-1.19,z:26},{x,y:-1.19,z:26}], '#b7ead633');
    stars.forEach((s, i) => sprite(s.x + Math.sin(time * .4 + i) * .13, s.y, s.z, s.radius, () => {
      halo('#ffe4ac', 2.5); ellipse(0,0,1,1,'#ffeac5');
    }));
    // The moon doorway beyond the garden.
    sprite(0, .6, 13, 1.5, () => {
      halo('#ffdcbd', 1.6);
      ellipse(0,0,1,1,'#ffd8b5'); ellipse(.35,-.14,.8,.8,'#51466d');
    });
    // Lanterns float at independent distances.
    for (let i = 0; i < 10; i++) {
      const z = i * 1.15 + .25;
      sprite((i % 2 ? 1 : -1) * (.8 + i * .05), .55 + Math.sin(time + i) * .09, z, .13, () => {
        halo('#ffb9d1', 1.9);
        ellipse(0,0,.75,1,'#ffd4be'); ellipse(0,-.95,.32,.12,'#fff3cb');
        ctx.strokeStyle='#edacbe'; ctx.lineWidth=.06; ctx.beginPath(); ctx.moveTo(0,-1.05); ctx.lineTo(0,-1.6); ctx.stroke();
      });
    }
    // A small curious friend with dimensional ears, body and cheeks.
    const bob = Math.sin(time * 1.3) * .035;
    ellipsoid(0,-.43+bob,1.55,.29,.37,.24);
    ellipsoid(-.2,-.78+bob,1.32,.14,.07,.18);
    ellipsoid(.2,-.78+bob,1.32,.14,.07,.18);
    for (const side of [-1,1]) {
      ellipsoid(side*.17,.27+bob,1.48,.07,.31,.07);
      sprite(side*.17,.27+bob,1.397,.14,()=>ellipse(0,0,.24,1.7,'#f3a9c5'));
    }
    ellipsoid(0,-.08+bob,1.45,.38,.33,.28);
    // Face markings sit just in front of the curved head.
    sprite(0,-.09+bob,1.16,.32,()=>{
      ellipse(-.34,-.03,.065,.1,'#342443'); ellipse(.34,-.03,.065,.1,'#342443');
      ellipse(-.34,-.065,.018,.025,'#fff'); ellipse(.34,-.065,.018,.025,'#fff');
      ellipse(-.55,.22,.16,.09,'#f4adbf'); ellipse(.55,.22,.16,.09,'#f4adbf');
      ellipse(0,.18,.07,.045,'#a66b89');
      ctx.strokeStyle='#a66b89';ctx.lineWidth=.025;ctx.beginPath();ctx.arc(-.07,.21,.075,0,Math.PI);ctx.arc(.07,.21,.075,0,Math.PI);ctx.stroke();
    });
    // Peek around the near pillars to discover two tiny star friends.
    for (const side of [-1,1]) sprite(side * .93, -.18, 2.6, .18, () => {
      ctx.beginPath(); for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?.46:1;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();
      ctx.fillStyle='#ffe6a8';ctx.fill();
      ellipse(-.22,0,.055,.08,'#604761');ellipse(.22,0,.055,.08,'#604761');
    });
    // Opaque foreground posts create unmistakable occlusion, unlike overlay parallax.
    const edge = Math.min(width / height, 1.5) * .9;
    for (const side of [-1,1]) {
      const x=side*edge, z=-.68;
      polygon([{x:x-.065,y:-1.5,z},{x:x-.065,y:1.7,z},{x:x+.065,y:1.7,z},{x:x+.065,y:-1.5,z}], '#393656', '#ad8fb688', 2);
      polygon([{x:x-.065,y:1.7,z},{x:x+.065,y:1.7,z},{x:x+.065,y:1.7,z:.6},{x:x-.065,y:1.7,z:.6}], '#897393');
      sprite(x,.85,z-.02,.12,()=>{halo('#f6c5e0', 1.4);ellipse(0,0,.55,1,'#facbe0');});
    }
    for (let i=0;i<8;i++) {
      const side=i%2?1:-1, z=i<2?-.9:1+i*.9;
      sprite(side*(i<2?edge*.9:1.25),i<2?-.62:-.9,z,i<2?.23:.22,()=>{
        ellipse(0,.37,.2,.54,'#f8e6cc');
        ellipse(0,-.05,1,.52,i%3?'#d4a6f3':'#ffb5ce');
        ellipse(-.42,-.17,.12,.075,'#fff0df');ellipse(.24,-.28,.14,.08,'#fff0df');
      });
    }
    // Foreground motes cross the physical glass plane (z=0).
    for(let i=0;i<12;i++) {
      const z=.3+Math.sin(time*.38+i)*1.05;
      sprite(Math.sin(i*31.7)*1.25,Math.cos(i*7.8)*.9+Math.sin(time*.6+i)*.06,z,.024,()=>{
        halo('#b6ffe6', 2.7);ellipse(0,0,1,1,'#b6ffe6');
      });
    }
    commands.sort((a,b)=>b.z-a.z).forEach(c=>c.draw());
    // Fixed glass edge stays on the display plane while the world moves behind it.
    const rim=ctx.createLinearGradient(0,0,width,height);rim.addColorStop(0,'#ffd6ef88');rim.addColorStop(.5,'#a4ead944');rim.addColorStop(1,'#bfb3ff88');
    ctx.strokeStyle=rim;ctx.lineWidth=3;ctx.strokeRect(2,2,width-4,height-4);
  }
  return { render };
}
