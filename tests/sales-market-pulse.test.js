import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('market pulse dashboard ships live Gun wiring and approval surfaces', async () => {
  const html = await readFile(new URL('../sales/market-pulse.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../sales/market-pulse.js', import.meta.url), 'utf8');
  const salesIndex = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');

  assert.match(html, /Market Pulse/);
  assert.match(html, /id="pulseDirectoryList"/);
  assert.match(html, /id="pulseMarketFitScore"/);
  assert.match(html, /id="pulseAutomationCommand"/);
  assert.match(html, /id="pulseAutomationPolicy"/);
  assert.match(html, /id="pulseSocialProbeList"/);
  assert.match(html, /id="pulseReactionList"/);
  assert.match(html, /id="pulseOutreachList"/);
  assert.match(html, /id="pulseTestList"/);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /type="module" src="\.\/market-pulse\.js"/);

  assert.match(js, /MARKET_PULSE_LATEST_PATH/);
  assert.match(js, /MARKET_PULSE_DIRECTORY_PATH/);
  assert.match(js, /deserializeMarketPulseFromGun/);
  assert.match(js, /automationPolicy/);
  assert.match(js, /market:pulse/);
  assert.match(js, /data-copy-probe/);
  assert.match(js, /reactionSnapshots/);
  assert.match(js, /data-approve-listing/);
  assert.match(js, /approval-required/);
  assert.match(salesIndex, /href="market-pulse\.html"/);
});
