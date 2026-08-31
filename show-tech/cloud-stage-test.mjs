import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { sendAction } from './controller.mjs';

const nodes = [
  { name: 'cloud-screen-a', port: 47801, discoveryPort: 47901, token: 'cloud-a-token' },
  { name: 'cloud-screen-b', port: 47802, discoveryPort: 47902, token: 'cloud-b-token' },
];
const children = [];

async function waitForHealth(port) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`node on port ${port} did not become healthy`);
}

function spawnNode(node) {
  const child = spawn(process.execPath, ['node.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      SHOW_NODE_PORT: String(node.port),
      SHOW_DISCOVERY_PORT: String(node.discoveryPort),
      SHOW_NODE_TOKEN: node.token,
      SHOW_NODE_ID: node.name,
      SHOW_NODE_NAME: node.name,
    },
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}

async function waitForActionEvent(port, actionId, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/events`, { signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;
        const event = JSON.parse(dataLine.slice(6));
        if (event.actionId === actionId) return event;
      }
    }
    throw new Error(`event stream ended before ${actionId}`);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

test.before(async () => {
  for (const node of nodes) spawnNode(node);
  await Promise.all(nodes.map(node => waitForHealth(node.port)));
});

test.after(() => {
  for (const child of children) child.kill('SIGTERM');
});

test('two virtual AV nodes execute the same cue with low local skew', async () => {
  const actionId = `cloud-stage-${Date.now()}`;
  const executeAt = Date.now() + 750;
  const eventPromises = nodes.map(node => waitForActionEvent(node.port, actionId));

  const targets = nodes.map(node => ({
    name: node.name,
    url: `http://127.0.0.1:${node.port}`,
    token: node.token,
  }));

  const sent = await sendAction(targets, {
    id: actionId,
    type: 'display.text',
    executeAt,
    payload: { text: 'CLOUD STAGE GO' },
  });

  assert.equal(sent.results.length, 2);
  assert.ok(sent.results.every(result => result.response.scheduled === true));

  const events = await Promise.all(eventPromises);
  const skewMs = Math.abs(events[0].appliedAt - events[1].appliedAt);
  const latenessMs = events.map(event => event.appliedAt - executeAt);

  assert.ok(skewMs <= 150, `node execution skew was ${skewMs}ms`);
  assert.ok(latenessMs.every(value => value >= -20 && value <= 250), `unexpected execution timing: ${latenessMs.join(', ')}ms`);

  const states = await Promise.all(nodes.map(async node => {
    const response = await fetch(`http://127.0.0.1:${node.port}/v1/state`);
    return response.json();
  }));
  assert.ok(states.every(state => state.display.text === 'CLOUD STAGE GO'));

  console.log(`CLOUD_STAGE_RESULT ${JSON.stringify({
    actionId,
    executeAt,
    appliedAt: events.map((event, index) => ({ node: nodes[index].name, at: event.appliedAt })),
    skewMs,
    latenessMs,
  })}`);
});
