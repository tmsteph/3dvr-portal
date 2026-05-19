(function initGunClipLab() {
  const refs = {
    roomForm: document.getElementById('room-form'),
    roomId: document.getElementById('room-id'),
    randomRoom: document.getElementById('random-room'),
    displayName: document.getElementById('display-name'),
    passphrase: document.getElementById('clip-passphrase'),
    copyLink: document.getElementById('copy-link'),
    cameraRecord: document.getElementById('camera-record'),
    screenRecord: document.getElementById('screen-record'),
    stopRecord: document.getElementById('stop-record'),
    clearClip: document.getElementById('clear-clip'),
    statusLine: document.getElementById('status-line'),
    clipPlayer: document.getElementById('clip-player'),
    clipMeta: document.getElementById('clip-meta'),
    clipsSaved: document.getElementById('clips-saved'),
    clipsReceived: document.getElementById('clips-received'),
    clipSize: document.getElementById('clip-size'),
    storageKey: document.getElementById('storage-key'),
    eventLog: document.getElementById('event-log')
  };

  const ROOM_ROOT = '3dvr-gun-clip-lab';
  const CLIP_KEY = 'latestClip';
  const MAX_RECORD_MS = 12000;

  let gun = null;
  let roomNode = null;
  let clipNode = null;
  let recorder = null;
  let activeStream = null;
  let stopTimer = null;
  let roomId = '';
  let displayName = '';
  let joined = false;
  let clipsSaved = 0;
  let clipsReceived = 0;

  function normalizeRoom(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function createRoom() {
    return `clip-${Math.random().toString(36).slice(2, 8)}`;
  }

  function resolveInitialRoom() {
    const params = new URLSearchParams(window.location.search);
    return normalizeRoom(params.get('room') || '') || `gun-clip-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  }

  function ensureGun() {
    if (gun) return gun;
    if (typeof Gun !== 'function') {
      throw new Error('Gun is not available.');
    }
    gun = Gun({
      peers: window.__GUN_PEERS__ || [
        'wss://gun-relay-3dvr.fly.dev/gun'
      ],
      axe: true
    });
    return gun;
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

  function setRecordingControls(active) {
    refs.cameraRecord.disabled = active || !joined;
    refs.screenRecord.disabled = active || !joined;
    refs.stopRecord.disabled = !active;
  }

  function stopActiveStream() {
    if (!activeStream) return;
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }

  function dataUrlFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Unable to read recording.'));
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  async function saveClip(blob, source) {
    if (!clipNode) return;
    const originalDataUrl = await dataUrlFromBlob(blob);
    let dataUrl = `data:video/webm${originalDataUrl.slice(originalDataUrl.indexOf(';'))}`;
    const encrypted = Boolean(refs.passphrase.value);

    if (encrypted) {
      if (!window.SEA || typeof window.SEA.encrypt !== 'function') {
        throw new Error('SEA encryption is not available.');
      }
      dataUrl = await window.SEA.encrypt(dataUrl, refs.passphrase.value);
    }

    clipsSaved += 1;
    refs.clipsSaved.textContent = String(clipsSaved);
    refs.clipSize.textContent = `${Math.round(String(dataUrl).length / 1024)} KB`;
    clipNode.put({
      dataUrl,
      encrypted,
      source,
      name: displayName,
      size: blob.size,
      mimeType: blob.type || 'video/webm',
      createdAt: Date.now()
    });
    setStatus(`Saved ${source.toLowerCase()} clip to Gun.`);
  }

  async function renderClip(payload) {
    if (!payload || typeof payload.dataUrl !== 'string') return;
    let dataUrl = payload.dataUrl;

    if (payload.encrypted) {
      if (!refs.passphrase.value) {
        refs.clipMeta.textContent = 'Encrypted clip needs passphrase';
        setStatus('Latest clip is encrypted. Enter the passphrase to view it.');
        return;
      }
      if (!window.SEA || typeof window.SEA.decrypt !== 'function') {
        setStatus('SEA decryption is not available.');
        return;
      }
      dataUrl = await window.SEA.decrypt(dataUrl, refs.passphrase.value);
      if (!dataUrl) {
        refs.clipMeta.textContent = 'Wrong passphrase';
        setStatus('Could not decrypt the latest clip.');
        return;
      }
    }

    refs.clipPlayer.src = dataUrl;
    clipsReceived += 1;
    refs.clipsReceived.textContent = String(clipsReceived);
    refs.clipSize.textContent = `${Math.round(String(dataUrl).length / 1024)} KB`;
    refs.clipMeta.textContent = `${payload.name || 'Someone'} - ${payload.source || 'Clip'} - ${new Date(payload.createdAt || Date.now()).toLocaleTimeString()}`;
  }

  async function startRecording(source) {
    if (!joined) {
      setStatus('Join a room first.');
      return;
    }
    if (!window.MediaRecorder) {
      setStatus('This browser does not support MediaRecorder.');
      return;
    }

    const media = source === 'Screen'
      ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const chunks = [];
    activeStream = media;
    recorder = new MediaRecorder(media);
    recorder.ondataavailable = event => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      clearTimeout(stopTimer);
      stopTimer = null;
      setRecordingControls(false);
      stopActiveStream();
      recorder = null;
      if (!chunks.length) {
        setStatus('Recording stopped without clip data.');
        return;
      }
      try {
        await saveClip(new Blob(chunks, { type: 'video/webm' }), source);
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'Could not save clip.');
      }
    };
    recorder.start();
    setRecordingControls(true);
    setStatus(`Recording ${source.toLowerCase()} for up to ${Math.round(MAX_RECORD_MS / 1000)} seconds.`);
    stopTimer = setTimeout(stopRecording, MAX_RECORD_MS);
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  function joinRoom(event) {
    if (event) event.preventDefault();
    roomId = normalizeRoom(refs.roomId.value) || resolveInitialRoom();
    displayName = String(refs.displayName.value || '').trim() || 'Guest recorder';
    refs.roomId.value = roomId;
    ensureGun();
    roomNode = gun.get(ROOM_ROOT).get(roomId);
    clipNode = roomNode.get(CLIP_KEY);
    refs.storageKey.textContent = `${ROOM_ROOT}/${roomId}/${CLIP_KEY}`;
    joined = true;
    updateRoomUrl();
    setRecordingControls(false);
    clipNode.on(renderClip);
    setStatus(`Joined Gun clip room ${roomId}.`);
  }

  function clearClip() {
    if (!clipNode) return;
    clipNode.put(null);
    refs.clipPlayer.removeAttribute('src');
    refs.clipPlayer.load();
    refs.clipMeta.textContent = 'No clip yet';
    setStatus('Cleared latest room clip.');
  }

  refs.roomId.value = resolveInitialRoom();
  setRecordingControls(false);
  refs.roomForm.addEventListener('submit', joinRoom);
  refs.randomRoom.addEventListener('click', () => {
    refs.roomId.value = createRoom();
  });
  refs.copyLink.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomLink());
      setStatus('Copied room link.');
    } catch (_error) {
      setStatus(roomLink());
    }
  });
  refs.cameraRecord.addEventListener('click', () => startRecording('Camera').catch(error => {
    console.error(error);
    setStatus(error.message || 'Could not start camera recording.');
  }));
  refs.screenRecord.addEventListener('click', () => startRecording('Screen').catch(error => {
    console.error(error);
    setStatus(error.message || 'Could not start screen recording.');
  }));
  refs.stopRecord.addEventListener('click', stopRecording);
  refs.clearClip.addEventListener('click', clearClip);
  refs.passphrase.addEventListener('change', () => {
    if (clipNode) {
      clipNode.once(renderClip);
    }
  });
}());
