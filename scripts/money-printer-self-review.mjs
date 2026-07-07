#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const RISK_LEVELS = Object.freeze({
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED'
});

export const DEFAULT_LIMITS = Object.freeze({
  maxGreenFiles: 6,
  maxGreenAdditions: 450,
  maxGreenDeletions: 80
});

const RED_PATH_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/).*secret.*$/i,
  /(^|\/).*token.*$/i,
  /(^|\/).*credential.*$/i,
  /(^|\/).*private.*key.*$/i,
  /(^|\/)\.github\/workflows\//i,
  /(^|\/)vercel\.json$/i,
  /(^|\/).+\/vercel\.json$/i,
  /(^|\/)ops\/systemd\//i,
  /(^|\/)(cron|crons|scheduler|schedulers)\//i,
  /(^|\/)api\/stripe\//i,
  /(^|\/)api\/webhooks\/stripe\.js$/i,
  /(^|\/)billing\//i,
  /(^|\/)src\/billing\//i,
  /(^|\/)finance\/stripe/i,
  /(^|\/)auth(\/|$)/i,
  /(^|\/)auth-identity\.js$/i,
  /(^|\/)api\/oauth\//i,
  /(^|\/)oauth\.js$/i,
  /(^|\/)api\/session\.js$/i,
  /(^|\/)api\/calendar\/reminder-email\.js$/i,
  /(^|\/)email-operator\//i,
  /(^|\/).*send.*email.*$/i,
  /(^|\/).*outreach.*send.*$/i,
  /(^|\/).*gmail.*$/i,
  /(^|\/).*sms.*$/i,
  /(^|\/).*twilio.*$/i,
  /(^|\/).*delete.*$/i,
  /(^|\/).*cleanup.*$/i
];

const YELLOW_PATH_PATTERNS = [
  /(^|\/)index\.html$/i,
  /(^|\/)navbar\.js$/i,
  /(^|\/)src\/money-printer\/messageReview\.js$/i,
  /(^|\/)scripts\/money-printer-operator\.mjs$/i,
  /(^|\/)scripts\/money-printer-self-review\.mjs$/i,
  /(^|\/)package(-lock)?\.json$/i,
  /(^|\/)src\//i,
  /(^|\/)api\//i,
  /(^|\/)crm\//i,
  /(^|\/)contacts\//i,
  /(^|\/)sales\//i,
  /(^|\/)growth-desk\//i
];

const GREEN_PATH_PATTERNS = [
  /(^|\/)docs\//i,
  /(^|\/)tests\//i,
  /(^|\/)money-printer\//i,
  /(^|\/)src\/money-printer\/(?!messageReview\.js$)[^/]+\.js$/i,
  /(^|\/)SELF_REVIEW\.md$/i
];

function cleanPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function matchesAny(filePath, patterns) {
  const normalized = cleanPath(filePath);
  return patterns.some(pattern => pattern.test(normalized));
}

export function isSecretLikePath(filePath) {
  return matchesAny(filePath, RED_PATH_PATTERNS.slice(0, 5));
}

export function classifyPath(file = {}) {
  const filePath = cleanPath(file.path || file);
  const status = String(file.status || '').toUpperCase();
  if (!filePath) {
    return {
      risk: RISK_LEVELS.RED,
      reason: 'Missing file path.'
    };
  }
  if (status.includes('D')) {
    return {
      risk: RISK_LEVELS.RED,
      reason: 'Deletes are blocked for autonomous runs.'
    };
  }
  if (matchesAny(filePath, RED_PATH_PATTERNS)) {
    return {
      risk: RISK_LEVELS.RED,
      reason: 'Path touches secrets, billing, sending, auth, deployment, scheduler, or destructive cleanup surface.'
    };
  }
  if (matchesAny(filePath, YELLOW_PATH_PATTERNS)) {
    return {
      risk: RISK_LEVELS.YELLOW,
      reason: 'Path is product, automation, API, CRM, package, or approval logic and needs human review.'
    };
  }
  if (matchesAny(filePath, GREEN_PATH_PATTERNS)) {
    return {
      risk: RISK_LEVELS.GREEN,
      reason: 'Path is documentation, tests, local Money Printer UI, or a bounded Money Printer internal file.'
    };
  }
  return {
    risk: RISK_LEVELS.YELLOW,
    reason: 'Path is not explicitly green-listed.'
  };
}

function rankRisk(risk) {
  return {
    [RISK_LEVELS.GREEN]: 0,
    [RISK_LEVELS.YELLOW]: 1,
    [RISK_LEVELS.RED]: 2
  }[risk] ?? 2;
}

function maxRisk(risks = []) {
  return risks.reduce((current, risk) => (
    rankRisk(risk) > rankRisk(current) ? risk : current
  ), RISK_LEVELS.GREEN);
}

