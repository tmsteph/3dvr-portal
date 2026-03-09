import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpenAiRequest,
  buildPrompt,
  createSiteGeneratorHandler,
  DEFAULT_MODEL,
  SITE_BUILDER_CAPABILITIES
} from '../api/openai-site.js';

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      this.body = payload ?? this.body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

function createOpenAiResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function createSseResponse(chunks, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      }
    }),
    async json() {
      throw new Error('json() should not be called for SSE responses');
    },
    async text() {
      return chunks.join('');
    }
  };
}

function createStreamingRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.stringify(payload);
      return this;
    },
    end(payload) {
      this.ended = true;
      if (payload) {
        this.body += payload;
      }
      return this;
    },
    write(chunk) {
      this.body += chunk;
      return true;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

function parseSsePayload(text) {
  return String(text)
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n');
      const eventLine = lines.find(line => line.startsWith('event:'));
      const dataLine = lines.find(line => line.startsWith('data:'));
      return {
        event: eventLine ? eventLine.slice('event:'.length).trim() : 'message',
        data: dataLine ? JSON.parse(dataLine.slice('data:'.length).trim()) : null
      };
    });
}

test('buildPrompt injects the current date and year guidance', () => {
  const prompt = buildPrompt(new Date('2026-03-09T12:00:00.000Z'));

  assert.match(prompt, /Today is 2026-03-09\./);
  assert.match(prompt, /current year is 2026/i);
  assert.match(prompt, /Never default to stale years like 2023/i);
  assert.match(prompt, /Do not link buttons or nav items to the local portal/i);
  assert.match(prompt, /Use live web search only when the request needs current facts/i);
});

test('buildOpenAiRequest lets the model decide whether to use live search', () => {
  const request = buildOpenAiRequest({
    model: DEFAULT_MODEL,
    prompt: 'Build a VR portal landing page.',
    now: new Date('2026-03-09T12:00:00.000Z')
  });

  assert.equal(request.model, DEFAULT_MODEL);
  assert.equal(request.text.format.type, 'json_schema');
  assert.match(request.instructions, /Today is 2026-03-09\./);
  assert.equal(request.tool_choice, 'auto');
  assert.deepEqual(request.tools, [{ type: 'web_search' }]);
  assert.deepEqual(request.include, ['web_search_call.action.sources']);
});

test('site generator handler uses the current default model and returns sources when live search is enabled', async () => {
  let requestUrl = '';
  let requestBody = null;
  const handler = createSiteGeneratorHandler({
    apiKey: 'sk-test',
    now: () => new Date('2026-03-09T12:00:00.000Z'),
    fetchImpl: async (url, options = {}) => {
      requestUrl = String(url);
      requestBody = JSON.parse(options.body || '{}');
      return createOpenAiResponse({
        output: [
          {
            type: 'web_search_call',
            action: {
              sources: [
                {
                  title: '3dvr',
                  url: 'https://3dvr.tech/'
                }
              ]
            }
          },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  title: 'Portal Draft',
                  summary: 'Drafted a hero, features, and footer using the current year.',
                  html: '<!DOCTYPE html><html><body>ok</body></html>'
                })
              }
            ]
          }
        ]
      });
    }
  });

  const req = {
    method: 'POST',
    headers: {},
    body: {
      prompt: 'Build a VR portal landing page.'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
  assert.equal(requestBody.model, DEFAULT_MODEL);
  assert.equal(requestBody.input, 'Build a VR portal landing page.');
  assert.deepEqual(requestBody.tools, [{ type: 'web_search' }]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.model, DEFAULT_MODEL);
  assert.equal(res.body.currentYear, 2026);
  assert.equal(res.body.liveWebSearch, SITE_BUILDER_CAPABILITIES.liveWebSearch);
  assert.equal(res.body.usedWebSearch, true);
  assert.deepEqual(res.body.sources, [
    {
      title: '3dvr',
      url: 'https://3dvr.tech/'
    }
  ]);
});

test('site generator handler reports when the model does not use live search', async () => {
  let requestBody = null;
  const handler = createSiteGeneratorHandler({
    apiKey: 'sk-test',
    now: () => new Date('2026-03-09T12:00:00.000Z'),
    fetchImpl: async (_url, options = {}) => {
      requestBody = JSON.parse(options.body || '{}');
      return createOpenAiResponse({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  title: 'Portal Draft',
                  summary: 'Drafted a hero and feature grid.',
                  html: '<!DOCTYPE html><html><body>ok</body></html>'
                })
              }
            ]
          }
        ]
      });
    }
  });

  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      headers: {},
      body: {
        prompt: 'Build a simple landing page.'
      }
    },
    res
  );

  assert.equal(requestBody.tool_choice, 'auto');
  assert.deepEqual(requestBody.tools, [{ type: 'web_search' }]);
  assert.equal(res.body.usedWebSearch, false);
  assert.deepEqual(res.body.sources, []);
});

test('site generator handler streams search status before the final result', async () => {
  let requestBody = null;
  const handler = createSiteGeneratorHandler({
    apiKey: 'sk-test',
    now: () => new Date('2026-03-09T12:00:00.000Z'),
    fetchImpl: async (_url, options = {}) => {
      requestBody = JSON.parse(options.body || '{}');
      return createSseResponse([
        'event: response.created\n',
        'data: {"type":"response.created"}\n\n',
        'event: response.web_search_call.searching\n',
        'data: {"type":"response.web_search_call.searching"}\n\n',
        `event: response.completed\n`,
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: {
            output: [
              {
                type: 'web_search_call',
                action: {
                  sources: [
                    {
                      title: 'OpenAI',
                      url: 'https://openai.com/'
                    }
                  ]
                }
              },
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      title: 'Portal Draft',
                      summary: 'Drafted a page after checking the web.',
                      html: '<!DOCTYPE html><html><body>ok</body></html>'
                    })
                  }
                ]
              }
            ]
          }
        })}\n\n`
      ]);
    }
  });

  const res = createStreamingRes();
  await handler(
    {
      method: 'POST',
      headers: {},
      body: {
        prompt: 'Build a current-events page.',
        stream: true
      }
    },
    res
  );

  const events = parseSsePayload(res.body);
  assert.equal(requestBody.stream, true);
  assert.equal(events[0].event, 'status');
  assert.equal(events[0].data.message, 'Searching the web...');
  assert.equal(events[1].event, 'result');
  assert.equal(events[1].data.usedWebSearch, true);
  assert.deepEqual(events[1].data.sources, [
    {
      title: 'OpenAI',
      url: 'https://openai.com/'
    }
  ]);
});
