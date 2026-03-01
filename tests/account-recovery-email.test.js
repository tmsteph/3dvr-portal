import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRecoveryEmailHandler } from '../api/calendar/reminder-email.js';

const baseConfig = {
  GMAIL_USER: 'bot@example.com',
  GMAIL_APP_PASSWORD: 'app_password',
  ACCOUNT_RECOVERY_TEAM_EMAILS: 'admin1@example.com,admin2@example.com',
  PORTAL_PUBLIC_ORIGIN: 'https://portal.3dvr.tech'
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
        alias: 'pilot@3dvr',
        aliases: ['pilot@3dvr', 'pilot.backup@3dvr']
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(mail.sendMail.mock.calls.length, 1);
    assert.equal(mail.sendMail.mock.calls[0].arguments[0].to, 'user@example.com');
    assert.equal(res.body.mode, 'lookup');
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

  it('returns server error when transport config is missing', async () => {
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

    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /Email transport is not configured/i);
  });
});
