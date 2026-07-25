const form = document.querySelector('#subscriberForm');
const status = document.querySelector('#subscriberStatus');
const source = document.querySelector('input[name="source"]')?.value || location.pathname;
const gun = typeof Gun === 'function' ? Gun(window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun']) : null;
const crm = gun?.get('3dvr-crm');
const touchLog = gun?.get('3dvr-portal')?.get('crm-touch-log');
const pendingKey = '3dvr-blog-signups-pending';

const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'subscriber';
const put = (node, payload) => new Promise(resolve => {
  if (!node?.put) return resolve(false);
  let done = false; const finish = value => { if (!done) { done = true; resolve(value); } };
  const timer = setTimeout(() => finish(false), 10000);
  node.put(payload, ack => { clearTimeout(timer); finish(!ack?.err); });
});

const saveDirect = async (record, touch) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const saved = await Promise.all([put(crm?.get(record.id), record), put(touchLog?.get(touch.id), touch)]);
    if (saved.every(Boolean)) return true;
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  return false;
};

const readPending = () => {
  try { return JSON.parse(localStorage.getItem(pendingKey) || '[]'); } catch (_) { return []; }
};

const writePending = items => {
  try { localStorage.setItem(pendingKey, JSON.stringify(items.slice(-20))); } catch (_) {}
};

const queueSignup = (record, touch) => {
  writePending([...readPending().filter(item => item.record?.id !== record.id), {record, touch}]);
};

const saveToServer = async ({email, consent, source: signupSource}) => {
  try {
    const response = await fetch('/api/trial', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({kind: 'blog-signup', email, consent, source: signupSource})
    });
    return response.ok;
  } catch (_) {
    return false;
  }
};

const syncPending = async () => {
  const items = readPending();
  for (const item of items) {
    if (await saveDirect(item.record, item.touch)) {
      writePending(readPending().filter(current => current.record?.id !== item.record.id));
    }
  }
};

syncPending();

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form); const email = String(data.get('email') || '').trim().toLowerCase();
  const consent = data.get('consent');
  if (!email || !consent) { status.textContent = 'Enter your email and confirm the signup.'; return; }
  status.textContent = 'Saving your signup…';
  const now = new Date().toISOString(); const id = `subscriber-${slug(email)}`;
  const record = {id, recordType:'person', name:email, email, tags:['blog-subscriber','digital-nomad','inbound'], status:'new', warmth:'warm', source:`blog:${source}`, nextBestAction:'Send the next practical transition note; honor unsubscribe requests.', created:now, updated:now, notes:`Opt-in signup from ${source}. Consent recorded ${now}.`};
  const touch = {id:`touch-blog-${slug(email)}-${Date.now()}`,recordId:id,contactName:email,contactEmail:email,type:'inbound',channel:'blog',source:`blog:${source}`,summary:'Opt-in email subscriber captured from article.',outcome:'Subscribed; permission-based content only.',message:JSON.stringify({email,source,consent:true}),created:now,updated:now};
  // Email is the main signup path. Gun is only a CRM mirror, so a relay outage
  // never makes a real subscriber think their signup failed.
  const savedToServer = await saveToServer({email, consent: true, source});
  const saved = savedToServer || await saveDirect(record, touch);
  if (saved) {
    status.textContent = savedToServer ? 'You are on the list. Check your email.' : 'You are on the list. Check your email for the next note.';
    form.reset();
  } else {
    queueSignup(record, touch);
    status.textContent = 'Saved on this phone. We will try the server again soon.';
    form.reset();
  }
});
