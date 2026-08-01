import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN || 'http://127.0.0.1:3011';

test('operator guides a mobile conversation from quick prompt to contextual next step', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const submittedPrompts = [];
  await page.route('**/api/openai-site?provider=operator', async route => {
    submittedPrompts.push(route.request().postDataJSON().prompt);
    const isFollowUp = submittedPrompts.length > 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(isFollowUp
        ? { reply: 'Your priorities are clear.', suggestions: [], action: { type: 'none' } }
        : { reply: 'Let’s choose your most important next step.', suggestions: ['Help me choose my top three priorities.'], action: { type: 'none' } })
    });
  });

  await page.goto(`${PORTAL_ORIGIN}/operator/`);
  assert.equal(await page.getByRole('button', { name: 'Plan my day' }).isVisible(), true);
  await page.getByRole('button', { name: 'Plan my day' }).click();
  await page.getByText('Let’s choose your most important next step.').waitFor();
  assert.equal(submittedPrompts[0], 'Help me plan my day and choose the most important next step.');
  assert.equal(await page.getByLabel('Things to try').isVisible(), false);
  await page.getByRole('button', { name: 'Help me choose my top three priorities.' }).click();
  await page.getByText('Your priorities are clear.').waitFor();
  assert.equal(submittedPrompts[1], 'Help me choose my top three priorities.');
  assert.equal(await page.getByLabel('Suggested next steps').count(), 0);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    height: document.documentElement.scrollHeight,
    viewportHeight: innerHeight
  }));
  assert.ok(dimensions.width <= dimensions.viewportWidth, `horizontal overflow: ${dimensions.width} > ${dimensions.viewportWidth}`);
  assert.ok(dimensions.height <= dimensions.viewportHeight, `document scrolls: ${dimensions.height} > ${dimensions.viewportHeight}`);
  await browser.close();
});

test('operator completes core user journeys on mobile', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/openai-site?provider=operator', async route => {
    const request = route.request().postDataJSON();
    const isLead = /Acme Electric/i.test(request.prompt);
    const isChecklist = /checklist/i.test(request.prompt);
    const isLink = /example guide/i.test(request.prompt);
    const response = isLead ? {
      reply: 'I added the business to your pipeline.',
      action: { type: 'add_lead', title: '', text: 'Needs a better website.', business: 'Acme Electric', location: 'San Diego, CA', url: '' }
    } : isChecklist ? {
      reply: 'I made the list.',
      action: { type: 'create_checklist', title: 'Today', text: 'Call Sam\nSend quote', business: '', location: '', url: '' }
    } : isLink ? {
      reply: 'I saved the guide.',
      action: { type: 'save_link', title: 'Example guide', text: 'Read later', business: '', location: '', url: 'https://example.com/guide' }
    } : {
      reply: 'I saved that so you do not have to organize it now.',
      action: { type: 'create_note', title: 'Family camping trip', text: 'Plan a family camping trip in October.', business: '', location: '', url: '' }
    };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });

  await page.goto(`${PORTAL_ORIGIN}/operator/`);
  await page.getByLabel('Message your operator').fill('Remember that I want to plan a family camping trip in October.');
  await page.getByRole('button', { name: /Do it/ }).click();
  await page.getByText('Saved in Life Space.').waitFor();
  assert.equal(await page.getByRole('link', { name: /Open Life Space/ }).getAttribute('href'), '/life-space/');

  await page.getByLabel('Message your operator').fill('Add Acme Electric in San Diego to my leads.');
  await page.getByLabel('Message your operator').press('Control+Enter');
  await page.getByText('Added Acme Electric to Lead Finder.').waitFor();
  const leads = await page.evaluate(() => JSON.parse(localStorage.getItem('3dvr.leadFinder.prospects.v1') || '[]'));
  assert.equal(leads[0].business, 'Acme Electric');

  await page.getByLabel('Message your operator').fill('Make a checklist for today.');
  await page.getByRole('button', { name: /Do it/ }).click();
  await page.getByText('Saved as a checklist in Life Space.').waitFor();
  await page.getByLabel('Message your operator').fill('Save the example guide.');
  await page.getByRole('button', { name: /Do it/ }).click();
  await page.getByText('Saved the link in Life Space.').waitFor();
  const lifeSpaceItems = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('3dvr-life-space');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const stateRequest = request.result.transaction('state').objectStore('state').get('workspace');
      stateRequest.onerror = () => reject(stateRequest.error);
      stateRequest.onsuccess = () => resolve(stateRequest.result.spaces[0].items);
    };
  }));
  assert.deepEqual(lifeSpaceItems.find(item => item.type === 'checklist').rows.map(row => row.text), ['Call Sam', 'Send quote']);
  assert.equal(lifeSpaceItems.find(item => item.type === 'link').url, 'https://example.com/guide');

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.width <= dimensions.viewport, `horizontal overflow: ${dimensions.width} > ${dimensions.viewport}`);
  const appShell = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    mainHeight: document.querySelector('main').getBoundingClientRect().height,
    logScrollable: document.querySelector('#operator-log').scrollHeight > document.querySelector('#operator-log').clientHeight
  }));
  assert.ok(appShell.documentHeight <= appShell.viewportHeight, `document scrolls: ${appShell.documentHeight} > ${appShell.viewportHeight}`);
  assert.equal(Math.round(appShell.mainHeight), appShell.viewportHeight);
  assert.equal(appShell.logScrollable, true);

  await page.reload();
  await page.getByText('Added Acme Electric to Lead Finder.').waitFor();
  await page.getByRole('button', { name: 'New conversation' }).click();
  assert.equal(await page.locator('.message').count(), 0);
  await browser.close();
});

