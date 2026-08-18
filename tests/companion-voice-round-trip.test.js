import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const router = read('apps/companion/native-spec/android/CompanionVoiceCommandRouter.kt');
const session = read('apps/companion/native-spec/android/CompanionVoiceInteractionSession.kt');
const service = read('apps/companion/native-spec/android/CompanionVoiceInteractionService.kt');
const assistantState = read('apps/companion/native-spec/android/CompanionAssistantStateStore.kt');
const activity = read('apps/companion/native-spec/android/MainActivity.kt');
const scaffold = read('apps/companion/scaffold.sh');
const dashboard = read('apps/companion/lib/main.dart');

test('voice round trip is constrained to the known app capability', () => {
  assert.match(router, /capabilityId = "app\.open_known"/);
  for (const alias of ['maps', 'gmail', 'camera', 'messages', 'calendar', 'chrome', 'chatgpt', 'settings']) {
    assert.match(router, new RegExp(`"${alias}"`));
  }
  assert.doesNotMatch(router, /"termux"/);
  assert.doesNotMatch(router, /Runtime\.getRuntime|ProcessBuilder|\bexec\s*\(/);
});

test('Android Assistant recognizes speech and records a visible receipt', () => {
  assert.match(session, /SpeechRecognizer\.createSpeechRecognizer/);
  assert.match(session, /CompanionVoiceCommandRouter\.route/);
  assert.match(session, /CompanionVoiceCommandRouter\.execute/);
  assert.match(session, /CompanionVoiceReceiptStore\.record/);
  assert.doesNotMatch(session, /Runtime\.getRuntime|ProcessBuilder|\bexec\s*\(/);
});

test('assistant readiness survives Android process boundaries', () => {
  assert.match(assistantState, /AtomicFile/);
  assert.match(service, /CompanionAssistantStateStore\.setServiceReady/);
  assert.match(session, /CompanionAssistantStateStore\.markSessionPrepared/);
  assert.match(activity, /CompanionAssistantStateStore\.snapshot/);
  assert.doesNotMatch(service, /CompanionAssistantState\./);
  assert.doesNotMatch(session, /CompanionAssistantState\./);
});

test('microphone consent and receipt are exposed to the Companion dashboard', () => {
  assert.match(activity, /"microphoneGranted" to hasMicrophonePermission\(\)/);
  assert.match(activity, /"requestMicrophonePermission"/);
  assert.match(activity, /"voiceReceipt"/);
  assert.match(dashboard, /Allow microphone/);
  assert.match(dashboard, /Last voice receipt/);
  assert.match(dashboard, /say “Open Maps”/);
});

test('fresh Android scaffolds include the voice sources and record-audio permission', () => {
  assert.match(scaffold, /CompanionVoiceReceiptStore\.kt/);
  assert.match(scaffold, /CompanionAssistantStateStore\.kt/);
  assert.match(scaffold, /CompanionVoiceCommandRouter\.kt/);
  assert.match(scaffold, /android\.permission\.RECORD_AUDIO/);
});
