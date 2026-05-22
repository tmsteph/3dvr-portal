import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../memory-capture/index.html', import.meta.url);
const appUrl = new URL('../memory-capture/app.js', import.meta.url);
const styleUrl = new URL('../memory-capture/style.css', import.meta.url);
const portalUrl = new URL('../index.html', import.meta.url);
const salesUrl = new URL('../sales/index.html', import.meta.url);

describe('Memory Capture app', () => {
  it('ships a low-energy capture app wired to CRM, proposals, and agent ops', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /Memory Capture \| 3dvr portal/);
    assert.match(html, /Brain dump first\. Organize later\./);
    assert.match(html, /Start dictation/);
    assert.match(html, /Record audio note/);
    assert.match(html, /Create CRM lead/);
    assert.match(html, /Create proposal/);
    assert.match(html, /Queue agent cleanup/);
    assert.match(html, /Proposal board/);
    assert.match(html, /proposalOpenCount/);
    assert.match(html, /proposalSentCount/);
    assert.match(html, /proposalWonCount/);
    assert.match(html, /proposalValue/);
    assert.match(html, /3dvr-portal\/memoryCapture\/captures/);
    assert.match(html, /agentOps\/3dvr-managed\/taskQueue/);
    assert.match(html, /app\.js/);
  });

  it('writes captures into the existing Gun-backed CRM and managed agent infrastructure', async () => {
    const js = await readFile(appUrl, 'utf8');

    assert.match(js, /CAPTURE_NODE = 'memoryCapture'/);
    assert.match(js, /PROPOSALS_NODE = 'proposals'/);
    assert.match(js, /CRM_NODE = '3dvr-crm'/);
    assert.match(js, /TOUCH_LOG_NODE = 'crm-touch-log'/);
    assert.match(js, /MANAGED_AGENT_OWNER_ALIAS = '3dvr-managed'/);
    assert.match(js, /SpeechRecognition|webkitSpeechRecognition/);
    assert.match(js, /MediaRecorder/);
    assert.match(js, /buildCrmRecord/);
    assert.match(js, /buildProposal/);
    assert.match(js, /renderProposals/);
    assert.match(js, /subscribeProposals/);
    assert.match(js, /PROPOSAL_STAGES/);
    assert.match(js, /updateProposalStage/);
    assert.match(js, /data-proposal-stage/);
    assert.match(js, /estimateProposalValue/);
    assert.match(js, /buildAgentTask/);
    assert.match(js, /taskQueue/);
    assert.match(js, /requiredCapabilities: 'codex,crm,gun'/);
  });

  it('keeps the app discoverable from the portal and sales hub', async () => {
    const portalHtml = await readFile(portalUrl, 'utf8');
    const salesHtml = await readFile(salesUrl, 'utf8');

    assert.match(portalHtml, /href="memory-capture\/"/);
    assert.match(portalHtml, /<span class="app-card__title">Memory Capture<\/span>/);
    assert.match(portalHtml, /Brain dump conversations into CRM leads, proposals, and 3dvr-agent cleanup tasks/);
    assert.match(salesHtml, /href="..\/memory-capture\/"/);
    assert.match(salesHtml, /Memory Capture/);
  });

  it('uses a mobile-friendly dark layout', async () => {
    const css = await readFile(styleUrl, 'utf8');

    assert.match(css, /--bg: #0d1117/);
    assert.match(css, /\.proposal-board/);
    assert.match(css, /\.proposal-stats/);
    assert.match(css, /\.proposal-actions/);
    assert.match(css, /@media \(max-width: 980px\)/);
    assert.match(css, /@media \(max-width: 680px\)/);
    assert.match(css, /grid-template-columns: 1fr/);
  });
});
