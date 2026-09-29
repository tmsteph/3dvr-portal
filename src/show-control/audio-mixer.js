export const AUDIO_OPERATOR_VERSION = '0.1.0';

const DEFAULT_POLICY = Object.freeze({
  minFaderDb: -90,
  maxFaderDb: 10,
  maxUnconfirmedStepDb: 6,
  allowSceneRecall: false,
  allowPreampGain: false,
  protectedChannels: [],
});

function requireId(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new TypeError(`${label} id is required`);
  return id;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createChannel(input = {}) {
  return {
    id: requireId(input.id, 'channel'),
    label: String(input.label || input.id).trim(),
    faderDb: finiteNumber(input.faderDb, -12),
    mute: Boolean(input.mute),
    meterDb: finiteNumber(input.meterDb, -60),
    protected: Boolean(input.protected),
  };
}

export function createMixerState(input = {}) {
  return {
    protocolVersion: AUDIO_OPERATOR_VERSION,
    id: requireId(input.id || 'mixer', 'mixer'),
    label: String(input.label || input.id || 'Mixer').trim(),
    mode: input.mode === 'live' ? 'live' : 'simulation',
    connected: Boolean(input.connected),
    revision: 1,
    channels: (input.channels || []).map(createChannel),
  };
}

export function createAudioPolicy(input = {}) {
  return {
    ...DEFAULT_POLICY,
    ...input,
    protectedChannels: [...new Set((input.protectedChannels || []).map(String))],
  };
}

function channelById(state, channelId) {
  return state.channels.find(channel => channel.id === channelId) || null;
}

function isProtected(channel, policy) {
  return Boolean(channel?.protected || policy.protectedChannels.includes(channel?.id));
}

function result(status, command, reason = null) {
  return { status, command, reason };
}

export function planAudioCommand(state, commandInput = {}, policyInput = {}) {
  const policy = createAudioPolicy(policyInput);
  const type = requireId(commandInput.type, 'command');
  const channelId = commandInput.channelId ? String(commandInput.channelId) : null;

  if (type === 'audio.scene.recall') {
    if (!policy.allowSceneRecall) {
      return result('blocked', { ...commandInput, type }, 'scene-recall-disabled');
    }
    return result('confirm', { ...commandInput, type }, 'scene-recall-requires-confirmation');
  }

  if (type === 'audio.preamp.gain') {
    if (!policy.allowPreampGain) {
      return result('blocked', { ...commandInput, type }, 'preamp-gain-disabled');
    }
    return result('confirm', { ...commandInput, type }, 'preamp-gain-requires-confirmation');
  }

  const channel = channelById(state, channelId);
  if (!channel) {
    return result('blocked', { ...commandInput, type, channelId }, 'channel-not-found');
  }

  if (type === 'audio.channel.fader') {
    const requestedDb = finiteNumber(commandInput.faderDb, channel.faderDb);
    const faderDb = clamp(requestedDb, policy.minFaderDb, policy.maxFaderDb);
    const command = { type, channelId, faderDb };
    const delta = Math.abs(faderDb - channel.faderDb);
    if (delta > policy.maxUnconfirmedStepDb || isProtected(channel, policy)) {
      return result('confirm', command, 'fader-change-requires-confirmation');
    }
    return result('ready', command);
  }

  if (type === 'audio.channel.mute') {
    const command = { type, channelId, mute: Boolean(commandInput.mute) };
    if (command.mute && isProtected(channel, policy)) {
      return result('confirm', command, 'protected-channel-mute');
    }
    return result('ready', command);
  }

  return result('blocked', { ...commandInput, type }, 'unsupported-command');
}

export function applyPlannedAudioCommand(state, plan, options = {}) {
  if (!plan || plan.status === 'blocked') {
    throw new Error(plan?.reason || 'blocked-command');
  }
  if (plan.status === 'confirm' && options.confirmed !== true) {
    throw new Error(plan.reason || 'confirmation-required');
  }

  const command = plan.command;
  const channels = state.channels.map(channel => {
    if (channel.id !== command.channelId) return channel;
    if (command.type === 'audio.channel.fader') {
      return { ...channel, faderDb: command.faderDb };
    }
    if (command.type === 'audio.channel.mute') {
      return { ...channel, mute: command.mute };
    }
    return channel;
  });

  return {
    ...state,
    revision: state.revision + 1,
    channels,
  };
}

export function setMeterLevel(state, channelId, meterDb) {
  const channels = state.channels.map(channel =>
    channel.id === channelId
      ? { ...channel, meterDb: clamp(finiteNumber(meterDb, -60), -90, 6) }
      : channel
  );
  return { ...state, channels };
}
