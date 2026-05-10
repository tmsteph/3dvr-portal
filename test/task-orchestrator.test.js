const test = require('node:test');
const assert = require('node:assert/strict');

const {
  backendCommand,
  buildPrompt,
  callClaude,
  callOpenAI,
  classifyTask,
  describeCommand,
  parseArgs,
  pickBackend,
  runAgentTask,
  taskId,
} = require('../thomas-agent/node/task-orchestrator');

test('parseArgs defaults to dry-run auto backend', () => {
  const options = parseArgs(['--backend', 'codex', '--execute', 'Fix the tests']);

  assert.equal(options.backend, 'codex');
  assert.equal(options.execute, true);
  assert.equal(options.task, 'Fix the tests');
});

test('classifyTask separates code and high-risk side effects', () => {
  const code = classifyTask('Fix the failing repo tests');
  const risky = classifyTask('Send outreach emails and merge the PR');

  assert.equal(code.kind, 'code');
  assert.equal(code.highRisk, false);
  assert.equal(risky.highRisk, true);
});

test('pickBackend prefers codex for code and openclaw for tool-heavy general work', () => {
  assert.equal(pickBackend(
    { backend: 'auto' },
    classifyTask('Fix the JavaScript tests'),
    { codex: true, openclaw: true, claudeCli: false, claudeApi: false, openaiApi: true },
  ), 'codex');
  assert.equal(pickBackend(
    { backend: 'auto' },
    classifyTask('Use the browser and calendar to prepare my day'),
    { codex: true, openclaw: true, claudeCli: false, claudeApi: false, openaiApi: true },
  ), 'openclaw');
});

test('buildPrompt preserves the portal and worker architecture', () => {
  const classification = classifyTask('Research a prospect');
  const prompt = buildPrompt('Research a prospect', { repo: '/tmp/repo' }, classification);

  assert.match(prompt, /Portal is the durable browser control plane/);
  assert.match(prompt, /Local\/server agents execute work/);
  assert.match(prompt, /Research a prospect/);
});

test('taskId is stable across devices for the same task', () => {
  assert.equal(taskId('Fix the sales worker'), taskId('Fix the sales worker'));
  assert.notEqual(taskId('Fix the sales worker'), taskId('Fix the inbox worker'));
});

test('backendCommand prints OpenClaw and Codex dispatch commands', () => {
  const prompt = 'Do the task';
  const openclaw = backendCommand('openclaw', prompt, { thinking: 'high' });
  const codex = backendCommand('codex', prompt, { repo: '/tmp/repo' });

  assert.equal(openclaw.command, 'openclaw');
  assert.deepEqual(openclaw.args.slice(0, 2), ['agent', '--message']);
  assert.match(describeCommand(codex), /^codex 'exec'/);
  assert.deepEqual(codex.args.slice(1, 4), ['--cd', '/tmp/repo', '--skip-git-repo-check']);
});

test('high-risk task is skipped unless explicitly unsafe', async () => {
  const result = await runAgentTask(['--backend', 'openai', 'Send customer emails'], {
    capabilities: { openaiApi: true },
  });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /high-risk/);
});

test('dry-run prints selected backend without executing', async () => {
  const result = await runAgentTask(['--backend', 'openclaw', 'Research the next best lead'], {
    capabilities: { openclaw: true },
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.backend, 'openclaw');
  assert.match(result.command, /openclaw/);
});

test('OpenAI Responses backend sends the expected request shape', async () => {
  let captured;
  const result = await callOpenAI('hello', { model: 'gpt-test' }, {
    env: { OPENAI_API_KEY: 'key' },
    fetchImpl: async (url, request) => {
      captured = { url, request };
      return {
        ok: true,
        json: async () => ({ output_text: 'world' }),
      };
    },
  });

  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(captured.request.body).model, 'gpt-test');
  assert.equal(result.stdout, 'world');
});

test('Claude backend sends the expected Messages request shape', async () => {
  let captured;
  const result = await callClaude('hello', { model: 'claude-test', task: 'hello' }, {
    env: { ANTHROPIC_API_KEY: 'key' },
    fetchImpl: async (url, request) => {
      captured = { url, request };
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'world' }] }),
      };
    },
  });

  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.request.headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.parse(captured.request.body).model, 'claude-test');
  assert.equal(result.stdout, 'world');
});
