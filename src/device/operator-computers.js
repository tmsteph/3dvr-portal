import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { verifySignedSeaPayload } from '../auth/sea.js';

const PAIR_MS = 2 * 60_000;
const SESSION_MS = 60 * 60_000;
const PRESENCE_MS = 15_000;
const MAX_RECORDS = 256;
const NAME = /^[a-z0-9][a-z0-9 ._-]{0,39}$/i;
const CODE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const digest = value => createHash('sha256').update(value).digest('hex');

export function createOperatorComputersHandler({
  verifyAuth = verifySignedSeaPayload, now = Date.now, probeMs = 6_000
} = {}) {
  // Temporary browser grants belong to this Portal process and expire on restart.
  const codes = new Map();
  const devices = new Map();
  const tokens = new Map();

  function disconnect(device) {
    devices.delete(device.id);
    tokens.delete(device.tokenHash);
    device.probe?.finish(false);
  }

  function prune(time) {
    for (const [key, invite] of codes) {
      if (invite.expiresAt <= time) codes.delete(key);
    }
    for (const device of devices.values()) {
      if (device.expiresAt <= time || device.lastSeen + PRESENCE_MS <= time) disconnect(device);
    }
  }

  function probe(device) {
    if (device.probe) return device.probe.result;
    const id = randomUUID();
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    function finish(online) {
      clearTimeout(timeout);
      device.probe = null;
      resolveResult(online);
    }
    const timeout = setTimeout(() => finish(false), probeMs);
    device.probe = { id, result, finish };
    return result;
  }

  return async function operatorComputers(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const fail = (status, error) => res.status(status).json({ ok: false, error });
    const ok = (data = {}) => res.status(200).json({ ok: true, ...data });
    if (req.method !== 'POST') return fail(405, 'Method not allowed.');

    const { action, code, token, receipt } = req.body || {};
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const time = now();
    prune(time);

    if (action === 'preview' || action === 'pair') {
      const key = typeof code === 'string' && CODE.test(code) ? digest(code) : '';
      const invite = codes.get(key);
      if (!invite) return fail(404, 'Pairing code is invalid, expired, or already used.');
      if (action === 'preview') return ok({ requestedBy: invite.alias });
      if (!NAME.test(name)) return fail(400, 'Use up to 40 letters, numbers, spaces, dots, hyphens, or underscores.');
      if ([...devices.values()].some(device => device.owner === invite.owner &&
          device.name.toLowerCase() === name.toLowerCase())) {
        return fail(409, 'That account already has a connected computer with this name.');
      }
      if (devices.size >= MAX_RECORDS) return fail(503, 'Computer pairing is busy. Try again shortly.');
      codes.delete(key);
      const secret = randomBytes(32).toString('base64url');
      const device = {
        id: randomUUID(), owner: invite.owner, name, tokenHash: digest(secret),
        lastSeen: time, expiresAt: time + SESSION_MS, probe: null
      };
      devices.set(device.id, device);
      tokens.set(device.tokenHash, device);
      return ok({ token: secret, expiresAt: device.expiresAt });
    }

    if (action === 'heartbeat' || action === 'disconnect') {
      const device = typeof token === 'string' && TOKEN.test(token) && tokens.get(digest(token));
      if (!device) return fail(401, 'Computer session ended. Pair again to reconnect.');
      if (action === 'disconnect') {
        disconnect(device);
        return ok();
      }
      device.lastSeen = time;
      if (device.probe && receipt === device.probe.id) device.probe.finish(true);
      return ok({ probeId: device.probe?.id || null });
    }

    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    if (action !== 'invite' && action !== 'list' && action !== 'status' && action !== 'revoke') {
      return fail(400, 'Unknown computer action.');
    }
    const expectedOrigin = req.portalOrigin;
    if (!expectedOrigin) return fail(400, 'Portal origin is unavailable.');
    const auth = await verifyAuth(req.body, { scope: 'operator-computers', expectedOrigin, maxAgeMs: 60_000 });
    const signedAction = deviceId ? `${action}:${deviceId}` : action;
    if (!auth.ok || !auth.identity?.pub || auth.identity.action !== signedAction) {
      return fail(401, 'Sign in to approve this computer request.');
    }
    const owner = auth.identity.pub;
    const verifiedAt = now();
    prune(verifiedAt);

    if (action === 'invite') {
      for (const [key, invite] of codes) {
        if (invite.owner === owner) codes.delete(key);
      }
      if (codes.size >= MAX_RECORDS) return fail(503, 'Computer pairing is busy. Try again shortly.');
      const newCode = randomBytes(12).toString('base64url');
      const expiresAt = verifiedAt + PAIR_MS;
      codes.set(digest(newCode), { owner, alias: auth.identity.alias || 'Portal account', expiresAt });
      return ok({ code: newCode, expiresAt });
    }

    if (action === 'list') {
      return ok({ devices: [...devices.values()]
        .filter(device => device.owner === owner)
        .map(({ id, name }) => ({ id, name })) });
    }

    const device = devices.get(deviceId);
    if (device?.owner !== owner) return fail(404, 'Computer is disconnected or unavailable.');
    if (action === 'revoke') {
      disconnect(device);
      return ok();
    }
    return ok({ deviceId: device.id, name: device.name, online: await probe(device) });
  };
}
