import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companionSignedAction,
  createCompanionCommandHandler,
} from '../src/device/companion-command-proxy.js';

function createResponse() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}
function request(body = {}, method = 'POST') {
  return { method, body, headers: { host: 'portal.3dvr.tech', 'x-forwarded-proto': 'https' } };
}
function acceptedAuth(action) {
  return async (_body, options) => ({ ok: true, identity: { pub: 'test-pub', alias: 'thomas', origin: options.expectedOrigin, action, issuedAt: Date.now(), scope: 'companion-command' } });
}
function mockJsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(payload); } };
}

const signed = (capabilityId, args = {}) => companionSignedAction('invoke', capabilityId, args);

test('requires a signed action proof before relay access', async () => {
  let networkCalls = 0;
  const handler = createCompanionCommandHandler({ config: { VERCEL_OIDC_TOKEN: 'oidc-token' }, fetchImpl: async () => { networkCalls += 1; throw new Error('should not call network'); }, verifyAuth: async () => ({ ok: false, reason: 'denied' }) });
  const res = createResponse();
  await handler(request({ mode: 'invoke', capabilityId: 'device.status' }), res);
  assert.equal(res.statusCode, 401); assert.equal(networkCalls, 0);
});

test('binds the signed proof to the requested capability', async () => {
  let networkCalls = 0;
  const handler = createCompanionCommandHandler({ config: { VERCEL_OIDC_TOKEN: 'oidc-token' }, fetchImpl: async () => { networkCalls += 1; throw new Error('should not call network'); }, verifyAuth: acceptedAuth(signed('health')) });
  const res = createResponse();
  await handler(request({ mode: 'invoke', capabilityId: 'device.status' }), res);
  assert.equal(res.statusCode, 401); assert.equal(networkCalls, 0);
});

test('binds the signed proof to exact remote action arguments', async () => {
  let networkCalls = 0;
  const approvedArgs = { url: 'https://example.com/approved' };
  const handler = createCompanionCommandHandler({
    config: { VERCEL_OIDC_TOKEN: 'oidc-token' },
    fetchImpl: async () => { networkCalls += 1; throw new Error('should not call network'); },
    verifyAuth: acceptedAuth(signed('url.open', approvedArgs)),
  });
  const res = createResponse();
  await handler(request({ mode: 'invoke', capabilityId: 'url.open', arguments: { url: 'https://example.com/changed' } }), res);
  assert.equal(res.statusCode, 401); assert.equal(networkCalls, 0);
});

test('rejects high-risk capabilities before relay access', async () => {
  let networkCalls = 0;
  const handler = createCompanionCommandHandler({ config: { VERCEL_OIDC_TOKEN: 'oidc-token' }, fetchImpl: async () => { networkCalls += 1; throw new Error('should not call network'); }, verifyAuth: acceptedAuth('unused') });
  const res = createResponse();
  await handler(request({ mode: 'invoke', capabilityId: 'ui.perform' }), res);
  assert.equal(res.statusCode, 403); assert.equal(networkCalls, 0);
});

test('rejects arbitrary app aliases and insecure URLs before relay access', async () => {
  for (const body of [
    { mode: 'invoke', capabilityId: 'app.open_known', arguments: { alias: 'termux' } },
    { mode: 'invoke', capabilityId: 'url.open', arguments: { url: 'http://example.com' } },
  ]) {
    let networkCalls = 0;
    const handler = createCompanionCommandHandler({ config: { VERCEL_OIDC_TOKEN: 'oidc-token' }, fetchImpl: async () => { networkCalls += 1; throw new Error('should not call network'); }, verifyAuth: acceptedAuth('unused') });
    const res = createResponse();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400); assert.equal(networkCalls, 0);
  }
});

test('requires Vercel workload identity after user authorization', async () => {
  const handler = createCompanionCommandHandler({ config: {}, fetchImpl: async () => { throw new Error('should not call network'); }, verifyAuth: acceptedAuth('devices') });
  const res = createResponse();
  await handler(request({ mode: 'devices' }), res);
  assert.equal(res.statusCode, 503); assert.match(res.body.error, /workload identity/i);
});

