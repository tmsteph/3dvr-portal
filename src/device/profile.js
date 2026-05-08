const PROFILE_ORDER = ['audio', 'survival', 'low', 'normal'];

const PROFILE_DEFINITIONS = {
  normal: {
    label: 'Normal',
    description: 'Good balance for stable Wi-Fi and desktop-class devices.'
  },
  low: {
    label: 'Low bandwidth',
    description: 'Compressed for travel, weaker networks, and mid-range devices.'
  },
  survival: {
    label: 'Survival',
    description: 'Emergency profile for very constrained devices or shaky links.'
  },
  audio: {
    label: 'Audio only',
    description: 'Fallback when video should be minimized or removed.'
  }
};

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDeviceHints(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    userAgent: normalizeText(source.userAgent),
    platform: normalizeText(source.platform),
    network: normalizeText(source.network || source.effectiveType),
    effectiveType: normalizeText(source.effectiveType || source.network),
    downlink: normalizeNumber(source.downlink),
    rtt: normalizeNumber(source.rtt),
    cores: normalizeNumber(source.cores),
    memory: normalizeNumber(source.memory),
    touch: typeof source.touch === 'boolean' ? source.touch : null,
    saveData: typeof source.saveData === 'boolean' ? source.saveData : null,
    screenWidth: normalizeNumber(source.screenWidth),
    screenHeight: normalizeNumber(source.screenHeight)
  };
}

function addReason(reasons, condition, message) {
  if (condition) {
    reasons.push(message);
  }
}

function isAndroid(userAgent = '', platform = '') {
  const normalizedUserAgent = normalizeText(userAgent).toLowerCase();
  const normalizedPlatform = normalizeText(platform).toLowerCase();
  return normalizedUserAgent.includes('android') || normalizedPlatform.includes('android');
}

export function chooseDeviceProfile(input = {}) {
  const device = normalizeDeviceHints(input);
  const reasons = [];
  const network = device.network.toLowerCase();
  const effectiveType = device.effectiveType.toLowerCase();
  const userAgent = device.userAgent.toLowerCase();
  const platform = device.platform.toLowerCase();

  const veryWeakNetwork =
    device.saveData === true
    || effectiveType === 'slow-2g'
    || effectiveType === '2g'
    || network === 'slow-2g'
    || network === '2g'
    || (typeof device.downlink === 'number' && device.downlink > 0 && device.downlink < 0.8)
    || (typeof device.rtt === 'number' && device.rtt >= 650);

  const constrainedDevice =
    (typeof device.cores === 'number' && device.cores > 0 && device.cores <= 2)
    || (typeof device.memory === 'number' && device.memory > 0 && device.memory <= 2)
    || (typeof device.screenWidth === 'number' && device.screenWidth > 0 && device.screenWidth <= 720)
    || isAndroid(userAgent, platform);

  const moderateConstraints =
    effectiveType === '3g'
    || network === '3g'
    || (typeof device.downlink === 'number' && device.downlink > 0 && device.downlink < 2.5)
    || (typeof device.rtt === 'number' && device.rtt >= 350)
    || (typeof device.cores === 'number' && device.cores > 0 && device.cores <= 4)
    || (typeof device.memory === 'number' && device.memory > 0 && device.memory <= 4);

  let profile = 'normal';

  if (veryWeakNetwork) {
    profile = constrainedDevice ? 'audio' : 'survival';
    addReason(reasons, device.saveData === true, 'save-data requested');
    addReason(reasons, effectiveType === 'slow-2g' || effectiveType === '2g' || network === 'slow-2g' || network === '2g', `network ${device.network || device.effectiveType || 'unknown'}`);
    addReason(reasons, typeof device.downlink === 'number' && device.downlink > 0 && device.downlink < 0.8, `downlink ${device.downlink} Mbps`);
    addReason(reasons, typeof device.rtt === 'number' && device.rtt >= 650, `rtt ${device.rtt} ms`);
  } else if (moderateConstraints) {
    profile = 'low';
    addReason(reasons, effectiveType === '3g' || network === '3g', `network ${device.network || device.effectiveType || 'unknown'}`);
    addReason(reasons, typeof device.downlink === 'number' && device.downlink > 0 && device.downlink < 2.5, `downlink ${device.downlink} Mbps`);
    addReason(reasons, typeof device.rtt === 'number' && device.rtt >= 350, `rtt ${device.rtt} ms`);
    addReason(reasons, typeof device.cores === 'number' && device.cores > 0 && device.cores <= 4, `cores ${device.cores}`);
    addReason(reasons, typeof device.memory === 'number' && device.memory > 0 && device.memory <= 4, `memory ${device.memory} GB`);
    addReason(reasons, isAndroid(userAgent, platform), 'Android device');
  }

  const profileMeta = PROFILE_DEFINITIONS[profile];
  const score = PROFILE_ORDER.indexOf(profile);

  return {
    profile,
    label: profileMeta.label,
    description: profileMeta.description,
    reasons,
    score,
    device
  };
}

