import Gun from 'gun';

const peer = process.env.THREEDVR_GUN_RELAY || 'https://gun-relay-3dvr.fly.dev/gun';
const expected = Number(process.env.EXPECTED_IMPORT_COUNT || 15);
const recentWindowMs = Number(process.env.RECENT_WINDOW_MS || 2 * 60 * 60 * 1000);
const collectMs = Number(process.env.COLLECT_MS || 9000);

const gun = Gun({ peers: [peer], localStorage: false, radisk: false });
const records = new Map();

gun.get('3dvr-crm').map().on((data, key) => {
  if (data && typeof data === 'object') records.set(key, data);
});

await new Promise((resolve) => setTimeout(resolve, collectMs));

const cutoff = Date.now() - recentWindowMs;
const recentImports = [...records.values()].filter((record) => {
  if (String(record?.source || '') !== 'Lead import') return false;
  const updated = Date.parse(String(record?.updated || ''));
  return Number.isFinite(updated) && updated >= cutoff;
});

const statusCounts = recentImports.reduce((acc, record) => {
  const status = String(record?.status || 'Unknown');
  acc[status] = (acc[status] || 0) + 1;
  return acc;
}, {});

const result = {
  ok: recentImports.length >= expected,
  expected,
  recentLeadImports: recentImports.length,
  totalCrmRecordsObserved: records.size,
  statusCounts,
};

console.log(`CRM_IMPORT_VERIFY ${JSON.stringify(result)}`);
process.exit(result.ok ? 0 : 2);
