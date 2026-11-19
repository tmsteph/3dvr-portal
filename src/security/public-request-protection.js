import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function normalizeIp(value) {
  const ip = String(value || '').trim().replace(/^::ffff:(?=\d+\.)/i, '');
  return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : isIP(ip) ? ip : '';
}

export function requestSource(req, { behindCaddy = false } = {}) {
  const peer = normalizeIp(req.socket?.remoteAddress);
  if (behindCaddy && ['127.0.0.1', '::1'].includes(peer)) {
    // Caddy replaces untrusted forwarded headers. Use the rightmost hop it supplied.
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',').at(-1);
    return normalizeIp(forwarded) || peer;
  }
  return peer || 'unknown';
}

export function canonicalRecipient(email) {
  const [local, domain] = email.split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0].replaceAll('.', '')}@gmail.com`;
  }
  return email;
}

export function createPublicRequestProtection({ path = ':memory:', now = Date.now } = {}) {
  let db;
  let fingerprintKey;

  function open() {
    if (db) return db;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const connection = new DatabaseSync(path);
    try {
      if (path !== ':memory:') chmodSync(path, 0o600);
      connection.exec(`
        PRAGMA busy_timeout=1000;
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS request_buckets (
          key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS protection_config (
          key TEXT PRIMARY KEY, value TEXT NOT NULL
        );
      `);
      connection.prepare("INSERT OR IGNORE INTO protection_config VALUES ('fingerprint', ?)")
        .run(randomBytes(32).toString('hex'));
      fingerprintKey = connection.prepare("SELECT value FROM protection_config WHERE key='fingerprint'").get().value;
      db = connection;
      return db;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  return {
    consume(buckets) {
      const connection = open();
      const time = now();
      const keyed = buckets.map(bucket => ({
        ...bucket,
        key: createHmac('sha256', fingerprintKey).update(bucket.key).digest('hex')
      }));
      connection.exec('BEGIN IMMEDIATE');
      try {
        connection.prepare('DELETE FROM request_buckets WHERE expires <= ?').run(time);
        const lookup = connection.prepare('SELECT count, expires FROM request_buckets WHERE key = ?');
        const retryMs = Math.max(0, ...keyed.map(({ key, limit }) => {
          const row = lookup.get(key);
          return row?.count >= limit ? row.expires - time : 0;
        }));
        if (!retryMs) {
          const reserve = connection.prepare(`
            INSERT INTO request_buckets VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET count = count + 1
          `);
          for (const { key, windowMs } of keyed) reserve.run(key, time + windowMs);
        }
        connection.exec('COMMIT');
        return Math.ceil(retryMs / 1000);
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    fingerprint(req, source) {
      open();
      const browser = ['user-agent', 'accept-language', 'sec-ch-ua-platform']
        .map(name => String(req.headers?.[name] || '').trim().slice(0, 512).toLowerCase());
      const hash = (category, value) => createHmac('sha256', fingerprintKey)
        .update(category).update('\0').update(value).digest('hex').slice(0, 20);
      return {
        browser: browser[0] ? hash('browser', JSON.stringify(browser)) : 'unknown',
        network: source === 'unknown' ? 'unknown' : hash('network', source)
      };
    }
  };
}
