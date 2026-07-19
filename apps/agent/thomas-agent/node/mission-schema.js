const MISSION_STATES = new Set(['queued', 'ready', 'running', 'blocked', 'awaiting_approval', 'completed', 'failed', 'cancelled']);
const TASK_STATES = new Set(['queued', 'ready', 'leased', 'running', 'validating', 'blocked', 'awaiting_approval', 'completed', 'failed', 'skipped', 'cancelled']);
const RISK_CLASSES = new Set(['read_only', 'draft', 'workspace_write', 'external_write', 'money', 'credential']);

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function validateMission(mission) {
  const errors = [];
  if (!mission || typeof mission !== 'object' || Array.isArray(mission)) return ['mission must be an object'];
  for (const key of ['missionId', 'repository', 'defaultBranch', 'objective', 'approvalPolicy']) if (!text(mission[key])) errors.push(`${key} is required`);
  if (mission.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(mission.tasks) || mission.tasks.length === 0) errors.push('tasks must be a non-empty array');
  const ids = new Set();
  for (const task of mission.tasks || []) {
    if (!task || typeof task !== 'object') { errors.push('each task must be an object'); continue; }
    if (!text(task.id)) errors.push('task id is required');
    if (ids.has(task.id)) errors.push(`duplicate task id: ${task.id}`);
    ids.add(task.id);
    for (const key of ['objective', 'riskClass', 'modelTier', 'backend']) if (!text(task[key])) errors.push(`${task.id}: ${key} is required`);
    if (!Array.isArray(task.dependsOn) || task.dependsOn.some(value => !text(value))) errors.push(`${task.id}: dependsOn must be an array of ids`);
    if (!Array.isArray(task.allowedFiles) || !Array.isArray(task.commands) || !Array.isArray(task.acceptanceTests) || !Array.isArray(task.evidenceRequired)) errors.push(`${task.id}: declared arrays are required`);
    if (!RISK_CLASSES.has(task.riskClass)) errors.push(`${task.id}: invalid riskClass`);
    if (task.approvalGate !== null && (typeof task.approvalGate !== 'object' || !text(task.approvalGate?.action) || !text(task.approvalGate?.target))) errors.push(`${task.id}: invalid approvalGate`);
    if (!task.retryPolicy || !Number.isInteger(task.retryPolicy.maxAttempts) || task.retryPolicy.maxAttempts < 1) errors.push(`${task.id}: retryPolicy.maxAttempts is required`);
  }
  for (const task of mission.tasks || []) for (const dependency of task.dependsOn || []) if (!ids.has(dependency)) errors.push(`${task.id}: unknown dependency ${dependency}`);
  const visiting = new Set(); const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`dependency cycle includes ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id); const task = (mission.tasks || []).find(item => item.id === id);
    for (const dependency of task?.dependsOn || []) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const id of ids) visit(id);
  return errors;
}

function validateTaskState(state) { return TASK_STATES.has(state); }

module.exports = { MISSION_STATES, TASK_STATES, RISK_CLASSES, validateMission, validateTaskState };
