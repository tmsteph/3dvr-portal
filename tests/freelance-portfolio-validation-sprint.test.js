import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const rootDir = new URL('../', import.meta.url);
const sprintPageUrl = new URL('ideas/freelance-portfolio-validation-sprint.html', rootDir);
const ideasIndexUrl = new URL('ideas/index.html', rootDir);
const portalIndexUrl = new URL('index.html', rootDir);
const growthOperatorUrl = new URL('growth-operator/app.js', rootDir);

async function fileExists(url) {
  try {
    await access(url, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('Freelance Portfolio Validation Sprint offer', () => {
  it('ships a buyable paid sprint page with Gun-backed intake', async () => {
    assert.equal(await fileExists(sprintPageUrl), true, 'portfolio validation sprint page should exist');
    const html = await readFile(sprintPageUrl, 'utf8');

    assert.match(html, /Freelance Portfolio Validation Sprint/);
    assert.match(html, /Turn one hidden skill into a proof piece clients can react to\./);
    assert.match(html, /\$500 validation sprint/);
    assert.match(html, /7-day delivery/);
    assert.match(html, /Proof-piece brief/);
    assert.match(html, /Portfolio proof copy/);
    assert.match(html, /Buyer feedback script/);
    assert.match(html, /Paid pilot offer/);
    assert.match(html, /Start \$500 sprint/);
    assert.match(html, /redirect=%2Fbilling%2F%3Fplan%3Dcustom%26amount%3D500/);
    assert.match(html, /label%3DFreelance%2520Portfolio%2520Validation%2520Sprint/);
    assert.match(html, /data-audience-key="freelance-portfolio-validation-sprint"/);
    assert.match(html, /3dvr-audience-tests\/v1\/freelance-portfolio-validation-sprint\/signups/);
    assert.match(html, /Web Designer Academy pricing report/);
    assert.match(html, /Upwork freelancing stats/);
  });

  it('links the sprint from Ideas Lab, portal search, and Growth Operator imports', async () => {
    const [ideas, portal, growthOperator] = await Promise.all([
      readFile(ideasIndexUrl, 'utf8'),
      readFile(portalIndexUrl, 'utf8'),
      readFile(growthOperatorUrl, 'utf8')
    ]);

    assert.match(ideas, /\/ideas\/freelance-portfolio-validation-sprint\.html/);
    assert.match(ideas, /A \$500 paid sprint for freelance designers/);
    assert.match(portal, /ideas\/freelance-portfolio-validation-sprint\.html/);
    assert.match(portal, /Portfolio Validation Sprint/);
    assert.match(portal, /data-app-keywords="[^"]*portfolio validation sprint[^"]*paid pilot/);
    assert.match(growthOperator, /key: 'freelance-portfolio-validation-sprint'/);
    assert.match(growthOperator, /\$500 Freelance Portfolio Validation Sprint/);
  });
});
