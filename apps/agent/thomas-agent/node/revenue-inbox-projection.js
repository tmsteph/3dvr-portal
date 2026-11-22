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

// A DSN-like subject or a recipient hint is not proof that we ever sent to
// that buyer. Require an attributable provider-acknowledged outbound attempt
// and a plausible delivery-agent sender before changing the CRM to bounced.
// This is an attribution check, NOT authenticated provider/DKIM verification.
function hasAcknowledgedOutbound(db, prospectId) {
  return Boolean(db.prepare(`SELECT 1 FROM delivery_attempts
    WHERE prospect_id = ? AND status = 'acknowledged'
      AND message_id != '' AND transport != '' LIMIT 1`).get(prospectId));
}

function hasDsnSender(message = {}) {
  const sender = lower(message.fromEmail || message.from);
  return /(?:^|[<@.\\s_-])(mailer-daemon|postmaster)(?:[>@.\\s_-]|$)/.test(sender)
    || /mail delivery (?:subsystem|system)/.test(sender);
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
  // An unverified prospectEmail/recipient hint must not let an unrelated
  // inbound sender suppress a different buyer's CRM record. Real opt-outs
  // from that buyer remain immediately effective; ambiguous ones go to
  // manual review rather than modifying a third party's contact state.
  if (state === 'suppressed' && lower(message.fromEmail) !== contact) {
    return { matched: false, state, reason: 'unattributed opt-out requires manual review' };
  }
  if (state === 'bounced' && (!hasAcknowledgedOutbound(db, prospect.id) || !hasDsnSender(message))) {
    return { matched: false, state, reason: 'unattributed delivery failure requires manual review' };
  }
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
    // One DSN may report failure for several distinct contacts. The inbox
    // message ID is unique per prospect, not globally unique across leads.
    idempotencyKey: `inbox:${prospect.id}:${messageId}:${state}`,
    payload: { messageId, uid: text(message.uid), subject: text(message.subject) },
  }) };
}

module.exports = { inboxState, projectInboxMessage };
