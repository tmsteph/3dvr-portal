import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

let browser;
let server;
const TEST_ORIGIN = 'http://127.0.0.1:4318';

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${TEST_ORIGIN}/chat/`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Chat test server did not start.');
}

before(async () => {
  server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '4318', HOST: '127.0.0.1' },
    stdio: 'ignore'
  });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.kill('SIGTERM');
});

describe('Chat guest mode', () => {
  it('boots without page errors and lets a guest send a safe message', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(`${TEST_ORIGIN}/chat/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#current-username')?.textContent !== 'Loading...');

    const identity = await page.evaluate(() => ({
      guest: localStorage.getItem('guest'),
      guestId: localStorage.getItem('guestId'),
      username: document.querySelector('#current-username')?.textContent
    }));
    assert.equal(identity.guest, 'true');
    assert.match(identity.guestId || '', /^guest_/);
    assert.match(identity.username || '', /^Guest/);

    const notificationRegistration = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return registration ? new URL(registration.scope).pathname : '';
    });
    assert.equal(notificationRegistration, '/');

    await page.locator('#message-input').fill('<img src=x onerror="window.chatInjected=true"> hello');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.locator('.message').filter({ hasText: 'hello' }).first().waitFor();

    assert.equal(await page.evaluate(() => window.chatInjected), undefined);
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#current-username')?.textContent !== 'Loading...');
    assert.equal(await page.evaluate(() => localStorage.getItem('guestId')), identity.guestId);
    assert.match(await page.locator('#current-username').textContent(), /^Guest/);
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
    await context.close();
  });

  it('keeps long YouTube links inside the mobile chat viewport', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();

    await page.goto(`${TEST_ORIGIN}/chat/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const message = document.createElement('div');
      message.className = 'message';
      const content = document.createElement('div');
      content.textContent = `Guest: https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&list=${'long-unbroken-value'.repeat(20)}`;
      const metadata = document.createElement('div');
      metadata.className = 'meta';
      metadata.textContent = 'now';
      message.append(content, metadata);
      document.querySelector('#messages').replaceChildren(message);
    });

    const dimensions = await page.evaluate(() => {
      const message = document.querySelector('.message');
      const messages = document.querySelector('#messages');
      return {
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
        messagesClient: messages.clientWidth,
        messagesScroll: messages.scrollWidth,
        messageRight: Math.ceil(message.getBoundingClientRect().right)
      };
    });

    assert.equal(dimensions.page, dimensions.viewport);
    assert.equal(dimensions.messagesScroll, dimensions.messagesClient);
    assert.ok(dimensions.messageRight <= dimensions.viewport, JSON.stringify(dimensions));
    await context.close();
  });
});
