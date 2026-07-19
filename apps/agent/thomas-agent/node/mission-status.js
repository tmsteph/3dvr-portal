const fs = require('node:fs/promises');
const path = require('node:path');
const { atomicWrite, stateDirectory } = require('./mission-store');
function renderStatus(mission, state, events = []) {
  const current = state.currentTaskId || 'none'; const active = mission.tasks.filter(task => !['completed', 'cancelled', 'skipped'].includes(state.tasks[task.id]?.state));
  const completed = mission.tasks.filter(task => state.tasks[task.id]?.state === 'completed');
  const blockers = state.blockers.length ? state.blockers.map(item => `- ${item}`).join('\n') : '- none recorded';
  const evidence = events.slice(-8).map(event => `- ${event.timestamp}: ${event.summary}`).join('\n') || '- none recorded';
  return ['# Live mission status', '', `Mission: ${mission.missionId}`, `State: ${state.state}`, `Updated: ${state.updatedAt}`, '', '## Current focus', '', `- ${current}`, '', '## Active tasks', '', ...(active.length ? active.map(task => `- ${task.id}: ${state.tasks[task.id].state}`) : ['- none']), '', '## Recently completed', '', ...(completed.length ? completed.slice(-8).map(task => `- ${task.id}`) : ['- none']), '', '## Blockers', '', blockers, '', '## Evidence', '', evidence, '', '## Needs your attention', '', state.state === 'awaiting_approval' ? '- A scoped human approval is required.' : '- none', ''].join('\n');
}
async function writeStatus(mission, state, events, root) { const file = path.join(stateDirectory(mission.missionId, root), 'LIVE_STATUS.md'); await atomicWrite(file, renderStatus(mission, state, events)); return file; }
module.exports = { renderStatus, writeStatus };
