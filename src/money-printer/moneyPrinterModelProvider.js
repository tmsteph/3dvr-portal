import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BOT_DEFINITIONS, findPromptForBot } from './moneyPrinterBots.js';
import {
  generateFounderCommandBrief,
  generateMoneyIdeas,
  getNextBestMoneyAction,
  runBotLoop,
  scoreBusinessIdeas
} from './moneyPrinterCore.js';
import { generateValidationTest } from './moneyPrinterExperiments.js';
import { getMoneyPrinterWorkspacePaths } from './moneyPrinterFileStorage.js';
import { createConnectorOperationPlan } from './moneyPrinterOperations.js';

export const DEFAULT_MONEY_PRINTER_MODEL = 'gpt-4.1-mini';
export const DEFAULT_MONEY_PRINTER_FAST_MODEL = 'gpt-4.1-mini';
export const DEFAULT_MONEY_PRINTER_REASONING_MODEL = 'gpt-5.4-mini';

const GPT_5_RE = /^gpt-5([.-]|$)/;

const BOT_OUTPUT_SCHEMA = {
  name: 'money_printer_bot_output',
  schema: {
    type: 'object',
    required: ['title', 'summary', 'lines', 'nextBestMoneyAction', 'connectorOperations', 'codexPrompt'],
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      lines: {
        type: 'array',
        items: { type: 'string' }
      },
      nextBestMoneyAction: { type: 'string' },
      connectorOperations: {
        type: 'array',
        items: {
          type: 'object',
          required: ['provider', 'action', 'title', 'summary', 'risk', 'payload'],
          additionalProperties: false,
          properties: {
            provider: { type: 'string' },
            action: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            risk: { type: 'string', enum: ['green', 'yellow', 'red'] },
            payload: {
              type: 'object',
              additionalProperties: true
            }
          }
        }
      },
      codexPrompt: { type: 'string' }
    }
  }
};

const IDEAS_SCHEMA = {
  name: 'money_printer_ideas',
  schema: {
    type: 'object',
    required: ['ideas'],
    additionalProperties: false,
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'business_name',
            'target_customer',
            'customer_pain',
            'offer',
            'why_now',
            'revenue_path',
            'first_test_this_week',
            'tools_needed',
            'difficulty_score',
            'speed_to_cash_score',
            'founder_fit_score'
          ],
          additionalProperties: true,
          properties: {
            business_name: { type: 'string' },
            target_customer: { type: 'string' },
            customer_pain: { type: 'string' },
            offer: { type: 'string' },
            why_now: { type: 'string' },
            revenue_path: { type: 'string' },
            first_test_this_week: { type: 'string' },
            tools_needed: { type: 'array', items: { type: 'string' } },
            difficulty_score: { type: 'number' },
            speed_to_cash_score: { type: 'number' },
            founder_fit_score: { type: 'number' }
          }
        }
      }
    }
  }
};

const FOUNDER_BRIEF_SCHEMA = {
  name: 'money_printer_founder_brief',
  schema: {
    type: 'object',
    required: [
      'currentMission',
      'bestNewOpportunity',
      'suggestedFirstCustomer',
      'primaryOffer',
      'fastestPathToFirstDollar',
      'next3Actions',
      'botToRunNext',
      'biggestRisk',
      'currentExperimentToKill',
      'currentExperimentToScale',
      'highestLeverageImprovementThisWeek',
      'nextBestMoneyAction'
    ],
    additionalProperties: false,
    properties: {
      currentMission: { type: 'string' },
      bestNewOpportunity: { type: 'string' },
      suggestedFirstCustomer: { type: 'string' },
      primaryOffer: { type: 'string' },
      fastestPathToFirstDollar: { type: 'string' },
      next3Actions: { type: 'array', items: { type: 'string' } },
      botToRunNext: { type: 'string' },
      biggestRisk: { type: 'string' },
      currentExperimentToKill: { type: 'string' },
      currentExperimentToScale: { type: 'string' },
      highestLeverageImprovementThisWeek: { type: 'string' },
      nextBestMoneyAction: { type: 'string' }
    }
  }
};

