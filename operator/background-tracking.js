export function backgroundTaskForMessage(message = {}) {
  if (message.backgroundTask?.kind) return message.backgroundTask;
  if (message.role !== 'assistant' || !message.actionUrl) return null;
  try {
    const url = new URL(message.actionUrl, 'https://portal.3dvr.tech');
    if (!['portal.3dvr.tech', 'operator.3dvr.tech'].includes(url.hostname)
      || url.pathname !== '/forge/record.html' || url.searchParams.get('kind') !== 'edit'
      || !/^operator-task-[a-zA-Z0-9_-]+$/.test(url.searchParams.get('id') || '')) return null;
    return { kind: 'forge', value: message.actionUrl };
  } catch { return null; }
}

export function createOperatorTaskTracker({ watch, onChange = () => {}, onStatus = () => {}, onError = () => {} }) {
  const tracked = new Map();
  function refresh(conversations = []) {
    const candidates = conversations.flatMap(conversation =>
      (conversation.messages || []).map(message => ({ conversation, message })));
    for (const { conversation, message } of candidates.sort((a, b) => String(b.message.createdAt || b.conversation.updatedAt || '').localeCompare(String(a.message.createdAt || a.conversation.updatedAt || '')))) {
      const background = backgroundTaskForMessage(message);
      if (!background || message.backgroundTerminal) continue;
      const key = conversation.id + ':' + message.id;
      const previous = tracked.get(key);
      if (previous?.message === message) continue;
      previous?.stop?.();
      if (!previous && tracked.size >= 20) continue;
      message.backgroundTask = background;
      message.backgroundReply ??= message.content || '';
      const entry = { message, stop: null };
      tracked.set(key, entry);
      Promise.resolve(watch({ backgroundTask: background }, {
        onStatus: text => { if (tracked.get(key) === entry) onStatus(text, message); },
        onUpdate: update => {
          if (tracked.get(key) !== entry) return;
          message.backgroundStatus = update.status;
          message.backgroundTerminal = update.terminal === true;
          message.content = [message.backgroundReply, update.message].filter(Boolean).join('\n\n');
          onChange(conversation, message, update);
          if (update.terminal) {
            tracked.delete(key);
            entry.stop?.();
          }
        }
      })).then(stop => {
        entry.stop = stop;
        if (tracked.get(key) !== entry) stop?.();
      }).catch(error => {
        if (tracked.get(key) === entry) {
          tracked.delete(key);
          onError(error, message);
        }
      });
    }
  }
  return { refresh, stop() { for (const entry of tracked.values()) entry.stop?.(); tracked.clear(); } };
}
