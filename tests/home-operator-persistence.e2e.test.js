import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN || 'http://127.0.0.1:3011';

test('home Operator conversation appears in Past conversations', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const prompt = 'Remember this homepage conversation for later.';
    const responseText = 'This homepage conversation is saved.';

    await page.route('**/api/openai-site?provider=operator', async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          reply: responseText,
          suggestions: ['Continue this saved conversation.'],
          action: { type: 'none' }
        })
      });
    });

    await page.goto(`${PORTAL_ORIGIN}/`);
    await page.getByLabel('Ask Operator anything').fill(prompt);
    await page.getByRole('button', { name: 'Send to Operator' }).click();
    await page.getByText(responseText).waitFor();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('3dvr.operator.conversations.v2') || 'null'));
    assert.ok(saved, 'home Operator should create the shared conversation store');
    assert.equal(saved.conversations.length, 1);
    assert.equal(saved.conversations[0].messages[0].content, prompt);
    assert.equal(saved.conversations[0].messages[1].content, responseText);
    assert.equal(saved.activeId, saved.conversations[0].id);

    await page.goto(`${PORTAL_ORIGIN}/operator/`);
    await page.getByRole('button', { name: 'Past conversations' }).click();
    const savedConversation = page.getByRole('button', { name: new RegExp(prompt.slice(0, 30)) });
    await savedConversation.waitFor();
    await savedConversation.click();
    await page.locator('#operator-log').getByText(prompt).waitFor();
    await page.locator('#operator-log').getByText(responseText).waitFor();
  } finally {
    await browser.close();
  }
});
