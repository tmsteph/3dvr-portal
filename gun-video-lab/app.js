(function initGunVideoLab() {
  const refs = {
    roomForm: document.getElementById('room-form'),
    displayName: document.getElementById('display-name'),
    roomId: document.getElementById('room-id'),
    randomRoom: document.getElementById('random-room'),
    frameRate: document.getElementById('frame-rate'),
    quality: document.getElementById('quality'),
    copyLink: document.getElementById('copy-link'),
    startCamera: document.getElementById('start-camera'),
    startStream: document.getElementById('start-stream'),
    stopStream: document.getElementById('stop-stream'),
    clearFrame: document.getElementById('clear-frame'),
    statusLine: document.getElementById('status-line'),
    localVideo: document.getElementById('local-video'),
    captureCanvas: document.getElementById('capture-canvas'),
    localLabel: document.getElementById('local-label'),
    localState: document.getElementById('local-state'),
    remoteFrame: document.getElementById('remote-frame'),
    remoteLabel: document.getElementById('remote-label'),
    remoteState: document.getElementById('remote-state'),
    framesSent: document.getElementById('frames-sent'),
    framesReceived: document.getElementById('frames-received'),
    frameSize: document.getElementById('frame-size'),
    frameAge: document.getElementById('frame-age'),
    eventLog: document.getElementById('event-log')
  };

  const ROOM_ROOT = '3dvr-gun-video-lab';
  const FRAME_WIDTH = 160;
  const FRAME_HEIGHT = 90;

  let gun = null;
  let roomNode = null;
  let framesNode = null;
  let participantsNode = null;
  let localStream = null;
  let localId = getOrCreateLocalId();
  let localName = '';
  let roomId = '';
  let joined = false;
  let publishTimer = null;
  let heartbeatTimer = null;
  let framesSent = 0;
  let framesReceived = 0;
  let latestRemoteAt = 0;

  function normalizeRoom(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function createId(prefix = 'gunvid') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  function getOrCreateLocalId() {
    try {
      const stored = localStorage.getItem('gunVideoLabParticipantId');
      if (stored) return stored;
      const next = createId('viewer');
      localStorage.setItem('gunVideoLabParticipantId', next);
      return next;
    } catch (_error) {
      return createId('viewer');
    }
  }

  function logEvent(message) {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()} ${message}`;
    refs.eventLog.prepend(item);
    while (refs.eventLog.children.length > 40) {
      refs.eventLog.lastElementChild.remove();
    }
  }

  function setStatus(message) {
    refs.statusLine.textContent = message;
    logEvent(message);
  }

  function resolveInitialRoom() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeRoom(params.get('room') || '');
    if (fromUrl) return fromUrl;
    return `gun-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  }

  function roomLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', normalizeRoom(refs.roomId.value) || roomId || resolveInitialRoom());
    return url.toString();
  }

  function updateRoomUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url.toString());
  }

  function ensureGun() {
    if (gun) return gun;
    if (typeof Gun !== 'function') {
      throw new Error('Gun is not available.');
    }
    gun = Gun({
      peers: window.__GUN_PEERS__ || [
        'wss://relay.3dvr.tech/gun',
        'wss://gun-relay-3dvr.fly.dev/gun'
      ],
      axe: true
    });
    return gun;
  }

  async function startCamera() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('This browser does not expose camera access.');
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 320 },
        height: { ideal: 180 },
        frameRate: { ideal: 8, max: 12 }
      },
      audio: false
    });
    refs.localVideo.srcObject = localStream;
    refs.startCamera.disabled = true;
    refs.startStream.disabled = !joined;
    refs.localState.textContent = 'Camera on';
    setStatus('Camera ready.');
    return localStream;
  }

  function stopCamera() {
    if (!localStream) return;
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    refs.localVideo.srcObject = null;
    refs.startCamera.disabled = false;
    refs.startStream.disabled = true;
    refs.localState.textContent = 'Camera off';
  }

  function publishPresence() {
    if (!participantsNode) return;
    participantsNode.get(localId).put({
      id: localId,
      name: localName,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    });
  }

  function watchPresence() {
    participantsNode.map().on((participant, id) => {
      if (!participant || id === '_' || id === localId) return;
      const lastSeen = Number(participant.lastSeen || 0);
      if (Date.now() - lastSeen > 45000) return;
      refs.remoteLabel.textContent = participant.name || 'Remote stream';
    });
  }

  function watchFrames() {
    framesNode.map().on((frame, id) => {
      if (!frame || id === '_' || id === localId) return;
      if (!frame.dataUrl || typeof frame.dataUrl !== 'string') return;
      latestRemoteAt = Number(frame.createdAt || Date.now());
      refs.remoteFrame.src = frame.dataUrl;
      refs.remoteLabel.textContent = frame.name || 'Remote stream';
      refs.remoteState.textContent = `${frame.width || FRAME_WIDTH}x${frame.height || FRAME_HEIGHT}`;
      framesReceived += 1;
      refs.framesReceived.textContent = String(framesReceived);
      refs.frameSize.textContent = `${Math.round(frame.dataUrl.length / 1024)} KB`;
    });
  }

  function captureFrame() {
    if (!localStream || !framesNode) return;
    const canvas = refs.captureCanvas;
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    context.drawImage(refs.localVideo, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const quality = Math.max(0.15, Math.min(0.75, Number(refs.quality.value || 0.35)));
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    framesSent += 1;
    refs.framesSent.textContent = String(framesSent);
    refs.frameSize.textContent = `${Math.round(dataUrl.length / 1024)} KB`;
    framesNode.get(localId).put({
      id: localId,
      name: localName,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      quality,
      dataUrl,
      frameNumber: framesSent,
      createdAt: Date.now()
    });
  }

  function startPublishing() {
    if (!joined || !localStream) {
      setStatus('Join a room and start your camera first.');
      return;
    }
    if (publishTimer) return;
    const fps = Math.max(0.2, Math.min(3, Number(refs.frameRate.value || 1)));
    const interval = Math.round(1000 / fps);
    captureFrame();
    publishTimer = setInterval(captureFrame, interval);
    refs.startStream.disabled = true;
    refs.stopStream.disabled = false;
    refs.localState.textContent = `Publishing ${fps} fps`;
    setStatus(`Publishing tiny frames at ${fps} fps.`);
  }

  function stopPublishing() {
    if (publishTimer) {
      clearInterval(publishTimer);
      publishTimer = null;
    }
    refs.startStream.disabled = !joined || !localStream;
    refs.stopStream.disabled = true;
    refs.localState.textContent = localStream ? 'Camera on' : 'Camera off';
    setStatus('Stopped publishing frames.');
  }

  function clearMyFrame() {
    if (framesNode) {
      framesNode.get(localId).put(null);
    }
    setStatus('Cleared local published frame.');
  }

  function joinRoom(event) {
    if (event) event.preventDefault();
    roomId = normalizeRoom(refs.roomId.value) || resolveInitialRoom();
    refs.roomId.value = roomId;
    localName = String(refs.displayName.value || '').trim() || `Guest ${localId.slice(-4)}`;
    refs.localLabel.textContent = `${localName} (you)`;
    ensureGun();
    roomNode = gun.get(ROOM_ROOT).get(roomId);
    framesNode = roomNode.get('frames');
    participantsNode = roomNode.get('participants');
    joined = true;
    updateRoomUrl();
    publishPresence();
    heartbeatTimer = setInterval(publishPresence, 10000);
    watchPresence();
    watchFrames();
    refs.startStream.disabled = !localStream;
    setStatus(`Joined Gun frame room ${roomId}.`);
  }

  function leaveRoom() {
    stopPublishing();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (participantsNode) {
      participantsNode.get(localId).put(null);
    }
    joined = false;
    refs.startStream.disabled = true;
    setStatus('Left room.');
  }

  async function copyLink() {
    const link = roomLink();
    try {
      await navigator.clipboard.writeText(link);
      setStatus('Room link copied.');
    } catch (_error) {
      window.prompt('Copy room link', link);
    }
  }

  function updateFrameAge() {
    if (!latestRemoteAt) {
      refs.frameAge.textContent = '-';
      return;
    }
    refs.frameAge.textContent = `${Math.max(0, Math.round((Date.now() - latestRemoteAt) / 1000))}s`;
  }

  function init() {
    refs.roomId.value = resolveInitialRoom();
    try {
      refs.displayName.value = localStorage.getItem('username')
        || localStorage.getItem('guestDisplayName')
        || '';
    } catch (_error) {
      refs.displayName.value = '';
    }
    refs.randomRoom.addEventListener('click', () => {
      refs.roomId.value = createId('room').replace(/^room_/, 'gun-');
    });
    refs.copyLink.addEventListener('click', copyLink);
    refs.startCamera.addEventListener('click', () => {
      startCamera().catch(error => setStatus(error.message || 'Unable to start camera.'));
    });
    refs.roomForm.addEventListener('submit', joinRoom);
    refs.startStream.addEventListener('click', startPublishing);
    refs.stopStream.addEventListener('click', stopPublishing);
    refs.clearFrame.addEventListener('click', clearMyFrame);
    setInterval(updateFrameAge, 1000);
    window.addEventListener('beforeunload', () => {
      leaveRoom();
      stopCamera();
    });
  }

  init();
})();
