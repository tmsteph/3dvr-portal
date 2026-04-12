import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../pocket-workstation/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('pocket workstation app', () => {
  it('ships the workstation workspace with dashboard, notes, commands, projects, and helper sections', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /3dvr Pocket Workstation \| 3DVR Portal/);
    assert.match(html, /Turn your phone into a builder console\./);
    assert.match(html, /id="dashboard-title"/);
    assert.match(html, /id="notes-title"/);
    assert.match(html, /id="commands-title"/);
    assert.match(html, /id="projects-title"/);
    assert.match(html, /id="helper-title"/);
    assert.match(html, /id="note-form"/);
    assert.match(html, /id="command-form"/);
    assert.match(html, /id="project-form"/);
    assert.match(html, /id="helper-form"/);
    assert.match(html, /Current identity/);
    assert.match(html, /Shared Gun paths/);
    assert.match(html, /3dvr-portal\/pocketWorkstation\/users\/&lt;identity&gt;\/notes/);
    assert.match(html, /curl -s https:\/\/3dvr\.tech\/install \| bash/);
    assert.match(html, /<script[^>]+src="\.\.\/auth-identity\.js"/);
    assert.match(html, /<script[^>]+src="\.\.\/score\.js"/);
    assert.match(html, /<script[^>]+src="\.\/app\.js"/);
  });

  it('ships dedicated styling for the workstation dashboard', async () => {
    const cssUrl = new URL('styles.css', baseDir);
    assert.equal(await fileExists(cssUrl), true, 'styles.css should exist');

    const css = await readFile(cssUrl, 'utf8');
    assert.match(css, /\.workstation-hero/);
    assert.match(css, /\.summary-grid/);
    assert.match(css, /\.workstation-grid/);
    assert.match(css, /\.record-list/);
    assert.match(css, /\.roadmap-grid/);
  });

  it('includes client logic for Gun-backed sync and helper generation', async () => {
    const appUrl = new URL('app.js', baseDir);
    assert.equal(await fileExists(appUrl), true, 'app.js should exist');

    const js = await readFile(appUrl, 'utf8');
    assert.match(js, /APP_ROOT_PATH = \['3dvr-portal', 'pocketWorkstation', 'users'\]/);
    assert.match(js, /window\.ScoreSystem && typeof window\.ScoreSystem\.ensureGun === 'function'/);
    assert.match(js, /resolveIdentity/);
    assert.match(js, /buildHelperResult/);
    assert.match(js, /renderHelper/);
    assert.match(js, /getUserNode\(type\)/);
    assert.match(js, /node\.get\(record\.id\)\.put\(record, ack =>/);
    assert.match(js, /node\.map\(\)\.on\(\(data, key\) =>/);
    assert.match(js, /Saved locally and synced to Gun\./);
  });

  it('registers Pocket Workstation in the portal dock near Notes and Projects', async () => {
    const portalIndex = new URL('../index.html', baseDir);
    const html = await readFile(portalIndex, 'utf8');
    const notesIndex = html.indexOf('>Notes<');
    const workstationIndex = html.indexOf('>Pocket Workstation<');
    const projectsIndex = html.indexOf('>Projects<');
    assert.ok(workstationIndex !== -1, 'Pocket Workstation app card should be listed on the portal');
    assert.ok(notesIndex !== -1, 'Notes app card should still be present');
    assert.ok(projectsIndex !== -1, 'Projects app card should still be present');
    assert.ok(notesIndex < workstationIndex, 'Pocket Workstation should render after Notes');
    assert.ok(workstationIndex < projectsIndex, 'Pocket Workstation should render before Projects');
    assert.match(html, /href="pocket-workstation\/(?:index\.html)?"/);
  });

  it('adds Pocket Workstation to the installable app list in the README', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    assert.match(readme, /\[Pocket Workstation\]\(https:\/\/3dvr-portal\.vercel\.app\/pocket-workstation\/\)/);
  });
});
