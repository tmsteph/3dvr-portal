import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('empty streaming bubble shows a live thinking indicator that clears on first content', async () => {
  const app = await read('operator/app.js');
  const css = await read('operator/focus.css');

  // The painter renders no empty <p> for empty content, so the indicator is
  // painted explicitly for a live, still-empty streaming message.
  assert.match(app, /paintThinking/);
  assert.match(app, /operator-thinking__label/);
  assert.match(app, /if\(item\.streaming&&!item\.content&&thinkingTimer\)paintThinking/);
  assert.match(app, /if\(message\.streaming&&!message\.content&&thinkingTimer\)paintThinking/);
  // First streamed content repaints the whole message content, so the
  // indicator cannot linger past the first delta.
  assert.match(app, /paintOperatorMarkdown\(content,message\.content\)/);
  // Timer only runs for a live submit, so a stale streaming message
  // restored from storage never looks alive.
  assert.match(app, /startThinking\(\);render\(\{forceLatest:true\}\)/);
  assert.match(app, /finally\{stopThinking\(\);/);
  // Status text progresses while the reply is still empty.
  assert.match(app, /THINKING_STAGES=\[\[0,'Connecting…'\],\[4000,'Thinking…'\],\[15000,'Still working…'\]\]/);
  // Animated dots reuse the existing calm streaming animation.
  assert.match(css, /\.message\.assistant\.is-streaming \.operator-thinking__dots/);
  assert.match(css, /animation:operator-stream-breathe 1\.9s ease-in-out infinite/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('install help explains the standalone origin instead of moving the user there', async () => {
  const html = await read('operator/index.html');
  const installer = await read('operator/install.js');
  assert.doesNotMatch(installer, /operator\.3dvr\.tech\/operator/);
  assert.doesNotMatch(installer, /location\.assign/);
  assert.match(html, /Open the Operator web app \(operator\.3dvr\.tech\)/);
});
