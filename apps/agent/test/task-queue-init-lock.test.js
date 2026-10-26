const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const store = require('../thomas-agent/node/task-queue-sqlite-store');

test('queue initialization waits for a short SQLite exclusive lock before reading', { timeout: 12000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'queue-init-lock-'));
  const options = { queueDb: join(dir, 'queue.sqlite'), ownerAlias: 'owner-a' };
  store.writeTask({id:'synthetic',status:'queued',updatedAt:new Date().toISOString()},options);
  const child = spawn(process.execPath, ['-e', `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.argv[1]);
    db.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE');
    db.prepare('UPDATE tasks SET updated_at=?').run('locked-for-test');
    process.stdout.write('LOCKED');
    setTimeout(() => { db.exec('COMMIT'); db.close(); }, 750);
  `, options.queueDb], {stdio:['ignore','pipe','pipe']});
  t.after(() => { child.kill(); rmSync(dir, {recursive:true,force:true}); });
  await new Promise((resolve,reject) => {
    child.stdout.once('data',resolve);
    child.once('error',reject);
    child.once('exit', code => { if(code)reject(Error('lock holder failed: '+code)); });
  });
  assert.equal(store.readTask('synthetic',options).status,'queued');
  assert.equal(store.readTask('synthetic',{...options,ownerAlias:'owner-b'}),null);
});
