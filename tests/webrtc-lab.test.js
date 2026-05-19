import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../webrtc-lab/', import.meta.url);
const gunVideoDir = new URL('../gun-video-lab/', import.meta.url);
const gunClipDir = new URL('../gun-clip-lab/', import.meta.url);
const gunLiveDir = new URL('../gun-live-room/', import.meta.url);
const gunChunkDir = new URL('../gun-chunk-stream/', import.meta.url);

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

describe('Gun Clip Lab app', () => {
  it('ships a Gun repo style MediaRecorder clip proof of concept', async () => {
    const indexUrl = new URL('index.html', gunClipDir);
    const stylesUrl = new URL('styles.css', gunClipDir);
    const appUrl = new URL('app.js', gunClipDir);
    const readmeUrl = new URL('README.md', gunClipDir);

    assert.equal(await fileExists(indexUrl), true, 'Gun Clip Lab index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'Gun Clip Lab styles should exist');
    assert.equal(await fileExists(appUrl), true, 'Gun Clip Lab app script should exist');
    assert.equal(await fileExists(readmeUrl), true, 'Gun Clip Lab README should exist');

    const html = await readFile(indexUrl, 'utf8');
    const js = await readFile(appUrl, 'utf8');
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(html, /3DVR Gun Clip Lab \| Portal/);
    assert.match(html, /Gun AV Clip Store/);
    assert.match(html, /Record audio and video into Gun/);
    assert.match(html, /id="camera-record"/);
    assert.match(html, /id="screen-record"/);
    assert.match(html, /id="clip-player"/);
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"><\/script>/);
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/sea\.js"><\/script>/);
    assert.match(js, /ROOM_ROOT = '3dvr-gun-clip-lab'/);
    assert.match(js, /new MediaRecorder\(media\)/);
    assert.match(js, /getUserMedia\(\{ video: true, audio: true \}\)/);
    assert.match(js, /getDisplayMedia\(\{ video: true, audio: true \}\)/);
    assert.match(js, /reader\.readAsDataURL\(blob\)/);
    assert.match(js, /data:video\/webm/);
    assert.match(js, /clipNode\.put/);
    assert.match(readme, /examples\/basic\/video\.html/);
    assert.match(readme, /audio\/video clips/);
    assert.match(readme, /3dvr-gun-clip-lab\/<room>\/latestClip/);
  });

  it('registers the Gun Clip Lab beside the other video experiments', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');
    const videoHome = await readFile(new URL('../portal.3dvr.tech/video/index.html', appDir), 'utf8');

    const gunVideoIndex = portalHtml.indexOf('>Gun Video Lab<');
    const gunClipIndex = portalHtml.indexOf('>Gun Clip Lab<');
    const wellnessIndex = portalHtml.indexOf('>Wellness<');

    assert.ok(gunClipIndex !== -1, 'Gun Clip Lab app card should be listed on the portal');
    assert.ok(gunVideoIndex !== -1, 'Gun Video Lab app card should still be listed');
    assert.ok(wellnessIndex !== -1, 'Wellness app card should still be listed');
    assert.ok(gunVideoIndex < gunClipIndex, 'Gun Clip Lab should render after Gun Video Lab');
    assert.ok(gunClipIndex < wellnessIndex, 'Gun Clip Lab should render before Wellness');
    assert.match(readme, /\[Gun Clip Lab\]\(https:\/\/3dvr-portal\.vercel\.app\/gun-clip-lab\/\)/);
    assert.match(videoHome, /href="\/gun-clip-lab\/"/);
  });
});

