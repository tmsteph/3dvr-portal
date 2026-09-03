import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release v0.0.61', () => {
  it('publishes v0.0.61 with the weekly cadence, app explanations, and useful links', async () => {
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
    assert.match(release, /href="\.\.\/">3DVR Portal<\/a>/);
    assert.match(release, /Internal release:<\/strong> Thursday, September 3, 2026/);
    assert.match(release, /Testing:<\/strong> Friday, September 4 through Sunday, September 6, 2026/);
    assert.match(release, /Public release:<\/strong> Monday, September 7, 2026/);
    assert.doesNotMatch(release, /Release Candidate/);
    assert.match(release, /href="v0\.0\.60\.html">Previous release<\/a>/);

    assert.match(release, /href="\.\.\/operator\/">Operator<\/a>/);
    assert.match(release, /href="\.\.\/digital-organism\/">Digital Organism<\/a>/);
    assert.match(release, /href="\.\.\/context-hq\/">Context HQ<\/a>/);
    assert.match(release, /href="\.\.\/forge\/">Forge<\/a>/);
    assert.match(release, /href="\.\.\/agent\/">3DVR Agent and cloud workers<\/a>/);
    assert.match(release, /href="\.\.\/freelance\/">Freelancer Desk<\/a>/);
    assert.match(release, /href="\.\.\/show-tech\/">Show-Tech<\/a>/);
    assert.match(release, /href="\.\.\/launch-room\/">Launch Room<\/a>/);
    assert.match(release, /href="\.\.\/projects\/">Projects<\/a>/);
    assert.match(release, /href="\.\.\/web-builder-app\/">Web Builder<\/a>/);
    assert.match(release, /href="\.\.\/growth-operator\/">Growth Operator<\/a>/);
    assert.match(release, /href="\.\.\/money-printer\/">Money Printer<\/a>/);
    assert.match(release, /href="\.\.\/teach\/">Teach<\/a>/);

    assert.match(release, /Operator is the main AI assistant and front door to 3DVR/);
    assert.match(release, /Digital Organism is 3DVR's memory layer/);
    assert.match(release, /Forge is the controlled code-editing side of 3DVR/);
    assert.match(release, /Freelancer Desk is a simple work hub for independent workers/);
    assert.match(release, /Show-Tech is 3DVR's networked audio-video control system/);
    assert.match(release, /Money Printer<\/a><\/strong> is the experiment loop/);
    assert.match(release, /Teach is a way to show 3DVR how you do something/);
    assert.match(release, /<h2>Safety<\/h2>/);
    assert.match(release, /<h2>In short<\/h2>/);
  });

  it('gives code-first projects simple public landing pages', async () => {
    const organism = await readFile(new URL('../digital-organism/index.html', releasesDir), 'utf8');
    const agent = await readFile(new URL('../agent/index.html', releasesDir), 'utf8');
    const showTech = await readFile(new URL('../show-tech/index.html', releasesDir), 'utf8');

    assert.match(organism, /<h1>Digital Organism<\/h1>/);
    assert.match(organism, /github\.com\/tmsteph\/3dvr-digital-organism/);
    assert.match(agent, /<h1>3DVR Agent<\/h1>/);
    assert.match(agent, /github\.com\/tmsteph\/3dvr-portal\/tree\/main\/apps\/agent/);
    assert.match(showTech, /<h1>Show-Tech<\/h1>/);
    assert.match(showTech, /github\.com\/tmsteph\/3dvr-portal\/tree\/main\/show-tech/);
  });
});
