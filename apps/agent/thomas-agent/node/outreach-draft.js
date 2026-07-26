const fs = require('fs');
const os = require('os');
const path = require('path');
const { finalizeCommercialOutreach } = require('./outreach-compliance');
const { loadReadyDraft } = require('./outreach-draft-queue');

function normalizeText(value) {
  return String(value || '').trim();
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultHint(site, contact) {
  const haystack = `${site || ''} ${contact || ''}`.toLowerCase();
  if (/menu/.test(haystack)) return 'website, menu, booking, or customer follow-up';
  if (/book|reserv|order/.test(haystack)) return 'website, booking, ordering, or customer follow-up';
  if (/contact|about/.test(haystack)) return 'website, contact, or lead follow-up';
  if (/event|cater/.test(haystack)) return 'website, events, catering, or customer follow-up';
  return 'website, booking, lead follow-up, or customer-flow';
}

function currentModel() {
  return normalizeText(process.env.THREEDVR_OUTREACH_LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini');
}

function currentMode() {
  return normalizeText(process.env.THREEDVR_OUTREACH_MESSAGE_MODE || 'auto').toLowerCase();
}

function currentOfferProfile() {
  return normalizeText(process.env.THREEDVR_OUTREACH_OFFER_PROFILE).toLowerCase();
}

function currentTemperature() {
  return parseNumber(process.env.THREEDVR_OUTREACH_LLM_TEMPERATURE, 0.7);
}

function currentMaxTokens() {
  return parseInteger(process.env.THREEDVR_OUTREACH_LLM_MAX_TOKENS, 220);
}

function currentLocalModel() {
  return normalizeText(
    process.env.THREEDVR_OUTREACH_LOCAL_MODEL
    || process.env.THREEDVR_INBOX_LOCAL_MODEL
    || process.env.LLAMA_MODEL
    || path.join(os.homedir(), '.cache/huggingface/hub/models--Qwen--Qwen2.5-Coder-1.5B-Instruct-GGUF/snapshots/f86cb2c1fa58255f8052cc32aeede1b7482d4361/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf')
  );
}

function currentLlamaCli() {
  return normalizeText(
    process.env.THREEDVR_OUTREACH_LLAMA_CLI
    || process.env.THREEDVR_INBOX_LLAMA_CLI
    || process.env.LLAMA_CLI
    || path.join(os.homedir(), 'llama.cpp/build/bin/llama-cli')
  );
}

function currentLocalTokens() {
  return parseInteger(process.env.THREEDVR_OUTREACH_LOCAL_TOKENS, 180);
}

function currentLocalContext() {
  return parseInteger(process.env.THREEDVR_OUTREACH_LOCAL_CONTEXT, 2048);
}

function currentLocalTemperature() {
  return parseNumber(process.env.THREEDVR_OUTREACH_LOCAL_TEMPERATURE, 0.35);
}

function currentLocalTimeoutMs() {
  return parseInteger(process.env.THREEDVR_OUTREACH_LOCAL_TIMEOUT_MS, 120000);
}

function commandExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath) && (fs.statSync(filePath).mode & 0o111));
  } catch {
    return false;
  }
}

