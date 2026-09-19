import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPresenceAudioHandler } from '../src/presence-audio/handler.js';

const uploadToken = 'u'.repeat(64);
const viewToken = 'v'.repeat(64);
const pairToken = 'p'.repeat(48);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'presence-audio-'));
  const handler = createPresenceAudioHandler({ config: {
    PRESENCE_AUDIO_DIR: directory,
    PRESENCE_AUDIO_UPLOAD_TOKEN: uploadToken,
    PRESENCE_AUDIO_VIEW_TOKEN: viewToken,
    PRESENCE_AUDIO_PAIR_TOKEN: pairToken,
  }});
  const server = createServer((req, res) => handler(req, res, new URL(req.url, 'http://' + req.headers.host)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = 'http://127.0.0.1:' + address.port;
  return { directory, server, origin };
}

test('presence audio supports resumable upload, history, playback and one-time pairing', async (t) => {
  const { directory, server, origin } = await fixture();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  const id = 'presence_test_12345';
  const audio = Buffer.from('OggS-fake-opus-audio-for-transport-test');
  const uploaded = await fetch(origin + '/api/presence-audio/stream', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + uploadToken,
      'x-3dvr-session': id,
      'x-3dvr-offset': '0',
      'content-type': 'audio/ogg',
    },
    body: audio,
  });
  assert.equal(uploaded.status, 200);
  const uploadJson = await uploaded.json();
  assert.equal(uploadJson.offset, audio.length);

  const offset = await fetch(origin + '/api/presence-audio/offset/' + id, {
    headers: { authorization: 'Bearer ' + uploadToken },
  });
  assert.equal((await offset.json()).offset, audio.length);

  const liveStatus = await fetch(origin + '/api/presence-audio/status?view=' + viewToken);
  const liveJson = await liveStatus.json();
  assert.equal(liveJson.active.length, 1);
  assert.equal(liveJson.active[0].id, id);

  const finalized = await fetch(origin + '/api/presence-audio/finalize/' + id, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + uploadToken },
  });
  assert.equal(finalized.status, 200);

  const sessions = await fetch(origin + '/api/presence-audio/sessions?view=' + viewToken);
  const sessionJson = await sessions.json();
  assert.equal(sessionJson.sessions[0].id, id);
  assert.equal(sessionJson.sessions[0].active, false);

  const recording = await fetch(origin + '/api/presence-audio/recordings/' + id + '?view=' + viewToken, {
    headers: { range: 'bytes=0-3' },
  });
  assert.equal(recording.status, 206);
  assert.equal(Buffer.from(await recording.arrayBuffer()).toString(), audio.subarray(0, 4).toString());

  const pairPage = await fetch(origin + '/presence-audio/pair/' + pairToken);
  assert.equal(pairPage.status, 200);

  const claim = await fetch(origin + '/api/presence-audio/pair/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: pairToken }),
  });
  assert.equal(claim.status, 200);
  const claimJson = await claim.json();
  assert.match(claimJson.deepLink, /^threedvr:\/\/presence\/pair\?/);
  assert.match(claimJson.viewUrl, /\/3dvr-connect\/presence\/#view=/);

  const secondClaim = await fetch(origin + '/api/presence-audio/pair/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: pairToken }),
  });
  assert.equal(secondClaim.status, 409);
});
