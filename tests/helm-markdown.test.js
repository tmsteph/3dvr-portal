import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { paintOperatorMarkdown } from '../operator/markdown.js';

// Minimal DOM stub with tag names recorded, rich enough for the shared
// renderer: it only ever builds nodes and assigns text, never HTML.
function makeNode(tag) {
  return {
    tagName: String(tag || '').toUpperCase(),
    children: [],
    className: '',
    textContent: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; }
  };
}
globalThis.document = {
  createElement: tag => makeNode(tag),
  createTextNode: text => String(text)
};

const findAll = (node, predicate, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) findAll(child, predicate, found);
  return found;
};
const textOf = node => {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return (typeof node.textContent === 'string' ? node.textContent : '')
    + (node.children || []).map(textOf).join('');
};
const paint = markdown => {
  const target = makeNode('div');
  paintOperatorMarkdown(target, markdown);
  return target;
};

test('the reported Helm reply renders bold instead of literal asterisks', () => {
  const target = paint("Yes. I'm **Helm** here, your chat front door to the same agent called **Operator** inside Portal.");
  const strongs = findAll(target, item => item.tagName === 'STRONG');
  assert.deepEqual(strongs.map(textOf), ['Helm', 'Operator']);
  assert.ok(!textOf(target).includes('**'));
  assert.match(textOf(target), /your chat front door to the same agent called Operator inside Portal\./);
});

test('block markdown: headings, lists, code fences, quotes, emphasis, inline code', () => {
  const target = paint([
    '## Plan',
    '',
    'First *draft* with `inline code`.',
    '',
    '1. one',
    '2. two',
    '',
    '- alpha',
    '- beta',
    '',
    '```js',
    'const x = 1 < 2;',
    '```',
    '',
    '> quoted line'
  ].join('\n'));
  assert.equal(findAll(target, item => item.tagName === 'H2').length, 1);
  assert.equal(textOf(findAll(target, item => item.tagName === 'EM')[0]), 'draft');
  const pre = findAll(target, item => item.tagName === 'PRE')[0];
  assert.ok(pre);
  const fence = findAll(pre, item => item.tagName === 'CODE')[0];
  assert.equal(fence.className, 'language-js');
  assert.equal(textOf(fence), 'const x = 1 < 2;');
  assert.equal(findAll(target, item => item.tagName === 'OL')[0].children.length, 2);
  assert.equal(findAll(target, item => item.tagName === 'UL')[0].children.length, 2);
  assert.equal(textOf(findAll(target, item => item.tagName === 'BLOCKQUOTE')[0]), 'quoted line');
  const codes = findAll(target, item => item.tagName === 'CODE').map(textOf);
  assert.ok(codes.includes('inline code'));
});

test('links are safe: https gets noopener, unsafe schemes render as plain text', () => {
  const target = paint('[docs](https://portal.3dvr.tech/helm/) [home](/helm/) [bad](javascript:alert(1)) [proto](//evil.example/x)');
  const links = findAll(target, item => item.tagName === 'A');
  assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://portal.3dvr.tech/helm/');
  assert.equal(links[0].target, '_blank');
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.equal(links[1].href, '/helm/');
  assert.equal(links[1].target, undefined);
  const visible = textOf(target);
  assert.ok(visible.includes('bad'));
  assert.ok(visible.includes('proto'));
});

test('hostile markup in a reply renders inert', () => {
  const target = paint('Look: <script>alert(1)</script> <img src=x onerror=alert(2)> <svg onload=alert(3)> [x](data:text/html;base64,PHNjcmlwdD4=)');
  assert.equal(findAll(target, item => item.tagName === 'SCRIPT').length, 0);
  assert.equal(findAll(target, item => item.tagName === 'IMG').length, 0);
  assert.equal(findAll(target, item => item.tagName === 'SVG').length, 0);
  assert.equal(findAll(target, item => item.tagName === 'A').length, 0);
  assert.equal(findAll(target, item => 'onerror' in item || 'onload' in item).length, 0);
  const visible = textOf(target);
  assert.ok(visible.includes('<script>alert(1)</script>'));
  assert.ok(visible.includes('<img src=x onerror=alert(2)>'));
});

test('Helm wires settled replies through the shared renderer and keeps user text plain', async () => {
  const app = await readFile(new URL('../helm/app.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../helm/styles.css', import.meta.url), 'utf8');
  assert.match(app, /import \{ paintOperatorMarkdown \} from '\/operator\/markdown\.js';/);
  assert.match(app, /paintOperatorMarkdown\(reply, record\.reply\)/);
  assert.doesNotMatch(app, /reply\.textContent = record\.reply/);
  // User messages are still appended as a raw text node, never painted.
  assert.match(app, /article\.append\(label, document\.createTextNode\(record\.text\)\)/);
  // The in-flight preview bubble stays plain text until the reply settles.
  assert.match(app, /reply\.textContent = partial/);
  // Painted blocks get their spacing and code styling in the Helm sheet.
  assert.match(styles, /\.saved-reply pre \{/);
  assert.match(styles, /\.saved-reply ul,/);
});
