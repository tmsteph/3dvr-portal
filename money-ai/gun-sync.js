const GUN_OFFLINE_ERROR = { err: 'gun-unavailable' };

function createGunNodeStub(path = []) {
  const node = {
    __isGunStub: true,
    path,
    get(key) {
      return createGunNodeStub([...path, String(key)]);
    },
    put(_value, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback(GUN_OFFLINE_ERROR), 0);
      }
      return node;
    },
    once(callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback(undefined), 0);
      }
      return node;
    },
    on() {
      return { off() {} };
    },
    off() {}
  };
  return node;
}

function createGunStub() {
  return {
    __isGunStub: true,
    get(key) {
      return createGunNodeStub([String(key)]);
    },
    user() {
      return { is: null };
    }
  };
}

export function ensureGunContext(factory, scoreSystem, label = 'money-ai') {
  if (scoreSystem && typeof scoreSystem.ensureGun === 'function') {
    try {
      return scoreSystem.ensureGun(factory, { label });
    } catch (error) {
      console.warn('ScoreSystem.ensureGun failed for money-ai', error);
    }
  }

  if (typeof factory === 'function') {
    try {
      const gun = factory();
      if (gun) {
        const user = typeof gun.user === 'function' ? gun.user() : { is: null };
        return { gun, user, isStub: !!gun.__isGunStub };
      }
    } catch (error) {
      console.warn('Money AI Gun factory failed', error);
    }
  }

  const stub = createGunStub();
  return {
    gun: stub,
    user: stub.user(),
    isStub: true
  };
}

export function ensureActorIdentity(scoreSystem) {
  if (scoreSystem && typeof scoreSystem.ensureGuestIdentity === 'function') {
    try {
      scoreSystem.ensureGuestIdentity();
    } catch (error) {
      console.warn('Failed to ensure money-ai guest identity', error);
    }
  }

  try {
    const username = localStorage.getItem('username');
    const alias = localStorage.getItem('alias');
    const guestId = localStorage.getItem('guestId');

    const actor = username || alias || guestId || 'guest';
    return String(actor).trim() || 'guest';
  } catch (error) {
    return 'guest';
  }
}

function buildSourceList(primary, legacy) {
  const sources = [];
  if (primary) {
    sources.push(primary);
  }
  if (legacy && legacy !== primary) {
    sources.push(legacy);
  }
  if (!sources.length) {
    sources.push(createGunNodeStub([]));
  }
  return sources;
}

function normalizeEmailHint(value = '') {
  return String(value || '').trim().toLowerCase();
}

function resolveAlias(aliasOverride = '') {
  const explicit = String(aliasOverride || '').trim();
  if (explicit) {
    return explicit;
  }

  try {
    return String(localStorage.getItem('alias') || '').trim();
  } catch (error) {
    return '';
  }
}

function buildBillingHintSources(gun) {
  const root = gun && typeof gun.get === 'function' ? gun : createGunStub();
  const portalRoot = root.get('3dvr-portal').get('money-ai').get('billing');
  const legacyRoot = root.get('money-ai').get('billing');
  return buildSourceList(portalRoot, legacyRoot);
}

function onceAsync(node) {
  if (!node || typeof node.once !== 'function') {
    return Promise.resolve(undefined);
  }

  return new Promise(resolve => {
    node.once(data => resolve(data));
  });
}

// Shared node shape:
// - gun.get('3dvr-portal').get('money-ai').get('runs').get(<runId>)
// - gun.get('3dvr-portal').get('money-ai').get('opportunities').get(<opportunityId>)
// - gun.get('3dvr-portal').get('money-ai').get('ads').get(<adId>)
// Legacy mirror remains under gun.get('money-ai') for older clients.
export function buildMoneyAutomationSources(gun) {
  const root = gun && typeof gun.get === 'function' ? gun : createGunStub();

  const portalRoot = root.get('3dvr-portal');
  const moneyRoot = portalRoot.get('money-ai');
  const legacyRoot = root.get('money-ai');

  return {
    runSources: buildSourceList(moneyRoot.get('runs'), legacyRoot.get('runs')),
    opportunitySources: buildSourceList(moneyRoot.get('opportunities'), legacyRoot.get('opportunities')),
    adSources: buildSourceList(moneyRoot.get('ads'), legacyRoot.get('ads')),
    statusSources: buildSourceList(moneyRoot.get('status'), legacyRoot.get('status'))
  };
}

