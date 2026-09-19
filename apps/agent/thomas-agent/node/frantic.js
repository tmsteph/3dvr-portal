#!/usr/bin/env node
'use strict';

const DEFAULT_BASE_URL = 'https://gofrantic.com';
const DEFAULT_AGENT_KID = 'agent-c87bb4';
const DEFAULT_PITCH = 'Ships small verifiable OSS fixes, protocol checks, and public evidence with tested receipts.';
const DEFAULT_WANTS = [
  'github_contribution_v1',
  'protocol_conformance_v1',
  'published_artifact_v1'
];

function config(env = process.env) {
  return {
    baseUrl: env.FRANTIC_BASE_URL || DEFAULT_BASE_URL,
    agentKid: env.FRANTIC_AGENT_KID || DEFAULT_AGENT_KID,
    operatorId: env.FRANTIC_OPERATOR_ID || '',
    operatorToken: env.FRANTIC_OPERATOR_TOKEN || ''
  };
}

async function requestJson(path, options = {}) {
  const cfg = options.config || config();
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(new URL(path, cfg.baseUrl), {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const detail = payload?.error || payload?.message || response.statusText;
    throw new Error(`Frantic ${response.status}: ${detail}`);
  }
  return payload;
}

async function getAgentStatus(cfg = config()) {
  return requestJson(`/v1/agents/${encodeURIComponent(cfg.agentKid)}/status`, { config: cfg });
}

async function getBoard(cfg = config()) {
  return requestJson('/v1/board', { config: cfg });
}

async function openShingle(options = {}, cfg = config()) {
  if (!cfg.operatorId) throw new Error('FRANTIC_OPERATOR_ID is required for shingle writes.');
  if (!cfg.operatorToken) throw new Error('FRANTIC_OPERATOR_TOKEN is required for shingle writes.');
  const floorCents = options.floorCents ?? 100;
  const wants = options.wants || DEFAULT_WANTS;
  const pitch = options.pitch || DEFAULT_PITCH;
  return requestJson(`/v1/operators/${encodeURIComponent(cfg.operatorId)}`, {
    config: cfg,
    method: 'PATCH',
    token: cfg.operatorToken,
    body: {
      agent_situation: {
        open: true,
        pitch,
        floor_cents: floorCents,
        wants
      }
    }
  });
}

function printStatus(payload) {
  const agent = payload.agent || {};
  const situation = agent.situation || {};
  console.log(`${agent.name || agent.kid || 'Frantic agent'}`);
  console.log(`sworn=${Boolean(agent.sworn)} eligible=${Boolean(agent.eligible)} runway=${agent.runwayGoodwillDays ?? '?'}d goodwill + ${agent.runwayCashDays ?? '?'}d cash`);
  console.log(`open_for_work=${Boolean(situation.open)} earned_usd=${agent.earnedUsd ?? 0} paid_bounties=${agent.paidBounties ?? 0}`);
  if (agent.claimEligibility?.reason) console.log(`claim: ${agent.claimEligibility.reason}`);
}

function printBoard(payload) {
  const board = payload.board || {};
  const rows = board.open_bounties || [];
  console.log(`open=${board.bounties_open ?? rows.length} funded_usd=${board.funded_usd ?? '?'}`);
  for (const bounty of rows.slice(0, 12)) {
    const slots = bounty.claim_slots?.available;
    const state = bounty.actions?.claim?.state || 'unknown';
    console.log(`#${bounty.number} $${bounty.price_usd} [${state}] slots=${slots ?? '?'} ${bounty.title}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'status';
  if (command === 'status') return printStatus(await getAgentStatus());
  if (command === 'board') return printBoard(await getBoard());
  if (command === 'doctor') {
    const cfg = config();
    console.log(`agent_kid=${cfg.agentKid}`);
    console.log(`operator_id=${cfg.operatorId ? 'configured' : 'missing'}`);
    console.log(`operator_token=${cfg.operatorToken ? 'configured' : 'missing'}`);
    return;
  }
  if (command === 'shingle') {
    const result = await openShingle();
    console.log(result.ok === false ? 'Frantic rejected the shingle update.' : 'Frantic shingle opened.');
    return;
  }
  throw new Error('Usage: 3dvr frantic [status|board|doctor|shingle]');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  config,
  requestJson,
  getAgentStatus,
  getBoard,
  openShingle,
  printStatus,
  printBoard
};
