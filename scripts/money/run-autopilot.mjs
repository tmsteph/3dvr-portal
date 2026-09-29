import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runAutopilotCycle } from '../../src/money/autopilot.js';
import { createActionReceipt } from '../../src/operator-runtime/action-receipt.js';

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

  const receipt = createActionReceipt({
    actionId: result.runId,
    kind: 'revenue_cycle',
    source: 'money-autopilot',
    title: 'Money autopilot cycle',
    intent: 'Analyze revenue signals and advance the strongest validated offer.',
    domain: 'revenue',
    workflow: 'money-autopilot',
    status: 'succeeded',
    verificationStatus: 'pending',
    resultSummary: `Analyzed ${result.signalsAnalyzed} signals. Top opportunity: ${result.topOpportunity?.title || 'none'}. Publish: ${result.publish.published ? 'published' : result.publish.reason || 'not published'}.`,
    createdAt: result.generatedAt,
    updatedAt: new Date().toISOString(),
    metadata: {
      topOpportunityId: result.topOpportunity?.id || '',
      checkoutConfigured: Boolean(result.monetization?.checkoutConfigured),
      publishAttempted: Boolean(result.publish?.attempted),
      published: Boolean(result.publish?.published)
    }
  });

  console.log(`Autopilot run: ${result.runId}`);
  console.log(`Generated: ${result.generatedAt}`);
  console.log(`Signals analyzed: ${result.signalsAnalyzed}`);
  console.log(`Top opportunity: ${result.topOpportunity?.title || 'none'}`);
  console.log(`Publish attempted: ${result.publish.attempted ? 'yes' : 'no'}`);
  console.log(`Publish status: ${result.publish.published ? 'published' : result.publish.reason || 'not published'}`);
  console.log(`Action receipt: ${receipt.id} · verification ${receipt.verificationStatus}`);

  if (result.warnings.length) {
    console.log('Warnings:');
    result.warnings.forEach(item => console.log(`- ${item}`));
  }

  if (args.out) {
    const outputPath = await writeOutput(args.out, { ...result, actionReceipt: receipt });
    console.log(`Saved autopilot artifact to ${outputPath}`);
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
