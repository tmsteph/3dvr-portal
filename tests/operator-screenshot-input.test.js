import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildOperatorRequest, normalizeOperatorImages } from '../src/operator/api.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Operator sends an attached screenshot as Responses API image input', () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const request = buildOperatorRequest({
    prompt: 'What is wrong with this interface?',
    images: [{ name: 'screen.png', type: 'image/png', dataUrl }]
  });

  const message = request.input.at(-1);
  assert.equal(message.role, 'user');
  assert.ok(Array.isArray(message.content));
  assert.deepEqual(message.content[0], { type: 'input_text', text: 'What is wrong with this interface?' });
  assert.deepEqual(message.content[1], { type: 'input_image', image_url: dataUrl, detail: 'auto' });
});

test('Operator rejects non-image data URLs before forwarding them', () => {
  assert.deepEqual(normalizeOperatorImages([{ dataUrl: 'data:text/html;base64,SGVsbG8=' }]), []);
});

test('full Operator exposes a mobile screenshot attachment control', async () => {
  const app = await read('operator/app.js');
  const attachments = await read('operator/attachments.js');
  const page = await read('operator/index.html');

  assert.match(app, /installOperatorAttachments/);
  assert.match(app, /images,history:prior/);
  assert.match(attachments, /Attach screenshot/);
  assert.match(attachments, /image\/png,image\/jpeg,image\/webp,image\/gif/);
  assert.match(attachments, /operator-attachment-preview/);
  assert.doesNotMatch(page, /operator-input[^>]+required/);
});
