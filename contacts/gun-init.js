(function initGunPeers(global) {
  const defaultPeers = [
    'wss://gun-relay-3dvr.fly.dev/gun'
  ];
  const disabledPeers = new Set([
    'wss://relay.3dvr.tech/gun'
  ]);
  const existingPeers = Array.isArray(global.__GUN_PEERS__)
    ? global.__GUN_PEERS__
    : [];
  global.__GUN_PEERS__ = Array.from(
    new Set([...defaultPeers, ...existingPeers].filter(Boolean))
  ).filter(peer => !disabledPeers.has(peer));
})(typeof window !== 'undefined' ? window : globalThis);
