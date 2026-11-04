'use strict';

// Gate 1, Step 4: the tool bridge.
//
// The planner (Step 2) can only propose typed actions; OperatorCore policy
// decides what may run. Step 3 gave the planner exactly one real effect
// (memory.write, applied by the planner itself after the core executed an
// approved action). This module is the general version of that pattern: a
// registry of the real tools from the Gate 1 spec section 4, each behind a
// named capability with a fixed risk tier, executed ONLY by the planner
// after OperatorCore has executed the action successfully - which for R2+
// already proves a live owner approval covers the action's exact hash.
//
// Capabilities and tiers (spec section 4, read-first):
//   files.read    R0  workspace-scoped file read
//   files.write   R1  workspace-scoped file write; result carries the
//                     sha256 of the written content for the receipt
//   gmail.search  R0  via the existing Google connector (connectors/google)
//   gmail.read    R0  via the existing Google connector
//   calendar.read R0  handler-injected; apps/agent has no calendar
//                     connector yet, so the default handler fails closed
//                     with an explicit "not available" error
//   browser.read  R1  fetch ONE public http(s) page as text; live browser
//                     control stays on the OVH lanes and is NOT in Gate 1
//   gmail.draft   R2  approval-gated like memory.write; creates a draft
//                     and NEVER sends (real sends are out of Gate 1)
//
// Fail-closed rules, same as the earlier steps:
// - Unknown capability: refused before any handler runs.
// - Malformed args (wrong types, missing required fields): refused.
// - files.* paths are confined to the configured workspace directory on
//   the CANONICAL path, so symlinks cannot smuggle a read or write
//   outside it (same boundary discipline as operator-memory.js).
// - browser.read accepts only credential-free http(s) URLs and caps the
//   response size; anything else is refused.
// - A handler that throws surfaces as a failed tool result; the planner
//   turns that into a corrective failed receipt (see operator-planner.js),
//   so a tool effect that did not happen never keeps a bare success.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FILES_READ_CAPABILITY = 'files.read';
const FILES_WRITE_CAPABILITY = 'files.write';
const GMAIL_SEARCH_CAPABILITY = 'gmail.search';
const GMAIL_READ_CAPABILITY = 'gmail.read';
const CALENDAR_READ_CAPABILITY = 'calendar.read';
const BROWSER_READ_CAPABILITY = 'browser.read';
const GMAIL_DRAFT_CAPABILITY = 'gmail.draft';

// The capability vocabulary of the bridge, with the risk tier a device
// grant must declare for OperatorCore policy to treat the action as the
// spec intends. The planner tests pin these tiers.
const TOOL_CAPABILITIES = Object.freeze({
  [FILES_READ_CAPABILITY]: 'R0',
  [FILES_WRITE_CAPABILITY]: 'R1',
  [GMAIL_SEARCH_CAPABILITY]: 'R0',
  [GMAIL_READ_CAPABILITY]: 'R0',
  [CALENDAR_READ_CAPABILITY]: 'R0',
  [BROWSER_READ_CAPABILITY]: 'R1',
  [GMAIL_DRAFT_CAPABILITY]: 'R2',
});

const DEFAULT_MAX_BROWSER_BYTES = 256 * 1024;
const DEFAULT_BROWSER_TIMEOUT_MS = 15000;

function isToolCapability(name) {
  return Object.prototype.hasOwnProperty.call(TOOL_CAPABILITIES, name);
}

// Canonicalise a path like operator-memory.js does: realpath for existing
// paths, nearest-existing-ancestor resolution for not-yet-existing ones,
// so a symlinked parent cannot escape the workspace either.
function canonicalize(p) {
  try {
    return fs.realpathSync(p);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
    const parent = path.dirname(p);
    if (parent === p) throw err;
    return path.join(canonicalize(parent), path.basename(p));
  }
}