function buildTemplateOutreachDraft(lead = {}) {
  const name = normalizeText(lead.name) || 'there';
  const previewLine = normalizeText(lead.previewUrl)
    ? `\n\nI made a sample page:\n${normalizeText(lead.previewUrl)}`
    : '';
  if (currentOfferProfile() === 'free-page') {
    const variant = normalizeText(lead.experimentVariant || lead.variant).toLowerCase();
    const body = variant === 'b'
      ? `Hi ${name} team,\n\nI'm Thomas in San Diego. I make simple web pages for local businesses. The first draft is free. You do not have to use it.${previewLine}\n\nWould you like me to make one for ${name}?\n\nThomas`
      : `Hi ${name} team,\n\nI'm Thomas in San Diego. I can make you a simple one-page website for free. It will show what you do and how to reach you.${previewLine}\n\nWould this help your business?\n\nThomas`;
    return {
      source: variant === 'b' ? 'template-free-page-b' : 'template-free-page',
      text: finalizeCommercialOutreach(body),
    };
  }
  if (currentOfferProfile() === 'av-operator') {
    const variant = normalizeText(lead.experimentVariant || lead.variant).toLowerCase();
    const body = variant === 'b'
      ? `Hi ${name} team,\n\nI'm Thomas in San Diego. I am free for AV work at $500 a day. I can help with audio, video, show calls, load-in, and strike.${previewLine}\n\nDo you need help on a show?\n\nThomas`
      : `Hi ${name} team,\n\nI'm Thomas in San Diego. I am free for AV work at $500 a day. I work in audio and video, and I can join your crew for a show.${previewLine}\n\nDo you need an AV tech soon?\n\nThomas`;
    return {
      source: variant === 'b' ? 'template-av-operator-b' : 'template-av-operator',
      text: finalizeCommercialOutreach(body),
    };
  }
  const hint = defaultHint(lead.site, lead.contact);
  return {
    source: 'template',
    text: finalizeCommercialOutreach(`Hi ${name} team,\n\nI'm Thomas with 3dvr.tech. We help small businesses clean up websites, follow-up systems, and simple online workflows so customers have an easier next step.\n\nAre you running into any ${hint} problems right now?\n\nIf not, no problem. I just wanted to introduce myself.\n\nThomas\n3dvr.tech`),
  };
}

function buildQueuedOutreachDraft(lead = {}, options = {}) {
  const draft = loadReadyDraft(lead, options);
  if (!draft) throw new Error('Personalized Codex draft is queued but not ready.');
  return draft;
}

function buildPrompt(lead = {}) {
  const name = normalizeText(lead.name);
  const site = normalizeText(lead.site);
  const contact = normalizeText(lead.contact);
  const offerLines = currentOfferProfile() === 'free-page'
    ? [
      '- Offer a clean one-page website draft at no cost, with no obligation to keep it.',
      '- Ask whether a simpler page would be useful for the business.',
      '- Say Thomas is with 3dvr.tech in San Diego.',
    ]
    : currentOfferProfile() === 'av-operator'
      ? [
        '- Offer Thomas as an audio-visual operator for event days at $500/day.',
        '- Mention audio, video, show calls, troubleshooting, load-in, and strike.',
        '- Say travel and special gear are quoted separately.',
        '- Ask whether they need reliable AV crew coverage for an upcoming event.',
      ]
      : [
      '- Mention websites, follow-up systems, or online workflows in a natural way.',
      '- Ask one concise question about whether something in their website or customer flow is harder than it should be.',
    ];
  return [
    'Write a very short first email from Thomas.',
    'Return JSON only with one key: "text".',
    'Constraints:',
    '- Keep it under 75 words before the required legal footer.',
    '- Use words and sentences a third grader can read.',
    '- Plain text only.',
    '- Start with "Hi <business> team,".',
    '- Write as Thomas, not as a company team.',
    ...offerLines,
    '- No fake specifics about their site.',
    '- No pricing.',
    '- No hype, no exclamation marks, no markdown.',
    '- If a contact phone number is configured, include the same footer block used by the inbox replies.',
    '- Close with exactly: Thomas',
    '',
    `Business name: ${name}`,
    `Website: ${site || 'unknown'}`,
    `Contact target: ${contact || 'unknown'}`,
  ].join('\n');
}

function buildLocalPrompt(lead = {}) {
  const name = normalizeText(lead.name) || 'there';
  const site = normalizeText(lead.site);
  const contact = normalizeText(lead.contact);
  const offerLines = currentOfferProfile() === 'free-page'
    ? [
      'Offer: a clean one-page website draft at no cost, with no obligation to keep it.',
      'Ask whether a simpler page would be useful for the business.',
    ]
    : currentOfferProfile() === 'av-operator'
      ? [
        'Offer: Thomas is available as an audio-visual operator for event days at $500/day.',
        'Mention audio, video, show calls, troubleshooting, load-in, and strike.',
        'Ask whether they need reliable AV crew coverage for an upcoming event.',
      ]
      : [
      'Ask one concrete question about whether something on the site or in the customer flow is harder than it should be.',
    ];
  return [
    'Write a very short first email from Thomas.',
    'Return only JSON: {"text":"..."}',
    'Voice: direct, warm, and human. Use words a third grader can read.',
    'Facts: 3dvr.tech helps with website work, follow-up systems, clearer offers, and small workflow fixes.',
    'Do not invent prices, guarantees, integrations, or meetings.',
    'Do not include a signature beyond Thomas.',
    'If a contact phone number is configured, include the same footer block used by the inbox replies.',
    `Lead: ${name}`,
    `Website: ${site || ''}`,
    `Contact: ${contact || ''}`,
    ...offerLines,
    'Keep it under 75 words before the legal footer.',
  ].join('\n');
}

