(function attachChatNotificationRouting(globalScope) {
  const DEFAULT_CHAT_ROOMS = ['general', 'ideas', 'support', 'random'];

  function getAllowedRooms(allowedRooms) {
    if (Array.isArray(allowedRooms) && allowedRooms.length) {
      return allowedRooms
        .map((room) => (typeof room === 'string' ? room.trim().toLowerCase() : ''))
        .filter(Boolean);
    }
    return DEFAULT_CHAT_ROOMS.slice();
  }

  function normalizeRoomName(room, allowedRooms, fallbackRoom = DEFAULT_CHAT_ROOMS[0]) {
    const rooms = getAllowedRooms(allowedRooms);
    const fallback = rooms.includes(fallbackRoom) ? fallbackRoom : rooms[0];
    const normalized = typeof room === 'string' ? room.trim().toLowerCase() : '';
    return rooms.includes(normalized) ? normalized : fallback;
  }

  function normalizeMessageId(messageId) {
    return typeof messageId === 'string' ? messageId.trim() : '';
  }

  function parseLegacyHash(strippedHash, allowedRooms, fallbackRoom) {
    const [rawRoom = '', ...messageParts] = strippedHash.split('/');
    const decodedRoom = decodeURIComponent(rawRoom);
    const normalizedRoom = normalizeRoomName(decodedRoom, allowedRooms, '');

    if (!normalizedRoom) {
      return {
        room: fallbackRoom,
        messageId: '',
        hasExplicitRoom: false
      };
    }

    return {
      room: normalizedRoom,
      messageId: normalizeMessageId(
        messageParts.length ? decodeURIComponent(messageParts.join('/')) : ''
      ),
      hasExplicitRoom: true
    };
  }

  function parseChatLocationHash(hash, options = {}) {
    const rooms = getAllowedRooms(options.allowedRooms);
    const fallbackRoom = normalizeRoomName(options.fallbackRoom, rooms, rooms[0]);
    const rawHash = typeof hash === 'string' ? hash.trim() : '';
    const strippedHash = rawHash.replace(/^#/, '').trim();

    if (!strippedHash) {
      return {
        room: fallbackRoom,
        messageId: '',
        hasExplicitRoom: false
      };
    }

    const params = new URLSearchParams(strippedHash);
    if (params.has('room') || params.has('message')) {
      return {
        room: normalizeRoomName(params.get('room'), rooms, fallbackRoom),
        messageId: normalizeMessageId(params.get('message')),
        hasExplicitRoom: params.has('room')
      };
    }

    return parseLegacyHash(strippedHash, rooms, fallbackRoom);
  }

  function buildChatNotificationHash(target = {}, options = {}) {
    const rooms = getAllowedRooms(options.allowedRooms);
    const fallbackRoom = normalizeRoomName(options.fallbackRoom, rooms, rooms[0]);
    const params = new URLSearchParams();
    params.set('room', normalizeRoomName(target.room, rooms, fallbackRoom));

    const messageId = normalizeMessageId(target.messageId);
    if (messageId) {
      params.set('message', messageId);
    }

    return `#${params.toString()}`;
  }

  function buildChatNotificationUrl(target = {}, options = {}) {
    const basePath = typeof options.basePath === 'string' && options.basePath.trim()
      ? options.basePath.trim()
      : '/chat/';
    const cleanBasePath = basePath.split('#')[0];
    return `${cleanBasePath}${buildChatNotificationHash(target, options)}`;
  }

  globalScope.ChatNotificationRouting = {
    DEFAULT_CHAT_ROOMS,
    normalizeRoomName,
    normalizeMessageId,
    parseChatLocationHash,
    buildChatNotificationHash,
    buildChatNotificationUrl
  };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
