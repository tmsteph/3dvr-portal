import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildOutboundQueue,
  buildOutboundSummary,
  dispatchOutboundWebhook,
  fetchRemoteOutboundStrategy,
  outcomeTrackerToCsv,
  parseProspectsCsv,
  queueToCsv
} from '../src/money/outboundAutopilot.js';

const autopilot = {
  runId: 'money-1',
  topOpportunity: {
    title: '3DVR Free Page'
  },
  publish: {
    destinationUrl: 'https://portal.3dvr.tech/free-page/'
  }
};

test('parseProspectsCsv reads allowlist and prospect fields', () => {
  const prospects = parseProspectsCsv([
    'name,email,segment,relationship,allow_auto_send,problem_hint',
    'Dana,dana@example.com,local service pro,warm referral,true,Needs one clean link',
    'Lee,,creator,friend,false,Needs a project page'
  ].join('\n'));

  assert.equal(prospects.length, 2);
  assert.equal(prospects[0].name, 'Dana');
  assert.equal(prospects[0].allowAutoSend, true);
  assert.equal(prospects[1].channel, 'text');
});

test('buildOutboundQueue defaults to approval-required and drafts personal messages', () => {
  const queue = buildOutboundQueue({
    autopilot,
    mode: 'approval-required',
    prospects: [{
      name: 'Dana',
      email: 'dana@example.com',
      segment: 'local service pro',
      relationship: 'warm referral',
      problemHint: 'Needs one clean link',
      allowAutoSend: true
    }]
  });

  assert.equal(queue.length, 1);
  assert.equal(queue[0].approvalStatus, 'needs-approval');
  assert.equal(queue[0].eligibleForAutoSend, false);
  assert.match(queue[0].messageDraft, /Hey Dana/);
  assert.match(queue[0].messageDraft, /free/);
  assert.match(queue[0].destinationUrl, /free-page/);
});

test('buildOutboundQueue plans auto-send only for allowlisted prospects inside cap', () => {
  const queue = buildOutboundQueue({
    autopilot,
    mode: 'allowlisted-auto-send',
    dailyCap: 1,
    prospects: [
      {
        name: 'Dana',
        email: 'dana@example.com',
        segment: 'local service pro',
        relationship: 'warm referral',
        allowAutoSend: true
      },
      {
        name: 'Lee',
        email: 'lee@example.com',
        segment: 'creator',
        relationship: 'friend',
        allowAutoSend: true
      },
      {
        name: 'Morgan',
        email: 'morgan@example.com',
        segment: 'contractor',
        relationship: 'cold',
        allowAutoSend: false
      }
    ]
  });

  assert.equal(queue.filter(item => item.autoSendPlanned).length, 1);
  assert.equal(queue.find(item => item.name === 'Morgan').approvalStatus, 'needs-approval');
});



test('buildOutboundQueue follows a revenue-selected paid offer instead of hardcoding the free-page pitch', () => {
  const paidAutopilot = {
    runId: 'money-paid-1',
    offerSelection: { profile: 'website-upgrade', source: 'stripe-revenue' },
    topOpportunity: {
      title: '3DVR Website Upgrade',
      problem: 'The current site loses buyers at the first screen.',
      solution: 'Clean up the main page, offer, proof, and customer path.',
      suggestedPrice: '$99 one time'
    },
    monetization: {
      checkoutUrl: 'https://buy.stripe.com/upgrade?client_reference_id=money-paid-1__website-upgrade',
      clientReferenceId: 'money-paid-1__website-upgrade'
    }
  };
  const queue = buildOutboundQueue({
    autopilot: paidAutopilot,
    prospects: [{ name: 'Dana', email: 'dana@example.com', company: 'Dana Electric', relationship: 'warm referral' }]
  });

  assert.equal(queue[0].offerProfile, 'website-upgrade');
  assert.equal(queue[0].autopilotRunId, 'money-paid-1');
  assert.equal(queue[0].clientReferenceId, 'money-paid-1__website-upgrade');
  assert.equal(queue[0].suggestedPrice, '$99 one time');
  assert.match(queue[0].subject, /Website Upgrade/);
  assert.match(queue[0].messageDraft, /\$99 one time/);
  assert.match(queue[0].messageDraft, /money-paid-1__website-upgrade/);
  assert.doesNotMatch(queue[0].messageDraft, /\$5\/month/);
});

