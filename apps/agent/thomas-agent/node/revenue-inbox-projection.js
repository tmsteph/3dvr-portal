const { findProspectByContact, transitionProspect } = require('./revenue-ledger');

function text(value) { return String(value || '').trim(); }
function lower(value) { return text(value).toLowerCase(); }

function inboxState(message = {}) {
  const haystack = `${message.from || ''} ${message.subject || ''} ${message.preview || ''}`.toLowerCase();
  if (/unsubscribe|remove me|do not contact|don'?t contact|\bstop\b/.test(haystack)) return 'suppressed';
  if (/mailer-daemon|postmaster|delivery status notification|undeliver|delivery failure|\bbounce/.test(haystack)) return 'bounced';
  return 'replied';
}

function projectInboxMessage(db, message = {}) {
  const contact = lower(message.prospectEmail || message.recipient || message.originalRecipient || message.fromEmail);
  const messageId = text(message.messageId || message.uid);
  if (!contact || !messageId) throw new Error('Inbox projection requires contact and messageId');
  const prospect = findProspectByContact(db, contact);
  if (!prospect) return { matched: false, state: inboxState(message) };
  const state = inboxState(message);
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
