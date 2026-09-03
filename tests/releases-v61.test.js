import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release v0.0.61', () => {
  it('publishes v0.0.61 with the weekly cadence and explains the apps for new readers', async () => {
    const index = await readFile(new URL('index.html', releasesDir), 'utf8');
    const previous = await readFile(new URL('v0.0.60.html', releasesDir), 'utf8');
    const release = await readFile(new URL('v0.0.61.html', releasesDir), 'utf8');

    assert.match(index, /<h2>Latest Release<\/h2>[\s\S]*href="v0\.0\.61\.html">v0\.0\.61/);
    assert.match(index, /<h2>Release History<\/h2>[\s\S]*href="v0\.0\.61\.html">v0\.0\.61[\s\S]*href="v0\.0\.60\.html">v0\.0\.60/);
    assert.match(previous, /href="v0\.0\.61\.html">Next release<\/a>/);
    assert.match(release, /<h1>Release v0\.0\.61<\/h1>/);
    assert.match(release, /Week of August 31, 2026/);
    assert.match(release, /<h2>What is 3DVR\?<\/h2>/);
    assert.match(release, /3DVR is an open-source set of tools/);
    assert.match(release, /The <strong>3DVR Portal<\/strong> is the web home/);
    assert.match(release, /Internal release:<\/strong> Thursday, September 3, 2026/);
    assert.match(release, /Testing:<\/strong> Friday, September 4 through Sunday, September 6, 2026/);
    assert.match(release, /Public release:<\/strong> Monday, September 7, 2026/);
    assert.doesNotMatch(release, /Release Candidate/);
    assert.match(release, /href="v0\.0\.60\.html">Previous release<\/a>/);
    assert.match(release, /Operator is the main AI assistant and front door to 3DVR/);
    assert.match(release, /Digital Organism is 3DVR's memory layer/);
    assert.match(release, /Forge is the controlled code-editing side of 3DVR/);
    assert.match(release, /Freelancer Desk is a simple work hub for independent workers/);
    assert.match(release, /Show-Tech is 3DVR's networked audio-video control system/);
    assert.match(release, /Launch Room<\/strong> helps turn a rough idea or goal/);
    assert.match(release, /Money Printer<\/strong> is the experiment loop/);
    assert.match(release, /Teach is a way to show 3DVR how you do something/);
    assert.match(release, /<h2>Safety<\/h2>/);
    assert.match(release, /<h2>In short<\/h2>/);
  });
});
