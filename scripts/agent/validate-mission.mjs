import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const REQUIRED_TASK_FIELDS = ['id', 'title', 'dependsOn', 'status'];

export async function loadMission(filePath) {
  const text = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Mission must be JSON-compatible YAML: ${error.message}`);
  }
}

export function validateMission(mission) {
  const errors = [];
  if (!mission || typeof mission !== 'object') errors.push('mission must be an object');
  if (!mission?.id) errors.push('mission.id is required');
  if (!Array.isArray(mission?.tasks) || mission.tasks.length === 0) errors.push('mission.tasks must be non-empty');
  const ids = new Set();
  for (const task of mission?.tasks || []) {
    for (const field of REQUIRED_TASK_FIELDS) {
      if (!(field in task)) errors.push(`task ${task.id || '<unknown>'} is missing ${field}`);
    }
    if (ids.has(task.id)) errors.push(`duplicate task id: ${task.id}`);
    ids.add(task.id);
    for (const dependency of task.dependsOn || []) {
      if (dependency === task.id) errors.push(`task ${task.id} depends on itself`);
    }
    if (task.checks && !task.checks.every(command => Array.isArray(command) && command.length > 0)) {
      errors.push(`task ${task.id} has an invalid checks entry`);
    }
  }
  for (const task of mission?.tasks || []) {
    for (const dependency of task.dependsOn || []) {
      if (!ids.has(dependency)) errors.push(`task ${task.id} depends on missing task ${dependency}`);
    }
  }
  if (!Array.isArray(mission?.allowedPaths)) errors.push('mission.allowedPaths must be an array');
  return errors;
}

async function main() {
  const filePath = path.resolve(process.argv[2] || 'docs/agent/missions/life-upgrade-v01.yaml');
  const mission = await loadMission(filePath);
  const errors = validateMission(mission);
  if (errors.length) {
    console.error(errors.map(error => `- ${error}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`Valid mission: ${mission.id} (${mission.tasks.length} tasks)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
