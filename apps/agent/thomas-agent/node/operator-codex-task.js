const { spawn } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

// Reuse Hetzner's working Codex login in place. The existing queue continues
// to own claims/results; this starts no service and never retries inference.
async function runOperatorCodexTask(record, options = {}) {
  if (!record.id?.startsWith('operator-http-') || record.backend !== 'codex' || record.unsafe) {
    throw new Error('Invalid private Operator task.');
  }
  const script = await readFile(path.resolve(__dirname, '../../../../src/openclaw/native.py'), 'utf8');
  const data = Buffer.from(JSON.stringify({action:'chat',session:record.id,message:record.task,taskMode:true,
    expiresAt:Date.now() + 90000})).toString('base64url');
  return new Promise((resolve, reject) => {
    const child = (options.spawn || spawn)('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=8',
      '3dvr-hetzner','python3','-',data], {stdio:['pipe','pipe','pipe']});
    let output = '';
    const timer = setTimeout(() => {child.kill('SIGTERM');reject(new Error('Codex task timed out; delivery is uncertain.'));},100000);
    child.stdout.on('data', chunk => {output += chunk;if(Buffer.byteLength(output)>200000)child.kill('SIGTERM');});
    child.stderr.on('data', () => {});
    child.on('error', error => {clearTimeout(timer);reject(error);});
    child.on('close', code => {
      clearTimeout(timer);
      try {
        if(code !== 0 || Buffer.byteLength(output)>200000) throw Error('transport');
        const result=JSON.parse(output);
        resolve({ok:result.ok === true,backend:'codex',result:result.ok ? {stdout:result.reply} : {stderr:result.error || 'Codex did not complete.'}});
      } catch {reject(new Error('Codex connection interrupted; check the saved task before retrying.'));}
    });
    child.stdin.on('error', () => {});
    child.stdin.end(script);
  });
}

module.exports = {runOperatorCodexTask};
