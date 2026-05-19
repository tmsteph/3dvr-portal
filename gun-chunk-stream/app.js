(function initGunChunkStream() {
  const refs = {
    roomForm: document.getElementById('room-form'),
    displayName: document.getElementById('display-name'),
    roomId: document.getElementById('room-id'),
    randomRoom: document.getElementById('random-room'),
    cameraSelect: document.getElementById('camera-select'),
    micSelect: document.getElementById('mic-select'),
    chunkSize: document.getElementById('chunk-size'),
    copyLink: document.getElementById('copy-link'),
    startPreview: document.getElementById('start-preview'),
    startStream: document.getElementById('start-stream'),
    stopStream: document.getElementById('stop-stream'),
    statusLine: document.getElementById('status-line'),
    localVideo: document.getElementById('local-video'),
    localLabel: document.getElementById('local-label'),
    localState: document.getElementById('local-state'),
    chunkGrid: document.getElementById('chunk-grid'),
    chunksSent: document.getElementById('chunks-sent'),
    chunksReceived: document.getElementById('chunks-received'),
    lastSize: document.getElementById('last-size'),
    playbackMode: document.getElementById('playback-mode'),
    chunkList: document.getElementById('chunk-list'),
    eventLog: document.getElementById('event-log')
  };

  const ROOM_ROOT = '3dvr-gun-chunk-stream';
  const CAMERA_PREF_KEY = 'gunChunkStreamCameraId';
  const MIC_PREF_KEY = 'gunChunkStreamMicId';
  const MIME_CANDIDATES = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm'
  ];

  let gun = null;
  let roomNode = null;
  let chunksNode = null;
  let presenceNode = null;
  let localStream = null;
  let recorder = null;
  let joined = false;
  let roomId = '';
  let localName = '';
  let localId = getOrCreateLocalId();
  let sequence = 0;
  let chunksSent = 0;
  let chunksReceived = 0;
  let heartbeatTimer = null;
  const seenChunks = new Set();
  const remotePlayers = new Map();

  function normalizeRoom(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function createId(prefix = 'gunchunk') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  function getOrCreateLocalId() {
    try {
      const stored = localStorage.getItem('gunChunkStreamParticipantId');
      if (stored) return stored;
      const next = createId('peer');
      localStorage.setItem('gunChunkStreamParticipantId', next);
      return next;
    } catch (_error) {
      return createId('peer');
    }
  }

  function logEvent(message) {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()} ${message}`;
    refs.eventLog.prepend(item);
    while (refs.eventLog.children.length > 50) refs.eventLog.lastElementChild.remove();
  }

  function logChunk(chunk) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = chunk.dataUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `${chunk.name || 'Guest'} chunk ${chunk.sequence || '?'} (${Math.round(chunk.dataUrl.length / 1024)} KB)`;
    item.append(link);
    refs.chunkList.prepend(item);
    while (refs.chunkList.children.length > 24) refs.chunkList.lastElementChild.remove();
  }

  function setStatus(message) {
    refs.statusLine.textContent = message;
    logEvent(message);
  }

  function readTabPreference(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch (_error) {
      return '';
    }
  }

  function writeTabPreference(key, value) {
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function resolveInitialRoom() {
    const params = new URLSearchParams(window.location.search);
    return normalizeRoom(params.get('room') || '') || `gun-chunk-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
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
    if (typeof Gun !== 'function') throw new Error('Gun is not available.');
    gun = Gun({
      peers: window.__GUN_PEERS__ || [
        'wss://gun-relay-3dvr.fly.dev/gun'
      ],
      axe: true
    });
    return gun;
  }

  function pickMimeType() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function setSelectOptions(select, devices, fallbackLabel) {
    const key = select === refs.cameraSelect ? CAMERA_PREF_KEY : MIC_PREF_KEY;
    const selected = select.value || readTabPreference(key);
    select.textContent = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = fallbackLabel;
    select.append(defaultOption);
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `${fallbackLabel.replace('Default ', '')} ${index + 1}`;
      select.append(option);
    });
    select.value = Array.from(select.options).some(option => option.value === selected) ? selected : '';
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setSelectOptions(refs.cameraSelect, devices.filter(device => device.kind === 'videoinput'), 'Default camera');
      setSelectOptions(refs.micSelect, devices.filter(device => device.kind === 'audioinput'), 'Default microphone');
    } catch (error) {
      console.warn('Device enumeration failed', error);
    }
  }

  function selectedVideoConstraint() {
    const deviceId = refs.cameraSelect.value;
    return {
      width: { ideal: 480 },
      height: { ideal: 270 },
      frameRate: { ideal: 12, max: 15 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    };
  }

  function selectedAudioConstraint() {
    const deviceId = refs.micSelect.value;
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    };
  }

  function stopLocalStream() {
    if (!localStream) return;
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    refs.localVideo.srcObject = null;
  }

  async function startPreview() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('This browser does not expose camera/mic access.');
    }
    stopRecorder();
    stopLocalStream();
    localStream = await navigator.mediaDevices.getUserMedia({
      video: selectedVideoConstraint(),
      audio: selectedAudioConstraint()
    });
    refs.localVideo.srcObject = localStream;
    refs.localState.textContent = 'Ready';
    refs.startPreview.disabled = true;
    refs.startStream.disabled = !joined;
    setStatus('Camera and mic ready for local recording.');
    await refreshDevices();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Unable to read chunk.'));
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  async function publishChunk(blob) {
    if (!chunksNode || !blob.size) return;
    const dataUrl = await blobToDataUrl(blob);
    sequence += 1;
    chunksSent += 1;
    refs.chunksSent.textContent = String(chunksSent);
    refs.lastSize.textContent = `${Math.round(dataUrl.length / 1024)} KB`;
    chunksNode.get(`${localId}_${sequence}`).put({
      id: `${localId}_${sequence}`,
      participantId: localId,
      name: localName,
      sequence,
      mimeType: blob.type || pickMimeType() || 'video/webm',
      dataUrl,
      createdAt: Date.now()
    });
  }

  function startStreaming() {
    if (!joined || !localStream) {
      setStatus('Join a room and start camera/mic first.');
      return;
    }
    if (!window.MediaRecorder) {
      setStatus('This browser does not support MediaRecorder.');
      return;
    }
    if (recorder && recorder.state !== 'inactive') return;
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(localStream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = event => {
      if (!event.data || !event.data.size) return;
      publishChunk(event.data).catch(error => {
        console.warn('Chunk upload failed', error);
        setStatus(error.message || 'Chunk upload failed.');
      });
    };
    recorder.onstop = () => {
      refs.startStream.disabled = !joined || !localStream;
      refs.stopStream.disabled = true;
      refs.localState.textContent = localStream ? 'Ready' : 'Offline';
      setStatus('Stopped chunk recording.');
    };
    const sliceMs = Math.max(1000, Math.min(4000, Number(refs.chunkSize.value || 2000)));
    recorder.start(sliceMs);
    refs.startStream.disabled = true;
    refs.stopStream.disabled = false;
    refs.localState.textContent = `Uploading every ${Math.round(sliceMs / 1000)}s`;
    setStatus(`Recording locally and uploading ${Math.round(sliceMs / 1000)}s chunks to Gun.`);
  }

  function stopRecorder() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder = null;
  }

  function publishPresence() {
    if (!presenceNode) return;
    presenceNode.get(localId).put({
      id: localId,
      name: localName,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    });
  }

  function createRemotePlayer(participantId, name = 'Guest', mimeType = 'video/webm') {
    if (remotePlayers.has(participantId)) return remotePlayers.get(participantId);
    const tile = document.createElement('article');
    tile.className = 'chunk-tile';
    tile.dataset.peerId = participantId;
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    const label = document.createElement('div');
    label.className = 'tile-label';
    const title = document.createElement('strong');
    title.textContent = name;
    const state = document.createElement('span');
    state.textContent = 'Waiting';
    label.append(title, state);
    tile.append(video, label);
    refs.chunkGrid.appendChild(tile);
    const player = {
      video,
      title,
      state,
      pending: new Map(),
      nextSequence: 1,
      sourceBuffer: null,
      mediaSource: null,
      fallback: false
    };

    if (window.MediaSource && MediaSource.isTypeSupported(mimeType)) {
      player.mediaSource = new MediaSource();
      video.src = URL.createObjectURL(player.mediaSource);
      player.mediaSource.addEventListener('sourceopen', () => {
        player.sourceBuffer = player.mediaSource.addSourceBuffer(mimeType);
        try {
          player.sourceBuffer.mode = 'sequence';
        } catch (_error) {
          // Some browsers expose a readonly mode for this codec.
        }
        player.sourceBuffer.addEventListener('updateend', () => appendNext(player));
        appendNext(player);
      }, { once: true });
    } else {
      player.fallback = true;
      refs.playbackMode.textContent = 'Latest chunk';
    }

    remotePlayers.set(participantId, player);
    return player;
  }

  function appendNext(player) {
    if (player.fallback || !player.sourceBuffer || player.sourceBuffer.updating) return;
    const next = player.pending.get(player.nextSequence);
    if (!next) return;
    player.pending.delete(player.nextSequence);
    player.nextSequence += 1;
    try {
      player.sourceBuffer.appendBuffer(next);
    } catch (error) {
      console.warn('Append failed', error);
      player.state.textContent = 'Append failed';
      player.pending.set(player.nextSequence - 1, next);
      player.nextSequence -= 1;
    }
  }

  async function receiveChunk(chunk) {
    if (!chunk || chunk.participantId === localId || !chunk.dataUrl || seenChunks.has(chunk.id)) return;
    seenChunks.add(chunk.id);
    const player = createRemotePlayer(chunk.participantId, chunk.name || 'Guest', chunk.mimeType || 'video/webm');
    player.title.textContent = chunk.name || 'Guest';
    player.state.textContent = `Chunk ${chunk.sequence || '?'}`;
    chunksReceived += 1;
    refs.chunksReceived.textContent = String(chunksReceived);
    refs.lastSize.textContent = `${Math.round(chunk.dataUrl.length / 1024)} KB`;
    logChunk(chunk);

    if (player.fallback) {
      player.video.src = chunk.dataUrl;
      return;
    }

    const buffer = await fetch(chunk.dataUrl).then(response => response.arrayBuffer());
    player.pending.set(Number(chunk.sequence || 1), buffer);
    appendNext(player);
    player.video.play().catch(() => {
      player.state.textContent = 'Tap to play';
    });
  }

  function watchChunks() {
    chunksNode.map().on(chunk => {
      receiveChunk(chunk).catch(error => {
        console.warn('Chunk receive failed', error);
      });
    });
  }

  function joinRoom(event) {
    if (event) event.preventDefault();
    roomId = normalizeRoom(refs.roomId.value) || resolveInitialRoom();
    localName = String(refs.displayName.value || '').trim() || `Guest ${localId.slice(-4)}`;
    refs.roomId.value = roomId;
    refs.localLabel.textContent = `${localName} (you)`;
    ensureGun();
    roomNode = gun.get(ROOM_ROOT).get(roomId);
    chunksNode = roomNode.get('chunks');
    presenceNode = roomNode.get('participants');
    joined = true;
    updateRoomUrl();
    publishPresence();
    heartbeatTimer = setInterval(publishPresence, 10000);
    watchChunks();
    refs.startStream.disabled = !localStream;
    setStatus(`Joined Gun chunk room ${roomId}.`);
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

  function leave() {
    stopRecorder();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (presenceNode) presenceNode.get(localId).put(null);
    stopLocalStream();
  }

  refs.roomId.value = resolveInitialRoom();
  refs.cameraSelect.value = readTabPreference(CAMERA_PREF_KEY);
  refs.micSelect.value = readTabPreference(MIC_PREF_KEY);
  try {
    refs.displayName.value = localStorage.getItem('username')
      || localStorage.getItem('guestDisplayName')
      || '';
  } catch (_error) {
    refs.displayName.value = '';
  }
  refs.cameraSelect.addEventListener('change', () => {
    writeTabPreference(CAMERA_PREF_KEY, refs.cameraSelect.value);
    refs.startPreview.disabled = false;
    setStatus('Camera selection changed. Start camera and mic again to apply it.');
  });
  refs.micSelect.addEventListener('change', () => {
    writeTabPreference(MIC_PREF_KEY, refs.micSelect.value);
    refs.startPreview.disabled = false;
    setStatus('Microphone selection changed. Start camera and mic again to apply it.');
  });
  refs.randomRoom.addEventListener('click', () => {
    refs.roomId.value = createId('room').replace(/^room_/, 'gun-chunk-');
  });
  refs.roomForm.addEventListener('submit', joinRoom);
  refs.copyLink.addEventListener('click', copyLink);
  refs.startPreview.addEventListener('click', () => startPreview().catch(error => setStatus(error.message || 'Unable to start media.')));
  refs.startStream.addEventListener('click', startStreaming);
  refs.stopStream.addEventListener('click', stopRecorder);
  refreshDevices();
  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
  }
  window.addEventListener('beforeunload', leave);
}());
