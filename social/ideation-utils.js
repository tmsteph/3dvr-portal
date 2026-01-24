export function shouldAllowRequest(lastAt, now, minIntervalMs) {
  const lastTime = Number(lastAt) || 0;
  const elapsed = Math.max(0, now - lastTime);
  if (elapsed >= minIntervalMs) {
    return { allowed: true, remainingMs: 0 };
  }
  return { allowed: false, remainingMs: minIntervalMs - elapsed };
}

export function buildIdeaPrompt({ goal, audience, platforms, tone, format }) {
  const lines = [
    'You are a social media strategist.',
    'Generate 6 concise post ideas based on the brief.',
    'Each idea should be one sentence with a clear hook and CTA suggestion.',
    'Return each idea on a new line without numbering.'
  ];

  if (goal) lines.push(`Goal: ${goal}`);
  if (audience) lines.push(`Audience: ${audience}`);
  if (platforms) lines.push(`Platforms: ${platforms}`);
  if (tone) lines.push(`Tone: ${tone}`);
  if (format) lines.push(`Content formats: ${format}`);

  return lines.join('\n');
}

export function splitIdeas(text) {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
}
