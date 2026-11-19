import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('today/index.html','utf8');
test('reuses existing destinations and exactly one timer entry',()=>{
 for(const path of ['/sky-room/','/squat-timer/','/meditation/guided-stretching.html','/meditation-garden/','/games.html']) assert.ok(html.includes(`href="${path}"`));
 assert.equal((html.match(/href="\/squat-timer\/"/g)||[]).length,1);
 assert.ok(!html.includes('autostart'));
});
test('passive page has no timer, auth, tracking or permission code',()=>{
 assert.ok(!/<script\b/i.test(html));
 assert.ok(!/requestPermission|setInterval|setTimeout|localStorage|serviceWorker/.test(html));
 assert.match(html,/allow="geolocation 'none'; microphone 'none'; camera 'none'"/);
 assert.match(html,/src="\/sky-room\/\?embed=today"/);
});
test('responsive and accessible entry points',()=>{
 assert.match(html,/name="viewport"/);
 assert.match(html,/iframe[^>]+title="Sky Room/);
 assert.match(html,/href="#choices"/);
 const css=fs.readFileSync('today/styles.css','utf8');
 assert.match(css,/grid-template-columns:1fr/);
 assert.match(css,/focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
});