function resolveInsideWorkspace(workspaceDir, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error('tool path must be a non-empty relative path');
  }
  if (path.isAbsolute(relPath)) {
    throw new Error(`tool path must be relative: ${relPath}`);
  }
  const root = path.resolve(workspaceDir);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`tool path escapes the tool workspace: ${relPath}`);
  }
  const canonRoot = canonicalize(root);
  const canonTarget = canonicalize(target);
  if (canonTarget !== canonRoot && !canonTarget.startsWith(canonRoot + path.sep)) {
    throw new Error(`tool path escapes the tool workspace: ${relPath}`);
  }
  return canonTarget;
}

function requireString(args, field, capability) {
  const value = args ? args[field] : undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${capability} needs a non-empty string arg: ${field}`);
  }
  return value;
}

function optionalAccountId(args, defaultAccountId, capability) {
  const value = args && args.account_id !== undefined ? args.account_id : defaultAccountId;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${capability} needs an account_id arg (no default account configured)`);
  }
  return value;
}

// Default browser.read: fetch one public page as text. Only http/https,
// no embedded credentials, bounded size, bounded time. Injectable for
// tests and for any future lane-backed reader.
async function fetchPublicPageAsText(url, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BROWSER_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`browser.read needs a valid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`browser.read only fetches http(s) URLs, not ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('browser.read refuses URLs with embedded credentials');
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('browser.read has no fetch implementation available');
  }
  const response = await fetchImpl(parsed.toString(), {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': '3dvr-operator-tool-bridge/1' },
  });
  if (!response.ok) {
    throw new Error(`browser.read fetch failed: HTTP ${response.status}`);
  }
  const text = await response.text();
  const bytes = Buffer.byteLength(text, 'utf8');
  return {
    url: parsed.toString(),
    status: response.status,
    content_type: response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type')
      : null,
    bytes,
    truncated: bytes > maxBytes,
    text: bytes > maxBytes ? text.slice(0, maxBytes) : text,
  };
}

// Default Gmail handlers delegate to the existing Google connector, the
// same implementation the MCP gateway (apps/agent/mcp/server.js) wraps.
// Required lazily so the bridge (and the test suite) never pays for - or
// breaks on - connector config when Gmail tools are unused.
function defaultGmailHandlers() {
  const gmail = require('../../connectors/google/gmail');
  return {
    search: (args) => gmail.searchMessages(args),
    read: (args) => gmail.readMessage(args),
    draft: (args) => gmail.createDraft(args),
  };
}

/**
 * Create a tool bridge.
 *
 * @param {object} options
 * @param {string} [options.workspaceDir] - root for files.read/write.
 *   Absent = the files tools fail closed.
 * @param {object} [options.handlers] - per-tool overrides keyed by short
 *   name: filesRead, filesWrite, gmailSearch, gmailRead, gmailDraft,
 *   calendarRead, browserRead. Each receives the action's args object.
 * @param {string} [options.gmailAccountId] - default account for the
 *   gmail.* tools when an action does not name account_id itself.
 * @param {object} [options.browser] - { fetchImpl, maxBytes, timeoutMs }
 *   for the default browser.read handler.
 */
