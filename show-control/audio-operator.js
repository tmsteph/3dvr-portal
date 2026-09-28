import {
  applyPlannedAudioCommand,
  createMixerState,
  planAudioCommand,
  setMeterLevel,
} from '../src/show-control/audio-mixer.js';

const seed = {
  id: 'foh-demo',
  label: 'FOH Demo',
  mode: 'simulation',
  channels: [
    { id: 'podium', label: 'Podium', faderDb: -8 },
    { id: 'lav-1', label: 'Lav 1', faderDb: -10 },
    { id: 'lav-2', label: 'Lav 2', faderDb: -12 },
    { id: 'handheld', label: 'Handheld', faderDb: -9 },
    { id: 'playback', label: 'Playback', faderDb: -16 },
    { id: 'show-master', label: 'Show Master', faderDb: 0, protected: true },
  ],
};

let state = createMixerState(seed);
const channelsEl = document.querySelector('#channels');
const logEl = document.querySelector('#log');

function log(message, status = 'ready') {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${stamp}] ${status.toUpperCase()} · ${message}\n${logEl.textContent}`.trim();
}

function run(command, confirmed = false) {
  const plan = planAudioCommand(state, command);
  if (plan.status === 'blocked') {
    log(`${command.type}: ${plan.reason}`, 'blocked');
    return false;
  }
  if (plan.status === 'confirm' && !confirmed) {
    const ok = window.confirm(`Audio Operator requires confirmation: ${plan.reason}. Apply this simulated change?`);
    if (!ok) {
      log(`${command.type}: confirmation declined`, 'confirm');
      return false;
    }
    confirmed = true;
  }
  state = applyPlannedAudioCommand(state, plan, { confirmed });
  log(`${command.type} → ${command.channelId || 'mixer'}`);
  render();
  return true;
}

function render() {
  channelsEl.innerHTML = state.channels.map(channel => {
    const meterPercent = Math.max(2, Math.min(100, ((channel.meterDb + 60) / 60) * 100));
    return `
      <article class="channel">
        <strong>${channel.label}</strong>
        <div class="meter" title="${channel.meterDb.toFixed(1)} dBFS"><span style="height:${meterPercent}%"></span></div>
        <input type="range" min="-60" max="10" step="1" value="${channel.faderDb}" data-fader="${channel.id}" aria-label="${channel.label} fader">
        <div class="readout">${channel.faderDb.toFixed(0)} dB</div>
        <button class="mute ${channel.mute ? 'active' : ''}" data-mute="${channel.id}">${channel.mute ? 'MUTED' : 'Mute'}</button>
      </article>
    `;
  }).join('');
}

channelsEl.addEventListener('change', event => {
  const fader = event.target.closest('[data-fader]');
  if (!fader) return;
  run({
    type: 'audio.channel.fader',
    channelId: fader.dataset.fader,
    faderDb: Number(fader.value),
  });
});

channelsEl.addEventListener('click', event => {
  const button = event.target.closest('[data-mute]');
  if (!button) return;
  const channel = state.channels.find(item => item.id === button.dataset.mute);
  run({
    type: 'audio.channel.mute',
    channelId: button.dataset.mute,
    mute: !channel.mute,
  });
});

document.querySelector('#speechTrim').addEventListener('click', () => {
  ['podium', 'lav-1', 'lav-2', 'handheld'].forEach(channelId => {
    const channel = state.channels.find(item => item.id === channelId);
    run({ type: 'audio.channel.fader', channelId, faderDb: channel.faderDb - 3 });
  });
});

document.querySelector('#mutePlayback').addEventListener('click', () => {
  run({ type: 'audio.channel.mute', channelId: 'playback', mute: true });
});

document.querySelector('#sceneRecall').addEventListener('click', () => {
  run({ type: 'audio.scene.recall', scene: 'Keynote' });
});

document.querySelector('#reset').addEventListener('click', () => {
  state = createMixerState(seed);
  log('Simulation reset');
  render();
});

setInterval(() => {
  state.channels.forEach(channel => {
    const base = channel.mute ? -90 : -38 + Math.random() * 28;
    state = setMeterLevel(state, channel.id, base);
  });
  render();
}, 350);

log('Audio Operator simulator ready. Hardware writes are disabled.');
render();
