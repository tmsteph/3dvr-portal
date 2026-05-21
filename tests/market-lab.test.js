import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../market-lab/index.html', import.meta.url);
const appUrl = new URL('../market-lab/app.js', import.meta.url);
const landingScriptUrl = new URL('../market-lab/landing.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);
const landingPages = [
  ['Launch Your Idea', '../market-lab/launch-your-idea/index.html'],
  ['Personal Tech Department', '../market-lab/personal-tech-department/index.html'],
  ['Open Future Computing', '../market-lab/open-future-computing/index.html'],
];

describe('Market Lab', () => {
  it('ships the dashboard page with the required experiments and explanation', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /3DVR Market Lab/);
    assert.match(html, /This page helps 3dvr\.tech test which market message gets the most energy back from reality\./);
    assert.match(html, /Landing pages to test/);
    assert.match(html, /Experiment dashboard/);
    assert.match(html, /Current leader/);
    assert.match(html, /Current source label/);
    assert.match(html, /\?source=instagram/);
    assert.match(html, /Gun backup: connecting/);
    assert.match(html, /3dvr-portal\/market-lab\/state/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
    assert.match(html, /app\.js/);
  });

  it('defines the initial experiments, Gun backup, source labels, metrics, and winner formula', async () => {
    const js = await readFile(appUrl, 'utf8');

    assert.match(js, /Launch Your Idea/);
    assert.match(js, /We help people finally launch their ideas\./);
    assert.match(js, /Personal Tech Department/);
    assert.match(js, /Your personal tech department for \$20\/month\./);
    assert.match(js, /Open Future Computing/);
    assert.match(js, /Open-source computing for real humans\./);
    assert.match(js, /window\.localStorage/);
    assert.match(js, /createGunBackup/);
    assert.match(js, /GUN_ROOT_KEY = '3dvr-portal'/);
    assert.match(js, /GUN_STATE_KEY = 'state'/);
    assert.match(js, /JSON\.stringify\(payload\.experiments\)/);
    assert.match(js, /backupEventToGun/);
    assert.match(js, /utm_source/);
    assert.match(js, /SOURCE_STORAGE_KEY/);
    assert.match(js, /clicksBySource/);
    assert.match(js, /getCrmHref/);
    assert.match(js, /getContactsHref/);
    assert.match(js, /experiment\.replies \* 3/);
    assert.match(js, /experiment\.callsBooked \* 5/);
    assert.match(js, /experiment\.signups \* 10/);
  });

  it('ships testable landing pages for each market angle', async () => {
    for (const [name, path] of landingPages) {
      const html = await readFile(new URL(path, import.meta.url), 'utf8');

      assert.match(html, new RegExp(name.replaceAll('$', '\\$')));
      assert.match(html, /data-market-cta/);
      assert.match(html, /data-crm-link/);
      assert.match(html, /data-contacts-link/);
      assert.match(html, /landing\.css/);
      assert.match(html, /landing\.js/);
      assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
    }
  });

  it('lets landing pages increment counts locally and back them up through Gun', async () => {
    const js = await readFile(landingScriptUrl, 'utf8');

    assert.match(js, /incrementClick/);
    assert.match(js, /window\.localStorage/);
    assert.match(js, /createGunBackup/);
    assert.match(js, /backupToGun/);
    assert.match(js, /backupEventToGun/);
    assert.match(js, /getCrmHref/);
    assert.match(js, /getContactsHref/);
  });

  it('links Market Lab from the portal app dock', async () => {
    const html = await readFile(indexUrl, 'utf8');

    assert.match(html, /href="market-lab\/"/);
    assert.match(html, /<span class="app-card__title">Market Lab<\/span>/);
    assert.match(html, /signal scores, CTA clicks, replies, calls, and signups/);
  });
});
