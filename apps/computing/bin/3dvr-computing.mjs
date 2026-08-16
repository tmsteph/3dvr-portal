#!/usr/bin/env node

import { createMockAdapters } from '../src/adapters/mock.mjs';
import { createPolicy } from '../src/policy.mjs';
import { createRuntime } from '../src/runtime.mjs';

const command = process.argv[2] ?? 'demo';

if (command !== 'demo') {
  console.error('Usage: node bin/3dvr-computing.mjs demo');
  process.exitCode = 1;
} else {
  const runtime = createRuntime({
    policy: createPolicy({
      'browser.open': 'allow',
      'os.notify': 'ask'
    }),
    adapters: createMockAdapters()
  });

  console.log('3DVR Computing capabilities:');
  for (const capability of runtime.listCapabilities()) {
    console.log(`- ${capability}`);
  }

  const browserReceipt = await runtime.request('browser.open', {
    url: 'https://3dvr.tech'
  });
  const notifyReceipt = await runtime.request('os.notify', {
    title: '3DVR Computing',
    body: 'The same capability contract can power Debian, Android, and the browser.'
  });

  console.log('\nReceipts:');
  console.log(JSON.stringify([browserReceipt, notifyReceipt], null, 2));
}
