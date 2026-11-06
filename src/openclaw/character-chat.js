// Character chat runner: calls the OpenAI chat completions API directly
// from the portal server, with the server-held persona (characters.js) as
// the system prompt.
//
// This replaces the OpenClaw gateway hop for character chat only. Helm
// keeps its SSH/gateway path in handler.js untouched. The credential and
// configuration style match the Operator's OpenAI wiring (src/operator/
// api.js): the key comes from OPENAI_API_KEY, and the model from a
// feature env var (OPENAI_GIRL_CHAT_MODEL), falling back to the Operator
// model env var (OPENAI_OPERATOR_MODEL) and then the shared default.
//
// The persona never comes from the client: the handler resolves it from
// the signed characterId against the server registry and passes it here.
// Conversation history is the client's own recent turns (validated and
// signature-bound by the handler); only 'user' and 'assistant' roles are
// accepted there, so a client can never inject a second system prompt.

export const DEFAULT_GIRL_CHAT_MODEL = 'gpt-4o-mini';
export const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

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

// Reads an OpenAI SSE stream, forwarding text deltas to onDelta and
// returning the assembled reply. Throws on a malformed stream.
async function readChatStream(body, onDelta) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let reply = '';
  const consume = block => {
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      const data = JSON.parse(raw);
      const delta = data?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        reply += delta;
        onDelta?.(delta);
      }
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
  const messages = [
    { role: 'system', content: request.persona.system },
    ...(request.history || []),
    { role: 'user', content: request.message }
  ];
  const streaming = Boolean(options.onDelta);
  let response;
  try {
    response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: resolveGirlChatModel(config),
        messages,
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
      ? await readChatStream(response.body, options.onDelta)
      : (await response.json())?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty reply');
    return { ok: true, reply, engine: 'OpenAI', session };
  } catch {
    return { ok: false, engine: 'OpenAI', session, error: 'Her reply was interrupted. Try again.' };
  }
}
