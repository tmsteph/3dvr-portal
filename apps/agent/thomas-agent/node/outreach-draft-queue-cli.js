const fs = require('node:fs');
const {
  completeDraftRequest,
  listRequests,
  rejectDraftRequest,
  requestById,
} = require('./outreach-draft-queue');

function parseArgs(argv) {
  const options = { command: argv[0] || 'pending', id: argv[1] || '', textFile: '', reason: '' };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--text-file') options.textFile = argv[++index] || '';
    else if (argv[index] === '--reason') options.reason = argv[++index] || '';
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'pending' || options.command === 'ready') {
    console.log(JSON.stringify(listRequests(options.command), null, 2));
    return;
  }
  if (options.command === 'show') {
    const found = requestById(options.id);
    if (!found) throw new Error(`Draft request not found: ${options.id}`);
    console.log(JSON.stringify(found, null, 2));
    return;
  }
  if (options.command === 'complete') {
    if (!options.textFile) throw new Error('complete requires --text-file PATH');
    const result = completeDraftRequest(options.id, { text: fs.readFileSync(options.textFile, 'utf8'), source: 'codex' });
    console.log(`Draft ready: ${result.id}`);
    return;
  }
  if (options.command === 'reject') {
    const result = rejectDraftRequest(options.id, options.reason || 'Rejected by drafting operator.');
    console.log(`Draft rejected: ${result.id}`);
    return;
  }
  throw new Error('Usage: ask-draft-queue pending|ready|show ID|complete ID --text-file PATH|reject ID --reason TEXT');
}

module.exports = { main, parseArgs };

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message || error); process.exit(1); }
}
