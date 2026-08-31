#!/usr/bin/env node
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function sendAction(targets, action, options = {}) {
  const executeAt = action.executeAt ?? (Date.now() + (options.leadMs ?? 500));
  const normalized = { ...action, executeAt };

  const results = await Promise.all(targets.map(async target => {
    const startedAt = Date.now();
    const response = await fetch(`${target.url.replace(/\/$/, '')}/v1/actions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${target.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(normalized),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`${target.name || target.url}: ${response.status} ${body.error || 'action rejected'}`);
    return {
      name: target.name || target.url,
      url: target.url,
      requestMs: Date.now() - startedAt,
      response: body,
    };
  }));

  return { executeAt, action: normalized, results };
}

async function main() {
  const [targetsPath, actionPath] = process.argv.slice(2);
  if (!targetsPath || !actionPath) {
    console.error('Usage: node show-tech/controller.mjs <targets.json> <action.json>');
    process.exitCode = 2;
    return;
  }
  const [targets, action] = await Promise.all([
    fs.readFile(targetsPath, 'utf8').then(JSON.parse),
    fs.readFile(actionPath, 'utf8').then(JSON.parse),
  ]);
  const result = await sendAction(targets, action);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
