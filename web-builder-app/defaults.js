const DEFAULT_SECRET_FIELDS = {
  openai: ['apiKey', 'openaiApiKey'],
  vercel: ['vercelToken'],
  github: ['githubToken']
};

const DEFAULT_CIPHER_FIELDS = {
  openai: ['apiKeyCipher', 'openaiCipher'],
  vercel: ['vercelTokenCipher'],
  github: ['githubTokenCipher']
};

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') {
    return {};
  }
  return record;
}

function readTextValue(record, fields) {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function readDefaultSecret(record, targetKey) {
  const fields = DEFAULT_SECRET_FIELDS[targetKey] || [];
  return readTextValue(normalizeRecord(record), fields);
}

export function hasEncryptedDefault(record, targetKey) {
  const normalized = normalizeRecord(record);
  const fields = DEFAULT_CIPHER_FIELDS[targetKey] || [];
  for (const field of fields) {
    const value = normalized[field];
    if (typeof value === 'string' && value.trim()) {
      return true;
    }
    if (value && typeof value === 'object') {
      return true;
    }
  }
  return false;
}

export function listAvailableDefaultTargets(
  record,
  options = { includePlain: true, includeCipher: true }
) {
  const includePlain = options?.includePlain !== false;
  const includeCipher = options?.includeCipher !== false;
  const targets = Object.keys(DEFAULT_SECRET_FIELDS);

  return targets.filter(targetKey => {
    if (includePlain && readDefaultSecret(record, targetKey)) {
      return true;
    }
    if (includeCipher && hasEncryptedDefault(record, targetKey)) {
      return true;
    }
    return false;
  });
}