test('queue and outcome CSV files include money-loop tracking columns', () => {
  const queue = buildOutboundQueue({
    autopilot,
    mode: 'draft-only',
    prospects: [{ name: 'Dana', segment: 'creator' }]
  });

  const queueCsv = queueToCsv(queue);
  const outcomeCsv = outcomeTrackerToCsv(queue);

  assert.match(queueCsv, /^id,score,name,company,segment,channel,email,relationship,approvalStatus/);
  assert.match(queueCsv, /messageDraft/);
  assert.match(queueCsv, /offerProfile/);
  assert.match(queueCsv, /clientReferenceId/);
  assert.match(outcomeCsv, /^id,name,channel,offer,offerProfile,suggestedPrice,autopilotRunId,clientReferenceId,contactedAt,replyStatus,pageRequestedAt,pageDeliveredAt/);
  assert.match(outcomeCsv, /subscriptionStatus,revenue,nextFollowUpAt/);
});



test('fetchRemoteOutboundStrategy reads the scoped portal strategy without Stripe credentials', async () => {
  const requests = [];
  const result = await fetchRemoteOutboundStrategy({
    strategyUrl: 'https://portal.example/api/money/strategy',
    token: 'strategy-token',
    async fetchImpl(url, options) {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            runId: 'money-remote-1',
            offerSelection: { profile: 'website-upgrade', source: 'stripe-revenue' }
          });
        }
      };
    }
  });

  assert.equal(result.runId, 'money-remote-1');
  assert.equal(result.offerSelection.profile, 'website-upgrade');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer strategy-token');
});

test('dispatchOutboundWebhook skips unless allowlisted messages and webhook are present', async () => {
  const noMessages = await dispatchOutboundWebhook({ queue: [] });
  assert.equal(noMessages.skipped, true);
  assert.match(noMessages.reason, /no allowlisted/);

  const queue = buildOutboundQueue({
    autopilot,
    mode: 'allowlisted-auto-send',
    prospects: [{
      name: 'Dana',
      email: 'dana@example.com',
      segment: 'local service pro',
      allowAutoSend: true
    }]
  });
  const noWebhook = await dispatchOutboundWebhook({ queue });
  assert.equal(noWebhook.skipped, true);
  assert.match(noWebhook.reason, /sender webhook not configured/);
});

test('dispatchOutboundWebhook posts allowlisted messages to configured sender', async () => {
  const queue = buildOutboundQueue({
    autopilot,
    mode: 'allowlisted-auto-send',
    prospects: [{
      name: 'Dana',
      email: 'dana@example.com',
      segment: 'local service pro',
      allowAutoSend: true
    }]
  });
  const requests = [];
  const result = await dispatchOutboundWebhook({
    queue,
    webhookUrl: 'https://sender.example.com/send',
    token: 'secret-token',
    async fetchImpl(url, options) {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ ok: true });
        }
      };
    }
  });

  assert.equal(result.sent, true);
  assert.equal(result.sentCount, 1);
  assert.equal(requests[0].url, 'https://sender.example.com/send');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.mode, 'outbound-autopilot');
  assert.equal(payload.messages[0].to, 'dana@example.com');
  assert.equal(payload.messages[0].metadata.autopilotRunId, 'money-1');
  assert.equal(payload.messages[0].metadata.offerProfile, 'free-page-starter');
});

test('buildOutboundSummary includes guardrail and first draft', () => {
  const queue = buildOutboundQueue({
    autopilot,
    prospects: [{ name: 'Dana', segment: 'creator' }]
  });
  const summary = buildOutboundSummary({
    queue,
    mode: 'approval-required',
    dispatch: { reason: 'sender webhook not configured' },
    now: new Date('2026-07-10T17:00:00.000Z')
  });

  assert.match(summary, /Outbound Autopilot/);
  assert.match(summary, /Money Action/);
  assert.match(summary, /Dana/);
  assert.match(summary, /Auto-send requires mode/);
});

test('outbound workflow runs manual diagnostic queue generation', async () => {
  const workflow = await readFile(new URL('../.github/workflows/outbound-autopilot.yml', import.meta.url), 'utf8');

  assert.match(workflow, /Outbound Autopilot/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /money:outbound/);
  assert.match(workflow, /approval-required/);
  assert.match(workflow, /MONEY_OUTBOUND_SENDER_WEBHOOK_URL/);
  assert.match(workflow, /MONEY_OUTBOUND_STRATEGY_URL/);
  assert.match(workflow, /MONEY_OUTBOUND_STRATEGY_TOKEN/);
  assert.doesNotMatch(workflow, /STRIPE_SECRET_KEY/);
  assert.match(workflow, /outbound-queue\.csv/);
  assert.match(workflow, /outcome-tracker\.csv/);
  assert.match(workflow, /sendEmail true/);
  assert.match(workflow, /email-message\.txt/);
  assert.match(workflow, /email-delivery\.json/);
  assert.doesNotMatch(workflow, /sendTelegram true/);
});
