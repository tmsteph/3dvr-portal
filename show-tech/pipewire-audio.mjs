import { spawnSync } from 'node:child_process';

const SPECIAL_TARGETS = new Set([
  '@DEFAULT_SINK@',
  '@DEFAULT_AUDIO_SINK@',
  '@DEFAULT_SOURCE@',
  '@DEFAULT_AUDIO_SOURCE@',
]);

function systemRun(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', timeout: 2500, maxBuffer: 1024 * 1024 });
}

function validTarget(value, fallback = '@DEFAULT_AUDIO_SINK@') {
  const target = value == null ? fallback : String(value);
  if (/^\d+$/.test(target) || SPECIAL_TARGETS.has(target)) return target;
  throw new Error(`Invalid PipeWire target: ${target}`);
}

function parseList(output, kind) {
  return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).flatMap(line => {
    const fields = line.split(/\t+/);
    const id = Number(fields[0]);
    if (!Number.isInteger(id)) return [];
    return [{ id, name: fields[1] || `node-${id}`, kind, default: fields.includes('*'), raw: line }];
  });
}

export function parseWpctlStatus(output) {
  const devices = [];
  let section = null;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/[│├└─]/g, ' ');
    if (/\bSinks:\s*$/.test(line)) { section = 'sink'; continue; }
    if (/\bSources:\s*$/.test(line)) { section = 'source'; continue; }
    if (/\bDevices:\s*$/.test(line)) { section = 'device'; continue; }
    if (/^\s*[A-Za-z][^:]*:\s*$/.test(line)) { section = null; continue; }
    if (!section) continue;
    const match = line.match(/^\s*(\*)?\s*(\d+)\.\s+(.+?)\s*$/);
    if (!match) continue;
    devices.push({
      id: Number(match[2]),
      name: match[3].replace(/\s+\[vol:.*$/i, '').trim(),
      kind: section,
      default: Boolean(match[1]),
      raw: rawLine.trim(),
    });
  }
  return devices;
}

export function createPipewireAudioAdapter({
  emit = () => {},
  command = process.env.SHOW_WPCTL_COMMAND || 'wpctl',
  runCommand = args => systemRun(command, args),
} = {}) {
  const probe = runCommand(['--help']);
  const state = {
    toolAvailable: probe.status === 0,
    sessionAvailable: false,
    backend: probe.status === 0 ? 'pipewire/wireplumber' : null,
    sinks: [],
    sources: [],
    devices: [],
    refreshedAt: null,
    lastError: probe.status === 0 ? null : 'wpctl is not installed',
  };

  function refresh({ quiet = false } = {}) {
    if (!state.toolAvailable) return state;
    const status = runCommand(['status', '-n']);
    state.refreshedAt = Date.now();
    if (status.status !== 0) {
      state.sessionAvailable = false;
      state.sinks = [];
      state.sources = [];
      state.devices = [];
      state.lastError = (status.stderr || status.stdout || 'Could not connect to PipeWire').trim();
      if (!quiet) emit({ type: 'audio.pipewire.state', state: { ...state } });
      return state;
    }

    state.sessionAvailable = true;
    state.lastError = null;
    const sinks = runCommand(['list', 'audio', 'sinks']);
    const sources = runCommand(['list', 'audio', 'sources']);
    if (sinks.status === 0 && sources.status === 0) {
      state.sinks = parseList(sinks.stdout, 'sink');
      state.sources = parseList(sources.stdout, 'source');
      state.devices = [...state.sinks, ...state.sources];
    } else {
      state.devices = parseWpctlStatus(status.stdout);
      state.sinks = state.devices.filter(device => device.kind === 'sink');
      state.sources = state.devices.filter(device => device.kind === 'source');
    }
    if (!quiet) emit({ type: 'audio.pipewire.state', state: { ...state } });
    return state;
  }

  refresh({ quiet: true });

  function capabilities() {
    if (!state.toolAvailable || !state.sessionAvailable) return [];
    return [{
      id: 'audio.pipewire',
      kind: 'audio.control',
      backend: 'pipewire/wireplumber',
      actions: ['audio.refresh', 'audio.volume', 'audio.mute', 'audio.default'],
      sinks: state.sinks,
      sources: state.sources,
    }];
  }

  function execute(args, errorLabel) {
    const result = runCommand(args);
    if (result.status !== 0) {
      const message = (result.stderr || result.stdout || `${errorLabel} failed`).trim();
      state.lastError = message;
      throw new Error(message);
    }
    state.lastError = null;
    return result.stdout?.trim() || '';
  }

  function handle(action) {
    const payload = action.payload || {};
    switch (action.type) {
      case 'audio.refresh':
        return { backend: 'pipewire/wireplumber', state: refresh() };
      case 'audio.volume': {
        if (!state.sessionAvailable) throw new Error('PipeWire session is unavailable');
        const target = validTarget(payload.target);
        const value = Number(payload.value);
        if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('audio.volume payload.value must be between 0 and 1');
        execute(['set-volume', target, String(value)], 'set-volume');
        return { backend: 'pipewire/wireplumber', target, volume: value };
      }
      case 'audio.mute': {
        if (!state.sessionAvailable) throw new Error('PipeWire session is unavailable');
        const target = validTarget(payload.target);
        const value = payload.value === 'toggle' ? 'toggle' : payload.value ? '1' : '0';
        execute(['set-mute', target, value], 'set-mute');
        return { backend: 'pipewire/wireplumber', target, mute: value };
      }
      case 'audio.default': {
        if (!state.sessionAvailable) throw new Error('PipeWire session is unavailable');
        const target = validTarget(payload.target, '');
        if (!/^\d+$/.test(target)) throw new Error('audio.default requires a numeric PipeWire node ID');
        execute(['set-default', target], 'set-default');
        refresh({ quiet: true });
        return { backend: 'pipewire/wireplumber', default: Number(target) };
      }
      default:
        return null;
    }
  }

  return { state, capabilities, handle, refresh };
}