const CONNECTOR_PLAN_SCHEMA = {
  name: 'money_printer_connector_plan',
  schema: {
    type: 'object',
    required: ['operations', 'nextBestMoneyAction'],
    additionalProperties: false,
    properties: {
      operations: BOT_OUTPUT_SCHEMA.schema.properties.connectorOperations,
      nextBestMoneyAction: { type: 'string' }
    }
  }
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function isGpt5FamilyModel(model = '') {
  return GPT_5_RE.test(String(model || '').trim());
}

function resolveAiMode(options = {}, env = process.env) {
  if (options.mock === true) return 'mock';
  if (options.ai === true) {
    return env.OPENAI_API_KEY && String(env.MONEY_PRINTER_AI_MODE || 'openai').toLowerCase() === 'openai'
      ? 'openai'
      : 'mock';
  }
  const configured = String(options.mode || env.MONEY_PRINTER_AI_MODE || '').trim().toLowerCase();
  if (configured === 'openai' && env.OPENAI_API_KEY) return 'openai';
  return 'mock';
}

export function getModelProviderStatus(options = {}, env = process.env) {
  const mode = resolveAiMode(options, env);
  const apiKeyPresent = Boolean(String(options.apiKey || env.OPENAI_API_KEY || '').trim());
  const model = String(
    options.model
    || env.MONEY_PRINTER_MODEL
    || env.OPENAI_MODEL
    || DEFAULT_MONEY_PRINTER_MODEL
  ).trim();
  const fastModel = String(env.MONEY_PRINTER_FAST_MODEL || model || DEFAULT_MONEY_PRINTER_FAST_MODEL).trim();
  const reasoningModel = String(
    env.MONEY_PRINTER_REASONING_MODEL
    || model
    || DEFAULT_MONEY_PRINTER_REASONING_MODEL
  ).trim();

  return {
    mode,
    requestedMode: String(options.mode || env.MONEY_PRINTER_AI_MODE || 'mock').trim() || 'mock',
    openAiKeyPresent: apiKeyPresent,
    openAiConfigured: apiKeyPresent && String(env.MONEY_PRINTER_AI_MODE || '').trim().toLowerCase() === 'openai',
    model,
    fastModel,
    reasoningModel,
    temperature: Number.parseFloat(env.MONEY_PRINTER_TEMPERATURE || '0.25'),
    maxOutputTokens: Number.parseInt(env.MONEY_PRINTER_MAX_OUTPUT_TOKENS || '2500', 10),
    liveConnectorsEnabled: parseBoolean(env.MONEY_PRINTER_LIVE_CONNECTORS, false),
    allowGithubWrite: parseBoolean(env.MONEY_PRINTER_ALLOW_GITHUB_WRITE, false),
    allowVercelWrite: parseBoolean(env.MONEY_PRINTER_ALLOW_VERCEL_WRITE, false),
    allowCodexExec: parseBoolean(env.MONEY_PRINTER_ALLOW_CODEX_EXEC, false),
    missing: {
      openai: apiKeyPresent ? [] : ['OPENAI_API_KEY']
    }
  };
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function extractJsonObject(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('{') && text.endsWith('}')) return text;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate;
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }
  return '';
}

export function extractResponseText(responseData = {}) {
  if (typeof responseData.output_text === 'string' && responseData.output_text.trim()) {
    return responseData.output_text.trim();
  }

  const outputItems = Array.isArray(responseData.output) ? responseData.output : [];
  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];
    for (const content of contentItems) {
      const text = typeof content?.text === 'string' ? content.text.trim() : '';
      if (text) return text;
    }
  }

  const chatContent = responseData?.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string' && chatContent.trim()) {
    return chatContent.trim();
  }

  return '';
}

