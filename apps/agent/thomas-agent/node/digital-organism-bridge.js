const {
  loadEvents,
  renderContext,
  replayMemories,
} = require('./digital-organism');
const {
  adaptiveRecall,
  readSelectedStrategy,
  recordRetrievalFeedback,
} = require('./retrieval-lab');

function decodeQuery(encoded = '') {
  const value = String(encoded || '').trim();
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoded question.');
  const text = Buffer.from(value, 'base64url').toString('utf8').trim();
  if (!text || text.length > 2000) throw new Error('Question must be between 1 and 2000 characters.');
  return text;
}

function normalizeMemoryId(value = '') {
  const id = String(value || '').trim();
  if (!id || id.length > 300) throw new Error('Memory id must be between 1 and 300 characters.');
  return id;
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
    const selected = await readSelectedStrategy();
    const strategy = selected?.strategy || 'baseline-jaccard';
    const hits = await adaptiveRecall(query, { limit });
    const context = {
      question: query,
      hits,
      text: renderContext(query, hits),
      strategy,
    };
    process.stdout.write(JSON.stringify({ ok: true, context }));
    return;
  }

  if (command === 'approve') {
    const query = decodeQuery(argv[1]);
    const memoryId = normalizeMemoryId(argv[2]);
    const event = await recordRetrievalFeedback(query, memoryId, {
      sourceType: 'owner-signed-portal'
    });
    process.stdout.write(JSON.stringify({ ok: true, memoryId: event.memoryId }));
    return;
  }

  throw new Error('Unsupported bridge command.');
}

module.exports = {
  decodeQuery,
  main,
  normalizeMemoryId,
};

if (require.main === module) {
  main().catch(error => {
    process.stdout.write(JSON.stringify({ ok: false, error: error?.message || String(error) }));
    process.exitCode = 1;
  });
}
