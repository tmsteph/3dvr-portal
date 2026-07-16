const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, mkdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  fillContactForm,
  pickLead,
  planFieldAssignments,
  selectAdapter,
  routeLabelForLead,
  resolveBrowserExecutablePath,
  runFormCommand,
} = require('../thomas-agent/node/contact-form-fill');
const { readOutreachLog } = require('../thomas-agent/node/outreach-log');

const askFormCli = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-form');

function makeElement(descriptor) {
  const attrs = {
    type: descriptor.type,
    name: descriptor.name,
    id: descriptor.id,
    placeholder: descriptor.placeholder,
    autocomplete: descriptor.autocomplete,
    'aria-label': descriptor.ariaLabel,
    value: descriptor.value,
  };

  return {
    tagName: String(descriptor.tag || 'input').toUpperCase(),
    required: Boolean(descriptor.required),
    disabled: Boolean(descriptor.disabled),
    readOnly: Boolean(descriptor.readonly),
    labels: descriptor.labelText ? [{ textContent: descriptor.labelText }] : [],
    getAttribute(name) {
      return attrs[name] || '';
    },
    hasAttribute(name) {
      return Boolean(attrs[name]);
    },
  };
}

function makeFakePage(descriptors, html = '<form><input type="text" name="name" /></form>') {
  const fields = descriptors.map((descriptor, index) => ({
    ...descriptor,
    index,
    value: descriptor.value || '',
  }));
  const controls = [];
  const formState = {
    submittedVia: '',
  };

  return {
    fields,
    controls,
    formState,
    async content() {
      return html;
    },
    async goto() {},
    async screenshot({ path: screenshotPath }) {
      writeFileSync(screenshotPath, 'screenshot');
    },
    async waitForLoadState() {},
    locator(selector) {
      if (selector === 'form') {
        return {
          count: async () => 1,
          first: () => ({
            evaluate: async (callback) => callback({
              requestSubmit: () => {
                formState.submittedVia = 'requestSubmit';
              },
              submit: () => {
                formState.submittedVia = 'submit';
              },
            }),
          }),
        };
      }

      if (selector === 'input, textarea, select') {
        return {
          count: async () => fields.length,
          evaluateAll: async (callback) => callback(fields.map((field) => makeElement(field))),
          nth: (index) => ({
            fill: async (value) => {
              fields[index].value = value;
            },
            check: async () => {
              fields[index].checked = true;
            },
            isChecked: async () => Boolean(fields[index].checked),
            evaluate: async (callback) => callback({
              checked: false,
              dispatchEvent: () => {},
            }),
            click: async () => {
              fields[index].clicked = true;
            },
          }),
        };
      }

      if (selector === 'button, input[type="submit"], input[type="button"]') {
        return {
          count: async () => controls.length,
          evaluateAll: async (callback) => callback(controls.map((control) => makeElement(control))),
          nth: (index) => ({
            click: async () => {
              controls[index].clicked = true;
            },
          }),
        };
      }

      throw new Error(`Unexpected selector: ${selector}`);
    },
  };
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

test('selectAdapter picks builder-specific adapters before the generic form adapter', () => {
  assert.equal(selectAdapter({ html: '<div class="wpcf7">Contact form</div>' }).id, 'wordpress-contact-form-7');
  assert.equal(selectAdapter({ html: '<div data-hook="form"></div><div class="wix-form">Form</div>' }).id, 'wix-contact-form');
  assert.equal(selectAdapter({ html: '<div class="sqs-block-form">Form</div>' }).id, 'squarespace-form');
  assert.equal(selectAdapter({ html: '<form><input name="name"></form>' }).id, 'generic-html-form');
});

test('pickLead prefers form routes over direct email', () => {
  const rows = [
    { name: 'Mail Lead', link: 'https://mail.example', contact: 'mailto:lead@mail.example', status: 'new', variant: '' },
    { name: 'Form Lead', link: 'https://form.example', contact: 'https://form.example/contact', status: 'new', variant: 'route=form' },
  ];

  const lead = pickLead(rows);

  assert.equal(lead.name, 'Form Lead');
  assert.equal(routeLabelForLead(lead), 'form');
});

test('planFieldAssignments fills the high-confidence fields only', () => {
  const fields = [
    { index: 0, tag: 'input', type: 'text', labelText: 'First name', name: 'first_name' },
    { index: 1, tag: 'input', type: 'text', labelText: 'Last name', name: 'last_name' },
    { index: 2, tag: 'input', type: 'email', labelText: 'Email address', name: 'email' },
    { index: 3, tag: 'input', type: 'text', labelText: 'Company', name: 'company' },
    { index: 4, tag: 'textarea', type: '', labelText: 'Message', name: 'message' },
    { index: 5, tag: 'input', type: 'tel', labelText: 'Phone', name: 'phone' },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.deepEqual(plan.assignments.map((item) => item.role), ['firstName', 'lastName', 'email', 'company', 'message']);
  assert.equal(plan.unmatchedRequired.length, 0);
});

test('planFieldAssignments ignores hidden fields when selecting targets', () => {
  const fields = [
    { index: 0, tag: 'input', type: 'hidden', labelText: 'Hidden email', name: 'email', visible: false },
    { index: 1, tag: 'input', type: 'text', labelText: 'Full name', name: 'name', visible: true },
    { index: 2, tag: 'textarea', type: '', labelText: 'Message', name: 'message', visible: true },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.deepEqual(plan.assignments.map((item) => item.role), ['name', 'message']);
});

test('planFieldAssignments checks consent-style checkboxes when present', () => {
  const fields = [
    { index: 0, tag: 'input', type: 'text', labelText: 'Full name', name: 'name', visible: true },
    { index: 1, tag: 'input', type: 'email', labelText: 'Email address', name: 'email', visible: true },
    { index: 2, tag: 'input', type: 'checkbox', labelText: 'I agree to terms and privacy', name: 'consent', visible: true },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.equal(plan.assignments[2].role, 'consent');
  assert.equal(plan.assignments[2].kind, 'check');
  assert.equal(plan.assignments[2].value, true);
});

test('planFieldAssignments fills split-name and new-client fields', () => {
  const fields = [
    { index: 0, tag: 'input', type: 'text', labelText: 'First name', name: 'first_name', visible: true },
    { index: 1, tag: 'input', type: 'text', labelText: 'Last name', name: 'last_name', visible: true },
    { index: 2, tag: 'select', type: 'select-one', labelText: 'Are you a new client?', name: 'new_client', visible: true },
    { index: 3, tag: 'input', type: 'email', labelText: 'Email address', name: 'email', visible: true },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.deepEqual(plan.assignments.map((item) => item.role), ['firstName', 'lastName', 'email', 'newClient']);
  assert.equal(plan.assignments[3].value, 'Yes');
});

test('planFieldAssignments uses a single name field when the form is not split', () => {
  const fields = [
    { index: 0, tag: 'input', type: 'text', labelText: 'Name', name: 'name', visible: true },
    { index: 1, tag: 'input', type: 'email', labelText: 'Email', name: 'email', visible: true },
    { index: 2, tag: 'textarea', type: '', labelText: 'Message', name: 'message', visible: true },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.deepEqual(plan.assignments.map((item) => item.role), ['name', 'email', 'message']);
});

test('planFieldAssignments ignores hidden split-name noise', () => {
  const fields = [
    { index: 0, tag: 'input', type: 'text', labelText: 'First name', name: 'first_name', visible: false },
    { index: 1, tag: 'input', type: 'text', labelText: 'Last name', name: 'last_name', visible: false },
    { index: 2, tag: 'input', type: 'text', labelText: 'Name', name: 'name', visible: true },
    { index: 3, tag: 'input', type: 'email', labelText: 'Email', name: 'email', visible: true },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.deepEqual(plan.assignments.map((item) => item.role), ['name', 'email']);
});

test('planFieldAssignments does not map unrelated selects to text targets', () => {
  const fields = [
    { index: 0, tag: 'select', type: 'select-one', labelText: 'Lead Type', name: 'lead_type', visible: true },
    { index: 1, tag: 'input', type: 'text', labelText: 'Full name', name: 'name', visible: true },
    { index: 2, tag: 'textarea', type: '', labelText: 'Message', name: 'message', visible: true },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.equal(plan.assignments.some((item) => item.label === 'Lead Type'), false);
  assert.deepEqual(plan.assignments.map((item) => item.role), ['name', 'message']);
});

test('fillContactForm fills fields and saves a screenshot in review mode', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-form-'));
  const screenshotPath = path.join(tmp, 'review.png');
  const page = makeFakePage([
    { tag: 'input', type: 'text', labelText: 'Full name', name: 'name' },
    { tag: 'input', type: 'email', labelText: 'Email address', name: 'email' },
    { tag: 'input', type: 'text', labelText: 'Company', name: 'company' },
    { tag: 'textarea', labelText: 'Message', name: 'message' },
  ]);

  try {
    const result = await fillContactForm(
      page,
      { name: 'Acme Studio', link: 'file:///tmp/acme.html', contact: 'file:///tmp/acme-contact.html' },
      'Hello from Thomas',
      {
        targetUrl: 'file:///tmp/acme-contact.html',
        screenshotPath,
        leadSiteUrl: 'file:///tmp/acme.html',
        adapter: selectAdapter({ html: '<form><input name="name"></form>' }),
      },
    );

    assert.equal(result.route, 'form');
    assert.equal(result.submitted, false);
    assert.equal(result.filled.length, 4);
    assert.ok(existsSync(screenshotPath));
    assert.match(readFileSync(screenshotPath, 'utf8'), /screenshot/);
    assert.equal(page.fields[0].value, 'Thomas');
    assert.equal(page.fields[1].value, '3dvr.tech@gmail.com');
    assert.equal(page.fields[2].value, '3DVR');
    assert.equal(page.fields[3].value, 'Hello from Thomas');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('fillContactForm does not navigate twice when page is already loaded', async () => {
  const page = makeFakePage([
    { tag: 'input', type: 'text', labelText: 'Full name', name: 'name' },
    { tag: 'input', type: 'email', labelText: 'Email address', name: 'email' },
    { tag: 'textarea', labelText: 'Message', name: 'message' },
  ], '<form><input name="name" /></form>');
  let gotoCount = 0;
  page.goto = async () => {
    gotoCount += 1;
  };

  const result = await fillContactForm(
    page,
    { name: 'Acme Studio', link: 'https://example.com', contact: 'https://example.com/contact' },
    'Hello from Thomas',
    {
      targetUrl: 'https://example.com/contact',
      leadSiteUrl: 'https://example.com',
      pageAlreadyLoaded: true,
      adapter: selectAdapter({ html: '<form><input name="name"></form>' }),
    },
  );

  assert.equal(result.filled.length, 3);
  assert.equal(gotoCount, 1);
});

test('fillContactForm keeps going when screenshot capture fails', async () => {
  const page = makeFakePage([
    { tag: 'input', type: 'text', labelText: 'Full name', name: 'name' },
    { tag: 'input', type: 'email', labelText: 'Email address', name: 'email' },
    { tag: 'textarea', labelText: 'Message', name: 'message' },
  ], '<form><input name="name" /></form>');
  page.screenshot = async () => {
    throw new Error('screenshot unavailable');
  };

  const result = await fillContactForm(
    page,
    { name: 'Acme Studio', link: 'https://example.com', contact: 'https://example.com/contact' },
    'Hello from Thomas',
    {
      targetUrl: 'https://example.com/contact',
      leadSiteUrl: 'https://example.com',
      adapter: selectAdapter({ html: '<form><input name="name"></form>' }),
    },
  );

  assert.equal(result.filled.length, 3);
  assert.equal(result.submitted, false);
});

test('fillContactForm submits through requestSubmit when no visible submit control is present', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-form-submit-fallback-'));
  const screenshotPath = path.join(tmp, 'submitted.png');
  const page = makeFakePage([
    { tag: 'input', type: 'text', labelText: 'Full name', name: 'name' },
    { tag: 'input', type: 'email', labelText: 'Email address', name: 'email' },
    { tag: 'textarea', labelText: 'Message', name: 'message' },
  ], '<form><input type="text" name="name" /><textarea name="message"></textarea></form>');

  try {
    const result = await fillContactForm(
      page,
      { name: 'Acme Studio', link: 'https://example.com', contact: 'https://example.com/contact' },
      'Hello from Thomas',
      {
        targetUrl: 'https://example.com/contact',
        screenshotPath,
        leadSiteUrl: 'https://example.com',
        submit: true,
        adapter: selectAdapter({ html: '<form><input name="name"></form>' }),
      },
    );

    assert.equal(result.submitted, true);
    assert.equal(result.submissionMethod, 'requestSubmit');
    assert.equal(page.formState.submittedVia, 'requestSubmit');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('fillContactForm force-checks consent controls when click does not stick', async () => {
  const page = makeFakePage([
    { tag: 'input', type: 'text', labelText: 'Name', name: 'name' },
    { tag: 'input', type: 'checkbox', labelText: 'I agree to terms and privacy', name: 'consent' },
    { tag: 'input', type: 'email', labelText: 'Email', name: 'email' },
    { tag: 'textarea', labelText: 'Message', name: 'message' },
  ], '<form><input type="checkbox" name="consent" /></form>');

  const result = await fillContactForm(
    page,
    { name: 'Acme Studio', link: 'https://example.com', contact: 'https://example.com/contact' },
    'Hello from Thomas',
    {
      targetUrl: 'https://example.com/contact',
      leadSiteUrl: 'https://example.com',
      adapter: selectAdapter({ html: '<form><input name="consent" type="checkbox"></form>' }),
    },
  );

  assert.equal(result.filled.some((item) => item.role === 'consent'), true);
});

test('fillContactForm explains when a required phone field has no configured default', async () => {
  const page = makeFakePage([
    { tag: 'input', type: 'text', labelText: 'First name', name: 'first_name' },
    { tag: 'input', type: 'text', labelText: 'Last name', name: 'last_name' },
    { tag: 'input', type: 'tel', labelText: 'Phone', name: 'phone', required: true },
    { tag: 'input', type: 'email', labelText: 'Email', name: 'email' },
    { tag: 'select', type: 'select-one', labelText: 'Are you a new client?', name: 'new_client' },
    { tag: 'textarea', labelText: 'How can we help you?', name: 'message' },
  ], '<form><input name="phone" required /></form>');

  await assert.rejects(
    fillContactForm(
      page,
      { name: 'Acme Studio', link: 'https://example.com', contact: 'https://example.com/contact' },
      'Hello from Thomas',
      {
        targetUrl: 'https://example.com/contact',
        leadSiteUrl: 'https://example.com',
        submit: true,
        adapter: selectAdapter({ html: '<form><input name="phone" required /></form>' }),
      },
    ),
    /Set THREEDVR_OUTREACH_PHONE to complete phone-required forms\./,
  );
});

test('runFormCommand logs successful submissions', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-form-log-'));
  const logPath = path.join(tmp, 'outreach-log.ndjson');
  const leadsPath = path.join(tmp, 'leads.csv');
  const screenshotPath = path.join(tmp, 'submitted.png');
  const originalLogFile = process.env.THREEDVR_OUTREACH_LOG_FILE;
  const originalLeadsFile = process.env.THREEDVR_LEADS_FILE;
  process.env.THREEDVR_OUTREACH_LOG_FILE = logPath;
  process.env.THREEDVR_LEADS_FILE = leadsPath;

  writeFileSync(
    leadsPath,
    'name,link,contact,status,date,variant\nAcme Studio,https://example.com,https://example.com/contact,new,2026-05-06,route=form\n',
  );

  const page = makeFakePage([
    { tag: 'input', type: 'text', labelText: 'Full name', name: 'name' },
    { tag: 'input', type: 'email', labelText: 'Email address', name: 'email' },
    { tag: 'input', type: 'text', labelText: 'Company', name: 'company' },
    { tag: 'textarea', labelText: 'Message', name: 'message' },
  ]);

  try {
    const result = await runFormCommand(['--submit', 'Acme Studio'], {
      page,
      adapter: {
        id: 'generic-html-form',
        async fill() {
          writeFileSync(screenshotPath, 'submitted');
          return {
            adapterId: 'generic-html-form',
            route: 'form',
            targetUrl: 'https://example.com/contact',
            screenshotPath,
            filled: [{ role: 'message', label: 'Message' }],
            submitted: true,
          };
        },
      },
      markLead: false,
      screenshotPath,
    });

    const entries = readOutreachLog({ filePath: logPath });

    assert.equal(result.submitted, true);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'form');
    assert.equal(entries[0].status, 'submitted');
    assert.equal(entries[0].source, 'template');
    assert.equal(entries[0].name, 'Acme Studio');
    assert.equal(entries[0].targetUrl, 'https://example.com/contact');
    assert.equal(entries[0].submitted, true);
    assert.equal(entries[0].screenshotPath, screenshotPath);
    assert.match(entries[0].body, /I'm Thomas with 3dvr\.tech/);
  } finally {
    restoreEnv('THREEDVR_OUTREACH_LOG_FILE', originalLogFile);
    restoreEnv('THREEDVR_LEADS_FILE', originalLeadsFile);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runFormCommand dry-run previews the form route without launching a browser', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-form-preview-'));
  const leads = path.join(tmp, 'leads.csv');
  writeFileSync(
    leads,
    'name,link,contact,status,date,variant\nForm Lead,https://form.example,https://form.example/contact,new,2026-05-06,route=form\n',
  );

  const originalLeadsFile = process.env.THREEDVR_LEADS_FILE;
  process.env.THREEDVR_LEADS_FILE = leads;
  const output = [];
  const originalLog = console.log;

  try {
    console.log = (...args) => {
      output.push(args.join(' '));
    };

    const result = await runFormCommand(['--dry-run', 'Form Lead'], {
      skipServer: true,
    });

    assert.equal(result.preview, true);
    assert.equal(result.route, 'form');
    assert.match(output.join('\n'), /FORM PREVIEW/);
    assert.match(output.join('\n'), /Mode: preview/);
    assert.match(output.join('\n'), /Filled fields: none/);
  } finally {
    console.log = originalLog;
    process.env.THREEDVR_LEADS_FILE = originalLeadsFile;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ask-form prefers the system node binary when PATH contains a broken node wrapper', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-form-node-'));
  const binDir = path.join(tmp, 'bin');
  const leads = path.join(tmp, 'leads.csv');
  const fakeNodeMarker = path.join(tmp, 'fake-node-invoked');
  const fakeNode = path.join(binDir, 'node');
  writeFileSync(
    leads,
    'name,link,contact,status,date,variant\nForm Lead,https://form.example,https://form.example/contact,new,2026-05-06,route=form\n',
  );
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    fakeNode,
    `#!/usr/bin/env bash
touch "${fakeNodeMarker}"
echo "fake node should not run" >&2
exit 99
`,
    { mode: 0o755 },
  );

  const output = execFileSync(askFormCli, ['--dry-run', 'Form Lead'], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      THREEDVR_LEADS_FILE: leads,
    },
    encoding: 'utf8',
  });

  assert.match(output, /FORM PREVIEW/);
  assert.equal(existsSync(fakeNodeMarker), false);
  rmSync(tmp, { recursive: true, force: true });
});

test('resolveBrowserExecutablePath auto-discovers a local chromium binary', () => {
  assert.equal(resolveBrowserExecutablePath(), '/usr/bin/chromium');
});

test('ask-form submit mode can run through a real chromium browser under xvfb', () => {
  const browserExecutablePath = resolveBrowserExecutablePath();
  if (!browserExecutablePath) {
    return;
  }

  try {
    require('playwright');
  } catch {
    try {
      require('playwright-core');
    } catch {
      return;
    }
  }

  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-form-real-'));
  const htmlPath = path.join(tmp, 'contact.html');
  const leadsPath = path.join(tmp, 'leads.csv');
  writeFileSync(
    htmlPath,
    `<!doctype html>
<html>
  <body>
    <form onsubmit="document.body.dataset.submitted='yes'; return false;">
      <label>Full name <input name="name" type="text" /></label>
      <label>Email address <input name="email" type="email" /></label>
      <label>Company <input name="company" type="text" /></label>
      <label>Message <textarea name="message"></textarea></label>
      <button type="submit">Send</button>
    </form>
  </body>
</html>`,
  );
  writeFileSync(
    leadsPath,
    `name,link,contact,status,date,variant\nForm Lead,file://${htmlPath},file://${htmlPath},new,2026-05-06,route=form\n`,
  );
  const logPath = path.join(tmp, 'outreach-log.ndjson');

  try {
    const output = execFileSync('xvfb-run', [
      '-a',
      askFormCli,
      '--submit',
      'Form Lead',
    ], {
      env: {
        ...process.env,
        THREEDVR_LEADS_FILE: leadsPath,
        THREEDVR_OUTREACH_LOG_FILE: logPath,
      },
      encoding: 'utf8',
    });

    assert.match(output, /FORM READY/);
    assert.match(output, /Submitted: yes/);
    assert.match(output, /Adapter: generic-html-form/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
