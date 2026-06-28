import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../scripts/money-printer-auto-business.mjs', import.meta.url));

test('auto-business setup check reuses existing portal secrets without printing values', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'auto-business-setup-'));
  const home = path.join(cwd, 'home');

  try {
    await mkdir(home, { recursive: true });
    await writeFile(path.join(cwd, '.env.local'), [
      'OPENAI_API_KEY=sk-secret-value',
      'GMAIL_USER=bot@example.com',
      'GMAIL_APP_PASSWORD=gmail-secret-value',
      'STRIPE_LOG_EMAIL=ops@example.com',
      'STRIPE_CHECKOUT_URL=https://buy.stripe.com/private-checkout',
      'AUTO_BUSINESS_PHYSICAL_ADDRESS=123 Main St',
      'AUTO_BUSINESS_UNSUBSCRIBE_EMAIL=unsubscribe@example.com',
      'AUTO_BUSINESS_CONTACTS_FILE=~/.config/3dvr/outreach-contacts.csv'
    ].join('\n'));

    const result = await execFileAsync(process.execPath, [cliPath, '--setup-check', '--json'], {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        NO_COLOR: '1'
      }
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ready.coreAi, true);
    assert.equal(payload.ready.ownerEmail, true);
    assert.equal(payload.ready.mailReports, true);
    assert.equal(payload.ready.checkout, true);
    assert.equal(payload.ready.outreach, true);

    const missingKeys = payload.missing.map(item => item.key);
    assert.equal(missingKeys.includes('openai'), false);
    assert.equal(missingKeys.includes('ownerEmail'), false);
    assert.equal(missingKeys.includes('mail'), false);
    assert.equal(missingKeys.includes('checkout'), false);
    assert.equal(missingKeys.includes('senderCompliance'), false);
    assert.equal(missingKeys.includes('outreachContacts'), false);

    assert.doesNotMatch(result.stdout, /sk-secret-value/);
    assert.doesNotMatch(result.stdout, /gmail-secret-value/);
    assert.doesNotMatch(result.stdout, /private-checkout/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