export function validateBusinessIdea(value = {}) {
  const name = String(value.business_name || value.name || '').trim();
  const customer = String(value.target_customer || value.customer || '').trim();
  const pain = String(value.customer_pain || value.pain || '').trim();
  const offer = String(value.offer || '').trim();
  if (!name || !customer || !pain || !offer) {
    return null;
  }

  return {
    id: String(value.id || `idea-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`),
    business_name: name,
    target_customer: customer,
    customer_pain: pain,
    offer,
    why_now: String(value.why_now || 'The buyer pain is visible and AI lowers delivery cost.').trim(),
    revenue_path: String(value.revenue_path || '$300 audit, then monthly improvement retainer.').trim(),
    first_test_this_week: String(value.first_test_this_week || 'Message 25 target buyers and ask for one paid pilot.').trim(),
    tools_needed: Array.isArray(value.tools_needed) ? value.tools_needed.map(String).filter(Boolean) : ['Market Research Bot'],
    difficulty_score: clampScore(value.difficulty_score, 3),
    speed_to_cash_score: clampScore(value.speed_to_cash_score, 3),
    founder_fit_score: clampScore(value.founder_fit_score, 4),
    urgent_pain_score: clampScore(value.urgent_pain_score, 4),
    reachable_buyer_score: clampScore(value.reachable_buyer_score, 4),
    simple_first_offer_score: clampScore(value.simple_first_offer_score, 4),
    low_build_cost_score: clampScore(value.low_build_cost_score, 4),
    clear_distribution_score: clampScore(value.clear_distribution_score, 3),
    software_later_score: clampScore(value.software_later_score, 4)
  };
}

