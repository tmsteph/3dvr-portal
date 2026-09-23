function parseEventBlock(block = '') {
  const lines = String(block).replace(/\r/g, '').split('\n');
  let event = 'message';
  const data = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }

  const raw = data.join('\n');
  if (!raw || raw === '[DONE]') return null;

  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

async function readError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.error || payload?.message || 'Operator request failed.';
  } catch {
    try {
      return (await response.text()) || 'Operator request failed.';
    } catch {
      return 'Operator request failed.';
    }
  }
}

export async function readOperatorStream(response, {
  onReplyDelta = () => {},
  onStatus = () => {}
} = {}) {
  if (!response?.ok) throw new Error(await readError(response));

  const contentType = response.headers?.get?.('content-type') || '';
  if (!contentType.includes('text/event-stream')) return response.json();
  if (!response.body?.getReader) throw new Error('Streaming is unavailable in this browser.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let streamError = '';

  const consumeBlock = block => {
    const parsed = parseEventBlock(block);
    if (!parsed) return;

    if (parsed.event === 'reply_delta') {
      const delta = typeof parsed.data?.delta === 'string' ? parsed.data.delta : '';
      if (delta) onReplyDelta(delta);
      return;
    }

    if (parsed.event === 'status') {
      const message = typeof parsed.data?.message === 'string' ? parsed.data.message : '';
      if (message) onStatus(message);
      return;
    }

    if (parsed.event === 'result') {
      result = parsed.data;
      return;
    }

    if (parsed.event === 'error') {
      streamError = parsed.data?.message || 'Operator stream failed.';
    }
  };

  const flushBlocks = final => {
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '');
    let split = buffer.indexOf('\n\n');
    while (split >= 0) {
      consumeBlock(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
      split = buffer.indexOf('\n\n');
    }
    if (final && buffer.trim()) {
      consumeBlock(buffer);
      buffer = '';
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flushBlocks(false);
  }

  buffer += decoder.decode();
  flushBlocks(true);

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error('Operator finished without a final response.');
  return result;
}

export async function fetchOperatorStream(payload, {
  fetchImpl = globalThis.fetch,
  onReplyDelta,
  onStatus
} = {}) {
  const response = await fetchImpl('/api/openai-site?provider=operator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true })
  });

  return readOperatorStream(response, { onReplyDelta, onStatus });
}
