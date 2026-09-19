import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [scaffold, recorder, accessibility, activity, ui] = await Promise.all([
  readFile(new URL('../apps/companion/scaffold.sh', import.meta.url), 'utf8'),
  readFile(new URL('../apps/companion/native-spec/android/CompanionPresenceAudioRecorder.kt', import.meta.url), 'utf8'),
  readFile(new URL('../apps/companion/native-spec/android/CompanionAccessibilityService.kt', import.meta.url), 'utf8'),
  readFile(new URL('../apps/companion/native-spec/android/MainActivity.kt', import.meta.url), 'utf8'),
  readFile(new URL('../apps/companion/lib/main.dart', import.meta.url), 'utf8'),
]);

test('Shared Presence is packaged as visible accessibility-owned ambient capture', () => {
  assert.match(scaffold, /CompanionPresenceAudioRecorder\.kt/);
  assert.match(scaffold, /POST_NOTIFICATIONS/);
  assert.match(scaffold, /threedvr/);
  assert.match(scaffold, /presence/);
  assert.match(recorder, /MediaRecorder\.OutputFormat\.OGG/);
  assert.match(recorder, /MediaRecorder\.AudioEncoder\.OPUS/);
  assert.match(recorder, /Shared audio recording ON/);
  assert.match(recorder, /NotificationManager\.IMPORTANCE_HIGH/);
  assert.match(accessibility, /CompanionPresenceAudioRecorder\(this\)/);
  assert.match(activity, /startPresenceAudio/);
  assert.match(activity, /requestPresencePermissions/);
  assert.match(ui, /Shared Presence/);
  assert.match(ui, /Start sharing/);
  assert.match(ui, /Stop sharing/);
});
