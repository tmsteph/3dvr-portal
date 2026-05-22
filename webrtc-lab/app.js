(function initWebRtcLab() {
  const refs = {
    roomForm: document.getElementById('room-form'),
    displayName: document.getElementById('display-name'),
    roomId: document.getElementById('room-id'),
    randomRoom: document.getElementById('random-room'),
    copyLink: document.getElementById('copy-link'),
    startCamera: document.getElementById('start-camera'),
    toggleMic: document.getElementById('toggle-mic'),
    toggleCamera: document.getElementById('toggle-camera'),
    leaveRoom: document.getElementById('leave-room'),
    statusLine: document.getElementById('status-line'),
    localVideo: document.getElementById('local-video'),
    localLabel: document.getElementById('local-label'),
    localState: document.getElementById('local-state'),
    videoGrid: document.getElementById('video-grid'),
    localPeerId: document.getElementById('local-peer-id'),
    peerCount: document.getElementById('peer-count'),
    signalCount: document.getElementById('signal-count'),
    eventLog: document.getElementById('event-log')
  };

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  const ROOM_ROOT = '3dvr-webrtc-lab-v2';
  const SIGNAL_TTL_MS = 1000 * 60 * 20;
  const PEER_SESSION_KEY = 'webrtcLabParticipantId';

  let gun = null;
  let roomNode = null;
  let participantsNode = null;
  let signalsNode = null;
  let roomId = '';
  let localId = getOrCreateLocalId();
  let localName = '';
  let localStream = null;
  let joined = false;
  let heartbeatTimer = null;
  let signalsHandled = 0;
  const peers = new Map();
  const seenSignals = new Set();

  function normalizeRoom(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function createId(prefix = 'rtc') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  function getOrCreateLocalId() {
    try {
      const stored = sessionStorage.getItem(PEER_SESSION_KEY);
      if (stored) return stored;
      const next = createId('peer');
      sessionStorage.setItem(PEER_SESSION_KEY, next);
      return next;
    } catch (_error) {
      return createId('peer');
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

  function updateDiagnostics() {
    refs.localPeerId.textContent = joined ? localId.replace(/^peer_/, '') : 'Not joined';
    refs.peerCount.textContent = String(peers.size);
    refs.signalCount.textContent = String(signalsHandled);
  }

  function resolveInitialRoom() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeRoom(params.get('room') || '');
    if (fromUrl) return fromUrl;
    return `3dvr-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
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
    if (typeof Gun !== 'function') {
      throw new Error('Gun is not available for signaling.');
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
      throw new Error('This browser does not expose camera/mic access.');
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 15, max: 24 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    refs.localVideo.srcObject = localStream;
    refs.startCamera.disabled = true;
    refs.toggleMic.disabled = false;
    refs.toggleCamera.disabled = false;
    refs.localState.textContent = 'Camera on';
    setStatus('Camera ready.');
    peers.forEach((peer, remoteId) => {
      const senders = peer.connection.getSenders();
      localStream.getTracks().forEach(track => {
        if (!senders.some(sender => sender.track && sender.track.id === track.id)) {
          peer.connection.addTrack(track, localStream);
        }
      });
      if (joined && shouldInitiateOffer(remoteId)) {
        makeOffer(remoteId, peer.name).catch(error => {
          console.error('Renegotiation failed', error);
          setStatus(`Renegotiation failed: ${error.message || error}`);
        });
      }
    });
    announcePresence('media-ready');
    return localStream;
  }

  function stopLocalStream() {
    if (!localStream) return;
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    refs.localVideo.srcObject = null;
    refs.startCamera.disabled = false;
    refs.toggleMic.disabled = true;
    refs.toggleCamera.disabled = true;
    refs.localState.textContent = 'Camera off';
  }

  function createPeer(remoteId, remoteName = 'Guest') {
    if (peers.has(remoteId)) return peers.get(remoteId);
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = {
      id: remoteId,
      name: remoteName || 'Guest',
      connection,
      stream: new MediaStream(),
      tile: createRemoteTile(remoteId, remoteName)
    };
    peers.set(remoteId, peer);
    updateDiagnostics();

    if (localStream) {
      localStream.getTracks().forEach(track => connection.addTrack(track, localStream));
    }

    connection.onnegotiationneeded = () => {
      if (!joined || !shouldInitiateOffer(remoteId)) return;
      makeOffer(remoteId, peer.name).catch(error => {
        console.error('Negotiation failed', error);
        setStatus(`Negotiation failed: ${error.message || error}`);
      });
    };

    connection.ontrack = event => {
      event.streams[0].getTracks().forEach(track => peer.stream.addTrack(track));
      peer.tile.video.srcObject = peer.stream;
      peer.tile.state.textContent = 'Connected';
    };

    connection.onicecandidate = event => {
      if (event.candidate) {
        sendSignal(remoteId, 'candidate', event.candidate);
      }
    };

    connection.onconnectionstatechange = () => {
      peer.tile.state.textContent = connection.connectionState;
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        logEvent(`${peer.name} ${connection.connectionState}.`);
      }
    };

    logEvent(`Peer ready: ${peer.name}.`);
    return peer;
  }

  function createRemoteTile(remoteId, name) {
    const tile = document.createElement('article');
    tile.className = 'video-tile';
    tile.dataset.peerId = remoteId;
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    const label = document.createElement('div');
    label.className = 'tile-label';
    const title = document.createElement('strong');
    title.textContent = name || 'Guest';
    const state = document.createElement('span');
    state.textContent = 'Connecting';
    label.append(title, state);
    tile.append(video, label);
    refs.videoGrid.appendChild(tile);
    return { tile, video, state, title };
  }

  async function makeOffer(remoteId, remoteName) {
    const peer = createPeer(remoteId, remoteName);
    if (peer.makingOffer || peer.connection.signalingState !== 'stable') return;
    peer.makingOffer = true;
    if (!localStream) await startCamera();
    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      sendSignal(remoteId, 'offer', peer.connection.localDescription);
      logEvent(`Offer sent to ${remoteName || remoteId}.`);
    } finally {
      peer.makingOffer = false;
    }
  }

  async function handleOffer(signal) {
    const peer = createPeer(signal.from, signal.fromName);
    if (!localStream) await startCamera();
    await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    sendSignal(signal.from, 'answer', peer.connection.localDescription);
    logEvent(`Answer sent to ${signal.fromName || signal.from}.`);
  }

  async function handleAnswer(signal) {
    const peer = peers.get(signal.from);
    if (!peer) return;
    await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    logEvent(`Answer received from ${signal.fromName || signal.from}.`);
  }

  async function handleCandidate(signal) {
    const peer = peers.get(signal.from) || createPeer(signal.from, signal.fromName);
    try {
      await peer.connection.addIceCandidate(new RTCIceCandidate(signal.payload));
    } catch (error) {
      console.warn('ICE candidate failed', error);
    }
  }

  function serializePayload(payload) {
    if (!payload) return '';
    const value = typeof payload.toJSON === 'function' ? payload.toJSON() : payload;
    return JSON.stringify(value);
  }

  function parsePayload(signal) {
    if (signal.payloadJson) return JSON.parse(signal.payloadJson);
    return signal.payload || null;
  }

  function sendSignal(to, type, payload) {
    if (!signalsNode) return;
    const id = createId('signal');
    signalsNode.get(id).put({
      id,
      roomId,
      from: localId,
      fromName: localName,
      to,
      type,
      payloadJson: serializePayload(payload),
      createdAt: Date.now()
    });
  }

  function handleSignal(signal, id) {
    if (!signal || id === '_' || seenSignals.has(id)) return;
    if (signal.from === localId) return;
    if (signal.to !== localId && signal.to !== '*') return;
    if (Date.now() - Number(signal.createdAt || 0) > SIGNAL_TTL_MS) return;
    seenSignals.add(id);
    signalsHandled += 1;
    updateDiagnostics();
    Promise.resolve()
      .then(() => {
        signal.payload = parsePayload(signal);
        if (signal.type === 'announce') return handleAnnounce(signal);
        if (signal.type === 'offer') return handleOffer(signal);
        if (signal.type === 'answer') return handleAnswer(signal);
        if (signal.type === 'candidate') return handleCandidate(signal);
        return null;
      })
      .catch(error => {
        console.error('Signal handling failed', error);
        setStatus(`Signal failed: ${error.message || error}`);
      });
  }

  function publishPresence() {
    if (!participantsNode) return;
    participantsNode.get(localId).put({
      id: localId,
      name: localName,
      hasMedia: Boolean(localStream),
      joinedAt: Date.now(),
      lastSeen: Date.now()
    });
  }

  function announcePresence(reason = 'announce') {
    publishPresence();
    sendSignal('*', 'announce', {
      reason,
      hasMedia: Boolean(localStream)
    });
  }

  function shouldInitiateOffer(remoteId) {
    return String(localId) < String(remoteId);
  }

  function connectToParticipant(remoteId, remoteName) {
    if (!remoteId || remoteId === localId) return;
    createPeer(remoteId, remoteName);
    if (shouldInitiateOffer(remoteId)) {
      makeOffer(remoteId, remoteName).catch(error => {
        console.error('Offer failed', error);
        setStatus(`Offer failed: ${error.message || error}`);
      });
    }
  }

  function handleAnnounce(signal) {
    if (!joined) return null;
    connectToParticipant(signal.from, signal.fromName);
    return null;
  }

  function watchParticipants() {
    participantsNode.map().on((participant, id) => {
      if (!joined || !participant || id === '_' || id === localId) return;
      const lastSeen = Number(participant.lastSeen || 0);
      if (Date.now() - lastSeen > 45000) return;
      connectToParticipant(id, participant.name);
    });
  }

  async function joinRoom(event) {
    if (event) event.preventDefault();
    if (!localStream) {
      setStatus('Starting camera before room signaling.');
      await startCamera();
    }
    roomId = normalizeRoom(refs.roomId.value) || resolveInitialRoom();
    refs.roomId.value = roomId;
    localName = String(refs.displayName.value || '').trim() || `Guest ${localId.slice(-4)}`;
    refs.localLabel.textContent = `${localName} (you)`;
    ensureGun();
    roomNode = gun.get(ROOM_ROOT).get(roomId);
    participantsNode = roomNode.get('participants');
    signalsNode = roomNode.get('signals');
    updateRoomUrl();
    joined = true;
    refs.leaveRoom.disabled = false;
    updateDiagnostics();
    signalsNode.map().on(handleSignal);
    watchParticipants();
    announcePresence('join');
    heartbeatTimer = setInterval(() => announcePresence('heartbeat'), 10000);
    setStatus(`Joined room ${roomId}. Waiting for peers.`);
  }

  function leaveRoom() {
    joined = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (participantsNode) {
      participantsNode.get(localId).put(null);
    }
    peers.forEach(peer => {
      peer.connection.close();
      peer.tile.tile.remove();
    });
    peers.clear();
    updateDiagnostics();
    refs.leaveRoom.disabled = true;
    setStatus('Left room.');
  }

  function toggleMic() {
    if (!localStream) return;
    const enabled = !localStream.getAudioTracks().every(track => track.enabled);
    localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
    refs.toggleMic.textContent = enabled ? 'Mute mic' : 'Unmute mic';
    refs.localState.textContent = enabled ? 'Mic on' : 'Mic muted';
  }

  function toggleCamera() {
    if (!localStream) return;
    const enabled = !localStream.getVideoTracks().every(track => track.enabled);
    localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
    refs.toggleCamera.textContent = enabled ? 'Hide camera' : 'Show camera';
    refs.localState.textContent = enabled ? 'Camera on' : 'Camera hidden';
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
      refs.roomId.value = createId('room').replace(/^room_/, '3dvr-');
    });
    refs.copyLink.addEventListener('click', copyLink);
    refs.startCamera.addEventListener('click', () => {
      startCamera().catch(error => setStatus(error.message || 'Unable to start camera.'));
    });
    refs.roomForm.addEventListener('submit', joinRoom);
    refs.toggleMic.addEventListener('click', toggleMic);
    refs.toggleCamera.addEventListener('click', toggleCamera);
    refs.leaveRoom.addEventListener('click', leaveRoom);
    updateDiagnostics();
    window.addEventListener('beforeunload', () => {
      leaveRoom();
      stopLocalStream();
    });
  }

  init();
})();
