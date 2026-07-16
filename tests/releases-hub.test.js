import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../releases/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('release hub backfill', () => {
  it('updates the release index with the weekly milestones through v0.0.54', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'releases/index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Latest Release/);
    assert.match(html, /href="v0\.0\.54\.html">v0\.0\.54</);
    assert.match(html, /Week of July 13, 2026/);
    assert.match(html, /personalized previews/);
    assert.match(html, /href="v0\.0\.53\.html">v0\.0\.53</);
    assert.match(html, /Week of July 6, 2026/);
    assert.match(html, /Free Page<\/a> starter offer/);
    assert.match(html, /href="v0\.0\.52\.html">v0\.0\.52</);
    assert.match(html, /Week of June 29, 2026/);
    assert.match(html, /href="\.\.\/life\/index\.html">Daily Direction</);
    assert.match(html, /href="\.\.\/friends-family\/">Friends &amp; Family Pass</);
    assert.match(html, /href="\.\.\/docs\/3dvr-long-term-plan-roadmap\.md">long-term roadmap</);
    assert.match(html, /href="\.\.\/docs\/no-account-stripe-payment-plan\.md">no-account Stripe payment plan</);
    assert.match(html, /href="v0\.0\.51\.html">v0\.0\.51</);
    assert.match(html, /Week of June 22, 2026/);
    assert.match(html, /href="\.\.\/forge\/">3DVR Forge</);
    assert.match(html, /href="\.\.\/money-printer\/">money-printer</);
    assert.match(html, /href="\.\.\/ideas\/forge-revenue-sprint\.html">Forge Revenue Sprint</);
    assert.match(html, /href="\.\.\/ideas\/freelance-portfolio-validation-sprint\.html">Portfolio Validation Sprint</);
    assert.match(html, /href="\.\.\/growth-operator\/">Growth Operator</);
    assert.match(html, /href="v0\.0\.50\.html">v0\.0\.50</);
    assert.match(html, /Week of June 15, 2026/);
    assert.match(html, /Launch Site/);
    assert.match(html, /custom-domain publishing/);
    assert.match(html, /href="\.\.\/sober-spark\/">Sober Spark</);
    assert.match(html, /href="\.\.\/projects\/">Seed Deck</);
    assert.match(html, /href="v0\.0\.49\.html">v0\.0\.49</);
    assert.match(html, /Week of June 8, 2026/);
    assert.match(html, /Stellar Drift/);
    assert.match(html, /href="\.\.\/games\.html">Games<\/a> hub polish/);
    assert.match(html, /href="v0\.0\.48\.html">v0\.0\.48</);
    assert.match(html, /Week of June 1, 2026/);
    assert.match(html, /Wellness and consciousness apps/);
    assert.match(html, /GunJS backup tooling/);
    assert.match(html, /href="\.\.\/intention-lab\/">Intention Lab</);
    assert.match(html, /href="\.\.\/games\.html">Games</);
    assert.match(html, /href="v0\.0\.47\.html">v0\.0\.47</);
    assert.match(html, /Week of May 25, 2026/);
    assert.match(html, /Revenue Desk/);
    assert.match(html, /WebRTC reliability/);
    assert.match(html, /href="v0\.0\.46\.html">v0\.0\.46</);
    assert.match(html, /Week of May 18, 2026/);
    assert.match(html, /Guest identity cleanup/);
    assert.match(html, /3dvr home grid/);
    assert.match(html, /href="v0\.0\.45\.html">v0\.0\.45</);
    assert.match(html, /Week of May 11, 2026/);
    assert.match(html, /billing plan selection/);
    assert.match(html, /agent worker scaling/);
    assert.match(html, /href="v0\.0\.44\.html">v0\.0\.44</);
    assert.match(html, /Week of May 4, 2026/);
    assert.match(html, /Video meeting operations/);
    assert.match(html, /href="v0\.0\.43\.html">v0\.0\.43</);
    assert.match(html, /1\.0\.1-beta\.2/);
    assert.match(html, /href="v0\.0\.42\.html">v0\.0\.42</);
    assert.match(html, /Week of April 20, 2026/);
    assert.match(html, /pre-release notes/i);
    assert.match(html, /href="v0\.0\.41\.html">v0\.0\.41</);
    assert.match(html, /Week of April 13, 2026/);
    assert.match(html, /Pocket Workstation/i);
    assert.match(html, /href="v0\.0\.40\.html">v0\.0\.40</);
    assert.match(html, /Logic Lab/);
    assert.match(html, /href="v0\.0\.39\.html">v0\.0\.39</);
    assert.match(html, /href="v0\.0\.38\.html">v0\.0\.38</);
    assert.match(html, /href="v0\.0\.37\.html">v0\.0\.37</);
    assert.match(html, /href="v0\.0\.36\.html">v0\.0\.36</);
  });

  it('links v0.0.35 forward into the new retroactive chain', async () => {
    const html = await readFile(new URL('v0.0.35.html', baseDir), 'utf8');
    assert.match(html, /href="v0\.0\.34\.html"/);
    assert.match(html, /href="v0\.0\.36\.html"/);
  });

  it('ships the new milestone pages with coherent navigation, summaries, and source links', async () => {
    const releases = [
      ['v0.0.54.html', /Week of July 13, 2026/, /Personalized preview funnel/i, /aria-disabled="true"/],
      ['v0.0.53.html', /Week of July 6, 2026/, /Money Printer becomes an operating loop/i, /href="v0\.0\.54\.html"/],
      ['v0.0.52.html', /Week of June 29, 2026/, /Free-first portal and Monday release path/i, /pull\/977/],
      ['v0.0.51.html', /Week of June 22, 2026/, /Money Printer and paid sprint paths/i, /href="v0\.0\.52\.html"/],
      ['v0.0.50.html', /Week of June 15, 2026/, /Launch Site publishing/i, /href="v0\.0\.51\.html"/],
      ['v0.0.49.html', /Week of June 8, 2026/, /Games and flight controls/i, /href="v0\.0\.50\.html"/],
      ['v0.0.48.html', /Week of June 1, 2026/, /Focus Flow direction/i, /href="v0\.0\.49\.html"/],
      ['v0.0.47.html', /Week of May 25, 2026/, /Market Lab/i, /href="v0\.0\.48\.html"/],
      ['v0.0.46.html', /Week of May 18, 2026/, /Pure Gun media/i, /3dvr-web\/pull\/185/],
      ['v0.0.45.html', /Week of May 11, 2026/, /tenant-aware task scheduling/i, /3dvr-agent\/commit\/ec7c967/],
      ['v0.0.44.html', /Week of May 4, 2026/, /3dvr-agent outreach phases/i, /3dvr-agent\/pull\/49/],
      ['v0.0.43.html', /Week of May 4, 2026/, /1\.0\.1-beta\.2/, /href="v0\.0\.44\.html"/],
      ['v0.0.42.html', /Week of April 20, 2026/, /pre-release notes/i, /aria-disabled="true"/],
      ['v0.0.36.html', /Late January 2026/, /social planning/i, /href="v0\.0\.37\.html"/],
      ['v0.0.37.html', /Mid February 2026/, /Money Autopilot/i, /href="v0\.0\.38\.html"/],
      ['v0.0.38.html', /Late March 2026/, /Email Operator/i, /href="v0\.0\.39\.html"/],
      ['v0.0.39.html', /Week of March 30, 2026/, /profitability/i, /href="v0\.0\.40\.html"/],
      ['v0.0.40.html', /Week of April 6, 2026/, /Logic Lab/i, /href="v0\.0\.41\.html"/],
      ['v0.0.41.html', /Week of April 13, 2026/, /Pocket Workstation/i, /href="v0\.0\.42\.html"/],
    ];

    for (const [filename, datePattern, topicPattern, navPattern] of releases) {
      const url = new URL(filename, baseDir);
      assert.equal(await fileExists(url), true, `${filename} should exist`);
      const html = await readFile(url, 'utf8');
      assert.match(html, /<nav class="release-nav" aria-label="Release navigation">/);
      assert.match(html, datePattern);
      assert.match(html, topicPattern);
      assert.match(html, navPattern);
    }
  });

  it('links shipped apps and docs inline where the release summaries mention them', async () => {
    const release54 = await readFile(new URL('v0.0.54.html', baseDir), 'utf8');
    const release53 = await readFile(new URL('v0.0.53.html', baseDir), 'utf8');
    const release52 = await readFile(new URL('v0.0.52.html', baseDir), 'utf8');
    const release51 = await readFile(new URL('v0.0.51.html', baseDir), 'utf8');
    const release50 = await readFile(new URL('v0.0.50.html', baseDir), 'utf8');
    const release49 = await readFile(new URL('v0.0.49.html', baseDir), 'utf8');
    const release47 = await readFile(new URL('v0.0.47.html', baseDir), 'utf8');
    const release48 = await readFile(new URL('v0.0.48.html', baseDir), 'utf8');

    assert.match(release54, /href="\.\.\/free-page\/">Free Page</);
    assert.match(release54, /href="\.\.\/free-page\/preview\/">personalized Free Page previews</);
    assert.match(release54, /href="\.\.\/research\/">research desk</);
    assert.match(release54, /pull\/1144/);
    assert.match(release54, /pull\/1155/);

    assert.match(release53, /href="\.\.\/growth-desk\/">Growth Desk</);
    assert.match(release53, /href="\.\.\/money-printer\/">Money Printer</);
    assert.match(release53, /href="\.\.\/offer-garden\/">Offer Garden</);
    assert.match(release53, /href="\.\.\/signal-garden\/">Signal Garden</);
    assert.match(release53, /href="\.\.\/career-launch\/">Career Launch</);
    assert.match(release53, /pull\/1025/);
    assert.match(release53, /pull\/1143/);

    assert.match(release52, /href="\.\.\/friends-family\/">Friends &amp; Family Pass</);
    assert.match(release52, /href="\.\.\/life\/index\.html">Daily Direction</);
    assert.match(release52, /href="\.\.\/index\.html">portal home</);
    assert.match(release52, /href="\.\.\/forge\/">3DVR Forge</);
    assert.match(release52, /href="\.\.\/string-theory\/">String Theory Visualizer</);
    assert.match(release52, /href="\.\.\/docs\/3dvr-long-term-plan-roadmap\.md">3DVR Long-Term Plan and Roadmap</);
    assert.match(release52, /href="\.\.\/docs\/no-account-stripe-payment-plan\.md">No-Account Stripe Payment Plan</);
    assert.match(release52, /The portal is easier to start, easier to recover, and clearer about the next money path/);
    assert.match(release52, /Monday,\s+July 6, 2026/);
    assert.match(release52, /pull\/906/);
    assert.match(release52, /pull\/977/);

    assert.match(release51, /href="\.\.\/crm\/">CRM</);
    assert.match(release51, /href="\.\.\/games\.html">Games</);
    assert.match(release51, /href="\.\.\/purpose-movement\/">Purpose Movement</);
    assert.match(release51, /href="\.\.\/launch-room\/">Launch Room</);
    assert.match(release51, /href="\.\.\/3dvr-connect\/">3DVR Connect</);
    assert.match(release51, /href="\.\.\/fascia-release\/">Fascia Release</);
    assert.match(release51, /href="\.\.\/3dvr-girl\/">3DVR Girl</);
    assert.match(release51, /href="\.\.\/money-printer\/">money-printer</);
    assert.match(release51, /href="\.\.\/ideas\/offer-audit\.html">Offer Audit</);
    assert.match(release51, /href="\.\.\/forge\/">3DVR Forge</);
    assert.match(release51, /href="\.\.\/ideas\/forge-revenue-sprint\.html">Forge Revenue Sprint</);
    assert.match(release51, /href="\.\.\/ideas\/freelance-portfolio-validation-sprint\.html">Portfolio Validation Sprint</);
    assert.match(release51, /href="\.\.\/growth-operator\/">Growth Operator</);
    assert.match(release51, /pull\/738/);
    assert.match(release51, /pull\/905/);

    assert.match(release50, /href="\.\.\/web-builder-app\/">Launch Site</);
    assert.match(release50, /href="\.\.\/sober-spark\/">Sober Spark</);
    assert.match(release50, /href="\.\.\/projects\/">Seed Deck</);
    assert.match(release50, /href="\.\.\/vr-portal\/">Spatial VR Portal</);
    assert.match(release50, /pull\/734/);
    assert.match(release50, /pull\/737/);

    assert.match(release49, /href="\.\.\/stellar-flight\.html">Stellar Drift</);
    assert.match(release49, /href="\.\.\/games\.html">Games</);
    assert.match(release49, /href="\.\.\/pong\.html">Pong Arena</);
    assert.match(release49, /href="\.\.\/meditation\/affirmations\.html">Manifestation Practice</);
    assert.match(release49, /href="\.\.\/3dvr-girl\/">3DVR Girl</);
    assert.match(release49, /pull\/673/);
    assert.match(release49, /pull\/703/);

    assert.doesNotMatch(release47, /<h2>Open the Work<\/h2>/);
    assert.match(release47, /href="\.\.\/revenue-desk\/">Revenue Desk</);
    assert.match(release47, /href="\.\.\/market-lab\/">Market Lab</);
    assert.match(release47, /href="\.\.\/webrtc-lab\/">WebRTC Lab</);
    assert.match(release47, /href="\.\.\/docs\/path-to-profitability\.md">path-to-profitability docs</);
    assert.match(release47, /<strong>Revenue and market systems:<\/strong>[\s\S]*href="\.\.\/market-lab\/"/);

    assert.doesNotMatch(release48, /<h2>Open the Work<\/h2>/);
    assert.match(release48, /href="\.\.\/intention-lab\/">Intention Lab</);
    assert.match(release48, /href="\.\.\/body-mode\/">Body Mode</);
    assert.match(release48, /href="\.\.\/portal-lab\/">Portal Lab</);
    assert.match(release48, /href="\.\.\/inner-alignment\/">Inner Alignment</);
    assert.match(release48, /href="\.\.\/life-force-room\/">Life Force Room</);
    assert.match(release48, /href="\.\.\/master-key-room\/">Master Key Room</);
    assert.match(release48, /href="\.\.\/games\.html">Games</);
    assert.match(release48, /href="\.\.\/stellar-flight\.html">Stellar Drift</);
    assert.match(release48, /<strong>Wellness and consciousness apps:<\/strong>[\s\S]*href="\.\.\/intention-lab\/"/);
    assert.match(release48, /pull\/672/);
  });
});
