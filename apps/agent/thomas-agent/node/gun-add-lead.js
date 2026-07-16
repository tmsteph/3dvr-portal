const { leadsNode, slugify } = require('./gun-db');

const [name, link = '', contact = ''] = process.argv.slice(2);

if (!name) {
  console.error('Usage: node gun-add-lead.js "Business Name" "https://site.com" "https://site.com/contact"');
  process.exit(1);
}

const id = slugify(name);
const now = new Date().toISOString().slice(0, 10);

const lead = {
  id,
  name,
  link,
  contact,
  status: 'new',
  date: now,
  updatedAt: Date.now(),
};

leadsNode().get(id).put(lead, (ack) => {
  if (ack.err) {
    console.error('Failed to save lead:', ack.err);
    process.exit(1);
  }
  console.log(`Saved lead: ${name} (${id})`);
  process.exit(0);
});

setTimeout(() => {
  console.error('Timed out writing lead');
  process.exit(1);
}, 8000);
