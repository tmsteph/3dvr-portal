import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOperatorHandler,
  extractOperatorReplyPrefix
} from '../src/operator/api.js';
import { readOperatorStream } from '../operator/stream.js';

function streamFrom(chunks) {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    }
  });
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = JSON.stringify(payload); return this; },
    write(chunk) { this.body += chunk; return true; },
    end(chunk = '') { this.body += chunk; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    flushHeaders() {}
  };
}

test('extractOperatorReplyPrefix decodes the streamed reply string before the full JSON exists', () => {
  assert.equal(
    extractOperatorReplyPrefix('{"reply":"Hello\\nstreaming wor'),
    'Hello\nstreaming wor'
  );
  assert.equal(extractOperatorReplyPrefix('{"suggestions":['), '');
});

test('Operator stream client joins reply deltas and returns the final structured result', async () => {
  const deltas = [];
  const statuses = [];
  const final = {
    reply: 'Hello world',
    suggestions: ['Keep going'],
    action: { type: 'none' }
  };
  const response = {
    ok: true,
    headers: { get: key => key.toLowerCase() === 'content-type' ? 'text/event-stream; charset=utf-8' : '' },
    body: streamFrom([
      'event: status\ndata: {"message":"Operator is thinking…"}\n\n',
      'event: reply_delta\ndata: {"delta":"Hello "}\n\n',
      'event: reply_delta\ndata: {"delta":"world"}\n\n',
      `event: result\ndata: ${JSON.stringify(final)}\n\n`
    ])
  };

  const result = await readOperatorStream(response, {
    onReplyDelta: delta => deltas.push(delta),
    onStatus: message => statuses.push(message)
  });

  assert.deepEqual(statuses, ['Operator is thinking…']);
  assert.equal(deltas.join(''), 'Hello world');
  assert.deepEqual(result, final);
});

test('Operator API emits reply deltas before the final structured result', async () => {
  const finalPayload = {
    reply: 'Hello world',
    suggestions: ['Keep going'],
    action: {
      type: 'none',
      title: '',
      text: '',
      business: '',
      location: '',
      url: '',
      repo: ''
    }
  };
  let upstreamRequest = null;
  const fetchImpl = async (_url, options) => {
    upstreamRequest = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      body: streamFrom([
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"{\\\"reply\\\":\\\"Hello "}\n\n',
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"world\\\",\\\"suggestions\\\":[\\\"Keep going\\\"],\\\"action\\\":{\\\"type\\\":\\\"none\\\",\\\"title\\\":\\\"\\\",\\\"text\\\":\\\"\\\",\\\"business\\\":\\\"\\\",\\\"location\\\":\\\"\\\",\\\"url\\\":\\\"\\\",\\\"repo\\\":\\\"\\\"}}"}\n\n',
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: {
            output: [{
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(finalPayload) }]
            }]
          }
        })}\n\n`
      ])
    };
  };

  const handler = createOperatorHandler({ apiKey: 'test-key', fetchImpl });
  const res = mockRes();
  await handler({
    method: 'POST',
    headers: { host: 'portal.test' },
    body: { prompt: 'Say hello.', stream: true }
  }, res);

  assert.equal(upstreamRequest.stream, true);
  assert.match(res.headers['Content-Type'], /text\/event-stream/);
  assert.match(res.body, /event: reply_delta/);
  assert.match(res.body, /"delta":"Hello "/);
  assert.match(res.body, /"delta":"world"/);
  assert.match(res.body, /event: result/);
  assert.match(res.body, /"reply":"Hello world"/);
});
