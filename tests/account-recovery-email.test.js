import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRecoveryEmailHandler, createUnifiedEmailHandler } from '../api/calendar/reminder-email.js';

const baseConfig = {
  GMAIL_USER: 'bot@example.com',
  GMAIL_APP_PASSWORD: 'app_password',
  ACCOUNT_RECOVERY_TEAM_EMAILS: 'admin1@example.com,admin2@example.com',
  PORTAL_PUBLIC_ORIGIN: 'https://portal.3dvr.tech',
  AGENT_OPERATOR_EMAIL_TOKEN: 'operator-secret'
};

function createMailTransport() {
  return {
    sendMail: mock.fn(async () => ({ ok: true }))
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      if (payload !== undefined) this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

describe('account recovery email api', () => {
  it('responds with diagnostics on GET', async () => {
    const handler = createAccountRecoveryEmailHandler({
      config: baseConfig,
      mailTransport: createMailTransport()
    });

    const req = { method: 'GET', body: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      mailConfigured: true,
      teamRecipientsConfigured: true
    });
  });

  it('rejects invalid recovery emails', async () => {
    const handler = createAccountRecoveryEmailHandler({
      config: baseConfig,
      mailTransport: createMailTransport()
    });

    const req = {
      method: 'POST',
      body: {
        mode: 'lookup',
        email: 'invalid'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'A valid recovery email is required.');
  });

  it('requires alias details for lookup emails', async () => {
    const mail = createMailTransport();
    const handler = createAccountRecoveryEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      body: {
        mode: 'lookup',
        email: 'user@example.com'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(mail.sendMail.mock.calls.length, 0);
  });

  it('sends lookup emails with alias details', async () => {
    const mail = createMailTransport();
    const handler = createAccountRecoveryEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      body: {
        mode: 'lookup',
        email: 'user@example.com',
        alias: 'Pilot@3dvr',
        aliases: ['Pilot@3dvr', 'pilot.backup@3dvr']
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(mail.sendMail.mock.calls.length, 1);
    assert.equal(mail.sendMail.mock.calls[0].arguments[0].to, 'user@example.com');
    assert.equal(res.body.mode, 'lookup');
    assert.equal(res.body.alias, 'Pilot@3dvr');
  });

  it('sends admin-reset-request notifications to team and requester', async () => {
    const mail = createMailTransport();
    const handler = createAccountRecoveryEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      body: {
        mode: 'admin-reset-request',
        email: 'member@example.com',
        alias: 'member@3dvr',
        requestedUsername: 'member-next'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, 'admin-reset-request');
    assert.equal(mail.sendMail.mock.calls.length, 2);

    const teamEmail = mail.sendMail.mock.calls[0].arguments[0];
    assert.deepEqual(teamEmail.to, ['admin1@example.com', 'admin2@example.com']);

    const requesterEmail = mail.sendMail.mock.calls[1].arguments[0];
    assert.equal(requesterEmail.to, 'member@example.com');
  });

  it('validates admin-reset-issued payloads', async () => {
    const mail = createMailTransport();
    const handler = createAccountRecoveryEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      body: {
        mode: 'admin-reset-issued',
        email: 'member@example.com',
        alias: 'member@3dvr',
        username: 'member-next',
        temporaryPassword: '123'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(mail.sendMail.mock.calls.length, 0);
  });

  it('sends admin-reset-issued emails', async () => {
    const mail = createMailTransport();
    const handler = createAccountRecoveryEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      body: {
        mode: 'admin-reset-issued',
        email: 'member@example.com',
        alias: 'member@3dvr',
        username: 'member-next',
        temporaryPassword: 'Temp#1234',
        issuedBy: 'admin@3dvr'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(mail.sendMail.mock.calls.length, 1);
    assert.equal(mail.sendMail.mock.calls[0].arguments[0].to, 'member@example.com');
  });

  it('returns service-unavailable details when transport config is missing', async () => {
    const handler = createAccountRecoveryEmailHandler({
      config: {
        ...baseConfig,
        GMAIL_USER: '',
        GMAIL_APP_PASSWORD: ''
      }
    });

    const req = {
      method: 'POST',
      body: {
        mode: 'lookup',
        email: 'member@example.com',
        alias: 'member@3dvr'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'email_transport_unavailable');
    assert.equal(res.body.mailConfigured, false);
    assert.equal(res.body.teamRecipientsConfigured, true);
    assert.match(res.body.error, /not configured on this deployment/i);
  });

  it('rejects operator alerts without the shared token', async () => {
    const mail = createMailTransport();
    const handler = createUnifiedEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      headers: {},
      body: {
        mode: 'operator-alert',
        to: 'thomas@example.com',
        subject: 'Need input',
        summary: 'Review the new leads.'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(mail.sendMail.mock.calls.length, 0);
  });

  it('sends operator alerts through the unified mail route', async () => {
    const mail = createMailTransport();
    const handler = createUnifiedEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer operator-secret'
      },
      body: {
        mode: 'operator-alert',
        to: ['thomas@example.com'],
        subject: '[3dvr-agent] action needed',
        summary: 'New leads are ready for review.',
        actionItems: ['Review/send new outreach', 'Check contacted lead follow-ups'],
        commands: ['ask-next', 'ask-send --enrich --mark "Lead Name"'],
        metadata: {
          runId: '2026-04-23T01-02-03Z',
          counts: 'new=5, contacted=2'
        }
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, 'operator-alert');
    assert.equal(mail.sendMail.mock.calls.length, 1);
    const sent = mail.sendMail.mock.calls[0].arguments[0];
    assert.deepEqual(sent.to, ['thomas@example.com']);
    assert.equal(sent.subject, '[3dvr-agent] action needed');
    assert.match(sent.html, /3DVR operator alert/i);
    assert.match(sent.text, /New leads are ready for review/i);
  });

  it('rejects lead outreach without the shared token', async () => {
    const mail = createMailTransport();
    const handler = createUnifiedEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      headers: {},
      body: {
        mode: 'lead-outreach',
        to: 'tmsteph1290@gmail.com',
        subject: 'Quick idea for your site',
        text: 'I noticed one small customer-flow issue worth tightening.'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(mail.sendMail.mock.calls.length, 0);
  });

  it('sends lead outreach through the unified mail route', async () => {
    const mail = createMailTransport();
    const handler = createUnifiedEmailHandler({
      config: baseConfig,
      mailTransport: mail
    });

    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer operator-secret'
      },
      body: {
        mode: 'lead-outreach',
        to: ['tmsteph1290@gmail.com'],
        subject: 'Re: Quick idea for your site',
        headline: 'Quick note from 3DVR',
        text: 'I noticed one small customer-flow issue worth tightening.',
        senderName: 'Thomas @ 3DVR',
        senderEmail: '3dvr.tech@gmail.com',
        inReplyTo: '<reply-message@example.com>',
        references: '<thread-root@example.com> <reply-message@example.com>'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, 'lead-outreach');
    assert.equal(mail.sendMail.mock.calls.length, 1);
    const sent = mail.sendMail.mock.calls[0].arguments[0];
    assert.deepEqual(sent.to, ['tmsteph1290@gmail.com']);
    assert.equal(sent.subject, 'Re: Quick idea for your site');
    assert.equal(sent.replyTo, '3dvr.tech@gmail.com');
    assert.equal(sent.inReplyTo, '<reply-message@example.com>');
    assert.equal(sent.references, '<thread-root@example.com> <reply-message@example.com>');
    assert.match(sent.html, /Quick note from 3DVR/i);
    assert.match(sent.text, /customer-flow issue/i);
  });
});
