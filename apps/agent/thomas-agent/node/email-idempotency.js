const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_SENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_UNCERTAIN_TTL_MS = 30 * 60 * 1000;

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function parseDuration(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function stateDir(config = process.env) {
  return normalizeText(config.THREEDVR_EMAIL_IDEMPOTENCY_DIR)
    || path.join(os.homedir(), '.3dvr', 'state', 'outbound-email-idempotency');
}

function fingerprintEmail(message = {}) {
  const canonical = JSON.stringify({
    from: normalizeText(message.from).toLowerCase(),
    to: normalizeText(message.to).toLowerCase(),
    subject: normalizeText(message.subject),
    text: normalizeText(message.text),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function readRecord(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeRecord(filePath, record) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

function blockWindowMs(record, config = process.env) {
  if (record?.status === 'sent') {
    return parseDuration(config.THREEDVR_EMAIL_IDEMPOTENCY_SENT_TTL_MS, DEFAULT_SENT_TTL_MS);
  }
  return parseDuration(config.THREEDVR_EMAIL_IDEMPOTENCY_UNCERTAIN_TTL_MS, DEFAULT_UNCERTAIN_TTL_MS);
}

function isFresh(record, now, config = process.env) {
  const timestamp = Date.parse(record?.updatedAt || record?.createdAt || '');
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp < blockWindowMs(record, config);
}

function acquireEmailSend(message, { config = process.env, now = Date.now() } = {}) {
  const key = fingerprintEmail(message);
  const dir = stateDir(config);
  const filePath = path.join(dir, `${key}.json`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record = {
      key,
      status: 'inflight',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      to: normalizeText(message.to).toLowerCase(),
      subject: normalizeText(message.subject),
    };
    try {
      const fd = fs.openSync(filePath, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`);
      } finally {
        fs.closeSync(fd);
      }
      return { ok: true, key, filePath, record };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = readRecord(filePath);
      if (!existing || isFresh(existing, now, config)) {
        return {
          ok: false,
          key,
          filePath,
          record: existing,
          reason: existing?.status === 'sent'
            ? 'Identical email was already sent recently.'
            : 'Identical email send is already in progress or has an uncertain outcome.',
        };
      }
      try {
        fs.renameSync(filePath, `${filePath}.stale-${process.pid}-${now}`);
      } catch (renameError) {
        if (renameError?.code !== 'ENOENT') throw renameError;
      }
    }
  }

  return { ok: false, key, filePath, reason: 'Unable to acquire outbound email idempotency lock.' };
}

function updateReservation(reservation, status, extra = {}) {
  if (!reservation?.filePath) return;
  const current = readRecord(reservation.filePath) || reservation.record || {};
  writeRecord(reservation.filePath, {
    ...current,
    ...extra,
    key: reservation.key || current.key,
    status,
    updatedAt: new Date().toISOString(),
  });
}

function markEmailSent(reservation, extra = {}) {
  updateReservation(reservation, 'sent', extra);
}

function markEmailUncertain(reservation, error) {
  updateReservation(reservation, 'uncertain', {
    error: normalizeText(error?.message || error).slice(0, 500),
  });
}

module.exports = {
  DEFAULT_SENT_TTL_MS,
  DEFAULT_UNCERTAIN_TTL_MS,
  acquireEmailSend,
  fingerprintEmail,
  markEmailSent,
  markEmailUncertain,
};
