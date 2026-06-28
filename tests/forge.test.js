import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('3DVR Forge product route', () => {
  it('ships a prompt-first guest Forge shell', async () => {
    const html = await readFile(new URL('../forge/index.html', import.meta.url), 'utf8');

    assert.match(html, /<title>3DVR Forge \| Turn frustration into a project<\/title>/);
    assert.match(html, /href="\.\.\/index\.html">Portal<\/a>/);
    assert.match(html, /href="\.\.\/launch-room\/">Launch Room<\/a>/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
    assert.match(html, /src="\/gun-init\.js"/);
    assert.match(html, /3DVR Forge/);
    assert.match(html, /What(?:&rsquo;|’)s been bothering you lately\?/);
    assert.match(html, /data-forge-form/);
    assert.match(html, /data-forge-answer/);
    assert.match(html, /data-forge-progress/);
    assert.match(html, /data-guidance-panel/);
    assert.match(html, /data-spark-idea>Spark idea<\/button>/);
    assert.match(html, /Forge read/);
    assert.match(html, /autofocus/);
    assert.match(html, /Send to Forge/);
    assert.match(html, /Ready\./);
    assert.match(html, /data-brief-output/);
    assert.match(html, /data-brief-status/);
    assert.match(html, /aria-label="Copy Movement Brief">Copy<\/button>/);
    assert.match(html, /aria-label="Download Movement Brief as Markdown">Download<\/button>/);
    assert.match(html, /aria-label="Forge another brief">New brief<\/button>/);
    assert.match(html, /Sell this next/);
    assert.match(html, /Turn this brief into a paid launch sprint\./);
    assert.match(html, /href="\.\.\/sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dpro">Start \$20 Founder<\/a>/);
    assert.match(html, /href="\.\.\/sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dbuilder">Go \$50 Builder<\/a>/);
    assert.match(html, /href="\.\.\/sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dcustom">Custom deposit<\/a>/);
    assert.match(html, /Make test message/);
    assert.match(html, /Make Codex prompt/);
    assert.match(html, /Make landing page copy/);
    assert.match(html, /Make 7-day checklist/);
    assert.doesNotMatch(html, /data-enter-forge/);
    assert.doesNotMatch(html, /<section class="forge-hero"/);
    assert.doesNotMatch(html, /Rant\. Reflect\. Forge a project\./);
    assert.doesNotMatch(html, /Readable output/);
    assert.match(html, /sign-in\.html\?redirect=%2Fbilling/);
    assert.doesNotMatch(html, /create an account/i);
  });

  it('uses the Forge API first and keeps local fallback behavior', async () => {
    const app = await readFile(new URL('../forge/app.js', import.meta.url), 'utf8');

    assert.match(app, /import \{ readDefaultSecret \} from '\.\.\/web-builder-app\/defaults\.js'/);
    assert.match(app, /const STORAGE_KEY = '3dvr\.forge\.session\.v1'/);
    assert.match(app, /const FORGE_GUN_SESSION_ID_KEY = '3dvr\.forge\.sessionId\.v1'/);
    assert.match(app, /const FORGE_MODEL = 'gpt-4\.1-mini'/);
    assert.match(app, /const starterSparks = \[/);
    assert.match(app, /SHARED_DEFAULTS_WAIT_MS/);
    assert.match(app, /const portalRoot = gun\?\.get\('3dvr-portal'\)/);
    assert.match(app, /const forgeSessionsNode = portalRoot\?\.get\('forge'\)\?\.get\('sessions'\)/);
    assert.match(app, /stage:\s*stage\.INITIAL/);
    assert.match(app, /guidance:\s*null/);
    assert.match(app, /INTRO: 'intro'/);
    assert.match(app, /INITIAL: 'initial'/);
    assert.match(app, /FOLLOWUPS: 'followups'/);
    assert.match(app, /GENERATING: 'generating'/);
    assert.match(app, /BRIEF: 'brief'/);
    assert.match(app, /document\.body\.dataset\.forgeStage = session\.stage/);
    assert.match(app, /refs\.conversationPanel\.hidden = session\.stage === stage\.BRIEF/);
    assert.match(app, /refs\.spark\.hidden = isBusy \|\| Boolean\(session\.initial\) \|\| session\.stage !== stage\.INITIAL/);
    assert.match(app, /refs\.reset\.hidden = !session\.initial && session\.stage === stage\.INITIAL/);
    assert.match(app, /if \(!session\.initial\) return/);
    assert.match(app, /button:\s*'Send to Forge'/);
    assert.match(app, /subscribeToSharedDefaults/);
    assert.match(app, /waitForSharedSecret\('openai'/);
    assert.match(app, /readDefaultSecret\(data, 'openai'\)/);
    assert.match(app, /function resolveForgeSessionId\(\)/);
    assert.match(app, /function resolveForgeActorKey\(\)/);
    assert.match(app, /function serializeSessionForGun\(snapshot\)/);
    assert.match(app, /payload:\s*JSON\.stringify\(snapshot\)/);
    assert.match(app, /forgeSessionsNode\.get\(forgeActorKey\)\.get\('latest'\)\.put/);
    assert.match(app, /function parseGunSessionRecord\(record\)/);
    assert.match(app, /function loadGunSession\(\)/);
    assert.match(app, /function clearGunSession\(\)/);
    assert.match(app, /cleared:\s*true/);
    assert.match(app, /loadGunSession\(\)/);
    assert.match(app, /fetch\('\/api\/openai-site'/);
    assert.match(app, /forge:\s*true/);
    assert.match(app, /requestForge\('followups'/);
    assert.match(app, /requestForge\('brief'/);
    assert.match(app, /function buildLocalForgeGuidance\(initial = ''\)/);
    assert.match(app, /function normalizeForgeGuidanceResponse/);
    assert.match(app, /function mergeFollowUpsResponse\(value, lockedCount = 0\)/);
    assert.match(app, /function refineForgeTurn\(\)/);
    assert.match(app, /function formatGuidanceMessage\(guidance\)/);
    assert.match(app, /function renderGuidance\(\)/);
    assert.match(app, /function renderProgress\(\)/);
    assert.match(app, /function sparkIdea\(\)/);
    assert.match(app, /Spark loaded\. Edit it or send it\./);
    assert.match(app, /Question \$\{active\} of \$\{total\}/);
    assert.match(app, /What I see:/);
    assert.match(app, /Possible solution paths:/);
    assert.match(app, /Do next:/);
    assert.match(app, /Updating solution paths from your answer/);
    assert.match(app, /Forge updated the solution paths/);
    assert.match(app, /function chooseFollowUps\(initial\)/);
    assert.match(app, /function buildMockMovementBrief\(currentSession\)/);
    assert.match(app, /normalizeFollowUpsResponse/);
    assert.match(app, /normalizeBriefResponse/);
    assert.match(app, /Local fallback brief ready/);
    assert.match(app, /Local solution paths loaded/);
    assert.match(app, /Forge suggested first solution paths/);
    assert.match(app, /7-Day Revenue Signal Test/);
    assert.match(app, /This is cash pressure, not a giant product problem yet/);
    assert.match(app, /paid micro-offer and direct outreach test/);
    assert.doesNotMatch(app, /data-enter-forge/);
    assert.match(app, /Who else has this problem\?/);
    assert.match(app, /What have you already tried\?/);
    assert.match(app, /What would a tiny version look like in 7 days\?/);
    assert.match(app, /What skills or resources do you already have\?/);
    assert.match(app, /Do you want this to become a tool, service, community, content project, or business\?/);

    [
      'Project Name',
      'Core Frustration',
      'Audience',
      'Project Concept',
      'Tiny 7-Day Experiment',
      'First 3 Actions',
      'Test Message',
      'Codex Build Prompt',
      'Reality Check',
    ].forEach((section) => {
      assert.match(app, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    assert.match(app, /Good raw material\. Too vague right now/);
    assert.match(app, /This is probably not a startup yet\. It is a test\./);
    assert.match(app, /Do not build an app yet/);
    assert.match(app, /navigator\.clipboard\.writeText/);
    assert.match(app, /type: 'text\/markdown'/);
    assert.match(app, /safeWriteStorage\(STORAGE_KEY/);
    assert.doesNotMatch(app, /JSON\.stringify\(sharedSecrets\)/);
    assert.doesNotMatch(app, /payload:\s*JSON\.stringify\([^)]*sharedSecrets/);
  });

  it('keeps the Forge CSS mobile-safe and free from viewport-width overflow traps', async () => {
    const css = await readFile(new URL('../forge/styles.css', import.meta.url), 'utf8');

    assert.match(css, /html,\s*body\s*\{\s*overflow-x:\s*hidden;/);
    assert.match(css, /\.forge-shell\s*\{\s*width:\s*min\(100%,\s*1180px\);/);
    assert.match(css, /\.forge-workspace\s*\{\s*display:\s*grid;/);
    assert.match(css, /width:\s*min\(100%,\s*760px\);/);
    assert.match(css, /body\[data-forge-stage="brief"\]\s+\.forge-workspace/);
    assert.match(css, /\.forge-transcript:empty/);
    assert.match(css, /\.forge-page\s+\[hidden\]\s*\{[\s\S]*?display:\s*none !important;/);
    assert.match(css, /\.forge-progress\s*\{/);
    assert.match(css, /\.forge-guidance\s*\{/);
    assert.match(css, /\.forge-spark\s*\{/);
    assert.match(css, /\.forge-message p\s*\{[\s\S]*?white-space:\s*pre-wrap;/);
    assert.match(css, /\.forge-offer\s*\{/);
    assert.match(css, /\.forge-offer__actions/);
    assert.match(css, /\.forge-brief__actions\s*\{/);
    assert.match(css, /\.forge-next-moves__buttons\s*\{/);
    assert.match(css, /min-width:\s*0/);
    assert.match(css, /@media \(min-width: 940px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
    assert.doesNotMatch(css, /width:\s*100vw/);
    assert.doesNotMatch(css, /(^|[;{]\s*)min-width:\s*\d{3,}px/m);
  });

  it('promotes Forge from the portal without changing the workshop default', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    assert.match(html, /data-view-mode="workshop" data-active-room=""/);
    assert.match(html, /<a href="forge\/">Forge<\/a>/);
    assert.match(html, /href="forge\/" class="cta primary">Enter the Forge<\/a>/);
    assert.match(html, /href="forge\/" class="app-card" data-app-keywords="[^"]*\bfrustration\b[^"]*\bmovement brief\b[^"]*"/);
    assert.match(html, /<span class="app-card__title">3DVR Forge<\/span>/);
    assert.match(html, /Rant, reflect, and turn messy thoughts into a Movement Brief and 7-day test\./);
    assert.match(html, /href="sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dpro"[\s\S]*?<span class="app-card__title">Forge Sprint<\/span>/);
    assert.match(html, /Turn a Movement Brief into a paid offer test, first messages, and a tiny launch artifact\./);
    assert.match(html, /projects:\s*\[[\s\S]*?'3DVR Forge'/);
    assert.match(html, /projects:\s*\[[\s\S]*?'Forge Sprint'/);
    assert.match(html, /money:\s*\[[\s\S]*?'Forge Sprint'/);
  });
});
