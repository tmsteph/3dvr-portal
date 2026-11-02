#!/usr/bin/env node
// Print a SEA-signed Portal auth proof for an agent account, as JSON:
//   { authPub, authProof }
//
// Usage:
//   AGENT_ALIAS=claude@3dvr AGENT_PASSWORD=... \
//     node scripts/agent-sea-proof.mjs --scope operator-developer-access --action status
//
// Credentials come only from the environment (source them from the OVH
// secrets broker at runtime); they are never read from files or printed.
// Options:
//   --scope S     Proof scope (required)
//   --action A    Proof action (default: status)
//   --origin URL  Portal origin to bind the proof to (default: https://portal.3dvr.tech)
//   --peers URL   Comma-separated Gun peers (default: the production relay)
//   --test-pair   Sign with a throwaway SEA pair instead of an account
//                 (for plumbing checks; the proof will not match any account)

import { authAgentPair, createAgentSeaPair, signSeaProof } from '../src/agents/sea-signer.js';

const DEFAULT_PEERS = ['https://gun-relay-3dvr.fly.dev/gun'];

function parseArgs(argv) {
  const args = { action: 'status', origin: 'https://portal.3dvr.tech', testPair: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--test-pair') args.testPair = true;
    else if (arg === '--scope') args.scope = argv[++i];
    else if (arg === '--action') args.action = argv[++i];
    else if (arg === '--origin') args.origin = argv[++i];
    else if (arg === '--peers') args.peers = String(argv[++i] || '').split(',').filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scope) throw new Error('--scope is required.');

  let pair;
  let alias;
  if (args.testPair) {
    pair = await createAgentSeaPair();
    alias = 'throwaway-test-agent@3dvr';
  } else {
    const authed = await authAgentPair({
      alias: process.env.AGENT_ALIAS,
      password: process.env.AGENT_PASSWORD,
      peers: args.peers?.length ? args.peers : DEFAULT_PEERS,
    });
    pair = authed.pair;
    alias = authed.alias;
  }

  const { authPub, authProof } = await signSeaProof(pair, {
    scope: args.scope,
    action: args.action,
    alias,
    origin: args.origin,
  });
  process.stdout.write(`${JSON.stringify({ authPub, authProof })}\n`);
}

main().catch(error => {
  process.stderr.write(`agent-sea-proof: ${error.message}\n`);
  process.exitCode = 1;
});
