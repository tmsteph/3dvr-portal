import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseDeviceProfile, normalizeDeviceHints } from '../src/device/profile.js';

test('normalizeDeviceHints preserves numeric and boolean device hints', () => {
  assert.deepEqual(normalizeDeviceHints({
    userAgent: 'Mozilla/5.0',
    platform: 'Android',
    network: '4g',
    effectiveType: '4g',
    downlink: '2.5',
    rtt: '180',
    cores: '8',
    memory: '4',
    touch: true,
    saveData: false,
    screenWidth: '1440',
    screenHeight: '2560'
  }), {
    userAgent: 'Mozilla/5.0',
    platform: 'Android',
    network: '4g',
    effectiveType: '4g',
    downlink: 2.5,
    rtt: 180,
    cores: 8,
    memory: 4,
    touch: true,
    saveData: false,
    screenWidth: 1440,
    screenHeight: 2560
  });
});

test('chooseDeviceProfile prefers stronger compression on slow or constrained devices', () => {
  const survival = chooseDeviceProfile({
    effectiveType: '2g',
    saveData: true,
    downlink: 0.3,
    rtt: 700,
    cores: 2,
    memory: 2
  });

  assert.equal(survival.profile, 'audio');
  assert.match(survival.reasons.join(' '), /save-data|network|downlink|rtt/i);

  const low = chooseDeviceProfile({
    effectiveType: '3g',
    downlink: 1.5,
    rtt: 360,
    cores: 4,
    memory: 4,
    platform: 'Android'
  });

  assert.equal(low.profile, 'low');
  assert.match(low.reasons.join(' '), /network|downlink|rtt|cores|memory|Android/i);

  const normal = chooseDeviceProfile({
    effectiveType: '4g',
    downlink: 12,
    rtt: 60,
    cores: 8,
    memory: 8
  });

  assert.equal(normal.profile, 'normal');
});
