const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {recover,layout}=require('../3dvr-os/window-manager.js');
test('partial offscreen drag preserves reachable titlebar on either edge',()=>{
 const a={width:1000,height:600},r={width:500,height:400,left:-900,top:-50};
 assert.deepEqual(recover(r,a),{width:500,height:400,left:-380,top:0});
 assert.deepEqual(recover({...r,left:2000,top:900},a),{width:500,height:400,left:880,top:560});
});
test('viewport shrink recovers dimensions and titlebar, including tiny areas',()=>{
 for(const a of [{width:320,height:200},{width:80,height:20}]) {
 const r=recover({width:900,height:800,left:-800,top:900},a);
 assert.ok(r.width<=a.width && r.height<=a.height && r.top>=0 && r.left+r.width>0 && r.left<a.width);
 }
});
test('tiling and maximize use current workspace bounds',()=>{
 const a={width:1000,height:600};
 assert.deepEqual(layout('left',a),{left:0,top:0,width:500,height:600});
 assert.deepEqual(layout('right',a),{left:500,top:0,width:500,height:600});
 assert.deepEqual(layout('maximize',a),{left:0,top:0,width:1000,height:600});
});
test('selection guard leaves in-app selection native; shortcuts and buttons share arrange',()=>{
 const s=fs.readFileSync('3dvr-os/window-manager.js','utf8');
 assert.match(s,/if \(!body \|\| body.contains\(selection.focusNode\)\) return/);
 assert.ok(!s.includes('removeAllRanges'));
 assert.match(s,/button.addEventListener\('click', \(\) => arrange\(win, mode\)\)/);
 assert.match(s,/event.preventDefault\(\); arrange\(win, mode\)/);
 assert.match(s,/if \(!state.mode\) state.saved = rect\(win\)/);
});

test('mobile keeps full-window mode without misleading arrange controls',()=>{
 const s=fs.readFileSync('3dvr-os/window-manager.js','utf8');
 const h=fs.readFileSync('3dvr-os/index.html','utf8');
 assert.match(s,/if \(root.innerWidth <= 680 \|\| !event.metaKey/);
 assert.match(h,/@media\(max-width:680px\)\{\.window-arrange\{display:none\}/);
});
