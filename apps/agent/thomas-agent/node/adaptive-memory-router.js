'use strict';

const crypto = require('node:crypto');

const INPUT_TRUNKS = Object.freeze(['HEAR', 'SEE', 'NOTICE']);
const OUTPUT_TRUNKS = Object.freeze(['SPEAK', 'LOOK', 'DO']);
const ALL_TRUNKS = Object.freeze([...INPUT_TRUNKS, ...OUTPUT_TRUNKS]);

function normalizeText(value) {
  return String(value || '').trim();
}

function tokenize(value) {
  return Array.from(new Set(
    normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9@._/-]+/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1)
  ));
}

function lexicalScore(queryTokens, text) {
  const haystack = new Set(tokenize(text));
  if (!queryTokens.length || !haystack.size) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) hits += 1;
  }
  return hits / Math.sqrt(queryTokens.length * haystack.size);
}

function softmax(values, temperature = 1) {
  const safeTemperature = Math.max(0.05, Number(temperature) || 1);
  const scaled = values.map(value => Number(value || 0) / safeTemperature);
  const max = Math.max(...scaled, 0);
  const exps = scaled.map(value => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0) || 1;
  return exps.map(value => value / sum);
}

function id(prefix, seed) {
  return `${prefix}_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

function classifyStimulus(event = {}) {
  const explicit = normalizeText(event.trunk).toUpperCase();
  if (INPUT_TRUNKS.includes(explicit)) return explicit;
  if (event.delayed || event.notification) return 'NOTICE';
  if (event.toolResult || event.observation) return 'SEE';
  return 'HEAR';
}

function classifyEffect(effect = {}) {
  const explicit = normalizeText(effect.trunk).toUpperCase();
  if (OUTPUT_TRUNKS.includes(explicit)) return explicit;
  if (effect.mutates || effect.sideEffect) return 'DO';
  if (effect.externalMessage || effect.communicates) return 'SPEAK';
  return 'LOOK';
}

class AdaptiveMemoryRouter {
  constructor(options = {}) {
    this.temperature = Number(options.temperature || 0.85);
    this.learningRate = Number(options.learningRate || 0.7);
    this.recencyHalfLifeMs = Number(options.recencyHalfLifeMs || 30 * 60 * 1000);
    this.records = [];
    this.recordById = new Map();
    this.supersededBy = new Map();
    this.tools = new Map();
    this.toolEdges = new Map();
    this.outcomes = [];
    this.pulse = 0;
  }

  ingest(event = {}) {
    const text = normalizeText(event.text);
    if (!text) throw new Error('memory text is required');
    const createdAt = normalizeText(event.createdAt) || new Date().toISOString();
    const trunk = classifyStimulus(event);
    const experienceId = normalizeText(event.experienceId) || id('exp', `${createdAt}:${text}:${this.records.length}`);
    const recordId = normalizeText(event.id) || id('mem', `${experienceId}:${trunk}:${text}:${this.records.length}`);
    if (this.recordById.has(recordId)) throw new Error(`record already exists: ${recordId}`);
    const record = Object.freeze({
      id: recordId,
      experienceId,
      text,
      createdAt,
      source: normalizeText(event.source) || 'unknown',
      provenance: normalizeText(event.provenance) || '',
      type: normalizeText(event.type) || 'event',
      trunk,
      tokens: Object.freeze(tokenize(text)),
      metadata: Object.freeze({ ...(event.metadata || {}) }),
      supersedes: normalizeText(event.supersedes) || null,
    });
    if (record.supersedes) {
      if (!this.recordById.has(record.supersedes)) throw new Error(`cannot supersede missing record: ${record.supersedes}`);
      this.supersededBy.set(record.supersedes, record.id);
    }
    this.records.push(record);
    this.recordById.set(record.id, record);
    this.pulse += 1;
    return record;
  }

  currentRecord(recordId) {
    let cursor = normalizeText(recordId);
    const visited = new Set();
    while (this.supersededBy.has(cursor) && !visited.has(cursor)) {
      visited.add(cursor);
      cursor = this.supersededBy.get(cursor);
    }
    return this.recordById.get(cursor) || null;
  }

  recall(query, options = {}) {
    const queryTokens = tokenize(query);
    const directLimit = Math.max(1, Number(options.directLimit || 3));
    const associativeLimit = Math.max(0, Number(options.associativeLimit || 5));

    const currentRecords = this.records.filter(record => !this.supersededBy.has(record.id));
    const direct = currentRecords
      .map(record => ({ record, score: lexicalScore(queryTokens, record.text) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.record.createdAt.localeCompare(a.record.createdAt))
      .slice(0, directLimit);

    const activatedTrunks = new Set(direct.map(item => item.record.trunk));
    const activatedTokens = new Set(queryTokens);
    for (const item of direct) {
      for (const token of item.record.tokens) activatedTokens.add(token);
    }

    const associative = currentRecords
      .filter(record => !direct.some(item => item.record.id === record.id))
      .map(record => {
        const semantic = lexicalScore(Array.from(activatedTokens), record.text);
        const trunkBoost = activatedTrunks.has(record.trunk) ? 0.15 : 0;
        return { record, score: semantic + trunkBoost };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.record.createdAt.localeCompare(a.record.createdAt))
      .slice(0, associativeLimit);

    return {
      query: normalizeText(query),
      direct,
      associative,
      records: [...direct, ...associative].map(item => item.record),
    };
  }

  registerTool(tool = {}) {
    const name = normalizeText(tool.name);
    if (!name) throw new Error('tool name is required');
    const effect = classifyEffect(tool);
    const description = normalizeText(tool.description);
    const keywords = tokenize([name, description, ...(tool.keywords || [])].join(' '));
    const existing = this.tools.get(name);
    const descriptor = Object.freeze({ name, effect, description, keywords: Object.freeze(keywords) });
    this.tools.set(name, descriptor);
    if (!existing) {
      this.toolEdges.set(name, {
        logStrength: Number(tool.prior || 0),
        lastActivatedAt: 0,
        successes: 0,
        failures: 0,
      });
    }
    return descriptor;
  }

  rankTools(task, options = {}) {
    const names = Array.from(this.tools.keys());
    if (!names.length) return [];
    const now = Number(options.now || Date.now());
    const taskTokens = tokenize(task);
    const logits = names.map(name => {
      const tool = this.tools.get(name);
      const edge = this.toolEdges.get(name);
      const semantic = lexicalScore(taskTokens, `${tool.name} ${tool.description} ${tool.keywords.join(' ')}`) * 2.2;
      const age = edge.lastActivatedAt ? Math.max(0, now - edge.lastActivatedAt) : Infinity;
      const recency = Number.isFinite(age) ? Math.exp(-Math.log(2) * age / this.recencyHalfLifeMs) * 0.35 : 0;
      return edge.logStrength + semantic + recency;
    });
    const probabilities = softmax(logits, this.temperature);
    return names
      .map((name, index) => ({
        tool: this.tools.get(name),
        probability: probabilities[index],
        logit: logits[index],
        stats: { ...this.toolEdges.get(name) },
      }))
      .sort((a, b) => b.probability - a.probability);
  }

  proposeTool(task, options = {}) {
    const ranked = this.rankTools(task, options);
    if (!ranked.length) return null;
    const winner = ranked[0];
    const traceId = id('trace', `${Date.now()}:${task}:${winner.tool.name}:${this.pulse}`);
    const edge = this.toolEdges.get(winner.tool.name);
    edge.lastActivatedAt = Number(options.now || Date.now());
    return {
      traceId,
      task: normalizeText(task),
      selectedTool: winner.tool,
      ranked,
      requiresReceipt: true,
    };
  }

  recordOutcome(outcome = {}) {
    const toolName = normalizeText(outcome.toolName);
    const receiptId = normalizeText(outcome.receiptId);
    if (!this.tools.has(toolName)) throw new Error(`unknown tool: ${toolName}`);
    if (!receiptId) {
      return { reinforced: false, reason: 'verified receipt required' };
    }
    if (this.outcomes.some(item => item.receiptId === receiptId)) {
      return { reinforced: false, reason: 'receipt already applied' };
    }
    const success = Boolean(outcome.success);
    const edge = this.toolEdges.get(toolName);
    edge.logStrength += success ? this.learningRate : -this.learningRate;
    if (success) edge.successes += 1;
    else edge.failures += 1;
    const packet = Object.freeze({
      receiptId,
      traceId: normalizeText(outcome.traceId),
      toolName,
      success,
      observedAt: normalizeText(outcome.observedAt) || new Date().toISOString(),
    });
    this.outcomes.push(packet);
    this.pulse += 1;
    return { reinforced: true, packet };
  }

  frontierWeights() {
    const names = Array.from(this.tools.keys());
    const probabilities = softmax(names.map(name => this.toolEdges.get(name).logStrength), this.temperature);
    return names.map((name, index) => ({ name, weight: probabilities[index] }));
  }

  snapshot() {
    return {
      version: 1,
      trunks: ALL_TRUNKS,
      pulse: this.pulse,
      records: this.records,
      supersededBy: Object.fromEntries(this.supersededBy),
      tools: Array.from(this.tools.values()),
      toolEdges: Object.fromEntries(Array.from(this.toolEdges.entries())),
      outcomes: this.outcomes,
    };
  }
}

module.exports = {
  AdaptiveMemoryRouter,
  INPUT_TRUNKS,
  OUTPUT_TRUNKS,
  classifyStimulus,
  classifyEffect,
  lexicalScore,
  softmax,
  tokenize,
};
