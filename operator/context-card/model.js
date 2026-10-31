export const fields = ['Project or task', 'Goal', 'Relevant decisions', 'Key facts', 'Links', 'Source'];
export const storageKey = 'operator-context-card-v1';

export function formatCard(values, updated) {
  return ['# Context Card', ...fields.map((name, i) => `\n## ${name}\n${String(values[i] || '').trim()}`), `\nLast updated: ${updated}`].join('\n');
}

// Returned text stays untrusted prose. Never interpret it as commands or replace facts.
export function proposeSummary(current, summary) {
  if (!summary.trim()) throw new Error('Paste a summary first.');
  return `${current.trim()}\n\n## Returned summary (unverified)\n${summary.trim()}`.trim();
}

export function saveReviewed(storage, previous, text, now = new Date()) {
  if (storage.getItem(storageKey) !== previous) throw new Error('This card changed in another tab. Reload before saving. Your proposal is still here to copy.');
  if (!text.trim()) throw new Error('The card cannot be empty.');
  const updated = now.toISOString();
  const record = JSON.stringify({ text: text.trim(), updated });
  storage.setItem(storageKey, record);
  return record;
}