describe('Gun Live Room app', () => {
  it('ships a pure Gun live audio/video room experiment', async () => {
    const indexUrl = new URL('index.html', gunLiveDir);
    const stylesUrl = new URL('styles.css', gunLiveDir);
    const appUrl = new URL('app.js', gunLiveDir);
    const readmeUrl = new URL('README.md', gunLiveDir);

    assert.equal(await fileExists(indexUrl), true, 'Gun Live Room index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'Gun Live Room styles should exist');
    assert.equal(await fileExists(appUrl), true, 'Gun Live Room app script should exist');
    assert.equal(await fileExists(readmeUrl), true, 'Gun Live Room README should exist');

    const html = await readFile(indexUrl, 'utf8');
    const js = await readFile(appUrl, 'utf8');
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(html, /3DVR Gun Live Room \| Portal/);
    assert.match(html, /Pure Gun Room/);
    assert.match(html, /Zoom-style, without WebRTC media/);
    assert.match(html, /id="start-media"/);
    assert.match(html, /id="start-live"/);
    assert.match(html, /id="camera-select"/);
    assert.match(html, /id="mic-select"/);
    assert.match(html, /id="live-grid"/);
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"><\/script>/);
    assert.match(js, /ROOM_ROOT = '3dvr-gun-live-room'/);
    assert.match(js, /enumerateDevices/);
    assert.match(js, /deviceId: \{ exact: deviceId \}/);
    assert.match(js, /sessionStorage\.setItem/);
    assert.match(js, /canvas\.toDataURL\('image\/jpeg', quality\)/);
    assert.match(js, /new MediaRecorder\(audioStream\)/);
    assert.match(js, /audioRecorder\.start\(AUDIO_SLICE_MS\)/);
    assert.match(js, /framesNode\.get\(localId\)\.put/);
    assert.match(js, /audioNode\.get\(localId\)\.put/);
    assert.doesNotMatch(js, /RTCPeerConnection/);
    assert.match(readme, /without WebRTC media tracks/);
    assert.match(readme, /3dvr-gun-live-room\/<room>\/audio\/<participantId>/);
  });

  it('registers the Gun Live Room beside the pure Gun experiments', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');
    const videoHome = await readFile(new URL('../portal.3dvr.tech/video/index.html', appDir), 'utf8');

    const gunClipIndex = portalHtml.indexOf('>Gun Clip Lab<');
    const gunLiveIndex = portalHtml.indexOf('>Gun Live Room<');
    const wellnessIndex = portalHtml.indexOf('>Wellness<');

    assert.ok(gunLiveIndex !== -1, 'Gun Live Room app card should be listed on the portal');
    assert.ok(gunClipIndex !== -1, 'Gun Clip Lab app card should still be listed');
    assert.ok(wellnessIndex !== -1, 'Wellness app card should still be listed');
    assert.ok(gunClipIndex < gunLiveIndex, 'Gun Live Room should render after Gun Clip Lab');
    assert.ok(gunLiveIndex < wellnessIndex, 'Gun Live Room should render before Wellness');
    assert.match(readme, /\[Gun Live Room\]\(https:\/\/3dvr-portal\.vercel\.app\/gun-live-room\/\)/);
    assert.match(videoHome, /href="\/gun-live-room\/"/);
  });
});

describe('Gun Chunk Stream app', () => {
  it('ships a pure Gun simultaneous local-recording chunk stream', async () => {
    const indexUrl = new URL('index.html', gunChunkDir);
    const stylesUrl = new URL('styles.css', gunChunkDir);
    const appUrl = new URL('app.js', gunChunkDir);
    const readmeUrl = new URL('README.md', gunChunkDir);

    assert.equal(await fileExists(indexUrl), true, 'Gun Chunk Stream index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'Gun Chunk Stream styles should exist');
    assert.equal(await fileExists(appUrl), true, 'Gun Chunk Stream app script should exist');
    assert.equal(await fileExists(readmeUrl), true, 'Gun Chunk Stream README should exist');

    const html = await readFile(indexUrl, 'utf8');
    const js = await readFile(appUrl, 'utf8');
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(html, /3DVR Gun Chunk Stream \| Portal/);
    assert.match(html, /Record locally, upload while recording/);
    assert.match(html, /id="chunk-size"/);
    assert.match(html, /id="start-stream"/);
    assert.match(html, /id="chunk-grid"/);
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"><\/script>/);
    assert.match(js, /ROOM_ROOT = '3dvr-gun-chunk-stream'/);
    assert.match(js, /recorder\.start\(sliceMs\)/);
    assert.match(js, /new MediaRecorder\(localStream/);
    assert.match(js, /reader\.readAsDataURL\(blob\)/);
    assert.match(js, /chunksNode\.get\(`\$\{localId\}_\$\{sequence\}`\)\.put/);
    assert.match(js, /new MediaSource\(\)/);
    assert.match(js, /appendBuffer/);
    assert.doesNotMatch(js, /RTCPeerConnection/);
    assert.match(readme, /MediaRecorder\.start\(timeslice\)/);
    assert.match(readme, /3dvr-gun-chunk-stream\/<room>\/chunks\/<participantId_sequence>/);
  });

  it('registers the Gun Chunk Stream beside the other pure Gun experiments', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');
    const videoHome = await readFile(new URL('../portal.3dvr.tech/video/index.html', appDir), 'utf8');

    const gunLiveIndex = portalHtml.indexOf('>Gun Live Room<');
    const gunChunkIndex = portalHtml.indexOf('>Gun Chunk Stream<');
    const wellnessIndex = portalHtml.indexOf('>Wellness<');

    assert.ok(gunChunkIndex !== -1, 'Gun Chunk Stream app card should be listed on the portal');
    assert.ok(gunLiveIndex !== -1, 'Gun Live Room app card should still be listed');
    assert.ok(wellnessIndex !== -1, 'Wellness app card should still be listed');
    assert.ok(gunLiveIndex < gunChunkIndex, 'Gun Chunk Stream should render after Gun Live Room');
    assert.ok(gunChunkIndex < wellnessIndex, 'Gun Chunk Stream should render before Wellness');
    assert.match(readme, /\[Gun Chunk Stream\]\(https:\/\/3dvr-portal\.vercel\.app\/gun-chunk-stream\/\)/);
    assert.match(videoHome, /href="\/gun-chunk-stream\/"/);
  });
});