export function classifyChange(input = {}) {
  const files = (input.files || []).map(file => ({
    path: cleanPath(file.path || file),
    status: String(file.status || 'M'),
    additions: Number(file.additions || 0),
    deletions: Number(file.deletions || 0)
  })).filter(file => file.path);
  const limits = {
    ...DEFAULT_LIMITS,
    ...(input.limits || {})
  };
  const testsPassed = Boolean(input.testsPassed);
  const commands = input.commands || [];

  const fileReviews = files.map(file => {
    const review = classifyPath(file);
    return {
      ...file,
      risk: review.risk,
      reason: review.reason
    };
  });
  const additions = fileReviews.reduce((sum, file) => sum + file.additions, 0);
  const deletions = fileReviews.reduce((sum, file) => sum + file.deletions, 0);

  const safetyChecks = {
    testsPassed,
    noSecretsTouched: !fileReviews.some(file => isSecretLikePath(file.path)),
    noBillingTouched: !fileReviews.some(file => /(^|\/)(billing|src\/billing|api\/stripe|api\/webhooks\/stripe|finance\/stripe)/i.test(file.path)),
    noRealSendingTouched: !fileReviews.some(file => /(^|\/)(email-operator|api\/calendar\/reminder-email|.*send.*email.*|.*gmail.*|.*sms.*|.*twilio.*)/i.test(file.path)),
    noDeploymentConfigTouched: !fileReviews.some(file => /(^|\/)(vercel\.json|\.github\/workflows|ops\/systemd|cron|crons|scheduler|schedulers)/i.test(file.path)),
    noDestructiveChanges: !fileReviews.some(file => String(file.status).toUpperCase().includes('D') || /(^|\/).*delete.*|(^|\/).*cleanup.*/i.test(file.path)),
    changedFileCountWithinLimit: fileReviews.length > 0 && fileReviews.length <= limits.maxGreenFiles,
    additionsWithinLimit: additions <= limits.maxGreenAdditions,
    deletionsWithinLimit: deletions <= limits.maxGreenDeletions
  };

  const reasons = [];
  if (!fileReviews.length) reasons.push('No changed files were found.');
  for (const file of fileReviews) {
    if (file.risk !== RISK_LEVELS.GREEN) reasons.push(`${file.path}: ${file.reason}`);
  }
  if (!testsPassed) reasons.push('Tests have not passed.');
  if (!safetyChecks.changedFileCountWithinLimit) reasons.push(`Changed file count must be 1-${limits.maxGreenFiles}.`);
  if (!safetyChecks.additionsWithinLimit) reasons.push(`Additions exceed green limit (${additions}/${limits.maxGreenAdditions}).`);
  if (!safetyChecks.deletionsWithinLimit) reasons.push(`Deletions exceed green limit (${deletions}/${limits.maxGreenDeletions}).`);

  let risk = maxRisk(fileReviews.map(file => file.risk));
  if (!fileReviews.length) risk = RISK_LEVELS.YELLOW;
  if (risk === RISK_LEVELS.GREEN && (!testsPassed || !Object.values(safetyChecks).every(Boolean))) {
    risk = RISK_LEVELS.YELLOW;
  }

  const autoMergeAllowed = risk === RISK_LEVELS.GREEN
    && testsPassed
    && Object.values(safetyChecks).every(Boolean);

  return {
    summary: input.summary || 'Money Printer autonomous self-review.',
    files: fileReviews,
    fileCount: fileReviews.length,
    additions,
    deletions,
    commands,
    risk,
    autoMergeAllowed,
    safetyChecks,
    reasons: unique(reasons),
    rollbackPlan: input.rollbackPlan || 'Revert the PR commit or run `git revert <merge-commit>` after merge.',
    nextSuggestedAction: input.nextSuggestedAction || (
      autoMergeAllowed
        ? 'Open a small PR and merge after normal checks pass.'
        : 'Ask Thomas to review the blocked or non-green change before merge.'
    )
  };
}

function formatCheck(value) {
  return value ? 'pass' : 'blocked';
}

export function buildSelfReviewMarkdown(review = {}) {
  const safety = review.safetyChecks || {};
  return `# Money Printer Self Review

## Summary

${review.summary || 'Money Printer autonomous self-review.'}

## Files Changed

${review.files?.length ? review.files.map(file => `- \`${file.status || 'M'}\` \`${file.path}\` (${file.additions || 0}+/${file.deletions || 0}-) - ${file.reason}`).join('\n') : '- No changed files detected.'}

## Risk Classification

${review.risk || RISK_LEVELS.RED}

Reasons:

${review.reasons?.length ? review.reasons.map(reason => `- ${reason}`).join('\n') : '- No blockers found.'}

## Auto-Merge Decision

${review.autoMergeAllowed ? 'Allowed' : 'Blocked'}

## Safety Checks

- tests passed: ${formatCheck(safety.testsPassed)}
- no secrets touched: ${formatCheck(safety.noSecretsTouched)}
- no billing touched: ${formatCheck(safety.noBillingTouched)}
- no real sending touched: ${formatCheck(safety.noRealSendingTouched)}
- no deployment config touched: ${formatCheck(safety.noDeploymentConfigTouched)}
- no destructive changes: ${formatCheck(safety.noDestructiveChanges)}
- changed file count within limit: ${formatCheck(safety.changedFileCountWithinLimit)}
- additions within limit: ${formatCheck(safety.additionsWithinLimit)}
- deletions within limit: ${formatCheck(safety.deletionsWithinLimit)}

