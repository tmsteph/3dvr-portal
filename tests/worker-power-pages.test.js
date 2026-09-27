import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('worker power pages connect organizing and freelance independence', async () => {
  const [hub, organize, independence, freelance] = await Promise.all([
    read('../workers/index.html'),
    read('../workers/organize/index.html'),
    read('../workers/independence/index.html'),
    read('../av-freelance/index.html')
  ]);

  assert.match(hub, /Help ourselves\. Help our families\. Help each other\./);
  assert.match(hub, /\.\/organize\//);
  assert.match(hub, /\.\/independence\//);

  assert.match(organize, /Start with listening/);
  assert.match(organize, /iatse122\.org\/organize/);
  assert.match(organize, /nlrb\.gov\/about-nlrb\/rights-we-protect/);
  assert.match(organize, /Private by default/);

  assert.match(independence, /A second path changes the first one/);
  assert.match(independence, /\.\.\/\.\.\/av-freelance\//);
  assert.match(independence, /price-setting club/);

  assert.match(freelance, /href="\.\.\/workers\/"/);
  assert.match(freelance, />Worker hub</);
});
