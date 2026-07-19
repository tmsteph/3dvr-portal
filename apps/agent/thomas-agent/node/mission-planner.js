function dependenciesDone(mission, state, task) { return task.dependsOn.every(id => state.tasks[id]?.state === 'completed'); }
function nextTask(mission, state) { return mission.tasks.find(task => ['queued', 'ready'].includes(state.tasks[task.id]?.state) && dependenciesDone(mission, state, task)) || null; }
function retryAllowed(task, state) { return (state.tasks[task.id]?.attempts || 0) < task.retryPolicy.maxAttempts; }
function plan(mission, state) {
  const task = nextTask(mission, state); const blocked = mission.tasks.filter(item => ['queued', 'ready'].includes(state.tasks[item.id]?.state) && item.dependsOn.some(id => ['failed', 'blocked', 'cancelled'].includes(state.tasks[id]?.state)));
  return { task, blocked, complete: !task && blocked.length === 0 && mission.tasks.every(item => state.tasks[item.id]?.state === 'completed') };
}
module.exports = { dependenciesDone, nextTask, plan, retryAllowed };
