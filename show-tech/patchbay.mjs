const VIDEO_LOGICAL = 'program.video';
const AUDIO_LOGICAL = 'program.audio';

export function createPatchbay({ nativeAv, pipewire, emit = () => {} } = {}) {
  const state = {
    patches: {
      [VIDEO_LOGICAL]: nativeAv?.state?.available ? 'video:gstreamer:auto' : 'video:browser',
      [AUDIO_LOGICAL]: pipewire?.state?.sessionAvailable ? 'audio:pipewire:default' : 'audio:gstreamer:auto',
    },
    changedAt: Date.now(),
  };

  function ports() {
    const result = [
      { id: 'video:browser', kind: 'video.output', label: 'Browser fullscreen output', backend: 'browser', selectable: true },
    ];

    if (nativeAv?.state?.available) {
      result.push(
        { id: 'video:gstreamer:auto', kind: 'video.output', label: 'Native display (automatic)', backend: 'gstreamer', selectable: true },
        { id: 'video:gstreamer:headless', kind: 'video.output.virtual', label: 'Virtual/headless video sink', backend: 'gstreamer', selectable: true },
        { id: 'audio:gstreamer:auto', kind: 'audio.output', label: 'Native audio (automatic)', backend: 'gstreamer', selectable: true },
      );
    }

    if (pipewire?.state?.sessionAvailable) {
      const defaultSink = pipewire.state.sinks.find(sink => sink.default);
      result.push({
        id: 'audio:pipewire:default',
        kind: 'audio.output',
        label: defaultSink ? `PipeWire default — ${defaultSink.name}` : 'PipeWire default output',
        backend: 'pipewire/wireplumber',
        selectable: true,
        target: defaultSink?.id ?? null,
      });
      for (const sink of pipewire.state.sinks) {
        result.push({
          id: `audio:pipewire:${sink.id}`,
          kind: 'audio.output',
          label: sink.name,
          backend: 'pipewire/wireplumber',
          selectable: true,
          target: sink.id,
          default: Boolean(sink.default),
        });
      }
    }
    return result;
  }

  function logicalOutputs() {
    return [
      { id: VIDEO_LOGICAL, kind: 'video.output', label: 'Program Video' },
      { id: AUDIO_LOGICAL, kind: 'audio.output', label: 'Program Audio' },
    ];
  }

  function manifest() {
    return { logicalOutputs: logicalOutputs(), ports: ports(), patches: { ...state.patches }, changedAt: state.changedAt };
  }

  function assertCompatible(logical, target) {
    const logicalPort = logicalOutputs().find(port => port.id === logical);
    if (!logicalPort) throw new Error(`Unknown logical output: ${logical}`);
    const physical = ports().find(port => port.id === target && port.selectable);
    if (!physical) throw new Error(`Unknown or unavailable target port: ${target}`);
    if (!physical.kind.startsWith(logicalPort.kind.split('.')[0])) {
      throw new Error(`${logical} cannot be patched to ${target}`);
    }
    return physical;
  }

  function setPatch(logical, target) {
    const physical = assertCompatible(logical, target);
    if (logical === AUDIO_LOGICAL && physical.backend === 'pipewire/wireplumber' && Number.isInteger(physical.target)) {
      pipewire.handle({ type: 'audio.default', payload: { target: physical.target } });
    }
    state.patches[logical] = target;
    state.changedAt = Date.now();
    const event = { type: 'patch.changed', at: state.changedAt, logical, target, patchbay: manifest() };
    emit(event);
    return event;
  }

  function clearPatch(logical) {
    if (!logicalOutputs().some(port => port.id === logical)) throw new Error(`Unknown logical output: ${logical}`);
    delete state.patches[logical];
    state.changedAt = Date.now();
    const event = { type: 'patch.changed', at: state.changedAt, logical, target: null, patchbay: manifest() };
    emit(event);
    return event;
  }

  function handle(action) {
    const payload = action?.payload || {};
    switch (action?.type) {
      case 'patch.set': return setPatch(String(payload.logical || ''), String(payload.target || ''));
      case 'patch.clear': return clearPatch(String(payload.logical || ''));
      default: return null;
    }
  }

  return { state, ports, logicalOutputs, manifest, handle, setPatch, clearPatch };
}
