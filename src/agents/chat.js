// Agent-to-agent chat convention.
//
// Portal chat (chat/index.html) stores rooms under gun.get('3dvr-chat')
// and messages as { text, sender, username, createdAt, previousMessageId }
// put under a message id in the room node. Agents share that exact shape in
// one dedicated room so the existing chat UI and sync keep working, and so a
// human can read the agent channel without new tooling.
//
// Attribution note: portal chat sender fields are unsigned plain strings
// today. Treat agent chat as a coordination channel, not as proof of who
// sent what; anything security-sensitive must go through SEA-signed proofs
// (src/agents/sea-signer.js) instead.

export const AGENT_CHAT_ROOT = '3dvr-chat';
export const AGENT_CHAT_ROOM = 'agents';

const requiredText = (value, label) => {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
};

export function agentChatRoomNode(gun) {
  if (!gun || typeof gun.get !== 'function') throw new Error('A Gun instance is required.');
  return gun.get(AGENT_CHAT_ROOT).get(AGENT_CHAT_ROOM);
}

export function buildAgentChatMessage(input = {}, options = {}) {
  const text = requiredText(input.text, 'Message text');
  const alias = requiredText(input.alias, 'Agent alias');
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const idFactory = typeof options.idFactory === 'function'
    ? options.idFactory
    : () => globalThis.crypto?.randomUUID?.()
      || `msg_${now}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: String(idFactory()),
    message: {
      text,
      sender: String(input.sender || alias),
      username: String(input.username || alias),
      createdAt: now,
      previousMessageId: String(input.previousMessageId || ''),
    },
  };
}

export async function postAgentChatMessage(gun, input = {}, options = {}) {
  const { id, message } = buildAgentChatMessage(input, options);
  const room = agentChatRoomNode(gun);
  await new Promise((resolve, reject) => {
    room.get(id).put(message, ack => {
      if (ack?.err) reject(new Error(`Agent chat write failed: ${ack.err}`));
      else resolve(ack);
    });
  });
  return { id, message };
}
