import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRepoStatus } from '../src/operator-runtime/hosted-task-executor.js';

const task = { kind: 'repo-status', repository: 'tmsteph/3dvr-portal', status: 'running' };

test('fetches bounded public repository status with GET', async () => {
  const result = await executeRepoStatus(task, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/tmsteph/3dvr-portal');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({
      full_name: 'tmsteph/3dvr-portal', default_branch: 'main',
      open_issues_count: 12, pushed_at: '2026-10-11T00:00:00Z',
      private_data: 'must-not-leak'
    }) };
  } });
  assert.equal(JSON.parse(result).openIssues, 12);
  assert.equal(result.includes('private_data'), false);
});
test('rejects unsupported operations and unsafe paths', async () => {
  await assert.rejects(executeRepoStatus({ ...task, kind: 'shell' }), /unsupported_task/);
  await assert.rejects(executeRepoStatus({ ...task, repository: '../secret' }), /unsupported_task/);
  await assert.rejects(executeRepoStatus({ ...task, status: 'queued' }), /unsupported_task/);
});
test('fails closed on mismatched repository or upstream error', async () => {
  await assert.rejects(executeRepoStatus(task, { fetchImpl: async () => ({
    ok: true, json: async () => ({ full_name: 'other/repo' })
  }) }), /repository_mismatch/);
  await assert.rejects(executeRepoStatus(task, { fetchImpl: async () => ({ ok: false }) }), /repository_lookup_failed/);
});
