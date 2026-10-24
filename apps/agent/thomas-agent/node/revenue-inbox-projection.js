const { findProspectByContact, transitionProspect } = require('./revenue-ledger');

function text(value) { return String(value || '').trim(); }
function lower(value) { return text(value).toLowerCase(); }

function inboxState(message = {}) {
  const sender = lower(message.from);
  const subject = lower(message.subject);
  const preview = lower(message.preview);
  // A delivery failure can quote the original message's unsubscribe footer.
  // It must be recorded as a bounce, not mistaken for the recipient opting out.
  if (/mailer-daemon|postmaster/.test(sender) ||
      /delivery status notification|undeliver|delivery failure|\bbounce\b/.test(subject)) {
    return 'bounced';
  }
  // "Can you stop by?" is a reply, not consent to suppress a contact.
  // Recognize standalone STOP and explicit opt-out requests, not any "stop".
  const content = `${subject}\n${preview}`;
  if (/unsubscribe|remove me|do not contact|don'?t contact|opt[ -]?out|stop (?:emailing|contacting|messaging|sending)/.test(content) ||
      /^stop[.!]?$/.test(preview || subject)) {
    return 'suppressed';
  }
  return 'replied';
}

function projectInboxMessage(db, message = {}) {
  const state = inboxState(message);
  // Recipient/prospect hints can be stale on an ordinary inbound reply.
  // Only delivery failures should prefer the original outbound recipient.
  const contact = lower(state === 'bounced'
    ? message.prospectEmail || message.recipient || message.originalRecipient || message.fromEmail
    : message.fromEmail || message.prospectEmail || message.recipient || message.originalRecipient);
  const messageId = text(message.messageId || message.uid);
  if (!contact || !messageId) throw new Error('Inbox projection requires contact and messageId');
  const prospect = findProspectByContact(db, contact);
  if (!prospect) return { matched: false, state };
  if (prospect.state === state || prospect.state === 'suppressed') return { matched: true, replayed: true, prospect };
  if (!['sent', 'replied'].includes(prospect.state) && state !== 'suppressed') {
    throw new Error(`Inbox event ${state} is invalid for ${prospect.state} prospect`);
  }
  return { matched: true, ...transitionProspect(db, {
    prospectId: prospect.id,
    toState: state,
    type: `inbox_${state}`,
    // A single provider bounce may list multiple recipients with the same message ID.
    // Scope deduplication to the canonical prospect so each recipient can be
    // updated once without colliding with another prospect's ledger event.
    idempotencyKey: `inbox:${messageId}:${state}:${prospect.id}`,
    payload: { messageId, uid: text(message.uid), subject: text(message.subject) },
  }) };
}

module.exports = { inboxState, projectInboxMessage };
