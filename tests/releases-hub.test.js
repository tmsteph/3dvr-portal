import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../releases/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('release hub backfill', () => {
  it('updates the release index with the retroactive milestones through v0.0.43', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'releases/index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Latest Release/);
    assert.match(html, /href="v0\.0\.43\.html">v0\.0\.43</);
    assert.match(html, /Week of May 4, 2026/);
    assert.match(html, /1\.0\.1-beta\.2/);
    assert.match(html, /href="v0\.0\.42\.html">v0\.0\.42</);
    assert.match(html, /Week of April 20, 2026/);
    assert.match(html, /pre-release notes/i);
    assert.match(html, /href="v0\.0\.41\.html">v0\.0\.41</);
    assert.match(html, /Week of April 13, 2026/);
    assert.match(html, /Pocket Workstation/i);
    assert.match(html, /href="v0\.0\.40\.html">v0\.0\.40</);
    assert.match(html, /Logic Lab/);
    assert.match(html, /href="v0\.0\.39\.html">v0\.0\.39</);
    assert.match(html, /href="v0\.0\.38\.html">v0\.0\.38</);
    assert.match(html, /href="v0\.0\.37\.html">v0\.0\.37</);
    assert.match(html, /href="v0\.0\.36\.html">v0\.0\.36</);
  });

  it('links v0.0.35 forward into the new retroactive chain', async () => {
    const html = await readFile(new URL('v0.0.35.html', baseDir), 'utf8');
    assert.match(html, /href="v0\.0\.34\.html"/);
    assert.match(html, /href="v0\.0\.36\.html"/);
  });

  it('ships the new milestone pages with coherent navigation and summaries', async () => {
    const releases = [
      ['v0.0.43.html', /Week of May 4, 2026/, /1\.0\.1-beta\.2/, /aria-disabled="true"/],
      ['v0.0.42.html', /Week of April 20, 2026/, /pre-release notes/i, /aria-disabled="true"/],
      ['v0.0.36.html', /Late January 2026/, /social planning/i, /href="v0\.0\.37\.html"/],
      ['v0.0.37.html', /Mid February 2026/, /Money Autopilot/i, /href="v0\.0\.38\.html"/],
      ['v0.0.38.html', /Late March 2026/, /Email Operator/i, /href="v0\.0\.39\.html"/],
      ['v0.0.39.html', /Week of March 30, 2026/, /profitability/i, /href="v0\.0\.40\.html"/],
      ['v0.0.40.html', /Week of April 6, 2026/, /Logic Lab/i, /href="v0\.0\.41\.html"/],
      ['v0.0.41.html', /Week of April 13, 2026/, /Pocket Workstation/i, /href="v0\.0\.42\.html"/],
    ];

    for (const [filename, datePattern, topicPattern, navPattern] of releases) {
      const url = new URL(filename, baseDir);
      assert.equal(await fileExists(url), true, `${filename} should exist`);
      const html = await readFile(url, 'utf8');
      assert.match(html, /<nav class="release-nav" aria-label="Release navigation">/);
      assert.match(html, datePattern);
      assert.match(html, topicPattern);
      assert.match(html, navPattern);
    }
  });
});