// Billing hint node shape:
// - gun.get('3dvr-portal').get('money-ai').get('billing').get(<alias>)
// - gun.get('money-ai').get('billing').get(<alias>) (legacy mirror)
// This is only a convenience hint for UI autofill, not a source of entitlement truth.
export async function readBillingEmailHint(gun, aliasOverride = '') {
  const alias = resolveAlias(aliasOverride);
  if (!alias) {
    return '';
  }

  const sources = buildBillingHintSources(gun);
  for (const source of sources) {
    const snapshot = await onceAsync(source.get(alias));
    const candidate = typeof snapshot === 'string'
      ? snapshot
      : snapshot && typeof snapshot.email === 'string'
        ? snapshot.email
        : '';
    const normalized = normalizeEmailHint(candidate);
    if (normalized.includes('@')) {
      return normalized;
    }
  }

  return '';
}

export async function persistBillingEmailHint(gun, email, aliasOverride = '') {
  const alias = resolveAlias(aliasOverride);
  const normalizedEmail = normalizeEmailHint(email);
  if (!alias || !normalizedEmail.includes('@')) {
    return {
      saved: false,
      alias,
      email: normalizedEmail
    };
  }

  const record = {
    alias,
    email: normalizedEmail,
    updatedAt: Date.now()
  };

  const sources = buildBillingHintSources(gun);
  const writes = sources.map(source => new Promise(resolve => {
    source.get(alias).put(record, ack => resolve(ack || { ok: true }));
  }));

  await Promise.all(writes);

  return {
    saved: true,
    alias,
    email: normalizedEmail
  };
}

export function sanitizeForGun(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeForGun(item)).filter(item => item !== undefined);
  }

  if (typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      if (typeof item === 'function' || item === undefined) {
        return;
      }
      output[key] = sanitizeForGun(item);
    });
    return output;
  }

  return value;
}

export async function writeRecordToSources(sources, identifier, record, label = 'record') {
  if (!identifier) {
    return;
  }

  const writes = [];

  sources.forEach((source, index) => {
    if (!source || typeof source.get !== 'function') {
      return;
    }

    const node = source.get(String(identifier));
    if (!node || typeof node.put !== 'function') {
      return;
    }

    writes.push(new Promise(resolve => {
      node.put(record, ack => {
        if (index === 0 && ack && ack.err) {
          console.warn(`Failed to persist ${label} to primary money-ai node`, ack.err);
        }
        resolve(ack || { ok: true });
      });
    }));
  });

  await Promise.all(writes);
}

export async function persistMoneyLoopRun({ sources, report, actor, nowIso = new Date().toISOString() }) {
  if (!sources || !report || !report.runId) {
    throw new Error('sources and report.runId are required for money-ai persistence.');
  }

  const runRecord = sanitizeForGun({
    runId: report.runId,
    generatedAt: report.generatedAt,
    actor,
    market: report.input?.market,
    budget: report.input?.budget,
    channels: report.input?.channels,
    usedOpenAi: report.usedOpenAi,
    warnings: report.warnings,
    topOpportunityId: report.topOpportunity?.id || null,
    signalCount: Array.isArray(report.signals) ? report.signals.length : 0,
    savedAt: nowIso
  });

  await writeRecordToSources(sources.runSources, report.runId, runRecord, 'run record');

  const opportunities = Array.isArray(report.opportunities) ? report.opportunities : [];
  for (const item of opportunities) {
    const opportunityId = item.id || `${report.runId}-opportunity`;
    await writeRecordToSources(
      sources.opportunitySources,
      opportunityId,
      sanitizeForGun({ ...item, runId: report.runId, actor, savedAt: nowIso }),
      'opportunity'
    );
  }

  const ads = Array.isArray(report.adDrafts) ? report.adDrafts : [];
  for (const item of ads) {
    const adId = item.id || `${report.runId}-ad`;
    await writeRecordToSources(
      sources.adSources,
      adId,
      sanitizeForGun({ ...item, runId: report.runId, actor, savedAt: nowIso }),
      'ad draft'
    );
  }

  await writeRecordToSources(
    sources.statusSources,
    'latest',
    sanitizeForGun({
      runId: report.runId,
      actor,
      savedAt: nowIso,
      topOpportunity: report.topOpportunity?.title || '',
      topOpportunityScore: report.topOpportunity?.score || 0,
      warnings: report.warnings || []
    }),
    'run status'
  );

  return {
    runId: report.runId,
    savedAt: nowIso,
    opportunitiesSaved: opportunities.length,
    adsSaved: ads.length
  };
}
