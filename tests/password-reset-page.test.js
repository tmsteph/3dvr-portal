import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const passwordResetUrl = new URL('../password-reset.html', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('password reset page', () => {
  it('checks recovery email diagnostics before enabling email actions', async () => {
    assert.equal(await fileExists(passwordResetUrl), true, 'password-reset.html should exist');

    const html = await readFile(passwordResetUrl, 'utf8');
    assert.match(html, /id="email-config-note"/);
    assert.match(html, /async function loadRecoveryEmailDiagnostics\(\)/);
    assert.match(html, /method: 'GET'/);
    assert.match(html, /applyRecoveryEmailDiagnostics\(body\)/);
    assert.match(html, /loadRecoveryEmailDiagnostics\(\);/);
  });

  it('explains when preview email actions are unavailable', async () => {
    const html = await readFile(passwordResetUrl, 'utf8');
    assert.match(html, /Email alias details unavailable here/);
    assert.match(html, /Admin reset email unavailable here/);
    assert.match(html, /Admin reset routing unavailable here/);
    assert.match(html, /recovery emails are not configured here yet/i);
  });

  it('returns users to the canonical sign-in route after recovery', async () => {
    const html = await readFile(passwordResetUrl, 'utf8');
    assert.match(html, /href="\/sign-in\.html"/);
    assert.doesNotMatch(html, /href="\/auth\/sign-in\.html"/);
  });
});
