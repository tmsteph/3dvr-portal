import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../webrtc-lab/', import.meta.url);
const gunVideoDir = new URL('../gun-video-lab/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('WebRTC Lab app', () => {
  it('ships a native WebRTC proof of concept with Gun signaling', async () => {
    const indexUrl = new URL('index.html', appDir);
    const stylesUrl = new URL('styles.css', appDir);
    const appUrl = new URL('app.js', appDir);
    const readmeUrl = new URL('README.md', appDir);

    assert.equal(await fileExists(indexUrl), true, 'WebRTC Lab index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'WebRTC Lab styles should exist');
    assert.equal(await fileExists(appUrl), true, 'WebRTC Lab app script should exist');
    assert.equal(await fileExists(readmeUrl), true, 'WebRTC Lab README should exist');

    const html = await readFile(indexUrl, 'utf8');
    const js = await readFile(appUrl, 'utf8');
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(html, /3DVR WebRTC Lab \| Portal/);
    assert.match(html, /Native WebRTC POC/);
    assert.match(html, /id="local-video"/);
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"><\/script>/);
    assert.match(html, /<script src="\.\/app\.js"><\/script>/);
    assert.match(js, /new RTCPeerConnection\(\{ iceServers: ICE_SERVERS \}\)/);
    assert.match(js, /navigator\.mediaDevices\.getUserMedia/);
    assert.match(js, /ROOM_ROOT = '3dvr-webrtc-lab'/);
    assert.match(js, /signalsNode\.map\(\)\.on\(handleSignal\)/);
    assert.match(js, /participantsNode\.map\(\)\.on/);
    assert.match(readme, /Mesh WebRTC/);
  });

  it('registers the lab in the portal and existing video hub', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');
    const videoHome = await readFile(new URL('../portal.3dvr.tech/video/index.html', appDir), 'utf8');

    assert.match(portalHtml, /href="webrtc-lab\/"/);
    assert.match(portalHtml, />WebRTC Lab</);
    assert.match(readme, /\[WebRTC Lab\]\(https:\/\/3dvr-portal\.vercel\.app\/webrtc-lab\/\)/);
    assert.match(videoHome, /href="\/webrtc-lab\/"/);
    assert.match(videoHome, /Native WebRTC Lab/);
  });
});

describe('Gun Video Lab app', () => {
  it('ships a Gun-backed frame streaming proof of concept', async () => {
    const indexUrl = new URL('index.html', gunVideoDir);
    const stylesUrl = new URL('styles.css', gunVideoDir);
    const appUrl = new URL('app.js', gunVideoDir);
    const readmeUrl = new URL('README.md', gunVideoDir);

    assert.equal(await fileExists(indexUrl), true, 'Gun Video Lab index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'Gun Video Lab styles should exist');
    assert.equal(await fileExists(appUrl), true, 'Gun Video Lab app script should exist');
    assert.equal(await fileExists(readmeUrl), true, 'Gun Video Lab README should exist');

    const html = await readFile(indexUrl, 'utf8');
    const js = await readFile(appUrl, 'utf8');
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(html, /3DVR Gun Video Lab \| Portal/);
    assert.match(html, /Gun Frame Stream/);
    assert.match(html, /id="capture-canvas"/);
    assert.match(html, /id="remote-frame"/);
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"><\/script>/);
    assert.match(js, /ROOM_ROOT = '3dvr-gun-video-lab'/);
    assert.match(js, /canvas\.toDataURL\('image\/jpeg', quality\)/);
    assert.match(js, /framesNode\.get\(localId\)\.put/);
    assert.match(js, /framesNode\.map\(\)\.on/);
    assert.match(readme, /Writes the latest frame to `3dvr-gun-video-lab\/<room>\/frames\/<participantId>`/);
  });

  it('registers the Gun Video Lab next to the WebRTC lab', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');
    const videoHome = await readFile(new URL('../portal.3dvr.tech/video/index.html', appDir), 'utf8');

    const webrtcIndex = portalHtml.indexOf('>WebRTC Lab<');
    const gunVideoIndex = portalHtml.indexOf('>Gun Video Lab<');
    const wellnessIndex = portalHtml.indexOf('>Wellness<');

    assert.ok(gunVideoIndex !== -1, 'Gun Video Lab app card should be listed on the portal');
    assert.ok(webrtcIndex !== -1, 'WebRTC Lab app card should still be listed');
    assert.ok(wellnessIndex !== -1, 'Wellness app card should still be listed');
    assert.ok(webrtcIndex < gunVideoIndex, 'Gun Video Lab should render after WebRTC Lab');
    assert.ok(gunVideoIndex < wellnessIndex, 'Gun Video Lab should render before Wellness');
    assert.match(readme, /\[Gun Video Lab\]\(https:\/\/3dvr-portal\.vercel\.app\/gun-video-lab\/\)/);
    assert.match(videoHome, /href="\/gun-video-lab\/"/);
  });
});
