const builder = document.querySelector('#briefBuilder');
const outputs = {
  title: document.querySelector('[data-output="title"]'),
  summary: document.querySelector('[data-output="summary"]'),
  steps: document.querySelector('[data-output="steps"]'),
  mailto: document.querySelector('[data-output="mailto"]')
};

function clean(value, fallback) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function buildMailto(payload) {
  const body = [
    'I want to start the 3DVR Microbusiness Launch Sprint.',
    '',
    'Price anchor: $500 launch sprint',
    '',
    `Calling: ${payload.calling}`,
    `Audience: ${payload.audience}`,
    `Pain: ${payload.pain}`,
    `Paid result: ${payload.paidResult}`,
    '',
    'Please help me turn this into one paid offer, landing page, lead/payment path, outreach script, and validation list.'
  ].join('\n');

  return `mailto:3dvr.tech@gmail.com?subject=${encodeURIComponent('3DVR Microbusiness Launch Sprint')}&body=${encodeURIComponent(body)}`;
}

builder?.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(builder);
  const payload = {
    calling: clean(form.get('calling'), 'a skill or calling that keeps returning'),
    audience: clean(form.get('audience'), 'one reachable audience'),
    pain: clean(form.get('pain'), 'one painful moment they already feel'),
    paidResult: clean(form.get('paidResult'), 'one paid offer, landing page, lead/payment path, outreach script, and validation list')
  };

  outputs.title.textContent = `${payload.audience}: ${payload.paidResult}`;
  outputs.summary.textContent = `The $500 sprint starts with ${payload.calling}. The first offer should help ${payload.audience} move through "${payload.pain}" and pay for "${payload.paidResult}".`;
  outputs.steps.innerHTML = '';

  [
    `Interview 3 people in ${payload.audience}.`,
    `Write one $500 launch-sprint promise around "${payload.paidResult}".`,
    'Launch a short page, lead/payment path, and outreach script before expanding the build.'
  ].forEach(step => {
    const item = document.createElement('li');
    item.textContent = step;
    outputs.steps.append(item);
  });

  outputs.mailto.href = buildMailto(payload);
});
