const fs = require('node:fs');
const { inboxState, projectInboxMessage } = require('./revenue-inbox-projection');

function consumeInboxState(db, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { scanned: 0, matched: 0, unmatched: 0, errors: [] };
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const result = { scanned: 0, matched: 0, unmatched: 0, errors: [] };
  for (const [messageId, message] of Object.entries(state.messages || {})) {
    // A bounce's multi-recipient hints are not identities for ordinary replies
    // or opt-outs. Otherwise an unrelated reply carrying stale bounceEmails
    // could advance the wrong prospect's CRM state.
    const contacts = inboxState(message) === 'bounced' &&
      Array.isArray(message.bounceEmails) && message.bounceEmails.length
      ? message.bounceEmails
      : [message.prospectEmail || message.recipient || message.originalRecipient || message.fromEmail];
    for (const contact of contacts.filter(Boolean)) {
      result.scanned += 1;
      try {
        const projected = projectInboxMessage(db, { ...message, messageId, prospectEmail: contact });
        if (projected.matched) result.matched += 1;
        else result.unmatched += 1;
      } catch (error) {
        result.errors.push(`${messageId}: ${error?.message || error}`);
      }
    }
  }
  return result;
}

module.exports = { consumeInboxState };
