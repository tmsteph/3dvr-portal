const { leadsNode, slugify } = require('./gun-db');

const [status, name] = process.argv.slice(2);

if (!status || !name) {
  console.error('Usage: node gun-track-lead.js "contacted" "Business Name"');
  process.exit(1);
}

const allowed = new Set(['new', 'contacted', 'replied', 'closed']);
if (!allowed.has(status)) {
  console.error('Status must be one of: new, contacted, replied, closed');
  process.exit(1);
}

const id = slugify(name);

leadsNode().get(id).once((existing) => {
  if (!existing || !existing.name) {
    console.error(`Lead not found: ${name} (${id})`);
    process.exit(1);
  }

  leadsNode().get(id).put(
    {
      ...existing,
      status,
      updatedAt: Date.now(),
    },
    (ack) => {
      if (ack.err) {
        console.error('Failed to update lead:', ack.err);
        process.exit(1);
      }
      console.log(`Updated lead: ${name} -> ${status}`);
      process.exit(0);
    }
  );
});

setTimeout(() => {
  console.error('Timed out updating lead');
  process.exit(1);
}, 8000);
