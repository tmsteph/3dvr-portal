import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('crm touch logging keeps explicit outcomes and reply metadata', async () => {
  const appJs = await readFile(new URL('../crm/app.js', import.meta.url), 'utf8');

  assert.match(appJs, /const TOUCH_TYPE_OPTIONS = Object\.freeze/);
  assert.match(appJs, /drafted/);
  assert.match(appJs, /reply-received/);
  assert.match(appJs, /follow-up-scheduled/);
  assert.match(appJs, /closed-won/);
  assert.match(appJs, /closed-later/);
  assert.match(appJs, /not-a-fit/);
  assert.match(appJs, /deriveStatusFromTouch/);
  assert.match(appJs, /lastReplyAt: isReply \? now : String\(record\.lastReplyAt \|\| ''\)/);
  assert.match(appJs, /replyCount: isReply \? toActivityCount\(record\.replyCount\) \+ 1 : toActivityCount\(record\.replyCount\)/);
  assert.match(appJs, /appendTouchLogEntry/);
  assert.match(appJs, /crmRecordId:/);
  assert.match(appJs, /source: 'CRM workspace'/);
  assert.match(appJs, /segment: normalizedRecord\.marketSegment \|\| ''/);
  assert.match(appJs, /\['Replies', toActivityCount\(record\.replyCount\)\]/);
  assert.match(appJs, /\['Last reply', record\.lastReplyAt \?/);
});
