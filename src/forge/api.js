export const DEFAULT_FORGE_MODEL = 'gpt-4.1-mini';
export const SUPPORTED_FORGE_MODELS = Object.freeze([
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-5.4-mini',
  'gpt-5.4'
]);

const FORGE_FOLLOWUPS_SCHEMA = {
  name: 'forge_followups_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['diagnosis', 'solutionPaths', 'nextActions', 'questions'],
    properties: {
      diagnosis: { type: 'string' },
      solutionPaths: {
        type: 'array',
        items: { type: 'string' }
      },
      nextActions: {
        type: 'array',
        items: { type: 'string' }
      },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'question'],
          properties: {
            key: { type: 'string' },
            question: { type: 'string' }
          }
        }
      }
    }
  }
};

const FORGE_BRIEF_SCHEMA = {
  name: 'forge_movement_brief_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'projectName',
      'coreFrustration',
      'audience',
      'projectConcept',
      'tinyExperiment',
      'firstActions',
      'testMessage',
      'codexPrompt',
      'realityCheck'
    ],
    properties: {
      projectName: { type: 'string' },
      coreFrustration: { type: 'string' },
      audience: { type: 'string' },
      projectConcept: { type: 'string' },
      tinyExperiment: { type: 'string' },
      firstActions: {
        type: 'array',
        items: { type: 'string' }
      },
      testMessage: { type: 'string' },
      codexPrompt: { type: 'string' },
      realityCheck: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  }
};

const DEFAULT_FOLLOWUPS = Object.freeze([
  {
    key: 'audience',
    question: 'Who else has this problem?'
  },
  {
    key: 'tried',
    question: 'What have you already tried?'
  },
  {
    key: 'tiny',
    question: 'What would a tiny version look like in 7 days?'
  }
]);

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function resolveDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatIsoDate(value) {
  return resolveDate(value).toISOString().slice(0, 10);
}

function isGpt5FamilyModel(model) {
  return /^gpt-5([.-]|$)/.test(String(model || '').trim());
}

function normalizeRequestedModel(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return DEFAULT_FORGE_MODEL;
  }

  return SUPPORTED_FORGE_MODELS.includes(normalized) ? normalized : '';
}

function clean(value, maxLength = 4000) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeQuestionKey(value, index) {
  const key = clean(value, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return key || `followup_${index + 1}`;
}

function normalizeFollowUps(value) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((item, index) => ({
      key: normalizeQuestionKey(item?.key, index),
      question: clean(item?.question, 220)
    }))
    .filter(item => item.question)
    .slice(0, 3);

  DEFAULT_FOLLOWUPS.forEach((fallback) => {
    if (normalized.length < 3) {
      normalized.push(fallback);
    }
  });

  return normalized.slice(0, 3);
}

function normalizeFollowUpGuidance(value = {}) {
  const fallbackSolutions = [
    'Turn the frustration into one paid or useful promise for a specific person.',
    'Test demand with direct messages before building a larger product.',
    'Create the smallest support artifact: a page, checklist, script, or tracker.'
  ];
  const fallbackActions = [
    'Write the plain-language problem in one sentence.',
    'Pick one audience you can reach this week.',
    'Send a low-pressure test message before building.'
  ];

  return {
    diagnosis: clean(value?.diagnosis, 700) || 'Good raw material. The frustration has energy, but it needs a sharper audience and a smaller first test.',
    solutionPaths: normalizeStringList(value?.solutionPaths, fallbackSolutions, { min: 2, max: 3 }),
    nextActions: normalizeStringList(value?.nextActions, fallbackActions, { min: 2, max: 3 })
  };
}

function normalizeStringList(value, fallback, { min = 3, max = 5 } = {}) {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .map(item => clean(item, 900))
    .filter(Boolean)
    .slice(0, max);

  fallback.forEach((item) => {
    if (normalized.length < min) {
      normalized.push(item);
    }
  });

  return normalized.slice(0, max);
}

function normalizeBrief(value) {
  const fallbackActions = [
    'Name the audience in one sentence.',
    'Send the test message to 10 real people.',
    'Build only after at least one useful reply.'
  ];
  const fallbackReality = [
    'Too vague unless the audience is specific.',
    'This is a test, not a full startup yet.',
    'A direct message may validate the idea faster than an app.'
  ];

  return {
    projectName: clean(value?.projectName, 120) || 'Useful Project Test',
    coreFrustration: clean(value?.coreFrustration, 900) || 'The raw frustration is real, but the project still needs sharper edges.',
    audience: clean(value?.audience, 500) || 'frustrated working people with hidden skills',
    projectConcept: clean(value?.projectConcept, 1400) || 'A small useful offer that turns the frustration into a testable project.',
    tinyExperiment: clean(value?.tinyExperiment, 900) || 'In 7 days, make one clear promise and send it to 10 people.',
    firstActions: normalizeStringList(value?.firstActions, fallbackActions, { min: 3, max: 3 }),
    testMessage: clean(value?.testMessage, 1200) || 'I am testing a small project idea. Does this feel useful, too vague, or not your problem?',
    codexPrompt: clean(value?.codexPrompt, 2600) || 'Build the smallest mobile-first support artifact for this project. Start with the offer, outreach script, and reply tracking before product features.',
    realityCheck: normalizeStringList(value?.realityCheck, fallbackReality, { min: 3, max: 5 })
  };
}