test('operator makes the latest message obvious after back navigation', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    const history = Array.from({ length: 18 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `Conversation message ${index + 1} with enough detail to make the history scroll.`
    }));
    history.push({ role: 'assistant', content: 'Your note is ready.', actionUrl: '/life-space/', actionLabel: 'Life Space' });
    localStorage.setItem('3dvr.operator.history.v1', JSON.stringify(history));
  });

  await page.goto(`${PORTAL_ORIGIN}/operator/`);
  const log = page.locator('#operator-log');
  await page.waitForFunction(() => {
    const element = document.querySelector('#operator-log');
    return element && element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  });
  await page.waitForTimeout(150);

  await log.evaluate(element => { element.scrollTop = 0; });
  await page.getByRole('button', { name: 'Jump to the latest message' }).waitFor();
  await page.getByRole('button', { name: 'Jump to the latest message' }).click();
  await page.waitForFunction(() => {
    const element = document.querySelector('#operator-log');
    return element && element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  });

  await page.getByRole('link', { name: /Open Life Space/ }).click();
  await page.goBack();
  await page.waitForFunction(() => {
    const element = document.querySelector('#operator-log');
    return element && element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  });
  assert.equal(await page.getByRole('button', { name: 'Jump to the latest message' }).isHidden(), true);
  await browser.close();
});

test('operator saves and reopens past conversations on mobile', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    if (!localStorage.getItem('3dvr.operator.conversations.v2')) localStorage.setItem('3dvr.operator.history.v1', JSON.stringify([
      { role: 'user', content: 'Plan the family camping trip' },
      { role: 'assistant', content: 'I can help with that.' }
    ]));
  });
  await page.goto(`${PORTAL_ORIGIN}/operator/`);
  await page.locator('#operator-log').getByText('Plan the family camping trip').waitFor();
  await page.getByRole('button', { name: 'New conversation' }).click();
  assert.equal(await page.locator('.message').count(), 0);
  await page.getByRole('button', { name: 'Past conversations' }).click();
  await page.getByRole('button', { name: /Plan the family camping trip/ }).click();
  await page.getByText('I can help with that.').waitFor();
  await page.reload();
  await page.locator('#operator-log').getByText('Plan the family camping trip').waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('3dvr.operator.conversations.v2') || 'null'));
  assert.equal(saved.conversations.filter(item => item.messages.length).length, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('3dvr.operator.history.v1')), null);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.width <= dimensions.viewport, `horizontal overflow: ${dimensions.width} > ${dimensions.viewport}`);
  await browser.close();
});

test('operator moves an existing device conversation into the signed-in account cache', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem('signedIn', 'true');
    localStorage.setItem('alias', 'thomas@example.com');
    localStorage.setItem('3dvr.operator.conversations.v2', JSON.stringify({
      activeId: 'device-chat',
      conversations: [{
        id: 'device-chat',
        createdAt: '2026-08-01T01:00:00.000Z',
        updatedAt: '2026-08-01T01:00:00.000Z',
        messages: [{ role: 'user', content: 'Move this chat into my account' }]
      }]
    }));
  });
  await page.goto(`${PORTAL_ORIGIN}/operator/`);
  await page.locator('#operator-log').getByText('Move this chat into my account').waitFor();
  await page.getByRole('button', { name: 'New conversation' }).click();
  const cache = await page.evaluate(() => ({
    old: localStorage.getItem('3dvr.operator.conversations.v2'),
    scoped: localStorage.getItem('3dvr.operator.conversations.v2.account.thomas%40example.com')
  }));
  assert.equal(cache.old, null);
  assert.match(cache.scoped, /Move this chat into my account/);
  await browser.close();
});
