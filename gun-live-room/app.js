(function initGunLiveRoom() {
  const refs = {
    roomForm: document.getElementById('room-form'),
    displayName: document.getElementById('display-name'),
    roomId: document.getElementById('room-id'),
    randomRoom: document.getElementById('random-room'),
    frameRate: document.getElementById('frame-rate'),
    quality: document.getElementById('quality'),
    copyLink: document.getElementById('copy-link'),
    cameraSelect: document.getElementById('camera-select'),
    micSelect: document.getElementById('mic-select'),
    startMedia: document.getElementById('start-media'),
    startLive: document.getElementById('start-live'),
    stopLive: document.getElementById('stop-live'),
    toggleMic: document.getElementById('toggle-mic'),
    toggleCamera: document.getElementById('toggle-camera'),
    statusLine: document.getElementById('status-line'),
    localVideo: document.getElementById('local-video'),
    captureCanvas: document.getElementById('capture-canvas'),
    localLabel: document.getElementById('local-label'),
    localState: document.getElementById('local-state'),
    liveGrid: document.getElementById('live-grid'),
    framesSent: document.getElementById('frames-sent'),
    framesReceived: document.getElementById('frames-received'),
    audioSent: document.getElementById('audio-sent'),
    audioReceived: document.getElementById('audio-received'),
    eventLog: document.getElementById('event-log')
  };

  const ROOM_ROOT = '3dvr-gun-live-room';
  const FRAME_WIDTH = 160;
  const FRAME_HEIGHT = 90;
  const AUDIO_SLICE_MS = 1500;
  const CAMERA_PREF_KEY = 'gunLiveRoomCameraId';
  const MIC_PREF_KEY = 'gunLiveRoomMicId';

  let gun = null;
  let roomNode = null;
  let participantsNode = null;
  let framesNode = null;
  let audioNode = null;
  let localStream = null;
  let audioRecorder = null;
  let frameTimer = null;
  let heartbeatTimer = null;
  let joined = false;
  let live = false;
  let roomId = '';
  let localName = '';
  let localId = getOrCreateLocalId();
  let framesSent = 0;
  let framesReceived = 0;
  let audioSent = 0;
  let audioReceived = 0;
  const tiles = new Map();
  const seenAudio = new Set();

  function normalizeRoom(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function createId(prefix = 'gunlive') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  function getOrCreateLocalId() {
    try {
      const stored = localStorage.getItem('gunLiveRoomParticipantId');
      if (stored) return stored;
      const next = createId('peer');
      localStorage.setItem('gunLiveRoomParticipantId', next);
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

  function setStatus(message) {
    refs.statusLine.textContent = message;
    logEvent(message);
  }

  function resolveInitialRoom() {
    const params = new URLSearchParams(window.location.search);
    return normalizeRoom(params.get('room') || '') || `gun-live-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  }

  function updateRoomUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url.toString());
  }

  function roomLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', normalizeRoom(refs.roomId.value) || roomId || resolveInitialRoom());
    return url.toString();
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

  function readTabPreference(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch (_error) {
      return '';
    }
  }

  function writeTabPreference(key, value) {
    try {
      if (value) {
        sessionStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
      }
    } catch (_error) {
      // Ignore private-mode storage failures.
    }
  }

  function setSelectOptions(select, devices, fallbackLabel) {
    const selected = select.value || readTabPreference(select === refs.cameraSelect ? CAMERA_PREF_KEY : MIC_PREF_KEY);
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
      setSelectOptions(
        refs.cameraSelect,
        devices.filter(device => device.kind === 'videoinput'),
        'Default camera'
      );
      setSelectOptions(
        refs.micSelect,
        devices.filter(device => device.kind === 'audioinput'),
        'Default microphone'
      );
    } catch (error) {
      console.warn('Could not enumerate media devices', error);
    }
  }

  function selectedVideoConstraint() {
    const deviceId = refs.cameraSelect.value;
    return {
      width: { ideal: 320 },
      height: { ideal: 180 },
      frameRate: { ideal: 8, max: 12 },
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

  function stopLocalTracks() {
    if (!localStream) return;
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    refs.localVideo.srcObject = null;
  }

  async function startMedia() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('This browser does not expose camera/mic access.');
    }
    if (localStream) {
      stopLive();
      stopLocalTracks();
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: selectedVideoConstraint(),
      audio: selectedAudioConstraint()
    });
    refs.localVideo.srcObject = localStream;
    refs.startMedia.disabled = true;
    refs.startLive.disabled = !joined;
    refs.toggleMic.disabled = false;
    refs.toggleCamera.disabled = false;
    refs.localState.textContent = 'Camera and mic ready';
    setStatus('Camera and mic ready.');
    await refreshDevices();
    return localStream;
  }

  function publishPresence() {
    if (!participantsNode) return;
    participantsNode.get(localId).put({
      id: localId,
      name: localName,
      live,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    });
  }

  function createTile(id, name = 'Guest') {
    if (tiles.has(id)) return tiles.get(id);
    const tile = document.createElement('article');
    tile.className = 'live-tile';
    tile.dataset.peerId = id;
    const img = document.createElement('img');
    img.alt = `${name} Gun live frame`;
    const audio = document.createElement('audio');
    audio.autoplay = true;
    const label = document.createElement('div');
    label.className = 'tile-label';
    const title = document.createElement('strong');
    title.textContent = name;
    const state = document.createElement('span');
    state.textContent = 'Waiting';
    label.append(title, state);
    tile.append(img, audio, label);
    refs.liveGrid.appendChild(tile);
    const next = { tile, img, audio, title, state, lastAudio: 0 };
    tiles.set(id, next);
    return next;
  }

  function watchParticipants() {
    participantsNode.map().on((participant, id) => {
      if (!participant || id === '_' || id === localId) return;
      const lastSeen = Number(participant.lastSeen || 0);
      if (Date.now() - lastSeen > 45000) return;
      const tile = createTile(id, participant.name || 'Guest');
      tile.title.textContent = participant.name || 'Guest';
      tile.state.textContent = participant.live ? 'Live' : 'In room';
    });
  }

  function watchFrames() {
    framesNode.map().on((frame, id) => {
      if (!frame || id === '_' || id === localId || typeof frame.dataUrl !== 'string') return;
      const tile = createTile(id, frame.name || 'Guest');
      tile.img.src = frame.dataUrl;
      tile.title.textContent = frame.name || 'Guest';
      tile.state.textContent = `${frame.width || FRAME_WIDTH}x${frame.height || FRAME_HEIGHT}`;
      framesReceived += 1;
      refs.framesReceived.textContent = String(framesReceived);
    });
  }

  function watchAudio() {
    audioNode.map().on((chunk, id) => {
      if (!chunk || id === '_' || id === localId) return;
      if (!chunk.dataUrl || typeof chunk.dataUrl !== 'string' || seenAudio.has(chunk.chunkId)) return;
      seenAudio.add(chunk.chunkId);
      const tile = createTile(id, chunk.name || 'Guest');
      tile.audio.src = chunk.dataUrl;
      tile.lastAudio = Number(chunk.createdAt || Date.now());
      tile.audio.play().catch(() => {
        tile.state.textContent = 'Tap page for audio';
      });
      audioReceived += 1;
      refs.audioReceived.textContent = String(audioReceived);
    });
  }

  function captureFrame() {
    if (!localStream || !framesNode || !live) return;
    const canvas = refs.captureCanvas;
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    context.drawImage(refs.localVideo, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const quality = Math.max(0.15, Math.min(0.7, Number(refs.quality.value || 0.32)));
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    framesSent += 1;
    refs.framesSent.textContent = String(framesSent);
    framesNode.get(localId).put({
      id: localId,
      name: localName,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      dataUrl,
      frameNumber: framesSent,
      createdAt: Date.now()
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Unable to read audio chunk.'));
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  function startAudioChunks() {
    if (!window.MediaRecorder || !localStream || !audioNode) return;
    const audioTracks = localStream.getAudioTracks();
    if (!audioTracks.length) return;
    const audioStream = new MediaStream(audioTracks);
    audioRecorder = new MediaRecorder(audioStream);
    audioRecorder.ondataavailable = async event => {
      if (!event.data || !event.data.size || !live) return;
      try {
        const dataUrl = await blobToDataUrl(event.data);
        audioSent += 1;
        refs.audioSent.textContent = String(audioSent);
        audioNode.get(localId).put({
          id: localId,
          name: localName,
          chunkId: createId('audio'),
          sequence: audioSent,
          mimeType: event.data.type || 'audio/webm',
          dataUrl,
          createdAt: Date.now()
        });
      } catch (error) {
        console.warn('Audio chunk failed', error);
      }
    };
    audioRecorder.start(AUDIO_SLICE_MS);
  }

  function startLive() {
    if (!joined || !localStream) {
      setStatus('Join a room and start camera/mic first.');
      return;
    }
    if (live) return;
    live = true;
    publishPresence();
    const fps = Math.max(0.2, Math.min(3, Number(refs.frameRate.value || 1)));
    frameTimer = setInterval(captureFrame, Math.round(1000 / fps));
    captureFrame();
    startAudioChunks();
    refs.startLive.disabled = true;
    refs.stopLive.disabled = false;
    refs.localState.textContent = `Live through Gun at ${fps} fps`;
    setStatus(`Pure Gun live started at ${fps} fps plus ${AUDIO_SLICE_MS}ms audio chunks.`);
  }

  function stopLive() {
    live = false;
    if (frameTimer) clearInterval(frameTimer);
    frameTimer = null;
    if (audioRecorder && audioRecorder.state !== 'inactive') audioRecorder.stop();
    audioRecorder = null;
    if (framesNode) framesNode.get(localId).put(null);
    if (audioNode) audioNode.get(localId).put(null);
    refs.startLive.disabled = !joined || !localStream;
    refs.stopLive.disabled = true;
    refs.localState.textContent = localStream ? 'Camera and mic ready' : 'Offline';
    publishPresence();
    setStatus('Pure Gun live stopped.');
  }

  function joinRoom(event) {
    if (event) event.preventDefault();
    roomId = normalizeRoom(refs.roomId.value) || resolveInitialRoom();
    localName = String(refs.displayName.value || '').trim() || `Guest ${localId.slice(-4)}`;
    refs.roomId.value = roomId;
    refs.localLabel.textContent = `${localName} (you)`;
    ensureGun();
    roomNode = gun.get(ROOM_ROOT).get(roomId);
    participantsNode = roomNode.get('participants');
    framesNode = roomNode.get('frames');
    audioNode = roomNode.get('audio');
    joined = true;
    updateRoomUrl();
    publishPresence();
    heartbeatTimer = setInterval(publishPresence, 10000);
    watchParticipants();
    watchFrames();
    watchAudio();
    refs.startLive.disabled = !localStream;
    setStatus(`Joined pure Gun room ${roomId}.`);
  }

  function toggleMic() {
    if (!localStream) return;
    const enabled = !localStream.getAudioTracks().every(track => track.enabled);
    localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
    refs.toggleMic.textContent = enabled ? 'Mute mic' : 'Unmute mic';
  }

  function toggleCamera() {
    if (!localStream) return;
    const enabled = !localStream.getVideoTracks().every(track => track.enabled);
    localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
    refs.toggleCamera.textContent = enabled ? 'Hide camera' : 'Show camera';
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
    stopLive();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (participantsNode) participantsNode.get(localId).put(null);
    stopLocalTracks();
  }

  refs.roomId.value = resolveInitialRoom();
  try {
    refs.displayName.value = localStorage.getItem('username')
      || localStorage.getItem('guestDisplayName')
      || '';
  } catch (_error) {
    refs.displayName.value = '';
  }
  refs.randomRoom.addEventListener('click', () => {
    refs.roomId.value = createId('room').replace(/^room_/, 'gun-live-');
  });
  refs.cameraSelect.value = readTabPreference(CAMERA_PREF_KEY);
  refs.micSelect.value = readTabPreference(MIC_PREF_KEY);
  refs.cameraSelect.addEventListener('change', () => {
    writeTabPreference(CAMERA_PREF_KEY, refs.cameraSelect.value);
    refs.startMedia.disabled = false;
    setStatus('Camera selection changed. Start camera and mic again to apply it.');
  });
  refs.micSelect.addEventListener('change', () => {
    writeTabPreference(MIC_PREF_KEY, refs.micSelect.value);
    refs.startMedia.disabled = false;
    setStatus('Microphone selection changed. Start camera and mic again to apply it.');
  });
  refs.roomForm.addEventListener('submit', joinRoom);
  refs.copyLink.addEventListener('click', copyLink);
  refs.startMedia.addEventListener('click', () => startMedia().catch(error => setStatus(error.message || 'Unable to start media.')));
  refs.startLive.addEventListener('click', startLive);
  refs.stopLive.addEventListener('click', stopLive);
  refs.toggleMic.addEventListener('click', toggleMic);
  refs.toggleCamera.addEventListener('click', toggleCamera);
  refreshDevices();
  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
  }
  window.addEventListener('beforeunload', leave);
}());
