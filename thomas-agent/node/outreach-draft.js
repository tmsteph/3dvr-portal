const fs = require('fs');
const os = require('os');
const path = require('path');

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
  const hint = defaultHint(lead.site, lead.contact);
  return {
    source: 'template',
    text: `Hi ${name} team,\n\nI'm Thomas with 3DVR. We help small businesses clean up websites, follow-up systems, and simple online workflows so customers have an easier next step.\n\nAre you running into any ${hint} problems right now?\n\nIf not, no problem. I just wanted to introduce myself.\n\nThomas\n3DVR`,
  };
}

function buildPrompt(lead = {}) {
  const name = normalizeText(lead.name);
  const site = normalizeText(lead.site);
  const contact = normalizeText(lead.contact);
  return [
    'Write a short first-touch sales email for a small business lead.',
    'Return JSON only with one key: "text".',
    'Constraints:',
    '- Keep it under 110 words.',
    '- Plain text only.',
    '- Start with "Hi <business> team,".',
    '- Use first person singular from Thomas at 3DVR.',
    '- Mention websites, follow-up systems, or online workflows in a natural way.',
    '- Ask one concise question about whether something in their website or customer flow is harder than it should be.',
    '- No fake specifics about their site.',
    '- No pricing.',
    '- No hype, no exclamation marks, no markdown.',
    '- Close with exactly:',
    'Thomas',
    '3DVR',
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
  return [
    'Write a short first-touch sales email for Thomas at 3DVR.',
    'Return only JSON: {"text":"..."}',
    'Voice: direct, practical, warm, not corporate.',
    'Facts: 3DVR helps with website work, follow-up systems, clearer offers, and small workflow fixes.',
    'Do not invent prices, guarantees, integrations, or meetings.',
    'Do not include a signature beyond Thomas and 3DVR.',
    `Lead: ${name}`,
    `Website: ${site || ''}`,
    `Contact: ${contact || ''}`,
    'Ask one concrete question about whether something on the site or in the customer flow is harder than it should be.',
    'Keep it under 110 words.',
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
  const text = normalizeText(parsed.text);
  if (!text) {
    throw new Error('Local model returned empty text.');
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
  const text = normalizeText(parsed?.text);
  if (!text) {
    throw new Error('OpenAI outreach draft returned empty text.');
  }

  return {
    source: 'openai',
    text,
  };
}

async function buildOutreachDraft(lead = {}, options = {}) {
  const mode = currentMode();
  if (mode === 'template') {
    return buildTemplateOutreachDraft(lead);
  }
  if (mode === 'local') {
    return buildLocalOutreachDraft(lead, options);
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
  buildLocalOutreachDraft,
  buildLlmOutreachDraft,
  buildOutreachDraft,
};