function parseLlmJson(raw) {
  const text = normalizeText(raw);
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isAcceptableOutreachText(text) {
  const value = normalizeText(text);
  if (!value) return false;
  if (value.split(/\s+/).length > 150) return false;
  if (!/^Hi [^\n]{1,80} team,/i.test(value)) return false;
  if (!/\bThomas\b[\s\S]*\b3dvr\.tech\b/i.test(value)) return false;
  if (/^- /m.test(value)) return false;
  if (/^Hey\s+Thomas/i.test(value)) return false;
  return true;
}

async function runCommand(command, args, { input = '', timeoutMs = 45000 } = {}) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Local model timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Local model exited with code ${code}.`));
        return;
      }
      resolve(stdout);
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function buildLocalOutreachDraft(lead = {}, { runCommandImpl = runCommand, commandExistsImpl = commandExists, fileExistsImpl = fs.existsSync } = {}) {
  const llama = currentLlamaCli();
  const model = currentLocalModel();
  if (!commandExistsImpl(llama)) {
    throw new Error(`llama-cli not found at ${llama}`);
  }
  if (!model || !fileExistsImpl(model)) {
    throw new Error(`local model not found at ${model}`);
  }

  const raw = await runCommandImpl(llama, [
    '-m', model,
    '-p', buildLocalPrompt(lead),
    '-n', String(currentLocalTokens()),
    '--ctx-size', String(currentLocalContext()),
    '--temp', String(currentLocalTemperature()),
    '--single-turn',
    '--simple-io',
    '--no-display-prompt',
    '--no-show-timings',
    '--no-warmup',
  ], { timeoutMs: currentLocalTimeoutMs() });

  const parsed = parseLlmJson(raw);
  if (!parsed) {
    throw new Error('Local model returned invalid JSON.');
  }
  const text = finalizeCommercialOutreach(normalizeText(parsed.text));
  if (!text) {
    throw new Error('Local model returned empty text.');
  }
  if (!isAcceptableOutreachText(text)) {
    throw new Error('Local model returned unacceptable outreach text.');
  }
  return {
    source: 'local',
    text: text.trim(),
  };
}

async function buildLlmOutreachDraft(lead = {}, { fetchImpl = fetch } = {}) {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: currentModel(),
      temperature: currentTemperature(),
      max_tokens: currentMaxTokens(),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You write restrained first-touch outbound sales emails for small businesses.',
        },
        {
          role: 'user',
          content: buildPrompt(lead),
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI outreach draft failed: ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(String(content || '{}'));
  const text = finalizeCommercialOutreach(normalizeText(parsed?.text));
  if (!text) {
    throw new Error('OpenAI outreach draft returned empty text.');
  }

  return {
    source: 'openai',
    text,
  };
}

async function buildOutreachDraft(lead = {}, options = {}) {
  const mode = normalizeText(options.mode || currentMode()).toLowerCase();
  if (mode === 'template') {
    return buildTemplateOutreachDraft(lead);
  }
  if (mode === 'queue' || mode === 'queued') {
    return buildQueuedOutreachDraft(lead, options);
  }
  if (mode === 'local') {
    try {
      return await buildLocalOutreachDraft(lead, options);
    } catch {
      return buildTemplateOutreachDraft(lead);
    }
  }
  if (mode === 'openai' || mode === 'llm') {
    return buildLlmOutreachDraft(lead, options);
  }
  try {
    return await buildLocalOutreachDraft(lead, options);
  } catch {
    try {
      return await buildLlmOutreachDraft(lead, options);
    } catch {
      return buildTemplateOutreachDraft(lead);
    }
  }
}

module.exports = {
  buildTemplateOutreachDraft,
  buildQueuedOutreachDraft,
  buildLocalOutreachDraft,
  buildLlmOutreachDraft,
  buildOutreachDraft,
};
