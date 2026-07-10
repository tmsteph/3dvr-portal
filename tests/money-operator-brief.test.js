import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMoneyOperatorBrief,
  leadQueueToCsv,
  sendEmailBrief,
  sendTelegramBrief
} from '../src/money/operatorBrief.js';

function sampleAutopilot() {
  return {
    runId: 'money-1',
    generatedAt: '2026-07-10T16:15:00.000Z',
    market: 'people who need a simple first website',
    warnings: ['Checkout URL not configured. Campaign traffic will use https://portal.3dvr.tech/free-page/.'],
    topOpportunity: {
      title: '3DVR Free Page',
      audience: 'friends, freelancers, creators, local service people, and small businesses',
      problem: 'Most people need one clean page they can send before they need a full site.',
      solution: 'Make a free one-page draft, then ask whether it is useful enough to keep live for $5/month.',
      suggestedPrice: 'Free draft, then $5/month to keep it live',
      score: 86
    },
    adDrafts: [
      {
        id: 'free-page-text-1',
        channel: 'text',
        headline: 'Want a simple page for what you do?',
        body: 'I am testing a tiny 3DVR offer: I will make you a clean one-page website for free.',
        cta: 'Send the basics'
      },
      {
        id: 'free-page-email-1',
        channel: 'email',
        headline: 'I can make you a simple one-page website',
        body: 'I am making free one-page websites for people with a service or creative project.',
        cta: 'Send the basics'
      }
    ],
    executionChecklist: [
      'Send the free page offer to 10 people.',
      'Collect their name, offer, audience, main CTA, and best contact link.'
    ],
    publish: {
      destinationUrl: 'https://portal.3dvr.tech/free-page/'
    },
    monetization: {
      checkoutConfigured: false,
      checkoutUrl: '',
      checkoutCtaLabel: 'Keep It Live'
    }
  };
}

test('buildMoneyOperatorBrief creates a day brief and lead queue without auto-sending', () => {
  const brief = buildMoneyOperatorBrief({
    autopilot: sampleAutopilot(),
    mode: 'day'
  });

  assert.equal(brief.mode, 'day');
  assert.equal(brief.title, 'Day Money Brief');
  assert.match(brief.markdown, /Send or edit one message to one likely person today/);
  assert.match(brief.markdown, /3DVR Free Page/);
  assert.match(brief.markdown, /No automatic outreach was sent/);
  assert.match(brief.telegramText, /Message to use:/);
  assert.equal(brief.leadQueue.length, 2);
  assert.equal(brief.leadQueue[0].status, 'suggested');
  assert.equal(brief.leadQueue[0].subscriptionStatus, '');
});

test('buildMoneyOperatorBrief creates a night brief for tomorrow prep', () => {
  const brief = buildMoneyOperatorBrief({
    autopilot: sampleAutopilot(),
    mode: 'night'
  });

  assert.equal(brief.mode, 'night');
  assert.equal(brief.title, 'Night Money Brief');
  assert.match(brief.telegramText, /Pick one person for tomorrow/);
});

test('leadQueueToCsv writes tracker columns and escapes message drafts', () => {
  const brief = buildMoneyOperatorBrief({
    autopilot: sampleAutopilot(),
    mode: 'day'
  });
  const csv = leadQueueToCsv(brief.leadQueue);

  assert.match(csv, /^id,priority,segment,channel,status,nextStep,messageDraft,cta,contactedAt/);
  assert.match(csv, /replyStatus,pageStatus,subscriptionStatus,notes/);
  assert.match(csv, /money-1-lead-1/);
  assert.match(csv, /I am testing a tiny 3DVR offer: I will make you a clean one-page website for free\./);
});

test('sendTelegramBrief skips cleanly when config is missing', async () => {
  const result = await sendTelegramBrief({
    text: 'Day Money Brief',
    env: {}
  });

  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /telegram config missing/);
});

test('sendTelegramBrief supports dry-run without calling Telegram', async () => {
  let called = false;
  const result = await sendTelegramBrief({
    text: 'Day Money Brief',
    dryRun: true,
    env: {
      MONEY_OPERATOR_TELEGRAM_BOT_TOKEN: 'token',
      MONEY_OPERATOR_TELEGRAM_CHAT_ID: '123'
    },
    async fetchImpl() {
      called = true;
    }
  });

  assert.equal(called, false);
  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'dry-run');
});

test('sendTelegramBrief posts to Telegram when configured', async () => {
  const requests = [];
  const result = await sendTelegramBrief({
    text: 'Day Money Brief',
    env: {
      MONEY_OPERATOR_TELEGRAM_BOT_TOKEN: 'token',
      MONEY_OPERATOR_TELEGRAM_CHAT_ID: '123'
    },
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
  assert.equal(result.reason, 'sent');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.telegram.org/bottoken/sendMessage');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.chat_id, '123');
  assert.equal(body.disable_web_page_preview, true);
  assert.equal(body.text, 'Day Money Brief');
});

test('sendEmailBrief skips cleanly when Gmail config is missing', async () => {
  const result = await sendEmailBrief({
    subject: '3DVR Day Money Brief',
    text: 'Day Money Brief',
    env: {
      MONEY_OPERATOR_EMAIL_TO: 'thomas@example.com'
    }
  });

  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /gmail config missing/);
});

test('sendEmailBrief supports dry-run without calling Gmail', async () => {
  let called = false;
  const result = await sendEmailBrief({
    subject: '3DVR Day Money Brief',
    text: 'Day Money Brief',
    dryRun: true,
    env: {
      GMAIL_USER: 'bot@example.com',
      GMAIL_APP_PASSWORD: 'secret',
      MONEY_OPERATOR_EMAIL_TO: 'thomas@example.com'
    },
    transport: {
      async sendMail() {
        called = true;
      }
    }
  });

  assert.equal(called, false);
  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'dry-run');
});

test('sendEmailBrief sends through configured transport', async () => {
  const messages = [];
  const result = await sendEmailBrief({
    subject: '3DVR Day Money Brief',
    text: 'Day Money Brief',
    env: {
      GMAIL_USER: 'bot@example.com',
      GMAIL_APP_PASSWORD: 'secret',
      MONEY_OPERATOR_EMAIL_TO: 'thomas@example.com'
    },
    transport: {
      async sendMail(message) {
        messages.push(message);
        return { messageId: 'email-1' };
      }
    }
  });

  assert.equal(result.sent, true);
  assert.equal(result.reason, 'sent');
  assert.equal(result.messageId, 'email-1');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'thomas@example.com');
  assert.equal(messages[0].from, '3DVR Operator <bot@example.com>');
  assert.equal(messages[0].subject, '3DVR Day Money Brief');
  assert.match(messages[0].html, /Day Money Brief/);
});
