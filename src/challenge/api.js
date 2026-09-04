import nodemailer from 'nodemailer';

export const CHALLENGE_PAYMENT_URL = 'https://buy.stripe.com/5kQaEXeua5pVeRpfYMc7u0g';
export const DEFAULT_CHALLENGE_MODEL = 'gpt-5.4-mini';
export const DEFAULT_CHALLENGE_GATEWAY_MODEL = 'openai/gpt-5.4-mini';

const cleanLine = (value, max = 180) => String(value || '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const cleanText = (value, max = 3000) => String(value || '').trim().slice(0, max);

function normalizeEmail(value) {
  const email = cleanLine(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function normalizeChallengeSubmission(input = {}) {
  const name = cleanLine(input.name, 140);
  const email = normalizeEmail(input.email);
  const problem = cleanText(input.problem, 3000);

  if (!name) throw new Error('Name or business is required.');
  if (!email) throw new Error('A valid email is required.');
  if (problem.length < 12) throw new Error('Please describe the problem in a little more detail.');

  return { name, email, problem };
}

export function buildChallengePrompt({ name, problem }) {
  return [
    'You are the autonomous first-response operator for the 3DVR $1 Open-Source Business Challenge.',
    'A small business owner sent one annoying business problem. Your job is to create immediate, honest value before asking for money.',
    'Prefer the smallest useful fix. Favor open-source, reversible, low-cost approaches. Do not invent access to their accounts, files, website, inbox, customers, or internal systems.',
    'Do not claim you implemented, deployed, contacted, purchased, scheduled, or changed anything unless the supplied problem itself proves that happened.',
    'Keep the response useful to a busy owner: plain language, concrete steps, usually under 450 words.',
    'Give them something they can try immediately. If the problem cannot be responsibly solved from the description alone, explain exactly what input is missing and still give the safest useful next step.',
    'Do not provide specialized medical, legal, financial, credential-stealing, destructive, or dangerous operational instructions. For those cases, give a safe general direction and say a qualified human should review the high-stakes part.',
    'Format with these exact headings: What I see; Smallest useful fix; Try this now; What 3DVR could automate next.',
    'The final section may mention a possible next automation, but do not sell aggressively and do not mention payment. Payment is handled separately after the value is delivered.',
    `Business/name: ${cleanLine(name, 140)}`,
    `Problem: ${cleanText(problem, 3000)}`
  ].join('\n\n');
}

function extractOutputText(data = {}) {
  const direct = cleanText(data.output_text, 12000);
  if (direct) return direct;

  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && cleanText(content.text, 12000)) {
        return cleanText(content.text, 12000);
      }
    }
  }
  return '';
}

async function readUpstreamError(response) {
  try {
    const body = await response.json();
    return cleanLine(body?.error?.message || body?.message, 300) || `AI request failed (${response.status}).`;
  } catch {
    return `AI request failed (${response.status}).`;
  }
}

export async function generateChallengeSolution(submission, options = {}) {
  const config = options.config || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const apiKey = cleanLine(config.OPENAI_API_KEY, 500);
  const gatewayToken = cleanLine(config.AI_GATEWAY_API_KEY || config.VERCEL_OIDC_TOKEN, 4000);
  const useGateway = !apiKey && Boolean(gatewayToken);
  const token = apiKey || gatewayToken;

  if (!token) {
    throw new Error('AI is not configured for the challenge worker.');
  }

  const endpoint = options.endpoint || (useGateway
    ? 'https://ai-gateway.vercel.sh/v1/responses'
    : 'https://api.openai.com/v1/responses');
  const model = cleanLine(
    options.model
      || config.CHALLENGE_MODEL
      || (useGateway ? DEFAULT_CHALLENGE_GATEWAY_MODEL : DEFAULT_CHALLENGE_MODEL),
    120
  );

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      model,
      store: false,
      input: buildChallengePrompt(submission),
      max_output_tokens: 900
    })
  });

  if (!response.ok) {
    throw new Error(await readUpstreamError(response));
  }

  const data = await response.json();
  const solution = extractOutputText(data);
  if (!solution) {
    throw new Error('AI returned an empty challenge solution.');
  }

  return { solution, model };
}

function createMailTransport(config = process.env) {
  const gmailUser = cleanLine(config.GMAIL_USER, 254);
  const gmailPass = cleanLine(config.GMAIL_APP_PASSWORD, 500);
  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass }
    });
  }

  const host = cleanLine(config.SMTP_HOST, 300);
  const user = cleanLine(config.SMTP_USER, 254);
  const pass = cleanLine(config.SMTP_PASSWORD || config.SMTP_PASS, 500);
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(config.SMTP_PORT || 587),
    secure: String(config.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass }
  });
}

function resolveFrom(config = process.env) {
  const explicit = cleanLine(config.CHALLENGE_FROM_EMAIL || config.MAIL_FROM, 300);
  if (explicit) return explicit;
  const user = cleanLine(config.GMAIL_USER || config.SMTP_USER, 254);
  return user ? `"3DVR Open-Source Challenge" <${user}>` : '';
}

export function buildChallengeEmail({ name, problem, solution }) {
  const subject = `Your 3DVR challenge fix — ${cleanLine(name, 80)}`;
  const text = [
    `Hi ${cleanLine(name, 80)},`,
    '',
    'You sent 3DVR this problem:',
    cleanText(problem, 3000),
    '',
    'Here is the smallest useful fix I could produce from what you shared:',
    '',
    cleanText(solution, 12000),
    '',
    'If this genuinely helped, the experiment is simple: send $1. If it did not help, keep the attempt and owe us nothing.',
    CHALLENGE_PAYMENT_URL,
    '',
    '— 3DVR',
    'Build the future, one useful fix at a time.'
  ].join('\n');

  return { subject, text };
}

export async function sendChallengeSolution(submission, generated, options = {}) {
  const config = options.config || process.env;
  const transport = options.mailTransport || createMailTransport(config);
  const from = resolveFrom(config);

  if (!transport || !from) {
    throw new Error('Email is not configured for the challenge worker.');
  }

  const message = buildChallengeEmail({
    ...submission,
    solution: generated.solution
  });

  const info = await transport.sendMail({
    from,
    to: submission.email,
    replyTo: cleanLine(config.CHALLENGE_REPLY_TO || config.GMAIL_USER || config.SMTP_USER, 254) || undefined,
    subject: message.subject,
    text: message.text
  });

  return {
    messageId: cleanLine(info?.messageId, 300),
    accepted: Array.isArray(info?.accepted) ? info.accepted.map(item => cleanLine(item, 254)).filter(Boolean) : []
  };
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function createChallengeHandler(options = {}) {
  return async function challengeHandler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    let submission;
    try {
      submission = normalizeChallengeSubmission(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const generated = await generateChallengeSolution(submission, options);
      const delivery = await sendChallengeSolution(submission, generated, options);
      return res.status(200).json({
        ok: true,
        delivered: true,
        model: generated.model,
        messageId: delivery.messageId || ''
      });
    } catch (error) {
      console.error('Challenge worker failed:', error);
      return res.status(503).json({
        ok: false,
        delivered: false,
        error: 'The automatic solution could not be delivered right now.'
      });
    }
  };
}
