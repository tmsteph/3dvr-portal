const {
  buildContext,
  loadEvents,
  replayMemories,
} = require('./digital-organism');

function decodeQuery(encoded = '') {
  const value = String(encoded || '').trim();
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoded question.');
  const text = Buffer.from(value, 'base64url').toString('utf8').trim();
  if (!text || text.length > 2000) throw new Error('Question must be between 1 and 2000 characters.');
  return text;
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'health';

  if (command === 'health') {
    const events = await loadEvents();
    const memories = replayMemories(events);
    process.stdout.write(JSON.stringify({
      ok: true,
      service: '3dvr-digital-organism-private',
      activeMemories: memories.length,
      events: events.length
    }));
    return;
  }

  if (command === 'context') {
    const query = decodeQuery(argv[1]);
    const limit = Math.min(10, Math.max(1, Number.parseInt(argv[2] || '5', 10) || 5));
    const context = await buildContext(query, { limit });
    process.stdout.write(JSON.stringify({ ok: true, context }));
    return;
  }

  throw new Error('Unsupported bridge command.');
}

main().catch(error => {
  process.stdout.write(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  process.exitCode = 1;
});