function clampScore(value, fallback = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

export function validateFounderBrief(value = {}, fallback = {}) {
  if (!value || typeof value !== 'object') return fallback;
  return {
    currentMission: String(value.currentMission || fallback.currentMission || ''),
    bestNewOpportunity: String(value.bestNewOpportunity || fallback.bestNewOpportunity || ''),
    suggestedFirstCustomer: String(value.suggestedFirstCustomer || fallback.suggestedFirstCustomer || ''),
    primaryOffer: String(value.primaryOffer || fallback.primaryOffer || ''),
    fastestPathToFirstDollar: String(value.fastestPathToFirstDollar || fallback.fastestPathToFirstDollar || ''),
    next3Actions: Array.isArray(value.next3Actions)
      ? value.next3Actions.map(String).filter(Boolean).slice(0, 5)
      : fallback.next3Actions || [],
    botToRunNext: String(value.botToRunNext || fallback.botToRunNext || ''),
    biggestRisk: String(value.biggestRisk || fallback.biggestRisk || ''),
    currentExperimentToKill: String(value.currentExperimentToKill || fallback.currentExperimentToKill || ''),
    currentExperimentToScale: String(value.currentExperimentToScale || fallback.currentExperimentToScale || ''),
    highestLeverageImprovementThisWeek: String(
      value.highestLeverageImprovementThisWeek || fallback.highestLeverageImprovementThisWeek || ''
    ),
    nextBestMoneyAction: String(value.nextBestMoneyAction || fallback.nextBestMoneyAction || '')
  };
}

export function validateConnectorOperations(value = []) {
  const raw = Array.isArray(value) ? value : value?.operations;
  return (Array.isArray(raw) ? raw : [])
    .map(operation => createConnectorOperationPlan(operation))
    .filter(Boolean);
}

async function writeRawModelOutput(rootDir, label, payload = {}) {
  const { logsDir } = getMoneyPrinterWorkspacePaths(rootDir);
  await mkdir(logsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = String(label || 'model-output').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '');
  const filePath = path.join(logsDir, `${stamp}-${safeLabel || 'model-output'}-raw.json`);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function fallbackToMockOnModelFailure({
  rootDir = process.cwd(),
  label = 'model-failure',
  error,
  rawOutput = '',
  fallback
} = {}) {
  const rawOutputPath = await writeRawModelOutput(rootDir, label, {
    error: error?.message || String(error || 'Unknown model failure'),
    rawOutput
  });
  const fallbackValue = typeof fallback === 'function' ? fallback() : fallback;
  return {
    ...fallbackValue,
    modelFallback: true,
    modelError: error?.message || String(error || 'Unknown model failure'),
    rawOutputPath
  };
}

function buildInstructions() {
  return [
    'You are Money Printer, a model-powered 3DVR venture operator.',
    'Your job is to find painful markets, make useful offers, validate demand, and create safe execution plans.',
    'Sell first. Build second. Keep it simple.',
    'Prefer service-first, software-later businesses with reachable buyers and clear first-dollar paths.',
    'Never propose red-zone execution as allowed. Money movement, DNS, deletion, mass email, and production merges stay blocked.',
    'Return only structured JSON that matches the requested schema.'
  ].join('\n');
}

function buildStatePayload(context = {}) {
  const state = context.state || context;
  return {
    businessConfig: state.businessConfig || context.businessConfig || {},
    mission: state.mission || state.businessConfig?.mission || '',
    ideas: (state.ideas || []).slice(0, 8),
    experiments: (state.experiments || []).slice(0, 8),
    metrics: context.metrics || {},
    recentReports: context.recentReports || [],
    availableConnectors: context.availableConnectors || ['github', 'vercel', 'codex'],
    autonomy: state.businessConfig?.autonomy || {}
  };
}

function buildResponseRequest({ model, prompt, schema, env = process.env }) {
  const request = {
    model,
    instructions: buildInstructions(),
    input: prompt,
    store: false
  };

  if (schema) {
    request.text = {
      format: {
        type: 'json_schema',
        name: schema.name,
        strict: false,
        schema: schema.schema
      }
    };
  }

  const maxTokens = Number.parseInt(env.MONEY_PRINTER_MAX_OUTPUT_TOKENS || '2500', 10);
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    request.max_output_tokens = maxTokens;
  }

  const temperature = Number.parseFloat(env.MONEY_PRINTER_TEMPERATURE || '0.25');
  if (!isGpt5FamilyModel(model) && Number.isFinite(temperature)) {
    request.temperature = temperature;
  }

  return request;
}

export async function runModelPrompt(prompt, options = {}) {
  const env = options.env || process.env;
  const status = getModelProviderStatus(options, env);
  if (status.mode !== 'openai') {
    return {
      mode: 'mock',
      model: status.model,
      text: '',
      skipped: true,
      message: status.openAiKeyPresent
        ? 'MONEY_PRINTER_AI_MODE is not openai, using mock mode.'
        : 'OPENAI_API_KEY is missing, using mock mode.'
    };
  }

  const apiKey = String(options.apiKey || env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      mode: 'mock',
      model: status.model,
      text: '',
      skipped: true,
      message: 'OPENAI_API_KEY is missing, using mock mode.'
    };
  }

  const model = String(options.model || status.model || DEFAULT_MONEY_PRINTER_MODEL).trim();
  const response = await (options.fetchImpl || globalThis.fetch)('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildResponseRequest({
      model,
      prompt,
      schema: options.schema,
      env
    }))
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText.slice(0, 240)}`);
  }

  const data = await response.json();
  const text = extractResponseText(data);
  if (!text) {
    throw new Error('OpenAI response did not include output text.');
  }

  return {
    mode: 'openai',
    model,
    text,
    response: data
  };
}

export async function runStructuredModelPrompt(prompt, options = {}) {
  const result = await runModelPrompt(prompt, options);
  if (result.skipped) {
    return {
      ...result,
      data: null
    };
  }

  const jsonText = extractJsonObject(result.text);
  const data = safeJsonParse(jsonText);
  if (!data) {
    const error = new Error('Model returned invalid JSON.');
    error.rawOutput = result.text;
    throw error;
  }

  return {
    ...result,
    data
  };
}

function botPrompt(botId, state = {}) {
  const bot = BOT_DEFINITIONS.find(item => item.id === botId);
  return [
    `Bot: ${bot?.name || botId}`,
    `Purpose: ${bot?.purpose || 'Operate the money machine.'}`,
    `Prompt template: ${findPromptForBot(botId)}`,
    'Context JSON:',
    JSON.stringify(buildStatePayload(state), null, 2),
    'Return a practical bot output with safe connector operations and a Codex prompt when useful.'
  ].join('\n\n');
}

export async function runBotWithModel(botId, state = {}, options = {}) {
  const mockOutput = () => runBotLoop(botId, state);
  const status = getModelProviderStatus(options, options.env || process.env);
  if (status.mode !== 'openai') {
    return {
      ...mockOutput(),
      aiMode: 'mock',
      model: status.model,
      modelMessage: status.openAiKeyPresent
        ? 'AI mode not set to openai; mock bot output used.'
        : 'OPENAI_API_KEY missing; mock bot output used.'
    };
  }

  try {
    const result = await runStructuredModelPrompt(botPrompt(botId, state), {
      ...options,
      schema: BOT_OUTPUT_SCHEMA
    });
    const data = result.data || {};
    return {
      title: String(data.title || `${botId} model output`),
      generatedAt: new Date().toISOString(),
      summary: String(data.summary || ''),
      lines: Array.isArray(data.lines) ? data.lines.map(String).filter(Boolean) : [],
      nextBestMoneyAction: String(data.nextBestMoneyAction || getNextBestMoneyAction(state)),
      connectorOperations: validateConnectorOperations(data.connectorOperations),
      codexPrompt: String(data.codexPrompt || ''),
      aiMode: 'openai',
      model: result.model
    };
  } catch (error) {
    return fallbackToMockOnModelFailure({
      rootDir: options.rootDir,
      label: botId,
      error,
      rawOutput: error.rawOutput,
      fallback: () => mockOutput()
    });
  }
}

export async function generateStructuredIdeasWithModel(state = {}, options = {}) {
  const fallbackIdeas = () => scoreBusinessIdeas(generateMoneyIdeas(state.businessConfig?.mission || state.mission)).slice(0, options.count || 5);
  const status = getModelProviderStatus(options, options.env || process.env);
  if (status.mode !== 'openai') {
    return {
      ideas: fallbackIdeas(),
      aiMode: 'mock',
      model: status.model,
      modelMessage: status.openAiKeyPresent
        ? 'AI mode not set to openai; mock ideas used.'
        : 'OPENAI_API_KEY missing; mock ideas used.'
    };
  }

  try {
    const result = await runStructuredModelPrompt([
      'Generate practical Money Printer business ideas.',
      'Each idea needs a reachable buyer, urgent pain, paid first offer, validation step, and tools needed.',
      JSON.stringify(buildStatePayload(state), null, 2)
    ].join('\n\n'), {
      ...options,
      schema: IDEAS_SCHEMA
    });
    const ideas = scoreBusinessIdeas(
      (result.data?.ideas || []).map(validateBusinessIdea).filter(Boolean)
    ).slice(0, options.count || 5);
    if (!ideas.length) {
      throw new Error('Model returned no valid business ideas.');
    }
    return {
      ideas,
      aiMode: 'openai',
      model: result.model
    };
  } catch (error) {
    return fallbackToMockOnModelFailure({
      rootDir: options.rootDir,
      label: 'ideas',
      error,
      rawOutput: error.rawOutput,
      fallback: () => ({
        ideas: fallbackIdeas(),
        aiMode: 'mock'
      })
    });
  }
}

export async function generateFounderBriefWithModel(state = {}, options = {}) {
  const fallbackBrief = () => generateFounderCommandBrief(state);
  const status = getModelProviderStatus(options, options.env || process.env);
  if (status.mode !== 'openai') {
    return {
      brief: fallbackBrief(),
      aiMode: 'mock',
      model: status.model
    };
  }

  try {
    const result = await runStructuredModelPrompt([
      'Create the founder command brief for this Money Printer state.',
      JSON.stringify(buildStatePayload(state), null, 2)
    ].join('\n\n'), {
      ...options,
      schema: FOUNDER_BRIEF_SCHEMA
    });
    return {
      brief: validateFounderBrief(result.data, fallbackBrief()),
      aiMode: 'openai',
      model: result.model
    };
  } catch (error) {
    return fallbackToMockOnModelFailure({
      rootDir: options.rootDir,
      label: 'founder-brief',
      error,
      rawOutput: error.rawOutput,
      fallback: () => ({
        brief: fallbackBrief(),
        aiMode: 'mock'
      })
    });
  }
}

export async function generateConnectorPlanWithModel(state = {}, options = {}) {
  const fallback = () => ({
    operations: validateConnectorOperations([
      {
        provider: 'github',
        action: 'createIssue',
        title: 'Create validation task issue',
        summary: getNextBestMoneyAction(state),
        risk: 'yellow',
        payload: {
          title: `Money Printer: ${getNextBestMoneyAction(state)}`,
          body: [
            'Generated by Money Printer.',
            '',
            `Mission: ${state.businessConfig?.mission || state.mission || ''}`,
            `Next action: ${getNextBestMoneyAction(state)}`
          ].join('\n')
        }
      }
    ]),
    nextBestMoneyAction: getNextBestMoneyAction(state),
    aiMode: 'mock'
  });
  const status = getModelProviderStatus(options, options.env || process.env);
  if (status.mode !== 'openai') return fallback();

  try {
    const result = await runStructuredModelPrompt([
      'Generate safe connector operations for the next Money Printer cycle.',
      'Only include green/yellow operations. Mark red-zone actions as blocked by omitting them or setting risk red.',
      JSON.stringify(buildStatePayload(state), null, 2)
    ].join('\n\n'), {
      ...options,
      schema: CONNECTOR_PLAN_SCHEMA
    });
    return {
      operations: validateConnectorOperations(result.data?.operations),
      nextBestMoneyAction: String(result.data?.nextBestMoneyAction || getNextBestMoneyAction(state)),
      aiMode: 'openai',
      model: result.model
    };
  } catch (error) {
    return fallbackToMockOnModelFailure({
      rootDir: options.rootDir,
      label: 'connector-plan',
      error,
      rawOutput: error.rawOutput,
      fallback
    });
  }
}

export async function generateCodexPromptWithModel(state = {}, options = {}) {
  const topIdea = state.ideas?.[0];
  const fallbackPrompt = [
    'Implement the strongest Money Printer experiment landing page in this repo.',
    `Experiment: ${topIdea?.business_name || state.experiments?.[0]?.name || 'top Money Printer experiment'}.`,
    'Create or update the smallest useful page, run focused tests, and summarize changes.',
    'Do not deploy or merge without explicit approval.'
  ].join('\n');
  const status = getModelProviderStatus(options, options.env || process.env);
  if (status.mode !== 'openai') {
    return {
      prompt: fallbackPrompt,
      aiMode: 'mock',
      model: status.model
    };
  }

  try {
    const result = await runModelPrompt([
      'Write one Codex-ready implementation prompt for the next Money Printer code task.',
      'It must be specific to this repo, include tests, and avoid deployment/merge without approval.',
      JSON.stringify(buildStatePayload(state), null, 2)
    ].join('\n\n'), options);
    return {
      prompt: result.text,
      aiMode: 'openai',
      model: result.model
    };
  } catch (error) {
    return fallbackToMockOnModelFailure({
      rootDir: options.rootDir,
      label: 'codex-prompt',
      error,
      rawOutput: error.rawOutput,
      fallback: () => ({
        prompt: fallbackPrompt,
        aiMode: 'mock'
      })
    });
  }
}

export function generateValidationPlanFromIdea(idea) {
  return generateValidationTest(idea);
}
