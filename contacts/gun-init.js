(function initGunPeers(global) {
  const defaultPeers = [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun'
  ];
  const existingPeers = Array.isArray(global.__GUN_PEERS__)
    ? global.__GUN_PEERS__
    : [];
  global.__GUN_PEERS__ = Array.from(
    new Set([...defaultPeers, ...existingPeers].filter(Boolean))
  );
})(typeof window !== 'undefined' ? window : globalThis);
