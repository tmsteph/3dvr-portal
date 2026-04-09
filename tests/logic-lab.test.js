import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../logic-lab/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('logic lab app', () => {
  it('ships the philosophy and logic workspace with the expected structure and scripts', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Philosophy &amp; Logic Lab \| 3DVR Portal/);
    assert.match(html, /Teach bots to define terms, separate facts from values/);
    assert.match(html, /id="reasoning-form"/);
    assert.match(html, /id="claim-input"/);
    assert.match(html, /id="goal-input"/);
    assert.match(html, /id="notes-input"/);
    assert.match(html, /id="scaffold-output"/);
    assert.match(html, /id="prompt-output"/);
    assert.match(html, /id="drill-list"/);
    assert.match(html, /id="session-list"/);
    assert.match(html, /Stored under <code>3dvr-portal\/philosophyLogic\/sessions<\/code> in Gun/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="\.\.\/auth-identity\.js"/);
    assert.match(html, /<script[^>]+src="\.\.\/score\.js"/);
    assert.match(html, /<script[^>]+src="\.\/app\.js"/);
  });

  it('ships a stylesheet tailored to the logic lab layout', async () => {
    const stylesUrl = new URL('styles.css', baseDir);
    assert.equal(await fileExists(stylesUrl), true, 'styles.css should exist');

    const css = await readFile(stylesUrl, 'utf8');
    assert.match(css, /\.logic-shell/);
    assert.match(css, /\.logic-layout/);
    assert.match(css, /\.discipline-grid/);
    assert.match(css, /\.drill-list/);
    assert.match(css, /\.session-list/);
    assert.match(css, /\.output-card/);
  });

  it('includes client logic for scaffolds, prompts, and Gun-backed session sync', async () => {
    const appUrl = new URL('app.js', baseDir);
    assert.equal(await fileExists(appUrl), true, 'app.js should exist');

    const js = await readFile(appUrl, 'utf8');
    assert.match(js, /window\.ScoreSystem && typeof window\.ScoreSystem\.ensureGun === 'function'/);
    assert.match(js, /ensureGuestIdentity/);
    assert.match(js, /seedDrills/);
    assert.match(js, /buildReasoningScaffold/);
    assert.match(js, /buildTrainingPrompt/);
    assert.match(js, /copyText/);
    assert.match(js, /portalRoot\.get\('philosophyLogic'\)\.get\('sessions'\)/);
    assert.match(js, /sessionsNode\.get\(sessionId\)\.put\(session/);
    assert.match(js, /Saved locally and synced to Gun\./);
  });

  it('registers Logic Lab in the portal dock near Learn and Meditation', async () => {
    const portalIndex = new URL('../index.html', baseDir);
    assert.equal(await fileExists(portalIndex), true, 'root index.html should exist');

    const html = await readFile(portalIndex, 'utf8');
    const learnIndex = html.indexOf('>Learn<');
    const logicIndex = html.indexOf('>Logic Lab<');
    const meditationIndex = html.indexOf('>Meditation<');
    assert.ok(logicIndex !== -1, 'Logic Lab app card should be listed on the portal');
    assert.ok(learnIndex !== -1, 'Learn app card should still be present');
    assert.ok(meditationIndex !== -1, 'Meditation app card should still be present');
    assert.ok(learnIndex < logicIndex, 'Logic Lab should render after Learn');
    assert.ok(logicIndex < meditationIndex, 'Logic Lab should render before Meditation');
    assert.match(html, /href="logic-lab\/(?:index\.html)?"/);
  });

  it('adds Logic Lab to the installable app list in the README', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    assert.match(readme, /\[Logic Lab\]\(https:\/\/3dvr-portal\.vercel\.app\/logic-lab\/\)/);
  });
});
