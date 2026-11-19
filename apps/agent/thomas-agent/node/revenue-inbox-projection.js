const { findProspectByContact, transitionProspect } = require('./revenue-ledger');

function text(value) { return String(value || '').trim(); }
function lower(value) { return text(value).toLowerCase(); }

function inboxState(message = {}) {
  const haystack = `${message.from || ''} ${message.subject || ''} ${message.preview || ''}`.toLowerCase();
  if (/unsubscribe|remove me|do not contact|don'?t contact|\bstop\b/.test(haystack)) return 'suppressed';
  if (/mailer-daemon|postmaster|delivery status notification|undeliver|delivery failure|\bbounce/.test(haystack)) return 'bounced';
  return 'replied';
}

// The sender's email address and a "Re:" subject are not proof of a
// commercial reply. Require an explicit In-Reply-To / References link to a
// provider-attributed outbound message recorded for this same prospect.
// This screens structured inbox state, not unauthenticated mailboxes/files.
function referencedMessageIds(message = {}) {
  return [message.inReplyTo, message.references]
    .flatMap(value => String(value || '').match(/<[^<>\s]+>|[^\s,]+/g) || [])
    .map(value => value.replace(/^<|>$/g, '').toLowerCase())
    .filter(Boolean);
}

function hasAcknowledgedThreadLink(db, prospectId, message) {
  const ids = new Set(referencedMessageIds(message));
  if (!ids.size) return false;
  return db.prepare(`SELECT message_id FROM delivery_attempts
    WHERE prospect_id = ? AND status = 'acknowledged' AND message_id != ''`)
    .all(prospectId)
    .some(row => ids.has(String(row.message_id).trim().replace(/^<|>$/g, '').toLowerCase()));
}

function projectInboxMessage(db, message = {}) {
  const contact = lower(message.prospectEmail || message.recipient || message.originalRecipient || message.fromEmail);
  const messageId = text(message.messageId || message.uid);
  if (!contact || !messageId) throw new Error('Inbox projection requires contact and messageId');
  const prospect = findProspectByContact(db, contact);
  if (!prospect) return { matched: false, state: inboxState(message) };
  const state = inboxState(message);
  if (state === 'replied' && (
    lower(message.fromEmail) !== contact ||
    !hasAcknowledgedThreadLink(db, prospect.id, message)
  )) {
    return { matched: false, state, reason: 'unlinked reply requires manual review' };
  }
  if (prospect.state === state || prospect.state === 'suppressed') return { matched: true, replayed: true, prospect };
  if (!['sent', 'replied'].includes(prospect.state) && state !== 'suppressed') {
    throw new Error(`Inbox event ${state} is invalid for ${prospect.state} prospect`);
  }
  return { matched: true, ...transitionProspect(db, {
    prospectId: prospect.id,
    toState: state,
    type: `inbox_${state}`,
    idempotencyKey: `inbox:${messageId}:${state}`,
    payload: { messageId, uid: text(message.uid), subject: text(message.subject) },
  }) };
}

module.exports = { inboxState, projectInboxMessage };
