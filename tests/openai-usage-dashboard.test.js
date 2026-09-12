import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

describe('OpenAI usage dashboard', () => {
  it('keeps ChatGPT allowance separate from API organization usage', async () => {
    const html = await readFile(new URL('openai-app/usage/index.html', root), 'utf8');
    assert.match(html, /ChatGPT allowance/);
    assert.match(html, /API organization usage/);
    assert.match(html, /ChatGPT plan allowance is separate from API billing/);
    assert.match(html, /3dvr-openai-chatgpt-allowance/);
    assert.match(html, /platform\.openai\.com\/usage/);
  });

  it('does not consume a dedicated Vercel function slot', async () => {
    await assert.rejects(
      access(new URL('api/openai-usage.js', root)),
      { code: 'ENOENT' }
    );
  });
});
