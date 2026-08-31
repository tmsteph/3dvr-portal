import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipewireAudioAdapter, parseWpctlStatus } from './pipewire-audio.mjs';

const legacyStatus = `
PipeWire 'pipewire-0'
 └─ Clients:

Audio
 ├─ Devices:
 │      30. alsa_card.pci-0000_00_1f.3
 │
 ├─ Sinks:
 │  *   40. alsa_output.pci-0000_00_1f.3.analog-stereo [vol: 0.50]
 │
 ├─ Sources:
 │      41. alsa_input.pci-0000_00_1f.3.analog-stereo [vol: 1.00]
 │
 └─ Streams:
`;

function result(status, stdout = '', stderr = '') {
  return { status, stdout, stderr };
}

test('parses sinks and sources from legacy wpctl status output', () => {
  const devices = parseWpctlStatus(legacyStatus);
  assert.deepEqual(devices.map(({ id, kind, default: isDefault }) => ({ id, kind, default: isDefault })), [
    { id: 30, kind: 'device', default: false },
    { id: 40, kind: 'sink', default: true },
    { id: 41, kind: 'source', default: false },
  ]);
});

test('falls back to status parsing and emits safe wpctl control commands', () => {
  const calls = [];
  const runCommand = args => {
    calls.push(args);
    const key = args.join(' ');
    if (key === '--version') return result(0, 'wpctl 0.4\n');
    if (key === 'status -n') return result(0, legacyStatus);
    if (key === 'list audio sinks' || key === 'list audio sources') return result(1, '', 'Usage: wpctl');
    if (key.startsWith('set-volume ') || key.startsWith('set-mute ') || key.startsWith('set-default ')) return result(0);
    return result(1, '', `unexpected ${key}`);
  };

  const adapter = createPipewireAudioAdapter({ runCommand });
  assert.equal(adapter.state.sessionAvailable, true);
  const capability = adapter.capabilities()[0];
  assert.equal(capability.id, 'audio.pipewire');
  assert.equal(capability.sinks[0].id, 40);
  assert.equal(capability.sources[0].id, 41);

  adapter.handle({ type: 'audio.volume', payload: { value: 0.65 } });
  adapter.handle({ type: 'audio.mute', payload: { target: 40, value: true } });
  adapter.handle({ type: 'audio.default', payload: { target: 40 } });

  assert.ok(calls.some(args => args.join(' ') === 'set-volume @DEFAULT_AUDIO_SINK@ 0.65'));
  assert.ok(calls.some(args => args.join(' ') === 'set-mute 40 1'));
  assert.ok(calls.some(args => args.join(' ') === 'set-default 40'));
  assert.throws(() => adapter.handle({ type: 'audio.volume', payload: { target: 'bad;target', value: 0.5 } }), /Invalid PipeWire target/);
  assert.throws(() => adapter.handle({ type: 'audio.volume', payload: { value: 1.5 } }), /between 0 and 1/);
});

test('uses machine-readable wpctl list output when available', () => {
  const runCommand = args => {
    const key = args.join(' ');
    if (key === '--version') return result(0, 'wpctl 0.5\n');
    if (key === 'status -n') return result(0, 'Audio\n');
    if (key === 'list audio sinks') return result(0, '52\tshow_sink\tAudio/Sink\t*\n');
    if (key === 'list audio sources') return result(0, '53\tshow_source\tAudio/Source\t\n');
    return result(0);
  };
  const adapter = createPipewireAudioAdapter({ runCommand });
  assert.deepEqual(adapter.state.sinks.map(({ id, name, default: isDefault }) => ({ id, name, default: isDefault })), [
    { id: 52, name: 'show_sink', default: true },
  ]);
  assert.equal(adapter.state.sources[0].id, 53);
});

test('does not advertise audio control when wpctl cannot connect to PipeWire', () => {
  const runCommand = args => args[0] === '--version'
    ? result(0, 'wpctl 0.4\n')
    : result(2, '', 'Could not connect to PipeWire');
  const adapter = createPipewireAudioAdapter({ runCommand });
  assert.equal(adapter.state.toolAvailable, true);
  assert.equal(adapter.state.sessionAvailable, false);
  assert.deepEqual(adapter.capabilities(), []);
  assert.throws(() => adapter.handle({ type: 'audio.mute', payload: { value: true } }), /session is unavailable/);
});
