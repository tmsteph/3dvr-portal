'use strict';

const http = require('node:http');

function requestJson(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path, method }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) return reject(new Error(`cdp-http-${res.statusCode}`));
        try { resolve(JSON.parse(text || '{}')); }
        catch { reject(new Error('cdp-invalid-json')); }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('cdp-http-timeout')));
    req.on('error', reject);
    req.end();
  });
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws-timeout')), 8000);
      this.ws.onopen = () => { clearTimeout(timer); resolve(); };
      this.ws.onerror = error => { clearTimeout(timer); reject(error); };
    });
    this.ws.onmessage = event => {
      let message;
      try { message = JSON.parse(String(event.data || '')); } catch { return; }
      const callback = this.pending.get(message.id);
      if (!callback) return;
      this.pending.delete(message.id);
      callback(message);
    };
    return this;
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('cdp-command-timeout'));
      }, 8000);
      this.pending.set(id, message => {
        clearTimeout(timer);
        resolve(message);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.result?.exceptionDetails) throw new Error('browser-evaluation-failed');
    return response.result?.result?.value;
  }
  close() {
    try { this.ws?.close(); } catch {}
  }
}

(async () => {
  let targets = await requestJson('/json/list');
  let target = targets.find(t => t?.type === 'page' && /member\.iatse\.io\/avail/.test(String(t.url || '')))
    || targets.find(t => t?.type === 'page' && /member\.iatse\.io/.test(String(t.url || '')));

  if (!target) {
    target = await requestJson('/json/new?https%3A%2F%2Fmember.iatse.io%2Favail', 'PUT');
    await new Promise(resolve => setTimeout(resolve, 1800));
    targets = await requestJson('/json/list');
    target = targets.find(t => t?.type === 'page' && /member\.iatse\.io/.test(String(t.url || ''))) || target;
  }

  if (!target?.webSocketDebuggerUrl) throw new Error('iatse-target-unavailable');

  const cdp = await new Cdp(target.webSocketDebuggerUrl).connect();
  try {
    const result = await cdp.evaluate(`(() => {
      const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
      const body = clean(document.body?.innerText || '').slice(0, 12000);
      const controls = [...document.querySelectorAll(
        'button,a,input,select,option,[role="button"],[role="checkbox"],[role="radio"],[role="combobox"]'
      )].map((el, i) => ({
        i,
        tag: el.tagName,
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        text: clean(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').slice(0, 260),
        name: el.getAttribute('name') || '',
        id: el.id || '',
        cls: String(el.className || '').slice(0, 260),
        value: el.value || el.getAttribute('value') || '',
        checked: Boolean(el.checked),
        disabled: Boolean(el.disabled),
        href: el.href || '',
        title: el.getAttribute('title') || '',
        aria: el.getAttribute('aria-label') || '',
        parent: clean(el.parentElement?.innerText || '').slice(0, 260),
      })).filter(x => x.text || x.name || x.id || x.value || x.href || x.title || x.aria);

      const useful = controls.filter(x => {
        const hay = [x.text,x.name,x.id,x.value,x.title,x.aria,x.parent].join(' ');
        return /all day|already booked|not available|choose|available|availability|save|submit|calendar|date|day|september|october|november/i.test(hay)
          || x.tag === 'SELECT' || x.tag === 'INPUT';
      });

      return {
        ok: true,
        url: location.href,
        title: document.title,
        body,
        controls: useful.slice(0, 100),
      };
    })()`);

    process.stdout.write(JSON.stringify(result || { ok: false, error: 'empty-result' }));
  } finally {
    cdp.close();
  }
})().catch(error => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
