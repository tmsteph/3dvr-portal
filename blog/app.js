const form = document.querySelector('#subscriberForm');
const status = document.querySelector('#subscriberStatus');
const source = document.querySelector('input[name="source"]')?.value || location.pathname;
const gun = typeof Gun === 'function' ? Gun(window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun']) : null;
const crm = gun?.get('3dvr-crm');
const touchLog = gun?.get('3dvr-portal')?.get('crm-touch-log');

const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'subscriber';
const put = (node, payload) => new Promise(resolve => {
  if (!node?.put) return resolve(false);
  let done = false; const finish = value => { if (!done) { done = true; resolve(value); } };
  const timer = setTimeout(() => finish(false), 10000);
  node.put(payload, ack => { clearTimeout(timer); finish(!ack?.err); });
});

const saveDirect = async (record, touch) => {
  const saved = await Promise.all([put(crm?.get(record.id), record), put(touchLog?.get(touch.id), touch)]);
  return saved.every(Boolean);
};

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form); const email = String(data.get('email') || '').trim().toLowerCase();
  const consent = data.get('consent');
  if (!email || !consent) { status.textContent = 'Enter your email and confirm the signup.'; return; }
  status.textContent = 'Saving your signup…';
  const now = new Date().toISOString(); const id = `subscriber-${slug(email)}`;
  const record = {id, recordType:'person', name:email, email, tags:['blog-subscriber','digital-nomad','inbound'], status:'new', warmth:'warm', source:`blog:${source}`, nextBestAction:'Send the next practical transition note; honor unsubscribe requests.', created:now, updated:now, notes:`Opt-in signup from ${source}. Consent recorded ${now}.`};
  const touch = {id:`touch-blog-${slug(email)}-${Date.now()}`,recordId:id,contactName:email,contactEmail:email,type:'inbound',channel:'blog',source:`blog:${source}`,summary:'Opt-in email subscriber captured from article.',outcome:'Subscribed; permission-based content only.',message:JSON.stringify({email,source,consent:true}),created:now,updated:now};
  let saved = false;
  try {
    const response = await fetch('/api/newsletter/subscribe', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, source, consent: true}),
    });
    saved = response.ok && (await response.json()).ok === true;
  } catch (error) {
    console.warn('Server-side signup failed; trying direct relay.', error);
  }
  if (!saved) saved = await saveDirect(record, touch);
  status.textContent = saved ? 'You’re on the list. Watch your inbox for the next practical note.' : 'The connection is still unavailable. Please try again in a moment.';
  if (saved) form.reset();
});
