const { leadsNode } = require('./gun-db');

const results = {};
const started = Date.now();

leadsNode().map().once((data, key) => {
  if (!data || typeof data !== 'object') return;
  if (!data.name) return;
  results[key] = data;
});

function finish() {
  const leads = Object.values(results)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));

  if (!leads.length) {
    console.log('No leads found.');
    process.exit(0);
  }

  for (const lead of leads) {
    console.log([
      lead.id || '',
      lead.name || '',
      lead.link || '',
      lead.contact || '',
      lead.status || '',
      lead.date || '',
    ].join(','));
  }
  process.exit(0);
}

setTimeout(finish, 2500);

setTimeout(() => {
  console.error('Timed out reading leads');
  process.exit(1);
}, 8000);
