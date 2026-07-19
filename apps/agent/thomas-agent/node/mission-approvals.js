const crypto = require('node:crypto');
function createApproval(missionId, taskId, gate, headSha, now = new Date().toISOString()) { return { approvalId: `approval_${crypto.randomUUID()}`, missionId, taskId, action: gate.action, target: gate.target, headSha, requestedAt: now, status: 'required' }; }
function matchesApproval(approval, expected, currentHeadSha) { return approval && approval.status === 'approved' && approval.missionId === expected.missionId && approval.taskId === expected.taskId && approval.action === expected.action && approval.target === expected.target && approval.headSha === currentHeadSha; }
function approve(approval, headSha) { if (approval.headSha !== headSha) throw new Error('approval expired because target head changed'); return { ...approval, status: 'approved', approvedAt: new Date().toISOString() }; }
module.exports = { approve, createApproval, matchesApproval };
