const SECRET = /(token|password|secret|authorization|cookie|api[-_]?key)/i;
function redact(value, key = '') {
  if (SECRET.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]').replace(/(ghp_|github_pat_)[A-Za-z0-9_]+/g, '[REDACTED]');
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  return value;
}
function workerResult(result) { return redact({ taskId: result.taskId, status: result.status, artifacts: result.artifacts || [], changedFiles: result.changedFiles || [], commandsRun: result.commandsRun || [], testResults: result.testResults || [], observations: result.observations || [], assumptions: result.assumptions || [], unresolvedRisks: result.unresolvedRisks || [], headSha: result.headSha || null, pullRequest: result.pullRequest || null }); }
module.exports = { redact, workerResult };
