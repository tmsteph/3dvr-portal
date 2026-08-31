import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function hasCommand(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createNativeAvAdapter({ emit = () => {}, outputMode = process.env.SHOW_NATIVE_OUTPUT_MODE || 'auto' } = {}) {
  const gstreamer = hasCommand('gst-launch-1.0');
  let current = null;

  const state = {
    available: gstreamer,
    backend: gstreamer ? 'gstreamer' : null,
    outputMode,
    running: false,
    action: null,
    pid: null,
    lastExit: null,
    lastError: null,
  };

  function capabilities() {
    if (!gstreamer) return [];
    return [{
      id: 'av.gstreamer',
      kind: 'av.output.native',
      backend: 'gstreamer',
      outputMode,
      actions: ['native.av.test', 'native.media.play', 'native.media.stop'],
    }];
  }

  function stop(reason = 'stopped') {
    if (current && !current.killed) current.kill('SIGTERM');
    current = null;
    state.running = false;
    state.pid = null;
    state.action = null;
    state.lastExit = { at: Date.now(), reason };
    emit({ type: 'native.av.state', state: { ...state } });
  }

  function resolveSinks(mode = outputMode) {
    const headless = mode === 'headless' || (mode === 'auto' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY);
    if (headless) return { video: 'fakesink', audio: 'fakesink', headless: true };
    return { video: 'autovideosink', audio: 'autoaudiosink', headless: false };
  }

  function runPipeline(args, actionName) {
    if (!gstreamer) throw new Error('GStreamer is not installed');
    stop('replaced');
    const child = spawn('gst-launch-1.0', ['-q', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    current = child;
    state.running = true;
    state.action = actionName;
    state.pid = child.pid;
    state.lastError = null;
    emit({ type: 'native.av.state', state: { ...state } });

    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
    child.on('error', error => {
      state.running = false;
      state.pid = null;
      state.lastError = error.message;
      emit({ type: 'native.av.error', error: error.message, state: { ...state } });
    });
    child.on('exit', (code, signal) => {
      if (current === child) current = null;
      state.running = false;
      state.pid = null;
      state.action = null;
      state.lastExit = { at: Date.now(), code, signal };
      if (code && stderr.trim()) state.lastError = stderr.trim();
      emit({ type: code === 0 ? 'native.av.complete' : 'native.av.error', state: { ...state } });
    });

    return { backend: 'gstreamer', pid: child.pid, action: actionName };
  }

  function test(payload = {}) {
    const durationMs = clamp(Number(payload.durationMs) || 750, 100, 5000);
    const fps = 30;
    const videoBuffers = Math.max(1, Math.round(durationMs / 1000 * fps));
    const audioBuffers = Math.max(1, Math.round(durationMs / 1000 * 100));
    const sinks = resolveSinks(payload.outputMode);

    const args = [
      'videotestsrc', 'pattern=smpte', `num-buffers=${videoBuffers}`, '!',
      `video/x-raw,width=640,height=360,framerate=${fps}/1`, '!', 'videoconvert', '!', sinks.video,
      'audiotestsrc', 'wave=sine', 'freq=1000', `num-buffers=${audioBuffers}`, '!',
      'audioconvert', '!', 'audioresample', '!', sinks.audio,
    ];
    return { ...runPipeline(args, 'native.av.test'), headless: sinks.headless, durationMs };
  }

  function play(payload = {}) {
    const src = String(payload.src || '');
    if (!src) throw new Error('native.media.play requires payload.src');
    const uri = /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : pathToFileURL(src).href;
    const sinks = resolveSinks(payload.outputMode);
    const volume = clamp(Number(payload.volume ?? 1), 0, 1);
    const args = ['playbin', `uri=${uri}`, `volume=${volume}`];
    if (sinks.headless) args.push('video-sink=fakesink', 'audio-sink=fakesink');
    return { ...runPipeline(args, 'native.media.play'), src, headless: sinks.headless };
  }

  function handle(action) {
    switch (action.type) {
      case 'native.av.test': return test(action.payload);
      case 'native.media.play': return play(action.payload);
      case 'native.media.stop': stop('action'); return { backend: 'gstreamer', stopped: true };
      default: return null;
    }
  }

  return { state, capabilities, handle, stop };
}
