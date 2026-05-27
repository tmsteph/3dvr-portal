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
    gunStatus: document.getElementById('gun-status'),
    announceCount: document.getElementById('announce-count'),
    turnStatus: document.getElementById('turn-status'),
    iceStatus: document.getElementById('ice-status'),
    relayCandidates: document.getElementById('relay-candidates'),
    eventLog: document.getElementById('event-log')
  };

  const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ];
  const DEFAULT_GUN_PEERS = Object.freeze([
    'wss://gun-relay-3dvr.fly.dev/gun',
    'https://gun-relay-3dvr.fly.dev/gun'
  ]);
  const ROOM_ROOT = '3dvr-webrtc-lab-v2';
  const SIGNAL_TTL_MS = 1000 * 60 * 20;
  const PEER_SESSION_KEY = 'webrtcLabParticipantId';
  const LOW_BANDWIDTH_VIDEO = Object.freeze({
    width: 320,
    height: 180,
    frameRate: 10,
    maxBitrate: 240000
  });

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
  let discoveryTimers = [];
  let signalsHandled = 0;
  let announcesHandled = 0;
  let iceServers = DEFAULT_ICE_SERVERS;
  let iceServersLoaded = false;
  let turnStatus = 'STUN only';
  let iceStatus = 'Idle';
  let localRelayCandidateCount = 0;
  let remoteRelayCandidateCount = 0;
  let gunStatus = 'Not connected';
  let gunPeers = [];
  let gunConnected = false;
  let gunConnectionWaiters = [];
  const peers = new Map();
  const seenSignals = new Set();
  const localCandidateKeys = new Set();
  const remoteCandidateKeys = new Set();

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
    if (refs.gunStatus) refs.gunStatus.textContent = gunStatus;
    if (refs.announceCount) refs.announceCount.textContent = String(announcesHandled);
    refs.turnStatus.textContent = turnStatus;
    if (refs.iceStatus) refs.iceStatus.textContent = iceStatus;
    if (refs.relayCandidates) {
      refs.relayCandidates.textContent = `${localRelayCandidateCount} local / ${remoteRelayCandidateCount} remote`;
    }
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
    gunPeers = configuredGunPeers();
    gunStatus = `Connecting (${gunPeers.length})`;
    updateDiagnostics();
    gun = Gun({
      peers: gunPeers,
      axe: true,
      // WebRTC room presence/signals are temporary; browser storage can make mobile clients look connected
      // while their writes remain stuck locally.
      radisk: false,
      localStorage: false
    });
    logEvent(`Gun signaling peers: ${gunPeers.join(', ')}.`);
    if (typeof gun.on === 'function') {
      gun.on('hi', peer => {
        gunConnected = true;
        gunStatus = 'Connected';
        updateDiagnostics();
        logEvent(`Gun relay connected: ${peer?.url || 'relay'}.`);
        resolveGunConnectionWaiters(true);
        if (joined) {
          announcePresence('relay-connected');
          readParticipantsOnce();
        }
      });
      gun.on('bye', peer => {
        gunConnected = false;
        gunStatus = 'Reconnecting';
        updateDiagnostics();
        logEvent(`Gun relay disconnected: ${peer?.url || 'relay'}.`);
      });
    }
    return gun;
  }

  function resolveGunConnectionWaiters(value) {
    const waiters = gunConnectionWaiters;
    gunConnectionWaiters = [];
    waiters.forEach(resolve => resolve(value));
  }

  function waitForGunConnection(timeoutMs = 15000) {
    if (gunConnected) return Promise.resolve(true);
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        gunConnectionWaiters = gunConnectionWaiters.filter(waiter => waiter !== done);
        resolve(false);
      }, timeoutMs);
      function done(value) {
        clearTimeout(timeout);
        resolve(value);
      }
      gunConnectionWaiters.push(done);
    });
  }

  function configuredGunPeers() {
    const configured = Array.isArray(window.__GUN_PEERS__) ? window.__GUN_PEERS__ : [];
    const peersToUse = Array.from(new Set([...configured, ...DEFAULT_GUN_PEERS]
      .map(peer => (typeof peer === 'string' ? peer.trim() : ''))
      .filter(Boolean)));
    return peersToUse.length ? peersToUse : [...DEFAULT_GUN_PEERS];
  }

  function shouldForceRelayOnly() {
    const params = new URLSearchParams(window.location.search);
    return params.get('relay') === '1' || params.get('ice') === 'relay';
  }

  function normalizeIceServers(servers) {
    if (!Array.isArray(servers)) return [];
    return servers
      .map(server => {
        if (!server || typeof server !== 'object') return null;
        const urls = Array.isArray(server.urls)
          ? server.urls.filter(url => typeof url === 'string' && url.trim())
          : (typeof server.urls === 'string' && server.urls.trim() ? [server.urls.trim()] : []);
        if (!urls.length) return null;

        const normalized = { urls };
        if (typeof server.username === 'string') normalized.username = server.username;
        if (typeof server.credential === 'string') normalized.credential = server.credential;
        return normalized;
      })
      .filter(Boolean);
  }

  async function loadIceServers() {
    if (iceServersLoaded) return iceServers;
    iceServersLoaded = true;

    try {
      const response = await fetch('/api/session?route=turn-credentials', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`TURN credentials returned ${response.status}`);
      }

      const data = await response.json();
      const nextServers = normalizeIceServers(data.iceServers);
      if (nextServers.length) {
        iceServers = nextServers;
      }

      turnStatus = data.configured
        ? (shouldForceRelayOnly() ? 'TURN relay-only' : 'TURN ready')
        : 'STUN only';
      updateDiagnostics();
      logEvent(data.configured ? 'TURN relay credentials loaded.' : 'Using STUN only.');
    } catch (error) {
      console.warn('TURN credential load failed', error);
      turnStatus = 'STUN only';
      updateDiagnostics();
      logEvent('TURN credentials unavailable; using STUN only.');
    }

    return iceServers;
  }

  async function startCamera() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('This browser does not expose camera/mic access.');
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: LOW_BANDWIDTH_VIDEO.width },
        height: { ideal: LOW_BANDWIDTH_VIDEO.height },
        frameRate: { ideal: LOW_BANDWIDTH_VIDEO.frameRate, max: 12 }
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
      addLocalTracksToConnection(peer.connection);
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
    const connectionConfig = { iceServers };
    if (shouldForceRelayOnly()) {
      connectionConfig.iceTransportPolicy = 'relay';
    }
    const connection = new RTCPeerConnection(connectionConfig);
    const peer = {
      id: remoteId,
      name: remoteName || 'Guest',
      connection,
      stream: new MediaStream(),
      tile: createRemoteTile(remoteId, remoteName),
      signalQueue: Promise.resolve()
    };
    peers.set(remoteId, peer);
    updateDiagnostics();

    addLocalTracksToConnection(connection);

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
        recordCandidate('local', event.candidate.candidate, peer.name);
        sendSignal(remoteId, 'candidate', event.candidate);
      }
    };

    connection.onicecandidateerror = event => {
      const target = event.url || 'ICE server';
      const detail = event.errorText || event.errorCode || 'candidate error';
      logEvent(`${target} failed: ${detail}.`);
    };

    connection.onicegatheringstatechange = () => {
      iceStatus = `Gathering ${connection.iceGatheringState}`;
      updateDiagnostics();
    };

    connection.oniceconnectionstatechange = () => {
      iceStatus = connection.iceConnectionState;
      updateDiagnostics();
      if (['failed', 'disconnected'].includes(connection.iceConnectionState)) {
        logEvent(`${peer.name} ICE ${connection.iceConnectionState}.`);
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

  function describeIceCandidate(candidateText = '') {
    const candidate = String(candidateText || '');
    const type = candidate.match(/\btyp\s+([a-z0-9]+)/i)?.[1] || 'unknown';
    const protocol = candidate.match(/\b(udp|tcp)\b/i)?.[1]?.toUpperCase() || 'ICE';
    const address = candidate.match(/candidate:\S+\s+\d+\s+\S+\s+\d+\s+([^\s]+)\s+(\d+)/i);
    const endpoint = address ? `${address[1]}:${address[2]}` : '';
    return { type, protocol, endpoint };
  }

  function recordCandidate(kind, candidateText = '', remoteName = '') {
    const candidate = String(candidateText || '');
    if (!candidate) return;

    const seen = kind === 'local' ? localCandidateKeys : remoteCandidateKeys;
    const key = `${kind}:${candidate}`;
    if (seen.has(key)) return;
    seen.add(key);

    const detail = describeIceCandidate(candidate);
    if (detail.type === 'relay') {
      if (kind === 'local') localRelayCandidateCount += 1;
      else remoteRelayCandidateCount += 1;

      const source = kind === 'local' ? 'Local' : `Remote${remoteName ? ` ${remoteName}` : ''}`;
      logEvent(`${source} relay candidate found (${detail.protocol}${detail.endpoint ? ` ${detail.endpoint}` : ''}).`);
    }
    updateDiagnostics();
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

  function addLocalTracksToConnection(connection) {
    if (!localStream) return;
    const senders = connection.getSenders();
    localStream.getTracks().forEach(track => {
      const existing = senders.find(sender => sender.track && sender.track.id === track.id);
      const sender = existing || addTrackToConnection(connection, track);
      if (track.kind === 'video') configureVideoSender(sender);
    });
  }

  function addTrackToConnection(connection, track) {
    if (
      track.kind === 'video' &&
      typeof connection.addTransceiver === 'function'
    ) {
      const transceiver = connection.addTransceiver(track, {
        streams: [localStream],
        sendEncodings: [{
          maxBitrate: LOW_BANDWIDTH_VIDEO.maxBitrate,
          maxFramerate: LOW_BANDWIDTH_VIDEO.frameRate
        }]
      });
      return transceiver.sender;
    }
    return connection.addTrack(track, localStream);
  }

  function configureVideoSender(sender) {
    if (
      !sender ||
      !sender.track ||
      sender.track.kind !== 'video' ||
      typeof sender.getParameters !== 'function' ||
      typeof sender.setParameters !== 'function'
    ) {
      return;
    }

    const parameters = sender.getParameters();
    const encodings = parameters.encodings && parameters.encodings.length
      ? parameters.encodings
      : [{}];
    parameters.encodings = encodings.map(encoding => ({
      ...encoding,
      maxBitrate: LOW_BANDWIDTH_VIDEO.maxBitrate,
      maxFramerate: LOW_BANDWIDTH_VIDEO.frameRate
    }));
    sender.setParameters(parameters).catch(error => {
      console.warn('Unable to apply low-bandwidth video sender settings', error);
    });
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
    return queuePeerSignal(peer, async () => {
      if (!localStream) await startCamera();

      const offerCollision = peer.makingOffer || peer.connection.signalingState !== 'stable';
      if (offerCollision && shouldInitiateOffer(signal.from)) {
        logEvent(`Ignored collided offer from ${signal.fromName || signal.from}.`);
        return;
      }

      if (offerCollision && typeof peer.connection.setLocalDescription === 'function') {
        try {
          await peer.connection.setLocalDescription({ type: 'rollback' });
        } catch (error) {
          console.warn('Offer rollback failed', error);
        }
      }

      if (peer.connection.signalingState !== 'stable') {
        logEvent(`Skipped offer from ${signal.fromName || signal.from}; state is ${peer.connection.signalingState}.`);
        return;
      }

      await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
      if (peer.connection.signalingState !== 'have-remote-offer') {
        logEvent(`Skipped answer for ${signal.fromName || signal.from}; state is ${peer.connection.signalingState}.`);
        return;
      }

      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      sendSignal(signal.from, 'answer', peer.connection.localDescription);
      logEvent(`Answer sent to ${signal.fromName || signal.from}.`);
    });
  }

  async function handleAnswer(signal) {
    const peer = peers.get(signal.from);
    if (!peer) return;
    return queuePeerSignal(peer, async () => {
      if (peer.connection.signalingState !== 'have-local-offer') {
        logEvent(`Ignored stale answer from ${signal.fromName || signal.from}; state is ${peer.connection.signalingState}.`);
        return;
      }
      await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
      logEvent(`Answer received from ${signal.fromName || signal.from}.`);
    });
  }

  async function handleCandidate(signal) {
    const peer = peers.get(signal.from) || createPeer(signal.from, signal.fromName);
    recordCandidate('remote', signal.payload?.candidate || '', signal.fromName);
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

  function queuePeerSignal(peer, task) {
    const run = peer.signalQueue
      .catch(() => {})
      .then(task);
    peer.signalQueue = run.catch(error => {
      console.warn('Queued peer signal failed', error);
    });
    return run;
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
    const isNewPeer = !peers.has(remoteId);
    createPeer(remoteId, remoteName);
    if (isNewPeer && shouldInitiateOffer(remoteId)) {
      makeOffer(remoteId, remoteName).catch(error => {
        console.error('Offer failed', error);
        setStatus(`Offer failed: ${error.message || error}`);
      });
    }
  }

  function handleAnnounce(signal) {
    if (!joined) return null;
    announcesHandled += 1;
    updateDiagnostics();
    connectToParticipant(signal.from, signal.fromName);
    return null;
  }

  function handleParticipant(participant, id) {
    if (!joined || !participant || id === '_' || id === localId) return;
    const remoteId = participant.id || id;
    if (!remoteId || remoteId === localId) return;
    const lastSeen = Number(participant.lastSeen || 0);
    if (Date.now() - lastSeen > 45000) return;
    connectToParticipant(remoteId, participant.name);
  }

  function watchParticipants() {
    participantsNode.map().on(handleParticipant);
  }

  function readParticipantsOnce() {
    if (!participantsNode) return;
    participantsNode.map().once(handleParticipant);
  }

  function clearDiscoveryTimers() {
    discoveryTimers.forEach(timer => clearTimeout(timer));
    discoveryTimers = [];
  }

  function scheduleDiscoveryRetries() {
    clearDiscoveryTimers();
    [800, 2200, 5200, 10000, 18000].forEach((delay, index) => {
      const timer = setTimeout(() => {
        if (!joined) return;
        announcePresence(`discovery-${index + 1}`);
        readParticipantsOnce();
        logEvent(`Discovery retry ${index + 1} sent.`);
      }, delay);
      discoveryTimers.push(timer);
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
    setStatus('Connecting to Gun relay before room signaling.');
    const [_iceServers, relayReady] = await Promise.all([
      loadIceServers(),
      waitForGunConnection()
    ]);
    if (!relayReady) {
      logEvent('Gun relay is still connecting; room signaling may be delayed.');
    }
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
    readParticipantsOnce();
    scheduleDiscoveryRetries();
    heartbeatTimer = setInterval(() => {
      announcePresence('heartbeat');
      readParticipantsOnce();
    }, 10000);
    setStatus(`Joined room ${roomId}. Waiting for peers.`);
  }

  function leaveRoom() {
    joined = false;
    clearDiscoveryTimers();
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
