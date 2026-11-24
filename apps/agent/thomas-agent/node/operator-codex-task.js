const { spawn } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

// Python json.dumps escapes non-ASCII and control characters. A valid reply
// can expand to six wire bytes per UTF-8 byte, plus the receipt envelope.
const MAX_REPLY_BYTES = 120000;
const MAX_WIRE_BYTES = 6 * MAX_REPLY_BYTES + 4096;

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
    const chunks = [];
    let wireBytes = 0;
    let oversized = false;
    const timer = setTimeout(() => {child.kill('SIGTERM');reject(new Error('Codex task timed out; delivery is uncertain.'));},100000);
    child.stdout.on('data', chunk => {
      if (oversized) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      wireBytes += bytes.length;
      if (wireBytes > MAX_WIRE_BYTES) {
        oversized = true;
        chunks.length = 0;
        child.kill('SIGTERM');
        return;
      }
      chunks.push(bytes);
    });
    child.stderr.on('data', () => {});
    child.on('error', error => {clearTimeout(timer);reject(error);});
    child.on('close', code => {
      clearTimeout(timer);
      try {
        if(code !== 0 || oversized) throw Error('transport');
        const result=JSON.parse(Buffer.concat(chunks, wireBytes).toString('utf8'));
        // A successful SSH exit is not a model completion receipt. Bind the
        // native response to this exact task and require a real final reply.
        if (result?.ok === true) {
          if (result.session !== record.id || result.engine !== 'Codex'
            || typeof result.reply !== 'string' || !result.reply.trim()
            || Buffer.byteLength(result.reply) > MAX_REPLY_BYTES) throw Error('invalid completion receipt');
          resolve({ok:true,backend:'codex',result:{stdout:result.reply}});
        } else if (result?.ok === false) {
          resolve({ok:false,backend:'codex',result:{stderr:typeof result.error === 'string'
            && result.error.trim() ? result.error : 'Codex did not complete.'}});
        } else {
          throw Error('invalid completion receipt');
        }
      } catch {reject(new Error('Codex connection interrupted; check the saved task before retrying.'));}
    });
    child.stdin.on('error', () => {});
    child.stdin.end(script);
  });
}

module.exports = {runOperatorCodexTask};