## Verification

${review.commands?.length ? review.commands.map(command => `- ${command}`).join('\n') : '- No verification commands recorded.'}

## Rollback Plan

${review.rollbackPlan || 'Revert the PR commit or run `git revert <merge-commit>` after merge.'}

## Next Suggested Action

${review.nextSuggestedAction || 'Review the change before merge.'}
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._ = [...(args._ || []), token];
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function runGit(rootDir, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8'
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout || '';
}

function parseNameStatus(output = '') {
  return output.trim().split('\n').filter(Boolean).map(line => {
    const [status, filePath] = line.split(/\s+/, 2);
    return {
      status,
      path: filePath
    };
  });
}

function parseNumstat(output = '') {
  const stats = new Map();
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const [adds, dels, filePath] = line.split(/\s+/, 3);
    stats.set(cleanPath(filePath), {
      additions: Number(adds) || 0,
      deletions: Number(dels) || 0
    });
  }
  return stats;
}

async function countFileLines(rootDir, filePath) {
  try {
    const text = await readFile(path.join(rootDir, filePath), 'utf8');
    return text.split('\n').length;
  } catch (_error) {
    return 0;
  }
}

export async function collectGitChange(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const mode = options.mode || 'working';
  const base = options.base || 'origin/main';
  let files = [];
  let stats = new Map();

  if (mode === 'committed') {
    const range = `${base}...HEAD`;
    files = parseNameStatus(runGit(rootDir, ['diff', '--name-status', range], { allowFailure: true }));
    stats = parseNumstat(runGit(rootDir, ['diff', '--numstat', range], { allowFailure: true }));
  } else {
    files = parseNameStatus(runGit(rootDir, ['diff', '--name-status', 'HEAD'], { allowFailure: true }));
    stats = parseNumstat(runGit(rootDir, ['diff', '--numstat', 'HEAD'], { allowFailure: true }));
    const untracked = runGit(rootDir, ['ls-files', '--others', '--exclude-standard'], { allowFailure: true })
      .trim()
      .split('\n')
      .filter(Boolean);
    files.push(...untracked.map(filePath => ({ status: 'A', path: filePath })));
  }

  const normalized = [];
  const seen = new Set();
  for (const file of files) {
    const filePath = cleanPath(file.path);
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    const stat = stats.get(filePath) || {};
    normalized.push({
      path: filePath,
      status: file.status,
      additions: stat.additions ?? (file.status === 'A' ? await countFileLines(rootDir, filePath) : 0),
      deletions: stat.deletions ?? 0
    });
  }
  return normalized;
}

export async function runSelfReview(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const files = options.files || await collectGitChange({
    rootDir,
    base: options.base,
    mode: options.mode
  });
  const review = classifyChange({
    summary: options.summary,
    files,
    testsPassed: options.testsPassed,
    commands: options.commands,
    limits: options.limits,
    rollbackPlan: options.rollbackPlan,
    nextSuggestedAction: options.nextSuggestedAction
  });
  const markdown = buildSelfReviewMarkdown(review);
  const outPath = path.resolve(rootDir, options.out || 'SELF_REVIEW.md');
  if (options.write !== false) {
    await writeFile(outPath, markdown, 'utf8');
  }
  return {
    ...review,
    markdown,
    outPath
  };
}

function printHelp() {
  console.log(`Money Printer Self Review

Usage:
  node scripts/money-printer-self-review.mjs
  node scripts/money-printer-self-review.mjs --mode committed --base origin/main --tests-passed true

Flags:
  --root <dir>            Repo root, defaults to cwd.
  --mode <working|committed>
  --base <ref>            Base ref for committed diff, default origin/main.
  --tests-passed <bool>   Whether verification passed.
  --command <text>        Verification command. Repeat is not required; use semicolon text.
  --summary <text>        Self-review summary.
  --out <path>            Output path, default SELF_REVIEW.md.
  --json                  Print JSON report.
`);
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

async function main() {
  const args = parseArgs();
  if (args.help || args.h) {
    printHelp();
    return;
  }
  const commands = args.command
    ? String(args.command).split(';').map(command => command.trim()).filter(Boolean)
    : [];
  const review = await runSelfReview({
    rootDir: args.root || process.cwd(),
    mode: args.mode || 'working',
    base: args.base || 'origin/main',
    testsPassed: parseBool(args.testsPassed),
    commands,
    summary: args.summary,
    out: args.out || 'SELF_REVIEW.md'
  });
  if (args.json) {
    console.log(JSON.stringify({
      risk: review.risk,
      autoMergeAllowed: review.autoMergeAllowed,
      files: review.files,
      safetyChecks: review.safetyChecks,
      reasons: review.reasons,
      outPath: review.outPath
    }, null, 2));
    return;
  }
  console.log(`Money Printer Self Review: ${review.risk}`);
  console.log(`Auto-merge: ${review.autoMergeAllowed ? 'allowed' : 'blocked'}`);
  console.log(`Review: ${path.relative(process.cwd(), review.outPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`money-printer-self-review: ${error.message}`);
    process.exitCode = 1;
  });
}
