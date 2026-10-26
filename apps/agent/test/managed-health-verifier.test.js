const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflow = fs.readFileSync(path.resolve(__dirname,'../../../.github/workflows/agent.yml'),'utf8');
const start = workflow.indexOf('          result="$("$THREEDVR_NODE_BIN" thomas-agent/node/agent-task-queue.js enqueue');
const end = workflow.indexOf('\n          REMOTE',start);
assert(start >= 0 && end > start, 'managed health verifier must be present');
const verifier = workflow.slice(start,end);

for (const [scenario, expectedExit, expectedPolls] of [
  ['transient',0,2],['persistent',1,18],['fatal',1,1],['failed',1,1]
]) {
  test('deployment health verifier: '+scenario, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'health-verifier-'));
    try {
      const script = `set -euo pipefail
sleep() { :; }
mock_node() {
  if [ "$1" != thomas-agent/node/agent-task-queue.js ]; then "$REAL_NODE" "$@"; return; fi
  if [ "$2" = enqueue ]; then echo enqueue >> "$CASE_DIR/enqueues"; echo '{"id":"health-one"}'; return; fi
  [ "$2" = status ] && [ "$4" = health-one ] || return 91
  echo status >> "$CASE_DIR/polls"
  count="$(wc -l < "$CASE_DIR/polls")"
  case "$SCENARIO" in
    transient) if [ "$count" -eq 1 ]; then echo 'database is locked' >&2; return 1; fi;;
    persistent) echo 'SQLITE_BUSY' >&2; return 1;;
    fatal) echo 'permission denied' >&2; return 1;;
    failed) echo '{"status":"failed"}'; return;;
  esac
  echo '{"status":"completed"}'
}
THREEDVR_NODE_BIN=mock_node
` + verifier;
      const result = spawnSync('bash',['-s'],{input:script,encoding:'utf8',timeout:10000,
        env:{...process.env,CASE_DIR:dir,SCENARIO:scenario,REAL_NODE:process.execPath}});
      assert.equal(result.status,expectedExit,result.stderr);
      const count = name => fs.readFileSync(path.join(dir,name),'utf8').trim().split('\n').length;
      assert.equal(count('enqueues'),1);
      assert.equal(count('polls'),expectedPolls);
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  });
}
