import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, firefox } from 'playwright';

let chromiumBrowser;
let firefoxBrowser;
let server;
const TEST_ORIGIN = 'http://127.0.0.1:4320';

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

async function openRandomRoom(browser, durableMessages) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  await context.addInitScript(() => {
    window.__GUN_PEERS__ = [];
  });
  await context.route('**/api/trial', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chatPushPublicKey: '' }) });
    }
    const body = request.postDataJSON();
    if (body.kind === 'chat-message' && body.action === 'publish') {
      if (!durableMessages.some(entry => entry.id === body.messageId)) {
        durableMessages.push({
          id: body.messageId,
          message: {
            sender: body.senderId,
            username: body.username,
            text: body.text,
            createdAt: body.createdAt
          }
        });
      }
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, messages: durableMessages })
    });
  });
  const page = await context.newPage();
  await page.goto(`${TEST_ORIGIN}/chat/#support`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#current-username')?.textContent !== 'Loading...');
  return { context, page };
}

async function waitForMessage(page, text, timeout = 15_000) {
  await page.waitForFunction(
    expected => [...document.querySelectorAll('.message')]
      .some(node => node.textContent?.includes(expected)),
    text,
    { timeout }
  );
}

before(async () => {
  server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '4320', HOST: '127.0.0.1' },
    stdio: 'ignore'
  });
  await waitForServer();
  [chromiumBrowser, firefoxBrowser] = await Promise.all([
    chromium.launch({ headless: true }),
    firefox.launch({ headless: true })
  ]);
});

after(async () => {
  await Promise.all([chromiumBrowser?.close(), firefoxBrowser?.close()]);
  server?.kill('SIGTERM');
});

describe('Chat cross-browser delivery', () => {
  it('delivers a Firefox message to an already-open Chromium chat', async () => {
    const durableMessages = [];
    const [{ context: chromeContext, page: chromePage }, { context: firefoxContext, page: firefoxPage }] =
      await Promise.all([
        openRandomRoom(chromiumBrowser, durableMessages),
        openRandomRoom(firefoxBrowser, durableMessages)
      ]);
    const message = `Cross-browser sync test ${Date.now()}`;

    await firefoxPage.locator('#message-input').fill(message);
    await firefoxPage.getByRole('button', { name: 'Send' }).click();
    try {
      await waitForMessage(firefoxPage, message);
    } catch (error) {
      const state = await firefoxPage.evaluate(() => ({
        input: document.querySelector('#message-input')?.value,
        messages: [...document.querySelectorAll('.message')].slice(0, 5).map(node => node.textContent),
        sendMessageType: typeof sendMessage,
        optimisticSource: sendMessage.toString().includes('messages[messageId] = message'),
        pendingSource: displayMessages.toString().includes('pendingMessagesByRoom[currentRoom]'),
        pending: Object.values(pendingMessagesByRoom[currentRoom] || {}).map(message => message.text),
        stored: Object.values(messages).slice(0, 5).map(message => message.text),
        room: currentRoom
      }));
      throw new Error(`Firefox did not render its own message: ${JSON.stringify(state)}`, { cause: error });
    }
    await waitForMessage(chromePage, message);

    assert.match(await chromePage.locator('.message').filter({ hasText: message }).first().textContent(), /Cross-browser sync test/);
    await Promise.all([chromeContext.close(), firefoxContext.close()]);
  });

  it('does not omit a burst of Firefox messages from Chromium', async () => {
    const durableMessages = [];
    const [{ context: chromeContext, page: chromePage }, { context: firefoxContext, page: firefoxPage }] =
      await Promise.all([
        openRandomRoom(chromiumBrowser, durableMessages),
        openRandomRoom(firefoxBrowser, durableMessages)
      ]);
    const prefix = `Cross-browser burst ${Date.now()}`;
    const messages = Array.from({ length: 12 }, (_, index) => `${prefix} ${index + 1}`);

    for (const message of messages) {
      await firefoxPage.locator('#message-input').fill(message);
      await firefoxPage.getByRole('button', { name: 'Send' }).click();
      try {
        await waitForMessage(firefoxPage, message, 5_000);
      } catch (error) {
        const state = await firefoxPage.evaluate(expected => ({
          expected,
          input: document.querySelector('#message-input')?.value,
          rendered: [...document.querySelectorAll('.message')].map(node => node.textContent),
          pending: Object.values(pendingMessagesByRoom[currentRoom] || {}).map(entry => entry.text),
          stored: Object.values(messages).map(entry => entry.text)
        }), message);
        throw new Error(`Firefox lost optimistic burst message: ${JSON.stringify(state)}`, { cause: error });
      }
    }

    try {
      await chromePage.waitForFunction(
        ({ expectedPrefix, count }) =>
          [...document.querySelectorAll('.message')]
            .filter(node => node.textContent?.includes(expectedPrefix)).length === count,
        { expectedPrefix: prefix, count: messages.length },
        { timeout: 30_000 }
      );
    } catch (error) {
      const received = await chromePage.locator('.message').filter({ hasText: prefix }).allTextContents();
      throw new Error(
        `Chromium received ${received.length}/${messages.length}; durable store has ${durableMessages.length}: ${JSON.stringify(received)}`,
        { cause: error }
      );
    }

    const received = await chromePage.locator('.message').filter({ hasText: prefix }).allTextContents();
    assert.equal(received.length, messages.length);
    await Promise.all([chromeContext.close(), firefoxContext.close()]);
  });
});
