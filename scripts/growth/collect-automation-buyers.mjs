import { openFunnelStore } from '../../src/automation-funnel/store.js';
import { collectJobs } from '../../src/automation-funnel/discovery.js';
const store = openFunnelStore();
try { console.log(JSON.stringify(await collectJobs(store))); }
finally { store.close(); }
