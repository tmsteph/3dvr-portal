import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPlannedAudioCommand,
  createMixerState,
  planAudioCommand,
} from '../src/show-control/audio-mixer.js';

function mixer() {
  return createMixerState({
    id: 'demo',
    channels: [
      { id: 'lav-1', label: 'Lav 1', faderDb: -10 },
      { id: 'show-master', label: 'Show Master', faderDb: 0, protected: true },
    ],
  });
}

test('plans a small fader move without confirmation', () => {
  const plan = planAudioCommand(mixer(), {
    type: 'audio.channel.fader',
    channelId: 'lav-1',
    faderDb: -13,
  });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.command.faderDb, -13);
});

test('large fader moves require confirmation', () => {
  const plan = planAudioCommand(mixer(), {
    type: 'audio.channel.fader',
    channelId: 'lav-1',
    faderDb: 0,
  });
  assert.equal(plan.status, 'confirm');
});

test('protected-channel mute requires confirmation', () => {
  const plan = planAudioCommand(mixer(), {
    type: 'audio.channel.mute',
    channelId: 'show-master',
    mute: true,
  });
  assert.equal(plan.status, 'confirm');
  assert.equal(plan.reason, 'protected-channel-mute');
});

test('scene recall is blocked by default', () => {
  const plan = planAudioCommand(mixer(), {
    type: 'audio.scene.recall',
    scene: 'Keynote',
  });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.reason, 'scene-recall-disabled');
});

test('applies a confirmed safe command to mixer state', () => {
  const state = mixer();
  const plan = planAudioCommand(state, {
    type: 'audio.channel.mute',
    channelId: 'lav-1',
    mute: true,
  });
  const next = applyPlannedAudioCommand(state, plan);
  assert.equal(next.channels[0].mute, true);
  assert.equal(next.revision, state.revision + 1);
});
