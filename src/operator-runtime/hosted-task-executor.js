// Read-only first pilot executor. The caller must enforce authenticated ownership,
// task admission and a dedicated restricted worker context.
export async function executeRepoStatus(task, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (!task || task.kind !== 'repo-status' ||
      !/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/.test(task.repository || '') ||
      task.repository.includes('..') || task.status !== 'running') {
    throw new Error('unsupported_task');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('invalid_timeout');
  }
  const response = await fetchImpl(
    'https://api.github.com/repos/' + task.repository,
    {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': '3dvr-operator-pilot' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error'
    }
  );
  if (!response.ok) throw new Error('repository_lookup_failed');
  const data = await response.json();
  if (data.full_name !== task.repository) throw new Error('repository_mismatch');
  return JSON.stringify({
    repository: data.full_name,
    defaultBranch: String(data.default_branch || '').slice(0, 120),
    openIssues: Number.isSafeInteger(data.open_issues_count) ? data.open_issues_count : null,
    pushedAt: typeof data.pushed_at === 'string' ? data.pushed_at.slice(0, 40) : null
  });
}
