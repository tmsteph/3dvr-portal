import {
  assignVariant,
  experimentPath,
  normalizeExperimentDefinition,
} from '../src/growth/experiment-engine.js';
import { AV_FREELANCE_HERO_EXPERIMENT } from '../src/growth/experiments.js';
import { DEFAULT_GUN_PEERS, getNode } from '../src/growth/homepage-hero.js';

const definition = normalizeExperimentDefinition(AV_FREELANCE_HERO_EXPERIMENT);
const visitorKey = `3dvr.experiment.${definition.id}.visitor.v1`;
const visitorId = getVisitorId();
const source = getSource();
const gun = createGun();
const configNode = gun ? getNode(gun, experimentPath(definition.id, 'config')) : null;
const eventsNode = gun ? getNode(gun, experimentPath(definition.id, 'events')) : null;
let finalized = false;

function getVisitorId() {
  try {
    const existing = window.localStorage.getItem(visitorKey);
    if (existing) return existing;
    const generated = `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(visitorKey, generated);
    return generated;
  } catch (_error) {
    return `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function getSource() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get('utm_source') || params.get('source') || params.get('ref') || 'direct')
    .trim()
    .slice(0, 80) || 'direct';
}

function createGun() {
  if (typeof window.Gun !== 'function') return null;
  try {
    return window.Gun({ peers: window.__GUN_PEERS__ || DEFAULT_GUN_PEERS });
  } catch (error) {
    console.warn('AV freelance experiment Gun init failed.', error);
    return null;
  }
}

function getVariant(key) {
  return AV_FREELANCE_HERO_EXPERIMENT.variants.find((variant) => variant.key === key)
    || AV_FREELANCE_HERO_EXPERIMENT.variants[0];
}

function applyVariant(key) {
  const variant = getVariant(key);
  const title = document.getElementById('heroTitle');
  const copy = document.getElementById('heroCopy');
  const primary = document.querySelector('[data-primary-work-agent]');
  if (title) title.textContent = variant.headline;
  if (copy) copy.textContent = variant.copy;
  if (primary) primary.textContent = variant.cta;
  document.documentElement.dataset.experimentVariant = variant.key;
  window.__3DVR_EXPERIMENT__ = { id: definition.id, variant: variant.key };
  return variant.key;
}

function recordEvent(variant, eventType, cta = '') {
  if (!eventsNode || !variant || !eventType) return;
  const timestamp = new Date().toISOString();
  const id = `${Date.now()}-${visitorId}-${eventType}-${Math.random().toString(36).slice(2, 8)}`;
  eventsNode.get(id).put({
    id,
    experimentId: definition.id,
    page: definition.page,
    visitorId,
    variant,
    eventType,
    cta,
    source,
    timestamp,
  });
}

function bindClicks(variant) {
  document.querySelectorAll('[data-work-agent-cta]').forEach((link) => {
    link.addEventListener('click', () => recordEvent(variant, 'work-agent-open', link.dataset.workAgentCta || 'work-agent'));
  });
  document.querySelectorAll('[data-starter-kit-cta]').forEach((link) => {
    link.addEventListener('click', () => recordEvent(variant, 'starter-kit-click', link.dataset.starterKitCta || 'starter-kit'));
  });
}

function finalize(config = {}) {
  if (finalized) return;
  finalized = true;
  const winner = String(config?.winner || '').trim();
  const assigned = assignVariant(definition, visitorId, winner);
  const variant = applyVariant(assigned);
  bindClicks(variant);
  recordEvent(variant, 'view');
}

if (configNode && typeof configNode.once === 'function') {
  configNode.once((data) => finalize(data || {}));
  window.setTimeout(() => finalize({}), 700);
} else {
  finalize({});
}
