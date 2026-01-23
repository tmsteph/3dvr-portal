export function summarizeDefaults(record = {}) {
  const defaults = {
    openai: record.apiKey || '',
    vercel: record.vercelToken || '',
    github: record.githubToken || ''
  };
  const hasPublic = Boolean(defaults.openai || defaults.vercel || defaults.github);
  const hasEncrypted = Boolean(record.apiKeyCipher || record.vercelTokenCipher || record.githubTokenCipher);

  return { defaults, hasPublic, hasEncrypted };
}
