function clean(value) {
  return String(value || '').trim();
}

function compact(value, max = 260) {
  const text = clean(value).replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = clean(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function escapeCsv(value = '') {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function bulletList(items = [], fallback = 'None recorded.') {
  const usable = items.map(clean).filter(Boolean);
  if (!usable.length) return `- ${fallback}`;
  return usable.map(item => `- ${item}`).join('\n');
}

function inferBriefMode({ mode = 'auto', now = new Date() } = {}) {
  const requested = clean(mode).toLowerCase();
  if (['day', 'morning'].includes(requested)) return 'day';
  if (['night', 'evening'].includes(requested)) return 'night';
  const utcHour = now.getUTCHours();
  return utcHour >= 0 && utcHour < 12 ? 'night' : 'day';
}

function modeTitle(mode) {
  return mode === 'night' ? 'Night Money Brief' : 'Day Money Brief';
}

function modeAction(mode) {
  if (mode === 'night') {
    return 'Pick one person for tomorrow and leave the message ready to send.';
  }
  return 'Send or edit one message to one likely person today.';
}

function selectDrafts(autopilot = {}, limit = 3) {
  const drafts = Array.isArray(autopilot.adDrafts) ? autopilot.adDrafts : [];
  return drafts
    .filter(item => clean(item?.body))
    .slice(0, limit)
    .map((item, index) => ({
      id: clean(item.id) || `draft-${index + 1}`,
      channel: clean(item.channel) || 'text',
      headline: clean(item.headline) || 'Personal outreach',
      body: clean(item.body),
      cta: clean(item.cta) || 'Send the basics'
    }));
}

function buildLeadQueue(autopilot = {}, { mode = 'day' } = {}) {
  const drafts = selectDrafts(autopilot, 3);
  const opportunity = autopilot.topOpportunity || {};
  const audience = clean(opportunity.audience) || clean(autopilot.market) || 'a warm local contact';
  const runId = clean(autopilot.runId) || 'money-run';

  return drafts.map((draft, index) => ({
    id: `${runId}-lead-${index + 1}`,
    priority: index + 1,
    segment: index === 0 ? audience : `${draft.channel} contact: ${audience}`,
    channel: draft.channel,
    status: 'suggested',
    nextStep: modeAction(mode),
    messageDraft: draft.body,
    cta: draft.cta,
    contactedAt: '',
    replyStatus: '',
    pageStatus: '',
    subscriptionStatus: '',
    notes: ''
  }));
}

export function leadQueueToCsv(queue = []) {
  const columns = [
    'id',
    'priority',
    'segment',
    'channel',
    'status',
    'nextStep',
    'messageDraft',
    'cta',
    'contactedAt',
    'replyStatus',
    'pageStatus',
    'subscriptionStatus',
    'notes'
  ];

  return [
    columns.join(','),
    ...queue.map(row => columns.map(column => escapeCsv(row[column])).join(','))
  ].join('\n') + '\n';
}

export function buildMoneyOperatorBrief({ autopilot = {}, mode = 'auto', now = new Date() } = {}) {
  const resolvedMode = inferBriefMode({ mode, now });
  const title = modeTitle(resolvedMode);
  const opportunity = autopilot.topOpportunity || {};
  const destinationUrl = clean(autopilot.publish?.destinationUrl)
    || clean(autopilot.promotion?.destinationUrl)
    || clean(autopilot.monetization?.checkoutUrl)
    || 'https://portal.3dvr.tech/free-page/';
  const drafts = selectDrafts(autopilot, 3);
  const leadQueue = buildLeadQueue(autopilot, { mode: resolvedMode });
  const warnings = Array.isArray(autopilot.warnings) ? autopilot.warnings : [];
  const checklist = Array.isArray(autopilot.executionChecklist) ? autopilot.executionChecklist.slice(0, 5) : [];
  const generatedAt = clean(autopilot.generatedAt) || now.toISOString();
  const price = clean(opportunity.suggestedPrice) || 'Free draft, then $5/month to keep it live';
  const score = Number.isFinite(Number(opportunity.score)) ? Number(opportunity.score) : null;

  const draftLines = drafts.map((draft, index) => [
    `${index + 1}. ${draft.channel}: ${draft.headline}`,
    `   ${compact(draft.body, 360)}`,
    `   CTA: ${draft.cta}`
  ].join('\n'));

  const leadLines = leadQueue.map(item => (
    `${item.priority}. ${compact(item.segment, 140)} — ${item.channel} — ${item.status}`
  ));

  const markdown = `# ${title}

Generated: ${generatedAt}
Run: ${clean(autopilot.runId) || 'unknown'}

## One Thing

${modeAction(resolvedMode)}

## Offer Angle

- Offer: ${clean(opportunity.title) || '3DVR Free Page'}
- Audience: ${clean(opportunity.audience) || clean(autopilot.market) || 'warm contacts who need a simple first website'}
- Price path: ${price}
- Score: ${score === null ? 'not scored' : score}
- Destination: ${destinationUrl}

## Why This Should Work

${compact(clean(opportunity.problem) || 'Most people need one clear page before they need a full site.', 420)}

${compact(clean(opportunity.solution) || 'Offer a free one-page draft, then ask whether it is useful enough to keep live for $5/month.', 420)}

## Suggested Lead Queue

${bulletList(leadLines, 'Pick one warm person manually.')}

## Ready Messages

${draftLines.join('\n\n') || '- No draft messages generated.'}

## Checklist

${bulletList(checklist)}

## Guardrail

No automatic outreach was sent. Thomas approves or sends the message manually.

## Warnings

${bulletList(warnings, 'No warnings.')}
`;

  const telegramText = [
    `${title}`,
    '',
    `One thing: ${modeAction(resolvedMode)}`,
    '',
    `Offer: ${clean(opportunity.title) || '3DVR Free Page'}`,
    `Audience: ${compact(clean(opportunity.audience) || clean(autopilot.market) || 'warm contacts', 170)}`,
    `Price: ${price}`,
    `Destination: ${destinationUrl}`,
    '',
    'Message to use:',
    drafts[0]?.body ? compact(drafts[0].body, 700) : 'No draft generated.',
    '',
    'Lead queue:',
    ...(leadLines.length ? leadLines.map(item => `- ${item}`) : ['- Pick one warm person manually.']),
    '',
    'No automatic outreach was sent.'
  ].join('\n');

  return {
    mode: resolvedMode,
    title,
    generatedAt,
    runId: clean(autopilot.runId),
    destinationUrl,
    oneThing: modeAction(resolvedMode),
    leadQueue,
    markdown,
    telegramText
  };
}

export async function sendTelegramBrief({ text, env = process.env, fetchImpl = fetch, dryRun } = {}) {
  const token = clean(
    env.MONEY_OPERATOR_TELEGRAM_BOT_TOKEN
    || env.TELEGRAM_BOT_TOKEN
    || env.OPENCLAW_TELEGRAM_BOT_TOKEN
  );
  const chatId = clean(
    env.MONEY_OPERATOR_TELEGRAM_CHAT_ID
    || env.TELEGRAM_CHAT_ID
    || env.OPENCLAW_TELEGRAM_CHAT_ID
  );
  const result = {
    attempted: false,
    sent: false,
    skipped: false,
    failed: false,
    dryRun: parseBool(dryRun ?? env.MONEY_OPERATOR_TELEGRAM_DRY_RUN, false),
    reason: ''
  };

  if (!clean(text)) {
    result.skipped = true;
    result.reason = 'message text missing';
    return result;
  }

  if (!token || !chatId) {
    result.skipped = true;
    result.reason = 'telegram config missing: MONEY_OPERATOR_TELEGRAM_BOT_TOKEN and MONEY_OPERATOR_TELEGRAM_CHAT_ID';
    return result;
  }

  if (result.dryRun) {
    result.skipped = true;
    result.reason = 'dry-run';
    return result;
  }

  result.attempted = true;
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: compact(text, 3900),
        disable_web_page_preview: true
      })
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(responseText || `Telegram returned ${response.status}`);
    }
    result.sent = true;
    result.reason = 'sent';
    return result;
  } catch (error) {
    result.failed = true;
    result.reason = `send failed: ${error.message}`;
    return result;
  }
}
