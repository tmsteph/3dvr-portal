#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  buildSelfReviewMarkdown,
  runSelfReview
} from './money-printer-self-review.mjs';
import { sendOperatorReportEmail } from '../src/money-printer/operatorEmailReport.js';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
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

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    ok: result.status === 0
  };
}

function git(rootDir, args = [], options = {}) {
  const result = runCommand('git', args, { cwd: rootDir });
  if (!result.ok && !options.allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function gh(rootDir, args = [], options = {}) {
  const result = runCommand('gh', args, { cwd: rootDir });
  if (!result.ok && !options.allowFailure) {
    throw new Error(`gh ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function ensureOperatorDir(rootDir) {
  const dir = path.join(rootDir, '.money-printer', 'operator');
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

async function writeThomasReport(rootDir, report) {
  const dir = await ensureOperatorDir(rootDir);
  const filePath = path.join(dir, 'thomas-email-latest.md');
  const body = `# Money Printer Operator Report

This is an internal operator report. Real outreach sending is not connected to this report path.

## Summary

- command: ${report.command}
- risk: ${report.selfReview?.risk || 'unknown'}
- auto-merge allowed: ${report.selfReview?.autoMergeAllowed ? 'yes' : 'no'}
- PR: ${report.pr?.url || 'not opened'}
- merged: ${report.merge?.merged ? 'yes' : 'no'}

## Verification

${report.verification?.commands?.map(item => `- ${item.command}: ${item.ok ? 'pass' : 'fail'}`).join('\n') || '- none'}

## Next

${report.next || 'Review the operator output.'}
`;
  await writeFile(filePath, body, 'utf8');
  return filePath;
}

async function maybeSendOperatorReport(rootDir, report, options = {}) {
  if (!parseBool(options.emailReport)) {
    return null;
  }
  const email = await sendOperatorReportEmail({
    rootDir,
    reportPath: report.thomasReportPath,
    report,
    dryRun: parseBool(options.emailDryRun)
  });
  report.emailReport = email;
  return email;
}

function commandOutputSummary(result) {
  if (result.ok) return 'pass';
  const text = `${result.stderr}\n${result.stdout}`.trim();
  return text.slice(0, 500);
}

function autonomousBranchName(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `codex/money-printer-autonomous-${stamp}`;
}

function ensureProposalBranch(rootDir, options = {}) {
  const branch = git(rootDir, ['branch', '--show-current']);
  if (!['main', 'master'].includes(branch)) {
    return {
      originalBranch: branch,
      branch,
      created: false
    };
  }
  const nextBranch = options.branchName || autonomousBranchName();
  git(rootDir, ['switch', '-c', nextBranch]);
  return {
    originalBranch: branch,
    branch: nextBranch,
    created: true
  };
}

async function runVerification(rootDir) {
  const commands = [
    ['node', ['--check', 'scripts/money-printer-self-review.mjs']],
    ['node', ['--check', 'scripts/money-printer-operator.mjs']],
    ['node', ['--test', 'tests/money-printer-self-review.test.js']]
  ];
  const results = commands.map(([command, args]) => runCommand(command, args, { cwd: rootDir }));
  return {
    passed: results.every(result => result.ok),
    commands: results.map(result => ({
      command: result.command,
      ok: result.ok,
      result: commandOutputSummary(result)
    }))
  };
}

async function writeSafeImprovement(rootDir) {
  const filePath = path.join(rootDir, 'docs', 'money-printer-operator-report.md');
  const generatedAt = new Date().toISOString();
  const content = `# Money Printer Operator Report

Generated: ${generatedAt}

## Current Safe Improvement

This report is the v1 safe improvement target for the Money Printer operator.

The operator may update this document during a dry run or proposal cycle because it is documentation-only and does not touch users, billing, sending, deployment, secrets, auth, or schedulers.

## Guardrail Reminder

- GREEN changes may be eligible for auto-merge after tests pass.
- YELLOW changes may open a PR but need Thomas to merge.
- RED changes stop before opening a mergeable PR.
- Real email, SMS, Stripe, billing, auth, deployment, scheduler, secrets, and destructive cleanup remain blocked.
`;
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

async function buildReport(rootDir, command) {
  const status = git(rootDir, ['status', '--short', '--branch'], { allowFailure: true });
  const branch = git(rootDir, ['branch', '--show-current'], { allowFailure: true });
  const head = git(rootDir, ['rev-parse', '--short', 'HEAD'], { allowFailure: true });
  return {
    command,
    rootDir,
    branch,
    head,
    status,
    generatedAt: new Date().toISOString()
  };
}

async function openPullRequest(rootDir, options = {}) {
  const branch = git(rootDir, ['branch', '--show-current']);
  const title = options.title || 'Money Printer autonomous safe improvement';
  const bodyPath = options.bodyPath || path.join(rootDir, 'SELF_REVIEW.md');
  const body = await readFile(bodyPath, 'utf8').catch(() => 'Money Printer self-review unavailable.');
  gh(rootDir, ['pr', 'create', '--base', options.base || 'main', '--head', branch, '--title', title, '--body', body]);
  const url = gh(rootDir, ['pr', 'view', '--json', 'url', '--jq', '.url']);
  return { branch, url };
}

async function mergePullRequestIfGreen(rootDir, review, pr, options = {}) {
  if (!review.autoMergeAllowed) {
    return {
      merged: false,
      reason: 'self-review did not allow auto-merge'
    };
  }
  if (!parseBool(options.autoMerge)) {
    return {
      merged: false,
      reason: 'auto-merge flag not enabled'
    };
  }
  gh(rootDir, ['pr', 'merge', pr.url, '--squash', '--delete-branch']);
  return {
    merged: true,
    reason: 'GREEN self-review and checks passed'
  };
}

async function runReport(rootDir, options = {}) {
  const report = await buildReport(rootDir, 'report');
  const review = await runSelfReview({
    rootDir,
    write: false,
    testsPassed: false,
    summary: 'Read-only Money Printer operator report.'
  });
  report.selfReview = {
    risk: review.risk,
    autoMergeAllowed: review.autoMergeAllowed,
    files: review.files
  };
  const dir = await ensureOperatorDir(rootDir);
  report.reportPath = await writeJson(path.join(dir, 'latest-report.json'), report);
  report.thomasReportPath = await writeThomasReport(rootDir, report);
  await maybeSendOperatorReport(rootDir, report, options);
  report.reportPath = await writeJson(path.join(dir, 'latest-report.json'), report);
  return report;
}

async function runPropose(rootDir, options = {}) {
  const branchContext = ensureProposalBranch(rootDir, options);
  const report = await buildReport(rootDir, 'propose');
  report.branchContext = branchContext;
  report.safeImprovementPath = await writeSafeImprovement(rootDir);
  report.verification = await runVerification(rootDir);
  const operatorDir = await ensureOperatorDir(rootDir);
  const selfReviewPath = path.join(operatorDir, 'self-review-latest.md');
  const verificationCommands = report.verification.commands.map(item => `${item.command}: ${item.ok ? 'pass' : 'fail'}`);
  const review = await runSelfReview({
    rootDir,
    testsPassed: report.verification.passed,
    commands: verificationCommands,
    out: selfReviewPath,
    summary: 'Money Printer proposed a documentation-only operator report update.',
    rollbackPlan: 'Revert the PR commit or restore docs/money-printer-operator-report.md from main.',
    nextSuggestedAction: 'If GREEN, open a PR for the documentation-only report update. If not GREEN, ask Thomas to review.'
  });
  report.selfReview = {
    risk: review.risk,
    autoMergeAllowed: review.autoMergeAllowed,
    outPath: review.outPath,
    files: review.files,
    safetyChecks: review.safetyChecks,
    reasons: review.reasons
  };

  if (parseBool(options.createPr) && review.risk !== 'RED') {
    git(rootDir, ['add', 'docs/money-printer-operator-report.md']);
    git(rootDir, ['commit', '-m', options.commitMessage || 'Add Money Printer operator report']);
    git(rootDir, ['push', '-u', 'origin', git(rootDir, ['branch', '--show-current'])]);
    report.pr = await openPullRequest(rootDir, {
      base: options.base || 'main',
      title: options.title || 'Money Printer autonomous operator report',
      bodyPath: selfReviewPath
    });
    report.merge = await mergePullRequestIfGreen(rootDir, review, report.pr, {
      autoMerge: options.autoMerge
    });
  } else if (parseBool(options.createPr) && review.risk === 'RED') {
    report.pr = {
      url: '',
      blocked: true,
      reason: 'RED self-review blocks PR creation'
    };
  }

  const dir = await ensureOperatorDir(rootDir);
  report.reportPath = await writeJson(path.join(dir, 'latest-proposal.json'), report);
  report.thomasReportPath = await writeThomasReport(rootDir, report);
  await maybeSendOperatorReport(rootDir, report, {
    emailReport: options.emailReport,
    emailDryRun: options.emailDryRun
  });
  report.reportPath = await writeJson(path.join(dir, 'latest-proposal.json'), report);
  return report;
}

function printHelp() {
  console.log(`Money Printer Operator

Usage:
  node scripts/money-printer-operator.mjs report
  node scripts/money-printer-operator.mjs report --email-report --email-dry-run
  node scripts/money-printer-operator.mjs report --email
  node scripts/money-printer-operator.mjs propose
  node scripts/money-printer-operator.mjs propose --create-pr --auto-merge
  node scripts/money-printer-operator.mjs propose --create-pr --auto-merge --email-report

Commands:
  report      Inspect repo state and write an email-ready local report.
  propose     Create a documentation-only safe improvement and self-review it.

Flags:
  --root <dir>             Repo root, defaults to cwd.
  --create-pr              Commit, push, and open a PR when the self-review is not RED.
  --auto-merge             Merge the PR only if self-review is GREEN and checks passed.
  --base <branch>          PR base, default main.
  --branch-name <name>     Branch to create when proposal starts from main/master.
  --title <text>           PR title.
  --commit-message <text>  Commit message for proposal mode.
  --email                  Alias for --email-report.
  --email-report           Send the internal Thomas report after the run.
  --email-dry-run          Verify email config and log without sending.
  --json                   Print JSON.

Report email is internal-only. Outreach, billing, deployment changes, schedulers, and secrets are not connected to this command.
`);
}

async function main() {
  const args = parseArgs();
  if (args.help || args.h) {
    printHelp();
    return;
  }
  const rootDir = path.resolve(args.root || process.cwd());
  const command = args._[0] || 'report';
  let result;
  if (command === 'report') {
    result = await runReport(rootDir, {
      emailReport: args.emailReport || args.email,
      emailDryRun: args.emailDryRun || args.dryRun
    });
  } else if (command === 'propose') {
    result = await runPropose(rootDir, {
      createPr: args.createPr,
      autoMerge: args.autoMerge,
      base: args.base,
      branchName: args.branchName,
      title: args.title,
      commitMessage: args.commitMessage,
      emailReport: args.emailReport || args.email,
      emailDryRun: args.emailDryRun || args.dryRun
    });
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Money Printer Operator: ${command}`);
  console.log(`Risk: ${result.selfReview?.risk || 'unknown'}`);
  console.log(`Auto-merge: ${result.selfReview?.autoMergeAllowed ? 'allowed' : 'blocked'}`);
  console.log(`Report: ${path.relative(rootDir, result.reportPath || '')}`);
  console.log(`Thomas report: ${path.relative(rootDir, result.thomasReportPath || '')}`);
  if (result.emailReport) {
    console.log(`Email report: ${result.emailReport.sent ? 'sent' : result.emailReport.skipped ? `skipped (${result.emailReport.reason})` : result.emailReport.failed ? `failed (${result.emailReport.reason})` : result.emailReport.reason}`);
  }
  if (result.pr?.url) console.log(`PR: ${result.pr.url}`);
  if (result.merge) console.log(`Merge: ${result.merge.merged ? 'merged' : `not merged (${result.merge.reason})`}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`money-printer-operator: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  runReport,
  runPropose,
  runVerification,
  autonomousBranchName,
  ensureProposalBranch,
  sendOperatorReportEmail,
  writeSafeImprovement
};
