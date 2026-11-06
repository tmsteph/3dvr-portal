// Character chat runner: calls the OpenAI Responses API directly from the
// portal server, with the server-held persona (characters.js) as the
// request instructions.
//
// This replaces the OpenClaw gateway hop for character chat only. Helm
// keeps its SSH/gateway path in handler.js untouched. The credential and
// configuration style match the Operator's OpenAI wiring (src/operator/
// api.js): the key comes from OPENAI_API_KEY, and the model from a feature
// env var (OPENAI_GIRL_CHAT_MODEL), falling back to the Operator model env
// var (OPENAI_OPERATOR_MODEL) and then the Operator's default model.
//
// The endpoint is /v1/responses, not /v1/chat/completions, on purpose: the
// production OPENAI_API_KEY is endpoint-restricted. Probed 2026-11-05
// against the key the portal services actually run with: POST
// /v1/responses returns 200, while POST /v1/chat/completions returns 401
// "Missing scopes: model.request". The request shape, streaming event
// parsing, and reply extraction below mirror src/operator/api.js, which
// already runs against this same key.
//
// The persona never comes from the client: the handler resolves it from
// the signed characterId against the server registry and passes it here.
// Conversation history is the client's own recent turns (validated and
// signature-bound by the handler); only 'user' and 'assistant' roles are
// accepted there, so a client can never inject a second system prompt.

export const DEFAULT_GIRL_CHAT_MODEL = 'gpt-6-luna';
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export function resolveGirlChatModel(config = process.env) {
  return config.OPENAI_GIRL_CHAT_MODEL || config.OPENAI_OPERATOR_MODEL || DEFAULT_GIRL_CHAT_MODEL;
}

function errorMessage(status, bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    if (typeof parsed?.error?.message === 'string' && parsed.error.message) {
      return `OpenAI error ${status}: ${parsed.error.message.slice(0, 200)}`;
    }
  } catch {}
  return `OpenAI error ${status}.`;
}

// Extracts the reply text from a Responses API payload (also the shape of
// the response object carried by the response.completed stream event).
// Same extraction src/operator/api.js uses.
function outputText(data) {
  return (data?.output || []).flatMap(item => item?.content || []).find(item => item?.type === 'output_text')?.text || '';
}

// Reads a Responses API SSE stream, forwarding output_text deltas to
// onDelta and returning the assembled reply. Event handling mirrors the
// upstream parser in src/operator/api.js: response.output_text.delta
// carries incremental text, response.output_text.done and
// response.completed carry the authoritative full text, and
// response.failed / error abort the turn. Throws on a malformed or
// failed stream.
async function readResponsesStream(body, onDelta) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let reply = '';
  const consume = block => {
    let event = 'message';
    const dataLines = [];
    for (const line of String(block || '').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('event:')) {
        event = trimmed.slice(6).trim() || 'message';
        continue;
      }
      if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice(5).trim());
    }
    const raw = dataLines.join('\n');
    if (!raw || raw === '[DONE]') return;
    const data = JSON.parse(raw);
    const type = data?.type || event;
    if (type === 'response.output_text.delta') {
      const delta = typeof data?.delta === 'string' ? data.delta : '';
      if (delta) {
        reply += delta;
        onDelta?.(delta);
      }
      return;
    }
    if (type === 'response.output_text.done' && typeof data?.text === 'string') {
      reply = data.text;
      return;
    }
    if (type === 'response.completed') {
      const completedText = outputText(data?.response || {});
      if (completedText) reply = completedText;
      return;
    }
    if (type === 'response.failed' || type === 'error') {
      throw new Error(data?.response?.error?.message || data?.error?.message || data?.message || 'The response stream failed.');
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        consume(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
      }
    }
    consume(pending + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return reply;
}

// Runs one character turn. Returns the same result shape the OpenClaw
// bridge returns ({ ok, reply, engine, session }) so the handler's
// receipts and streaming envelope do not care which engine answered.
export async function runCharacterChat(request, options = {}) {
  const config = options.config || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const apiKey = config.OPENAI_API_KEY;
  const session = request.session;
  if (!apiKey) {
    return { ok: false, engine: 'OpenAI', session, error: 'Character chat is not configured on the server yet (OPENAI_API_KEY is missing).' };
  }
  const input = [
    ...(request.history || []),
    { role: 'user', content: request.message }
  ];
  const streaming = Boolean(options.onDelta);
  let response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: resolveGirlChatModel(config),
        store: false,
        instructions: request.persona.system,
        input,
        ...(streaming ? { stream: true } : {})
      }),
      signal: AbortSignal.timeout(100000)
    });
  } catch {
    return { ok: false, engine: 'OpenAI', session, error: 'She could not reach the model just now. Try again in a moment.' };
  }
  if (!response.ok) {
    const bodyText = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
    return { ok: false, engine: 'OpenAI', session, error: errorMessage(response.status, bodyText) };
  }
  try {
    const reply = streaming
      ? await readResponsesStream(response.body, options.onDelta)
      : outputText(await response.json());
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty reply');
    return { ok: true, reply, engine: 'OpenAI', session };
  } catch {
    return { ok: false, engine: 'OpenAI', session, error: 'Her reply was interrupted. Try again.' };
  }
}
