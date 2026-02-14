import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runAutopilotCycle } from '../../src/money/autopilot.js';

function parseArgs(argv = []) {
  const args = {
    out: '',
    dryRun: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const hasValue = argv[index + 1] && !argv[index + 1].startsWith('--');
    args[key] = hasValue ? argv[index + 1] : 'true';
    if (hasValue) {
      index += 1;
    }
  }

  return args;
}

async function writeOutput(pathname, payload) {
  const absolute = resolve(pathname);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return absolute;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const result = await runAutopilotCycle({
    dryRun: args.dryRun ? ['true', '1', 'yes'].includes(String(args.dryRun).toLowerCase()) : undefined
  });

  console.log(`Autopilot run: ${result.runId}`);
  console.log(`Generated: ${result.generatedAt}`);
  console.log(`Signals analyzed: ${result.signalsAnalyzed}`);
  console.log(`Top opportunity: ${result.topOpportunity?.title || 'none'}`);
  console.log(`Publish attempted: ${result.publish.attempted ? 'yes' : 'no'}`);
  console.log(`Publish status: ${result.publish.published ? 'published' : result.publish.reason || 'not published'}`);

  if (result.warnings.length) {
    console.log('Warnings:');
    result.warnings.forEach(item => console.log(`- ${item}`));
  }

  if (args.out) {
    const outputPath = await writeOutput(args.out, result);
    console.log(`Saved autopilot artifact to ${outputPath}`);
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
