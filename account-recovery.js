(function initAccountRecovery(global) {
  const PORTAL_NAMESPACE = '3dvr-portal';
  const RECOVERY_EMAIL_INDEX_NODE = 'recoveryEmailIndex';
  const RECOVERY_EMAIL_LATEST_NODE = 'recoveryEmailLatest';
  // Gun graph: 3dvr-portal/recoveryEmailIndex/<email>/<alias> -> { alias, email, archived, recoveredTo, updatedAt }
  //             3dvr-portal/recoveryEmailLatest/<email> -> { alias, email, updatedAt }

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function sanitizeAliasLocalPart(value = '') {
    return value.replace(/\s+/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
  }

  function normalizeEmail(value) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return '';
    return normalized;
  }

  function looksLikeEmail(value) {
    return Boolean(normalizeEmail(value));
  }

  function normalizeAlias(value) {
    const raw = normalizeText(value);
    if (!raw) return '';

    if (raw.includes('@')) {
      const parts = raw.split('@');
      const local = sanitizeAliasLocalPart(parts.shift() || '');
      const domain = normalizeText(parts.join('@')).replace(/\s+/g, '');
      const domainLower = domain.toLowerCase();
      if (!local) return '';
      if (!domain || domainLower === '3dvr' || domainLower === '3dvr.tech') {
        return `${local}@3dvr`;
      }
      return '';
    }

    const local = sanitizeAliasLocalPart(raw);
    return local ? `${local}@3dvr` : '';
  }

  function aliasToDisplay(alias) {
    const normalized = normalizeAlias(alias);
    if (!normalized) return '';
    return normalized.split('@')[0];
  }

  function once(node) {
    return new Promise(resolve => {
      if (!node || typeof node.once !== 'function') {
        resolve(null);
        return;
      }
      node.once(value => resolve(value || null));
    });
  }

  function readNodeValue(node, key) {
    if (!node || typeof node.get !== 'function') {
      return Promise.resolve(null);
    }
    return once(node.get(key));
  }

  function getPortalRoot(target) {
    if (!target || typeof target.get !== 'function') return null;

    try {
      const current = target._ && target._.get;
      if (current === PORTAL_NAMESPACE) {
        return target;
      }
    } catch (_err) {
      // Ignore metadata read issues and try root lookup below.
    }

    return target.get(PORTAL_NAMESPACE);
  }

  function extractRecoveryEntries(snapshot, defaultEmail = '') {
    if (!snapshot || typeof snapshot !== 'object') {
      return [];
    }

    const entries = [];
    const fallbackEmail = normalizeEmail(defaultEmail);

    Object.entries(snapshot).forEach(([key, rawValue]) => {
      if (key === '_' || !rawValue || typeof rawValue !== 'object') {
        return;
      }

      const alias = normalizeAlias(rawValue.alias || key);
      if (!alias) return;

      const updatedAt = Number(rawValue.updatedAt);
      entries.push({
        alias,
        email: normalizeEmail(rawValue.email) || fallbackEmail,
        updatedAt: Number.isFinite(updatedAt) ? Math.round(updatedAt) : 0,
        archived: Boolean(rawValue.archived),
        recoveredTo: normalizeAlias(rawValue.recoveredTo),
        source: normalizeText(rawValue.source),
        updatedBy: normalizeText(rawValue.updatedBy)
      });
    });

    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }

  function extractUserIndexRecoveryEntries(snapshot, targetEmail = '') {
    if (!snapshot || typeof snapshot !== 'object') {
      return [];
    }

    const normalizedTargetEmail = normalizeEmail(targetEmail);
    if (!normalizedTargetEmail) {
      return [];
    }

    const entries = [];

    Object.entries(snapshot).forEach(([key, rawValue]) => {
      if (key === '_' || !rawValue || typeof rawValue !== 'object') {
        return;
      }

      const alias = normalizeAlias(rawValue.alias || key);
      const recoveryEmail = normalizeEmail(rawValue.recoveryEmail);
      if (!alias || recoveryEmail !== normalizedTargetEmail) {
        return;
      }

      const updatedAt = Number(rawValue.lastLogin || rawValue.createdAt || rawValue.recoveredAt || 0);
      entries.push({
        alias,
        email: normalizedTargetEmail,
        updatedAt: Number.isFinite(updatedAt) ? Math.round(updatedAt) : 0,
        archived: Boolean(rawValue.archived),
        recoveredTo: normalizeAlias(rawValue.recoveredTo),
        source: 'user-index-fallback',
        updatedBy: normalizeText(rawValue.updatedBy)
      });
    });

    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }

  async function lookupAliasesByEmail({ portalRoot, email, includeArchived = false } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return {
        email: '',
        latestAlias: '',
        aliases: [],
        entries: []
      };
    }

    const root = getPortalRoot(portalRoot);
    if (!root) {
      return {
        email: normalizedEmail,
        latestAlias: '',
        aliases: [],
        entries: []
      };
    }

    const [latestRecord, snapshot] = await Promise.all([
      readNodeValue(root.get(RECOVERY_EMAIL_LATEST_NODE), normalizedEmail),
      once(root.get(RECOVERY_EMAIL_INDEX_NODE).get(normalizedEmail))
    ]);

    const latestAlias = normalizeAlias(latestRecord && latestRecord.alias);
    const parsedEntries = extractRecoveryEntries(snapshot, normalizedEmail);
    let entries = includeArchived
      ? parsedEntries
      : parsedEntries.filter(entry => !entry.archived);

    if (!entries.length) {
      const userIndexSnapshot = await once(root.get('userIndex'));
      const fallbackEntries = extractUserIndexRecoveryEntries(userIndexSnapshot, normalizedEmail);
      entries = includeArchived
        ? fallbackEntries
        : fallbackEntries.filter(entry => !entry.archived);

      if (entries.length) {
        // Auto-heal recovery index so future lookups do not need a userIndex scan.
        await Promise.all(entries.map(entry => syncRecoveryEmailIndex({
          portalRoot: root,
          alias: entry.alias,
          email: normalizedEmail,
          updatedAt: entry.updatedAt || Date.now(),
          source: entry.source,
          updatedBy: entry.updatedBy
        })));
      }
    }

    const aliases = entries.map(entry => entry.alias);
    const resolvedLatestAlias = latestAlias || aliases[0] || '';
    if (resolvedLatestAlias && !aliases.includes(resolvedLatestAlias)) {
      aliases.unshift(resolvedLatestAlias);
    }

    return {
      email: normalizedEmail,
      latestAlias: resolvedLatestAlias,
      aliases,
      entries
    };
  }

  async function findAliasByRecoveryInput({ portalRoot, input } = {}) {
    const normalizedInput = normalizeText(input);
    if (!normalizedInput) {
      return {
        inputType: 'unknown',
        alias: '',
        email: '',
        aliases: []
      };
    }

    const email = normalizeEmail(normalizedInput);
    if (email) {
      const lookup = await lookupAliasesByEmail({ portalRoot, email, includeArchived: false });
      return {
        inputType: 'email',
        alias: lookup.latestAlias || lookup.aliases[0] || '',
        email,
        aliases: lookup.aliases,
        entries: lookup.entries
      };
    }

    const alias = normalizeAlias(normalizedInput);
    return {
      inputType: alias ? 'alias' : 'unknown',
      alias,
      email: '',
      aliases: alias ? [alias] : [],
      entries: []
    };
  }

  async function syncRecoveryEmailIndex({
    portalRoot,
    alias,
    email,
    updatedAt = Date.now(),
    source = 'app',
    updatedBy = ''
  } = {}) {
    const root = getPortalRoot(portalRoot);
    const normalizedAlias = normalizeAlias(alias);
    const normalizedEmail = normalizeEmail(email);

    if (!root) {
      return {
        saved: false,
        reason: 'portal-root-unavailable'
      };
    }
    if (!normalizedAlias || !normalizedEmail) {
      return {
        saved: false,
        reason: 'alias-and-email-required'
      };
    }

    const safeUpdatedAt = Number.isFinite(Number(updatedAt))
      ? Math.round(Number(updatedAt))
      : Date.now();

    const record = {
      alias: normalizedAlias,
      email: normalizedEmail,
      archived: false,
      source: normalizeText(source) || 'app',
      updatedBy: normalizeText(updatedBy),
      updatedAt: safeUpdatedAt
    };

    root.get(RECOVERY_EMAIL_INDEX_NODE)
      .get(normalizedEmail)
      .get(normalizedAlias)
      .put(record);

    root.get(RECOVERY_EMAIL_LATEST_NODE)
      .get(normalizedEmail)
      .put({
        alias: normalizedAlias,
        email: normalizedEmail,
        source: record.source,
        updatedBy: record.updatedBy,
        updatedAt: safeUpdatedAt
      });

    return {
      saved: true,
      alias: normalizedAlias,
      email: normalizedEmail,
      updatedAt: safeUpdatedAt
    };
  }

  async function archiveRecoveryAlias({
    portalRoot,
    alias,
    email,
    recoveredTo = '',
    updatedAt = Date.now(),
    updatedBy = ''
  } = {}) {
    const root = getPortalRoot(portalRoot);
    const normalizedAlias = normalizeAlias(alias);
    const normalizedEmail = normalizeEmail(email);
    const nextAlias = normalizeAlias(recoveredTo);

    if (!root || !normalizedAlias || !normalizedEmail) {
      return {
        saved: false,
        reason: 'alias-email-and-root-required'
      };
    }

    const safeUpdatedAt = Number.isFinite(Number(updatedAt))
      ? Math.round(Number(updatedAt))
      : Date.now();

    const existing = await readNodeValue(
      root.get(RECOVERY_EMAIL_INDEX_NODE).get(normalizedEmail),
      normalizedAlias
    );

    root.get(RECOVERY_EMAIL_INDEX_NODE)
      .get(normalizedEmail)
      .get(normalizedAlias)
      .put({
        ...(existing && typeof existing === 'object' ? existing : {}),
        alias: normalizedAlias,
        email: normalizedEmail,
        archived: true,
        recoveredTo: nextAlias,
        updatedBy: normalizeText(updatedBy),
        updatedAt: safeUpdatedAt
      });

    if (nextAlias) {
      root.get(RECOVERY_EMAIL_LATEST_NODE)
        .get(normalizedEmail)
        .put({
          alias: nextAlias,
          email: normalizedEmail,
          source: 'admin-recovery',
          updatedBy: normalizeText(updatedBy),
          updatedAt: safeUpdatedAt
        });
    }

    return {
      saved: true,
      alias: normalizedAlias,
      email: normalizedEmail,
      recoveredTo: nextAlias,
      updatedAt: safeUpdatedAt
    };
  }

  global.AccountRecovery = {
    PORTAL_NAMESPACE,
    RECOVERY_EMAIL_INDEX_NODE,
    RECOVERY_EMAIL_LATEST_NODE,
    normalizeText,
    normalizeEmail,
    looksLikeEmail,
    normalizeAlias,
    aliasToDisplay,
    once,
    readNodeValue,
    extractRecoveryEntries,
    extractUserIndexRecoveryEntries,
    lookupAliasesByEmail,
    findAliasByRecoveryInput,
    syncRecoveryEmailIndex,
    archiveRecoveryAlias
  };
})(typeof window !== 'undefined' ? window : globalThis);
