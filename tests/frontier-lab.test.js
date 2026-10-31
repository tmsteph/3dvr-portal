import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('frontier lab produces reproducible failure baseline without raw event payloads',()=>{
 const dir=mkdtempSync(join(tmpdir(),'frontier-'));
 const input=join(dir,'events.json'), output=join(dir,'report.json');
 writeFileSync(input,JSON.stringify([{kind:'queue',outcome:'failure',secret:'must-not-leak'},{kind:'queue',outcome:'success'},{kind:'routing',outcome:'failure'}]));
 const p=spawnSync(process.execPath,['scripts/frontier-lab.mjs',input,output],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const raw=readFileSync(output,'utf8'); assert.ok(!raw.includes('must-not-leak'));
 const r=JSON.parse(raw); assert.deepEqual(r.categories.map(x=>[x.kind,x.failures,x.total]),[['queue',1,2],['routing',1,1]]);
});
test('rejects invalid outcome',()=>{
 const dir=mkdtempSync(join(tmpdir(),'frontier-'));const input=join(dir,'events.json');
 writeFileSync(input,JSON.stringify([{kind:'queue',outcome:'unknown'}]));
 assert.notEqual(spawnSync(process.execPath,['scripts/frontier-lab.mjs',input],{encoding:'utf8'}).status,0);
});
