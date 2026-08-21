const path = require('path');
const { spawn } = require('child_process');
const { ImapFlow } = require('imapflow');
const { getOAuthAccessToken } = require('./oauth-connection');

const ROOT = path.join(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'ask-inbox');
const FREE_SITE_WORKER = path.join(__dirname, 'free-site-worker.js');
const DEFAULT_GMAIL_USER = String(process.env.GMAIL_USER || '3dvr.tech@gmail.com').trim().toLowerCase();
const DEFAULT_IMAP_HOST = String(process.env.THREEDVR_INBOX_IMAP_HOST || 'imap.gmail.com').trim();
const DEFAULT_IMAP_PORT = Number.parseInt(process.env.THREEDVR_INBOX_IMAP_PORT || '993', 10);
const DEFAULT_IMAP_TLS = !/^(0|false|no|off)$/i.test(String(process.env.THREEDVR_INBOX_IMAP_TLS || 'true').trim());
const DEFAULT_MAILBOX = String(process.env.THREEDVR_INBOX_MAILBOX || 'INBOX').trim() || 'INBOX';
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 60 * 1000;
const EVENT_DEBOUNCE_MS = Number.parseInt(process.env.THREEDVR_INBOX_EVENT_DEBOUNCE_MS || '750', 10);
const MAX_IDLE_TIME_MS = Number.parseInt(process.env.THREEDVR_INBOX_MAX_IDLE_TIME_MS || String(4 * 60 * 1000), 10);
const LOCAL_FREE_SITE_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.THREEDVR_FREE_SITE_LOCAL_WORKER || 'true').trim());
const FREE_SITE_DISPATCH = !/^(0|false|no|off)$/i.test(String(process.env.THREEDVR_FREE_SITE_WORKFLOW_DISPATCH || 'true').trim());
const FREE_SITE_WORKFLOW = String(process.env.THREEDVR_FREE_SITE_WORKFLOW || 'free-site-fast-lane.yml').trim();
const FREE_SITE_REPO = String(process.env.THREEDVR_FREE_SITE_REPO || 'tmsteph/3dvr-portal').trim();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, label) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => resolve({ ok: code === 0, code: code || 0 }));
    child.on('error', (error) => {
      console.error(`[inbox-monitor-loop] ${label} failed to start: ${error.message || error}`);
      resolve({ ok: false, code: 1, error });
    });
  });
}

async function runInboxCycle(reason) {
  console.log(`[inbox-monitor-loop] processing inbox (${reason})`);
  const result = await runCommand(RUNNER, [], 'ask-inbox');
  if (!result.ok) {
    console.error(`[inbox-monitor-loop] ask-inbox exited with code ${result.code}`);
  }
  return result;
}

async function runLocalFreeSiteWorker(reason) {
  if (!LOCAL_FREE_SITE_ENABLED) return { ok: true, skipped: true };
  console.log(`[inbox-monitor-loop] running local free-site worker (${reason})`);
  const result = await runCommand(process.execPath, [FREE_SITE_WORKER], 'local free-site worker');
  if (!result.ok) {
    console.error(`[inbox-monitor-loop] local free-site worker exited with code ${result.code}`);
  }
  return result;
}

async function dispatchFreeSiteFastLane(reason) {
  if (!FREE_SITE_DISPATCH) return { ok: true, skipped: true };
  console.log(`[inbox-monitor-loop] dispatching free-site fallback (${reason})`);
  const result = await runCommand(
    'gh',
    ['workflow', 'run', FREE_SITE_WORKFLOW, '--repo', FREE_SITE_REPO, '--ref', 'main'],
    'free-site workflow dispatch'
  );
  if (!result.ok) {
    console.error('[inbox-monitor-loop] free-site fallback dispatch failed; the scheduled GitHub fallback remains available');
  }
  return result;
}

async function resolveImapAuth() {
  const authMode = String(process.env.THREEDVR_GMAIL_AUTH || '').trim().toLowerCase();
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').trim();

  if (authMode === 'oauth' || !pass) {
    const connection = await getOAuthAccessToken('google');
    const user = String(connection.email || DEFAULT_GMAIL_USER).trim().toLowerCase();
    if (!(user && connection.accessToken)) {
      throw new Error('Google OAuth connection is missing an email or access token.');
    }
    return {
      user,
      auth: {
        user,
        accessToken: connection.accessToken,
      },
    };
  }

  return {
    user: DEFAULT_GMAIL_USER,
    auth: {
      user: DEFAULT_GMAIL_USER,
      pass,
    },
  };
}

function makeProcessor() {
  let running = false;
  let pending = false;
  let pendingReason = 'event';
  let timer = null;

  const drain = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      do {
        pending = false;
        const reason = pendingReason;
        const freeSite = await runLocalFreeSiteWorker(reason);
        if (!freeSite.ok) {
          await dispatchFreeSiteFastLane(reason);
        }
        await runInboxCycle(reason);
      } while (pending);
    } finally {
      running = false;
    }
  };

  return (reason) => {
    pendingReason = reason || 'event';
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      drain().catch((error) => {
        console.error(`[inbox-monitor-loop] processor error: ${error.message || error}`);
      });
    }, Math.max(0, Number.isFinite(EVENT_DEBOUNCE_MS) ? EVENT_DEBOUNCE_MS : 750));
  };
}

async function watchConnection() {
  const { user, auth } = await resolveImapAuth();
  const client = new ImapFlow({
    host: DEFAULT_IMAP_HOST,
    port: Number.isFinite(DEFAULT_IMAP_PORT) ? DEFAULT_IMAP_PORT : 993,
    secure: DEFAULT_IMAP_TLS,
    auth,
    logger: false,
    maxIdleTime: Number.isFinite(MAX_IDLE_TIME_MS) ? MAX_IDLE_TIME_MS : 4 * 60 * 1000,
  });

  const processInbox = makeProcessor();
  let closed = false;
  let lastCount = 0;

  client.on('error', (error) => {
    console.error(`[inbox-monitor-loop] IMAP error: ${error.message || error}`);
  });

  client.on('close', () => {
    closed = true;
  });

  client.on('exists', (data) => {
    const count = Number(data?.count || 0);
    const prevCount = Number(data?.prevCount || lastCount || 0);
    lastCount = count;
    if (count > prevCount) {
      processInbox('new-message');
    }
  });

  await client.connect();
  const lock = await client.getMailboxLock(DEFAULT_MAILBOX);
  try {
    lastCount = Number(client.mailbox?.exists || 0);
    console.log(`[inbox-monitor-loop] watching ${user} ${DEFAULT_MAILBOX} with IMAP IDLE; messages=${lastCount}`);

    // Catch anything that arrived while the worker was stopped before waiting for
    // the next server notification.
    processInbox('startup');

    while (!closed && client.usable) {
      // ImapFlow enters IDLE automatically while a mailbox is open and no command
      // is running. maxIdleTime periodically refreshes that IDLE session.
      await sleep(1000);
    }
  } finally {
    lock.release();
    if (client.usable) {
      await client.logout().catch(() => {});
    }
  }
}

async function main() {
  let backoffMs = RECONNECT_MIN_MS;
  while (true) {
    try {
      await watchConnection();
      backoffMs = RECONNECT_MIN_MS;
    } catch (error) {
      console.error(`[inbox-monitor-loop] connection failed: ${error.message || error}`);
    }

    console.error(`[inbox-monitor-loop] reconnecting in ${Math.round(backoffMs / 1000)}s`);
    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
