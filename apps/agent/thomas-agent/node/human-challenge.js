'use strict';

const CHALLENGES = [
  { kind: 'recaptcha', pattern: /(?:g-recaptcha|google\.com\/recaptcha|recaptcha\/api)/i },
  { kind: 'hcaptcha', pattern: /(?:h-captcha|hcaptcha\.com\/)/i },
  { kind: 'turnstile', pattern: /(?:cf-turnstile|challenges\.cloudflare\.com\/turnstile)/i },
  { kind: 'captcha', pattern: /(?:name|id|class)=["'][^"']*captcha[^"']*["']/i },
  { kind: 'human-verification', pattern: /(?:verify (?:that )?you(?:'re| are) human|confirm you(?:'re| are) human|security check)/i },
];

function detectHumanChallenge(html = '', url = '') {
  const source = `${String(url || '')}\n${String(html || '')}`;
  const match = CHALLENGES.find((challenge) => challenge.pattern.test(source));
  if (!match) return { detected: false };
  return {
    detected: true,
    kind: match.kind,
    reason: 'human-verification-required',
  };
}

function humanChallengeResult({ challenge, targetUrl, previous = {} }) {
  return {
    ...previous,
    status: 'human-challenge',
    requiresHuman: true,
    challenge,
    targetUrl,
    submitted: false,
    filled: previous.filled || [],
    screenshotPath: previous.screenshotPath || '',
  };
}

module.exports = { detectHumanChallenge, humanChallengeResult };
