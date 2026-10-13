import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pagePath = new URL('../sd-day-traders-admin/index.html', import.meta.url);
const appPath = new URL('../sd-day-traders-admin/app.js', import.meta.url);

describe('SD Day Traders admin', () => {
  it('uses the shared Google OAuth flow and calendar API', async () => {
    const [html, app] = await Promise.all([
      readFile(pagePath, 'utf8'),
      readFile(appPath, 'utf8')
    ]);

    assert.match(html, /\/calendar\/oauth\.js/);
    assert.match(html, /data-blackout-form/);
    assert.match(app, /scopeKey:\s*'calendar-gmail-send'/);
    assert.match(app, /gamboaesai@gmail\.com/);
    assert.match(app, /action:\s*'createEvent'/);
    assert.match(app, /startDate:\s*date/);
    assert.match(app, /endDate:\s*nextDateKey\(date\)/);
  });
});
