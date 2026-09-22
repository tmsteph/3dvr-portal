#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { execFileSync } = require('node:child_process');

const locationId = String(process.argv[3] || '9036').trim();
const requestedDate = String(process.argv[2] || '').trim();
const asOf = requestedDate || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !/^\d+$/.test(locationId)) {
  process.stderr.write('Usage: 3dvr-lighthouse-schedule [YYYY-MM-DD] [location-id]\n');
  process.exit(64);
}

const port = 9222;
const baseUrl = 'https://lighthouse2.psav.com';
const scheduleUrl = `${baseUrl}/schedule/loc/${locationId}/asOf/${asOf}`;
const leaseBin = process.env.THREEDVR_BROWSER_LEASE_BIN || '/usr/local/bin/3dvr-browser-lease';
const owner = `lighthouse-schedule-${process.pid}`;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function httpJson(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, res => {
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

function runLease(action, extra = []) {
  const direct = [leaseBin, action, 'general', ...extra];
  const command = process.getuid?.() === 0
    ? { file: direct.shift(), args: direct }
    : { file: 'sudo', args: ['-n', ...direct] };
  return execFileSync(command.file, command.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

class CdpSession {
  constructor(url) { this.url = url; this.ws = null; this.nextId = 1; this.pending = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = event => {
      let message;
      try { message = JSON.parse(String(event.data || '')); } catch { return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending(message);
    };
    return this;
  }
  call(method, params = {}) {
    return new Promise(resolve => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.result?.exceptionDetails) throw new Error('browser-evaluation-failed');
    return response.result?.result?.value;
  }
  close() { try { this.ws?.close(); } catch {} }
}

let leaseToken = '';
(async () => {
  leaseToken = runLease('acquire', [owner, '120']);
  let targets = await httpJson('/json/list');
  let page = targets.find(target => target?.type === 'page' && target?.url === scheduleUrl);
  if (!page) {
    page = await httpJson(`/json/new?${encodeURIComponent(scheduleUrl)}`, 'PUT');
    await sleep(4500);
    targets = await httpJson('/json/list');
    page = targets.find(target => target?.type === 'page' && target?.url === scheduleUrl) || page;
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('lighthouse-schedule-target-unavailable');

  const session = await new CdpSession(page.webSocketDebuggerUrl).connect();
  try {
    const result = await session.evaluate(`(() => {
      const dates = [...document.querySelectorAll('.mbsc-timeline-header-date-text')]
        .map(node => (node.textContent || '').trim())
        .filter(Boolean)
        .slice(-7);
      const resource = (document.querySelector('.e2e_schedule_resource_name')?.textContent || '').trim();
      const hours = (document.querySelector('.e2e_schedule_resource_hours')?.textContent || '').trim();
      const events = [...document.querySelectorAll('mbsc-schedule-event')].map(node => {
        const left = Number.parseFloat((node.getAttribute('style') || '').match(/left:\\s*([0-9.]+)%/)?.[1] || 'NaN');
        const index = Number.isFinite(left) ? Math.round(left / (100 / 7)) : null;
        return {
          date: index == null ? null : dates[index] || null,
          title: (node.querySelector('.e2e_schedule_event_card_title')?.textContent || '').trim(),
          notes: (node.querySelector('.e2e_schedule_event_card_client_or_notes')?.textContent || '').trim(),
          status: (node.querySelector('.e2e_schedule_event_card_status')?.getAttribute('title') || '').trim(),
        };
      }).filter(event => event.title);
      return { url: location.href, dates, resource, hours, events };
    })()`);

    if (!String(result?.url || '').startsWith(`${baseUrl}/schedule/`)) throw new Error('lighthouse-session-not-authenticated');
    if (!result?.resource) throw new Error('lighthouse-schedule-resource-missing');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    session.close();
  }
})().catch(error => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) })}\n`);
  process.exitCode = 1;
}).finally(() => {
  if (leaseToken) {
    try { runLease('release', [leaseToken]); } catch {}
  }
});
