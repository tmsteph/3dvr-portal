// 3DVR Core: Thomas's own agent engine for Helm. A conversation turn goes
// to DeepInfra's OpenAI-compatible API (DeepSeek V4.1 Flash, thinking
// disabled) and the reply comes back in the Helm result shape
// ({ ok, reply, engine, session }). The DeepInfra key is never configured
// here: it is resolved at runtime through the secrets broker (alias
// deepinfra.api) and held only in process memory.
//
// History is server-side, one file per conversation under the Helm state
// dir. The history key is the handler-built session name, which already
// embeds a digest of the account's public key, so histories are
// partitioned by account by construction and never mix with the gateway
// engines' own session stores.
//
// Failure is explicit, never silent: broker, network, and provider
// failures return { ok: false, error } with the reason, which Helm shows
// the user verbatim. Nothing here throws for an upstream problem.
//
// Usage is metered per turn from the provider's own usage block
// (including estimated_cost) and appended to core-usage.jsonl in the
// state dir, plus one log line, so spend stays auditable.
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveBrokerSecret } from './broker.js';

export const CORE_ENGINE_LABEL = '3DVR Core';
export const DEFAULT_CORE_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
export const DEFAULT_CORE_API_URL = 'https://api.deepinfra.com/v1/openai/chat/completions';
export const CORE_KEY_ALIAS = 'deepinfra.api';

const HISTORY_LIMIT = 40;
const KEY_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 60000;
const FALLBACK_SYSTEM_PROMPT = 'You are the 3DVR Core agent, Thomas Stephens\' own agent. Work for the user alone, protect his data, and be direct and helpful.';

const digest = value => createHash('sha256').update(value).digest('hex');

export function coreModel(config = process.env) {
  return config.THREEDVR_CORE_MODEL || DEFAULT_CORE_MODEL;
}

function validHistory(entries) {
  return Array.isArray(entries) && entries.every(entry =>
    entry && typeof entry === 'object'
    && (entry.role === 'user' || entry.role === 'assistant')
    && typeof entry.content === 'string' && entry.content.length > 0);
}

function providerError(status, bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const message = parsed?.error?.message || parsed?.error;
    if (typeof message === 'string' && message) return `DeepInfra error ${status}: ${message.slice(0, 200)}`;
  } catch {}
  return `DeepInfra error ${status}.`;
}

export function createAgentCore(options = {}) {
  const config = options.config || process.env;
  const stateDir = options.stateDir;
  const fetchImpl = options.fetchImpl || fetch;
  const resolveSecret = options.resolveSecret || (alias => resolveBrokerSecret(alias, { config }));
  const now = options.now || Date.now;
  const log = options.log || (line => console.log(line));
  const model = coreModel(config);
  const apiUrl = config.THREEDVR_CORE_API_URL || DEFAULT_CORE_API_URL;
  const timeoutMs = Number.parseInt(config.THREEDVR_CORE_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;

  let keyCache = null;
  let systemPrompt = options.systemPrompt || null;

  async function getKey() {
    if (keyCache && now() - keyCache.at < KEY_CACHE_MS) return keyCache.value;
    const value = await resolveSecret(CORE_KEY_ALIAS);
    keyCache = { value, at: now() };
    return value;
  }

  async function getSystemPrompt() {
    if (systemPrompt) return systemPrompt;
    try {
      systemPrompt = (await readFile(new URL('./system-prompt.md', import.meta.url), 'utf8')).trim();
    } catch {
      systemPrompt = FALLBACK_SYSTEM_PROMPT;
    }
    return systemPrompt;
  }

  function historyPath(session) {
    return join(stateDir, 'core-history', `${digest(`core|${session}`)}.json`);
  }

  async function loadHistory(session) {
    if (!stateDir || !session) return [];
    try {
      const parsed = JSON.parse(await readFile(historyPath(session), 'utf8'));
      return validHistory(parsed) ? parsed.slice(-HISTORY_LIMIT) : [];
    } catch { return []; }
  }

  async function saveHistory(session, entries) {
    if (!stateDir || !session) return;
    const path = historyPath(session);
    await mkdir(join(stateDir, 'core-history'), { recursive: true, mode: 0o700 });
    const temp = `${path}.tmp-${randomUUID()}`;
    await writeFile(temp, JSON.stringify(entries.slice(-HISTORY_LIMIT)), { mode: 0o600 });
    await rename(temp, path);
  }

  async function meter(session, usage) {
    const entry = {
      at: new Date(now()).toISOString(),
      session: session ? digest(session).slice(0, 16) : null,
      model,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      estimatedCost: usage?.estimated_cost ?? null,
    };
    log(`[agent-core] turn model=${entry.model} prompt=${entry.promptTokens} completion=${entry.completionTokens} cost=${entry.estimatedCost}`);
    if (stateDir) {
      try {
        await mkdir(stateDir, { recursive: true, mode: 0o700 });
        await appendFile(join(stateDir, 'core-usage.jsonl'), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
      } catch {}
    }
    return entry;
  }

  // Connection check for Helm's status action: proves the whole key path
  // (token file, broker, policy) without spending a model call.
  async function status() {
    try {
      await getKey();
      return { ok: true, engine: CORE_ENGINE_LABEL, model };
    } catch (error) {
      return { ok: false, engine: CORE_ENGINE_LABEL, model, error: `3DVR Core is unavailable: ${error.message}` };
    }
  }

  async function run(request, runOptions = {}) {
    let apiKey;
    try {
      apiKey = await getKey();
    } catch (error) {
      return { ok: false, error: `3DVR Core could not resolve its DeepInfra key from the secrets broker: ${error.message}` };
    }
    const history = await loadHistory(request.session);
    const messages = [
      { role: 'system', content: await getSystemPrompt() },
      ...history,
      { role: 'user', content: request.message },
    ];
    let response;
    try {
      response = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, thinking: { type: 'disabled' } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? `no answer within ${Math.round(timeoutMs / 1000)}s` : error.message;
      return { ok: false, error: `3DVR Core could not reach DeepInfra: ${reason}` };
    }
    const bodyText = await response.text();
    if (!response.ok) {
      return { ok: false, error: `3DVR Core could not answer: ${providerError(response.status, bodyText)}` };
    }
    let data;
    try { data = JSON.parse(bodyText); } catch {
      return { ok: false, error: '3DVR Core received an unreadable reply from DeepInfra.' };
    }
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return { ok: false, error: '3DVR Core received an empty reply from DeepInfra.' };
    }
    const usage = await meter(request.session, data.usage);
    await saveHistory(request.session, [...history,
      { role: 'user', content: request.message },
      { role: 'assistant', content: reply }]);
    // v0 answers in one shot rather than token-streaming; the whole reply
    // goes out as a single delta so Helm's streaming renderer shows it the
    // moment it lands.
    runOptions.onDelta?.(reply);
    return { ok: true, reply, engine: CORE_ENGINE_LABEL, session: request.session, usage };
  }

  return { run, status };
}