function createToolBridge(options = {}) {
  const workspaceDir = options.workspaceDir || null;
  const handlers = options.handlers || {};
  const gmailAccountId = options.gmailAccountId || null;
  let gmailDefaults = null;
  const gmail = () => {
    if (!gmailDefaults) gmailDefaults = defaultGmailHandlers();
    return gmailDefaults;
  };

  const filesRead = handlers.filesRead || (async (args) => {
    if (!workspaceDir) throw new Error('files.read has no tool workspace configured');
    const relPath = requireString(args, 'path', FILES_READ_CAPABILITY);
    const target = resolveInsideWorkspace(workspaceDir, relPath);
    const content = fs.readFileSync(target, 'utf8');
    return { path: relPath, bytes: Buffer.byteLength(content, 'utf8'), content };
  });

  const filesWrite = handlers.filesWrite || (async (args) => {
    if (!workspaceDir) throw new Error('files.write has no tool workspace configured');
    const relPath = requireString(args, 'path', FILES_WRITE_CAPABILITY);
    if (!args || typeof args.content !== 'string') {
      throw new Error('files.write needs a string arg: content');
    }
    const target = resolveInsideWorkspace(workspaceDir, relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, args.content, 'utf8');
    // The receipt surface for a write shows the path and the hash of what
    // actually landed (spec section 4, tool 2).
    const sha256 = crypto.createHash('sha256').update(args.content, 'utf8').digest('hex');
    return { path: relPath, bytes: Buffer.byteLength(args.content, 'utf8'), sha256 };
  });

  const gmailSearch = handlers.gmailSearch || (async (args) => gmail().search({
    accountId: optionalAccountId(args, gmailAccountId, GMAIL_SEARCH_CAPABILITY),
    query: args && typeof args.query === 'string' ? args.query : '',
    maxResults: args && Number.isFinite(args.max_results) ? args.max_results : 25,
  }));

  const gmailRead = handlers.gmailRead || (async (args) => gmail().read({
    accountId: optionalAccountId(args, gmailAccountId, GMAIL_READ_CAPABILITY),
    messageId: requireString(args, 'message_id', GMAIL_READ_CAPABILITY),
    format: args && typeof args.format === 'string' ? args.format : 'metadata',
  }));

  const gmailDraft = handlers.gmailDraft || (async (args) => gmail().draft({
    accountId: optionalAccountId(args, gmailAccountId, GMAIL_DRAFT_CAPABILITY),
    to: requireString(args, 'to', GMAIL_DRAFT_CAPABILITY),
    subject: requireString(args, 'subject', GMAIL_DRAFT_CAPABILITY),
    body: args && typeof args.body === 'string' ? args.body : '',
    ...(args && typeof args.thread_id === 'string' ? { threadId: args.thread_id } : {}),
  }));

  // apps/agent has no calendar connector (verified 2026-11-02:
  // connectors/google carries Gmail only), so the default fails closed
  // with an explicit reason instead of pretending to read anything. A
  // real handler can be injected once a connector exists.
  const calendarRead = handlers.calendarRead || (async () => {
    throw new Error('calendar.read is not available: no calendar connector exists in apps/agent yet');
  });

  const browserRead = handlers.browserRead || (async (args) => {
    const url = requireString(args, 'url', BROWSER_READ_CAPABILITY);
    return fetchPublicPageAsText(url, options.browser || {});
  });

  const executors = {
    [FILES_READ_CAPABILITY]: filesRead,
    [FILES_WRITE_CAPABILITY]: filesWrite,
    [GMAIL_SEARCH_CAPABILITY]: gmailSearch,
    [GMAIL_READ_CAPABILITY]: gmailRead,
    [CALENDAR_READ_CAPABILITY]: calendarRead,
    [BROWSER_READ_CAPABILITY]: browserRead,
    [GMAIL_DRAFT_CAPABILITY]: gmailDraft,
  };

  return {
    capabilities: TOOL_CAPABILITIES,
    workspaceDir,

    // Run one tool for an action OperatorCore has already executed.
    // Returns the tool's result object; throws (fail closed) on unknown
    // capability, malformed args, boundary escapes, or handler errors.
    async execute(capability, args = {}) {
      const run = executors[capability];
      if (!run) throw new Error(`unknown tool capability: ${capability}`);
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error(`${capability} args must be an object`);
      }
      return run(args);
    },
  };
}

module.exports = {
  createToolBridge,
  fetchPublicPageAsText,
  isToolCapability,
  TOOL_CAPABILITIES,
  FILES_READ_CAPABILITY,
  FILES_WRITE_CAPABILITY,
  GMAIL_SEARCH_CAPABILITY,
  GMAIL_READ_CAPABILITY,
  CALENDAR_READ_CAPABILITY,
  BROWSER_READ_CAPABILITY,
  GMAIL_DRAFT_CAPABILITY,
};
