import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const meetingIndexUrl = new URL('../meeting-notes/index.html', import.meta.url);
const meetingDetailUrl = new URL('../meeting-notes/meeting.html', import.meta.url);

test('meeting creation captures workflow and video control fields', async () => {
  const html = await readFile(meetingIndexUrl, 'utf8');

  assert.match(html, /<label for="meetingWorkflow">Meeting workflow<\/label>/);
  assert.match(html, /<select class="select" id="meetingWorkflow" name="workflow">/);
  assert.match(html, /Two-tab Chrome test/);
  assert.match(html, /Travel \/ weak data/);
  assert.match(html, /<label for="meetingRoom">Room token<\/label>/);
  assert.match(html, /<label for="meetingControl">Control token<\/label>/);
  assert.match(html, /const buildMeetingLinks =/);
  assert.match(html, /Open ops pack/);
  assert.match(html, /Copy guest pack/);
  assert.match(html, /Host: \$\{links\.host\}/);
  assert.match(html, /Ops: \$\{links\.ops\}/);
});

test('meeting detail page exposes generated host guest fallback and ops links', async () => {
  const html = await readFile(meetingDetailUrl, 'utf8');

  assert.match(html, /<h2>Meeting links<\/h2>/);
  assert.match(html, /id="hostLink"/);
  assert.match(html, /id="guestLink"/);
  assert.match(html, /id="fallbackLink"/);
  assert.match(html, /id="opsLink"/);
  assert.match(html, /id="openHostLink"/);
  assert.match(html, /id="openGuestLink"/);
  assert.match(html, /id="openFallbackLink"/);
  assert.match(html, /id="openOpsLink"/);
});
