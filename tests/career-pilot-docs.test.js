import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('career onboarding documentation covers providers, privacy, deployment, and rollback', async () => {
  const docs = await readFile(new URL('../docs/career-opportunity-onboarding.md', import.meta.url), 'utf8');

  assert.match(docs, /Startup skills are opportunity-creation skills/);
  assert.match(docs, /deterministic generator is the source of truth/);
  assert.match(docs, /Local Model Pilot/);
  assert.match(docs, /OpenAI Hosted Pilot/);
  assert.match(docs, /ChatGPT subscription and the OpenAI API are separate products/);
  assert.match(docs, /Never expose the key in portal JavaScript/);
  assert.match(docs, /DigitalOcean Static Pilot/);
  assert.match(docs, /127\.0\.0\.1:4174/);
  assert.match(docs, /Rollback/);
  assert.match(docs, /Pilot Evaluation/);
});

test('career pilot service is loopback-only and runs without model secrets', async () => {
  const unit = await readFile(new URL('../ops/systemd/career-pilot.service', import.meta.url), 'utf8');

  assert.match(unit, /User=www-data/);
  assert.match(unit, /--bind 127\.0\.0\.1/);
  assert.match(unit, /NoNewPrivileges=true/);
  assert.match(unit, /ProtectSystem=strict/);
  assert.doesNotMatch(unit, /OPENAI_API_KEY|HF_TOKEN|HUGGING_FACE/);
});