test('lists active Companion devices and admitted capabilities', async () => {
  const calls = [];
  const handler = createCompanionCommandHandler({ config: { VERCEL_OIDC_TOKEN: 'vercel-oidc-secret' }, verifyAuth: acceptedAuth('devices'), fetchImpl: async (url, options) => { calls.push({ url, options }); return mockJsonResponse(200, { ok: true, devices: [{ deviceId: 'device_abcdefghijklmnopqrstuv', expiresAt: 123456 }] }); } });
  const res = createResponse();
  await handler(request({ mode: 'devices' }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.devices.length, 1);
  assert.deepEqual(res.body.capabilities, [
    'health', 'device.status', 'app.open_known', 'url.open',
    'messages.notification.read', 'messages.notification.reply',
  ]);
  assert.equal(calls[0].options.headers.authorization, 'Bearer vercel-oidc-secret'); assert.equal(JSON.stringify(res.body).includes('vercel-oidc-secret'), false);
});

test('invokes device.status on the sole connected phone and returns the result', async () => {
  const calls = [];
  const handler = createCompanionCommandHandler({
    config: { VERCEL_OIDC_TOKEN: 'vercel-oidc-secret' }, verifyAuth: acceptedAuth(signed('device.status')),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/relay/v1/devices')) return mockJsonResponse(200, { ok: true, devices: [{ deviceId: 'device_abcdefghijklmnopqrstuv', expiresAt: 999999 }] });
      if (url.endsWith('/relay/v1/commands')) { const body = JSON.parse(options.body); assert.equal(body.deviceId, 'device_abcdefghijklmnopqrstuv'); assert.equal(body.capabilityId, 'device.status'); assert.deepEqual(body.arguments, {}); return mockJsonResponse(201, { ok: true, requestId: body.requestId }); }
      if (url.includes('/relay/v1/results/')) return mockJsonResponse(200, { ok: true, commandOk: true, data: { model: 'SM-F936U1', batteryPercent: 67 }, completedAt: 123456 });
      throw new Error(`unexpected URL ${url}`);
    },
  });
  const res = createResponse();
  await handler(request({ mode: 'invoke', capabilityId: 'device.status' }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true); assert.equal(res.body.deviceId, 'device_abcdefghijklmnopqrstuv');
  assert.deepEqual(res.body.data, { model: 'SM-F936U1', batteryPercent: 67 }); assert.equal(calls.length, 3);
});

test('forwards bounded message reads and exact notification replies', async () => {
  for (const [capabilityId, args] of [
    ['messages.notification.read', { limit: 5 }],
    ['messages.notification.reply', { key: 'sms|thread|42', text: 'On my way' }],
  ]) {
    const handler = createCompanionCommandHandler({
      config: { VERCEL_OIDC_TOKEN: 'vercel-oidc-secret' }, verifyAuth: acceptedAuth(signed(capabilityId, args)),
      fetchImpl: async (url, options) => {
        if (url.endsWith('/relay/v1/devices')) return mockJsonResponse(200, { ok: true, devices: [{ deviceId: 'device_abcdefghijklmnopqrstuv', expiresAt: 999999 }] });
        if (url.endsWith('/relay/v1/commands')) { const body = JSON.parse(options.body); assert.equal(body.capabilityId, capabilityId); assert.deepEqual(body.arguments, args); return mockJsonResponse(201, { ok: true, requestId: body.requestId }); }
        if (url.includes('/relay/v1/results/')) return mockJsonResponse(200, { ok: true, commandOk: true, data: {}, completedAt: 123456 });
        throw new Error(`unexpected URL ${url}`);
      },
    });
    const res = createResponse();
    await handler(request({ mode: 'invoke', capabilityId, arguments: args }), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true);
  }
});

test('rejects overbroad message reads and malformed replies before relay access', async () => {
  for (const body of [
    { mode: 'invoke', capabilityId: 'messages.notification.read', arguments: { limit: 50 } },
    { mode: 'invoke', capabilityId: 'messages.notification.read', arguments: { packageName: 'com.whatsapp' } },
    { mode: 'invoke', capabilityId: 'messages.notification.reply', arguments: { key: '', text: 'hi' } },
    { mode: 'invoke', capabilityId: 'messages.notification.reply', arguments: { key: 'message-key', text: '' } },
  ]) {
    let networkCalls = 0;
    const handler = createCompanionCommandHandler({ config: { VERCEL_OIDC_TOKEN: 'oidc-token' }, fetchImpl: async () => { networkCalls += 1; throw new Error('should not call network'); }, verifyAuth: acceptedAuth('unused') });
    const res = createResponse();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400); assert.equal(networkCalls, 0);
  }
});

test('forwards a normalized known-app action to the relay', async () => {
  const args = { alias: 'maps' };
  const handler = createCompanionCommandHandler({
    config: { VERCEL_OIDC_TOKEN: 'vercel-oidc-secret' }, verifyAuth: acceptedAuth(signed('app.open_known', args)),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/relay/v1/devices')) return mockJsonResponse(200, { ok: true, devices: [{ deviceId: 'device_abcdefghijklmnopqrstuv', expiresAt: 999999 }] });
      if (url.endsWith('/relay/v1/commands')) { const body = JSON.parse(options.body); assert.deepEqual(body.arguments, args); return mockJsonResponse(201, { ok: true, requestId: body.requestId }); }
      if (url.includes('/relay/v1/results/')) return mockJsonResponse(200, { ok: true, commandOk: true, data: { opened: true, alias: 'maps' }, completedAt: 123456 });
      throw new Error(`unexpected URL ${url}`);
    },
  });
  const res = createResponse();
  await handler(request({ mode: 'invoke', capabilityId: 'app.open_known', arguments: args }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true); assert.equal(res.body.data.alias, 'maps');
});

test('does not guess when multiple Companion devices are connected', async () => {
  let commandPosted = false;
  const handler = createCompanionCommandHandler({
    config: { VERCEL_OIDC_TOKEN: 'vercel-oidc-secret' }, verifyAuth: acceptedAuth(signed('health')),
    fetchImpl: async (url) => {
      if (url.endsWith('/relay/v1/devices')) return mockJsonResponse(200, { ok: true, devices: [{ deviceId: 'device_abcdefghijklmnopqrstuv', expiresAt: 1 }, { deviceId: 'device_zyxwvutsrqponmlkjihgfe', expiresAt: 2 }] });
      commandPosted = true; throw new Error('should not enqueue');
    },
  });
  const res = createResponse();
  await handler(request({ mode: 'invoke', capabilityId: 'health' }), res);
  assert.equal(res.statusCode, 409); assert.equal(commandPosted, false);
});