function extractResponseText(responseData) {
  const outputItems = Array.isArray(responseData?.output) ? responseData.output : [];

  for (const item of outputItems) {
    if (item?.type !== 'message') continue;
    const contentItems = Array.isArray(item.content) ? item.content : [];
    for (const content of contentItems) {
      if (content?.type !== 'output_text') continue;
      const text = typeof content.text === 'string' ? content.text.trim() : '';
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function parseJsonResponse(responseData) {
  const raw = extractResponseText(responseData);
  if (!raw) {
    throw new Error('No content returned from OpenAI.');
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse OpenAI response: ${error.message}`);
  }
}

export function buildForgeInstructions(now = new Date()) {
  const currentDate = resolveDate(now);

  return [
    'You are 3DVR Forge, a builder-oriented AI product inside the 3DVR Portal.',
    `Today is ${formatIsoDate(currentDate)}.`,
    'Your job is to turn messy frustration, rants, ideas, or dreams into launchable project tests.',
    'Do not act like a therapist. Act like a practical blacksmith for projects.',
    'Use a direct, supportive, unsyrupy tone. Challenge vague claims.',
    'Prefer tiny tests over platform fantasies. Tell the user when they should send a message before building software.',
    'If the user mentions needing money, low time, income, clients, bills, sales, or starting 3DVR, default to a revenue/offer validation test instead of a 3D scene or VR build.',
    'Treat 3DVR as a business or project brand unless the user explicitly asks for a 3D, VR, Three.js, or game scene.',
    'For revenue-pressure ideas, the tiny 7-day experiment should usually be one clear paid promise, one specific audience, 10 direct messages, and a simple reply tracker.',
    'The Codex build prompt should create the smallest support artifact, such as a landing page, outreach script, checklist, or reply tracker. Avoid accounts, dashboards, metaverse concepts, and complex persistence unless the user specifically needs them.',
    'If the user answers with placeholders such as test, unsure, or I do not know, say what is missing instead of inventing certainty.',
    'The target user is a frustrated working person with hidden skills who wants to build something useful but does not know where to begin.',
    'For followups mode, do not only ask questions. Give a concise diagnosis, two or three plausible solution paths, two or three concrete next actions, then ask exactly three short adaptive questions. If prior answers are present, update the diagnosis and solution paths from those answers, then ask only for the missing sharp details. The questions should sharpen a choice, not restart the conversation.',
    'For brief mode, produce a complete Movement Brief with concrete next steps, a test message, a Codex-ready build prompt, and a blunt reality check.',
    'Do not include markdown fences. Return only the JSON object requested by the schema.'
  ].join(' ');
}

function buildForgeInput({ mode, initial, followUps, answers }) {
  return JSON.stringify({
    mode,
    initial: clean(initial, 4000),
    followUps: normalizeFollowUps(followUps),
    answers: answers && typeof answers === 'object' ? answers : {}
  }, null, 2);
}

export function buildForgeOpenAiRequest({
  mode,
  initial,
  followUps = DEFAULT_FOLLOWUPS,
  answers = {},
  model = DEFAULT_FORGE_MODEL,
  now = new Date()
}) {
  const selectedMode = mode === 'followups' ? 'followups' : 'brief';
  const requestBody = {
    model,
    instructions: buildForgeInstructions(now),
    input: buildForgeInput({
      mode: selectedMode,
      initial,
      followUps,
      answers
    }),
    store: false,
    text: {
      format: {
        type: 'json_schema',
        ...(selectedMode === 'followups' ? FORGE_FOLLOWUPS_SCHEMA : FORGE_BRIEF_SCHEMA)
      }
    }
  };

  if (!isGpt5FamilyModel(model)) {
    requestBody.temperature = selectedMode === 'followups' ? 0.45 : 0.35;
  }

  return requestBody;
}

export function createForgeHandler(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model = normalizeRequestedModel(options.model || process.env.OPENAI_FORGE_MODEL || DEFAULT_FORGE_MODEL) || DEFAULT_FORGE_MODEL,
    fetchImpl = globalThis.fetch,
    now = () => new Date()
  } = options;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
      mode: requestedMode,
      initial,
      followUps,
      answers,
      apiKey: requestApiKey,
      model: requestedModel
    } = req.body || {};
    const mode = requestedMode === 'followups' ? 'followups' : 'brief';
    const effectiveApiKey = typeof requestApiKey === 'string' && requestApiKey.trim()
      ? requestApiKey.trim()
      : apiKey;
    const effectiveModel = requestedModel === undefined
      ? model
      : normalizeRequestedModel(requestedModel);

    if (!effectiveApiKey) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    if (!effectiveModel) {
      return res.status(400).json({
        error: `Unsupported model. Choose one of: ${SUPPORTED_FORGE_MODELS.join(', ')}.`
      });
    }

    if (!initial || typeof initial !== 'string' || !initial.trim()) {
      return res.status(400).json({ error: 'An initial frustration, rant, idea, or dream is required.' });
    }

    if (mode === 'brief' && (!answers || typeof answers !== 'object')) {
      return res.status(400).json({ error: 'Follow-up answers are required before forging a brief.' });
    }

    try {
      const currentDate = resolveDate(now());
      const requestBody = buildForgeOpenAiRequest({
        mode,
        initial,
        followUps,
        answers,
        model: effectiveModel,
        now: currentDate
      });

      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText || 'OpenAI error' });
      }

      const data = await response.json();
      const parsed = parseJsonResponse(data);

      if (mode === 'followups') {
        return res.status(200).json({
          mode,
          guidance: normalizeFollowUpGuidance(parsed),
          questions: normalizeFollowUps(parsed.questions),
          model: effectiveModel,
          createdAt: currentDate.getTime()
        });
      }

      return res.status(200).json({
        mode,
        brief: normalizeBrief(parsed),
        model: effectiveModel,
        createdAt: currentDate.getTime()
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Unexpected error during Forge generation.' });
    }
  };
}

const handler = createForgeHandler();
export default handler;
