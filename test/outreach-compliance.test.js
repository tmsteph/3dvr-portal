const test = require('node:test');
const assert = require('node:assert/strict');

const {
  finalizeCommercialOutreach,
  validateCommercialOutreach,
} = require('../thomas-agent/node/outreach-compliance');
const { buildTemplateOutreachDraft } = require('../thomas-agent/node/outreach-draft');

test('commercial outreach includes disclosure, postal address, and reply-based opt out', () => {
  const config = {
    GMAIL_USER: '3dvr.tech@gmail.com',
    THREEDVR_OUTREACH_POSTAL_ADDRESS: '123 Business Way, San Diego, CA 92101',
  };
  const text = finalizeCommercialOutreach('Hi Acme team,\n\nWould a free page be useful?\n\nThomas\n3DVR', config);
  const result = validateCommercialOutreach(text, config);

  assert.equal(result.ok, true);
  assert.match(text, /Advertisement from 3DVR/);
  assert.match(text, /123 Business Way/);
  assert.match(text, /reply unsubscribe or stop/i);
});

test('commercial outreach is blocked when a physical postal address is missing', () => {
  const text = finalizeCommercialOutreach('Hi Acme team,\n\nWould a free page be useful?', {});
  const result = validateCommercialOutreach(text, {});

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /postal/i);
});

test('free-page campaign copy offers a no-cost draft without invented site claims', () => {
  const previousProfile = process.env.THREEDVR_OUTREACH_OFFER_PROFILE;
  const previousAddress = process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS;
  process.env.THREEDVR_OUTREACH_OFFER_PROFILE = 'free-page';
  process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS = '123 Business Way, San Diego, CA 92101';
  try {
    const draft = buildTemplateOutreachDraft({ name: 'Acme Studio' });
    assert.equal(draft.source, 'template-free-page');
    assert.match(draft.text, /one-page website draft at no cost/i);
    assert.match(draft.text, /no obligation/i);
    assert.doesNotMatch(draft.text, /noticed|looked at|problem with your site/i);
    assert.equal(validateCommercialOutreach(draft.text, process.env).ok, true);
  } finally {
    if (previousProfile === undefined) delete process.env.THREEDVR_OUTREACH_OFFER_PROFILE;
    else process.env.THREEDVR_OUTREACH_OFFER_PROFILE = previousProfile;
    if (previousAddress === undefined) delete process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS;
    else process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS = previousAddress;
  }
});

test('free-page experiment variant b changes the call to action and stays compliant', () => {
  process.env.THREEDVR_OUTREACH_OFFER_PROFILE = 'free-page';
  process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS = '123 Main St, San Diego, CA 92101';
  try {
    const draft = buildTemplateOutreachDraft({ name: 'Acme', experimentVariant: 'b' });
    assert.equal(draft.source, 'template-free-page-b');
    assert.match(draft.text, /Would you like me to put together a first draft for Acme/i);
    assert.equal(validateCommercialOutreach(draft.text).ok, true);
  } finally {
    delete process.env.THREEDVR_OUTREACH_OFFER_PROFILE;
    delete process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS;
  }
});
