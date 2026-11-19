import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../woof-test/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('woof test page ships its interactive structure', async () => {
  const htmlUrl = new URL('index.html', appDir);
  assert.equal(await fileExists(htmlUrl), true);

  const html = await readFile(htmlUrl, 'utf8');
  assert.match(html, /<title>Woof test/);
  assert.match(html, /id="text"/);
  assert.match(html, /id="voice"/);
  assert.match(html, /id="speak"/);
  assert.match(html, /id="status"/);
  assert.match(html, /id="player"/);
  assert.match(html, /id="readsText"/);
  assert.match(html, /415-555-0199/);
  assert.match(html, /<script defer src="\/issue-launcher\.js"><\/script>/);
});

test('woof test page runs the model in the browser via pyodide and hugging face weights', async () => {
  const html = await readFile(new URL('index.html', appDir), 'utf8');
  assert.match(html, /cdn\.jsdelivr\.net\/pyodide\/v0\.28\.3\/full\//);
  assert.match(html, /huggingface\.co\/ConwayResearch\/Underdog-Woof\/resolve\/main\//);
  assert.match(html, /woof_int8\.npz/);
  assert.match(html, /loadPackage\("numpy"\)/);
  assert.match(html, /new Worker/);
  // Generation is local: the page must not post text to any 3dvr api endpoint.
  assert.doesNotMatch(html, /fetch\(\s*["']\/api\//);
  assert.doesNotMatch(html, /fetch\(\s*["']https:\/\/portal\.3dvr\.tech\/api/);
});

test('woof test page carries the license credit the model requires', async () => {
  const html = await readFile(new URL('index.html', appDir), 'utf8');
  assert.match(html, /Voice by Underdog Woof/);
  assert.match(html, /Underdog Non-Commercial License 1\.0/);
  assert.match(html, /not a product feature/);
});
