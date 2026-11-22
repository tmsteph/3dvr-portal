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

// A correlated delivery-status message can confirm successful delivery or a
// temporary delay. Neither is evidence of a permanent bounce or a lost buyer.
// Preserve ambiguous/mixed outcomes for review; do not update CRM to Lost.
function nonFailureDsn(message = {}) {
  const details = `${message.subject || ''} ${message.preview || ''}`;
  return /\bstatus:\s*[24]\.\d{1,3}\.\d{1,3}\b/i.test(details)
    || /\bdelivery status notification\s*\(\s*(?:success|delay|delayed)\s*\)/i.test(details)
    || /\b(?:successfully delivered|delivery (?:was )?successful|(?:message|mail) was delivered|delivery (?:was )?delayed|temporarily deferred)\b/i.test(details);
}

// A DSN-like subject or a recipient hint is not proof of which outbound
// message failed. Require a link to this same prospect's acknowledged provider
// Message-ID, plus a plausible delivery-agent sender, before marking bounced.
// This is correlation only, NOT authenticated DSN/DKIM verification.

function hasDsnSender(message = {}) {
  const sender = lower(message.fromEmail || message.from);
  return /(?:^|[<@._ -])(mailer-daemon|postmaster)(?:[>@._ -]|$)/.test(sender)
    || /mail delivery (?:subsystem|system)/.test(sender);
}

function hasAcknowledgedThreadLink(db, prospectId, message) {
  const ids = new Set(referencedMessageIds(message));
  if (!ids.size) return false;
  return db.prepare(`SELECT message_id FROM delivery_attempts
    WHERE prospect_id = ? AND status = 'acknowledged'
      AND message_id != '' AND transport != ''`)
    .all(prospectId)
    .some(row => ids.has(String(row.message_id).trim().replace(/^<|>$/g, '').toLowerCase()));
}

// DSNs often supply the failed message's ID as Original-Message-ID rather
// than In-Reply-To. Only the bounce path may use these additional fields:
// an ordinary human reply still needs its own real References/In-Reply-To.
function hasAcknowledgedBounceLink(db, prospectId, message) {
  const originals = Array.isArray(message.originalMessageIds)
    ? message.originalMessageIds : [message.originalMessageIds];
  return hasAcknowledgedThreadLink(db, prospectId, {
    inReplyTo: [message.inReplyTo, message.originalMessageId].filter(Boolean).join(' '),
    references: [message.references, ...originals].filter(Boolean).join(' '),
  });
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
  if (state === 'bounced' && nonFailureDsn(message)) {
    return { matched: false, state, reason: 'non-failure delivery notice requires manual review' };
  }
  if (state === 'bounced' && (!hasDsnSender(message) || !hasAcknowledgedBounceLink(db, prospect.id, message))) {
    return { matched: false, state, reason: 'unattributed delivery failure requires manual review' };
  }
  if (state === 'replied' && (
    lower(message.fromEmail) !== contact ||
    !hasAcknowledgedThreadLink(db, prospect.id, message)
  )) {
    return { matched: false, state, reason: 'unlinked reply requires manual review' };
  }
  // A new message ID from a buyer who already replied is not a replay.
  // Let the ledger persist a second inbox_replied event and CRM touch; only
  // the same message ID is idempotent. Suppression remains terminal.
  if ((prospect.state === state && state !== 'replied') || prospect.state === 'suppressed') {
    return { matched: true, replayed: true, prospect };
  }
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
