import Gun from 'gun';
import { summarizeRecentCrmImports } from './recent-import-summary.mjs';

const peer = process.env.THREEDVR_GUN_RELAY || 'https://portal.3dvr.tech/gun-relay';
const expected = Number(process.env.EXPECTED_IMPORT_COUNT || 15);
const recentWindowMs = Number(process.env.RECENT_WINDOW_MS || 2 * 60 * 60 * 1000);
const collectMs = Number(process.env.COLLECT_MS || 9000);

const gun = Gun({ peers: [peer], localStorage: false, radisk: false });
const records = new Map();

gun.get('3dvr-crm').map().on((data, key) => {
  if (data && typeof data === 'object') records.set(key, data);
});

await new Promise((resolve) => setTimeout(resolve, collectMs));

// This measures the observed relay snapshot only; it cannot prove the presence
// of an authenticated Operator task, worker completion, or source import job.
const result = summarizeRecentCrmImports(records, { expected, recentWindowMs });

console.log(`CRM_IMPORT_VERIFY ${JSON.stringify(result)}`);
process.exit(result.ok ? 0 : 2);
