// Partial text is presentation only; a final result confirms durable completion.
export async function readHelmResponse(response, onDelta = () => {}) {
  if (!response.headers?.get('content-type')?.includes('text/event-stream')) return response.json();
  if (!response.body) throw new Error('Reply stream is unavailable. Delivery is uncertain.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result;
  let bytes = 0;
  const consume = block => {
    const lines = block.split('\n');
    const name = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const raw = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (result !== undefined) throw new Error('Unexpected data after the final reply.');
    if (name === 'delta') {
      if (typeof data.text !== 'string') throw new Error('Invalid reply fragment.');
      onDelta(data.text);
    } else if (name === 'result') {
      if (typeof data.ok !== 'boolean') throw new Error('Invalid final reply.');
      result = data;
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 400000) throw new Error('Reply stream exceeded its limit.');
      pending += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        consume(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
      }
    }
    pending += decoder.decode();
    if (pending.trim() || result === undefined) throw new Error('Reply stream interrupted. Delivery is uncertain.');
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
