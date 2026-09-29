'use strict';

const CVW_WATCHDOG_POLICY = Object.freeze({
  target: 'cvw',
  expectedTotalWorkflows: 29,
  expectedActiveWorkflows: 18,
  workflows: Object.freeze([
    { name: 'CANARY — is n8n actually working', mode: 'scheduled', maxSilenceHours: 24, impact: 'instance liveness', knownBaseline: 'Documented schedule trigger currently never fires.' },
    { name: 'Missing Docs — Approval & Email', mode: 'scheduled', maxSilenceHours: 36, impact: 'document follow-up', knownBaseline: 'Documented daily schedule currently has no recent executions.' },
    { name: 'Hermes - Daily Morning Briefing', mode: 'scheduled', maxSilenceHours: 36, impact: 'daily practice briefing', knownBaseline: 'Documented dead OpenAI credential causes current failures.' },
    { name: 'Client Intake — Daily Reminder Emails', mode: 'scheduled', maxSilenceHours: 36, impact: 'client follow-up' },
    { name: 'Document Intake Pipeline', mode: 'event', impact: 'document intake' },
    { name: 'Cognito Forms — Send Return Link on Submit', mode: 'event', impact: 'questionnaire intake' },
    { name: 'Client Intake — Credit Counseling Detector', mode: 'event', impact: 'credit counseling tracking' },
    { name: 'Client Intake — Appointment Booking Tracker', mode: 'event', impact: 'appointment tracking', knownBaseline: 'Documented as having zero executions during the prior audit.' },
    { name: 'Hermes - Error Notifications', mode: 'event', impact: 'error notification path' },
  ]),
});

function timestamp(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function latestExecution(rows = []) {
  return [...rows].sort((a, b) => {
    const aTime = timestamp(a.stoppedAt) ?? timestamp(a.startedAt) ?? 0;
    const bTime = timestamp(b.stoppedAt) ?? timestamp(b.startedAt) ?? 0;
    return bTime - aTime;
  })[0] || null;
}

function finding(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

function evaluateN8nWatchdog({
  workflows = [],
  executionsByWorkflow = {},
  now = new Date(),
  policy = CVW_WATCHDOG_POLICY,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const byName = new Map(workflows.map((row) => [row.name, row]));
  const findings = [];
  const monitored = [];

  const activeCount = workflows.filter((row) => row.active && !row.isArchived).length;
  if (workflows.length !== policy.expectedTotalWorkflows) {
    findings.push(finding('critical', 'workflow-count-total',
      `Expected ${policy.expectedTotalWorkflows} workflows; found ${workflows.length}.`));
  }
  if (activeCount !== policy.expectedActiveWorkflows) {
    findings.push(finding('critical', 'workflow-count-active',
      `Expected ${policy.expectedActiveWorkflows} active workflows; found ${activeCount}.`));
  }

  for (const rule of policy.workflows) {
    const workflow = byName.get(rule.name);
    if (!workflow) {
      findings.push(finding('high', 'workflow-missing', `Missing monitored workflow: ${rule.name}`, {
        workflow: rule.name,
        impact: rule.impact,
        knownBaseline: rule.knownBaseline || null,
      }));
      continue;
    }
    if (!workflow.active || workflow.isArchived) {
      findings.push(finding('high', 'workflow-inactive', `Monitored workflow is not active: ${rule.name}`, {
        workflow: rule.name,
        workflowId: workflow.id,
        impact: rule.impact,
        knownBaseline: rule.knownBaseline || null,
      }));
    }

    const entry = {
      workflow: rule.name,
      workflowId: workflow.id,
      mode: rule.mode,
      impact: rule.impact,
      active: Boolean(workflow.active && !workflow.isArchived),
      knownBaseline: rule.knownBaseline || null,
    };

    if (rule.mode === 'scheduled') {
      const rows = executionsByWorkflow[workflow.id] || [];
      const latest = latestExecution(rows);
      entry.latestExecution = latest;
      if (!latest) {
        findings.push(finding('high', 'scheduled-no-executions',
          `No recent execution metadata for scheduled workflow: ${rule.name}`, entry));
      } else {
        const lastMs = timestamp(latest.stoppedAt) ?? timestamp(latest.startedAt);
        const ageHours = lastMs == null ? null : (nowMs - lastMs) / 3_600_000;
        entry.ageHours = ageHours;
        if (ageHours == null || ageHours > rule.maxSilenceHours) {
          findings.push(finding('high', 'scheduled-stale',
            `Scheduled workflow is stale: ${rule.name}`, {
              ...entry,
              maxSilenceHours: rule.maxSilenceHours,
            }));
        }
        if (latest.status === 'error') {
          findings.push(finding('high', 'latest-execution-error',
            `Latest execution failed: ${rule.name}`, entry));
        }
      }
    } else {
      entry.heartbeatRequired = true;
      entry.reason = 'Execution metadata alone cannot distinguish a healthy event-driven flow from a successful no-op.';
    }

    monitored.push(entry);
  }

  const rank = { critical: 3, high: 2, medium: 1, low: 0 };
  findings.sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));

  return {
    target: policy.target,
    generatedAt: new Date(nowMs).toISOString(),
    baseline: {
      expectedTotalWorkflows: policy.expectedTotalWorkflows,
      expectedActiveWorkflows: policy.expectedActiveWorkflows,
      actualTotalWorkflows: workflows.length,
      actualActiveWorkflows: activeCount,
    },
    findings,
    monitored,
    blindSpot: {
      code: 'success-no-op',
      description: 'n8n execution status can be success even when no meaningful business step occurred.',
      mitigation: 'Add metadata-only entry/progress/completion heartbeats to critical event-driven workflows.',
      clientData: 'Do not send client names, documents, form fields, message contents, or credentials.',
    },
  };
}

module.exports = {
  CVW_WATCHDOG_POLICY,
  evaluateN8nWatchdog,
  latestExecution,
};
