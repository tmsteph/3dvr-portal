const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  fillContactForm,
  pickLead,
  planFieldAssignments,
  selectAdapter,
  routeLabelForLead,
} = require('../thomas-agent/node/contact-form-fill');

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

  return {
    fields,
    controls,
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
    { index: 0, tag: 'input', type: 'text', labelText: 'Full name', name: 'name' },
    { index: 1, tag: 'input', type: 'email', labelText: 'Email address', name: 'email' },
    { index: 2, tag: 'input', type: 'text', labelText: 'Company', name: 'company' },
    { index: 3, tag: 'textarea', type: '', labelText: 'Message', name: 'message' },
    { index: 4, tag: 'input', type: 'tel', labelText: 'Phone', name: 'phone' },
  ];

  const plan = planFieldAssignments(fields, { name: 'Acme Studio' }, 'Hello there');

  assert.deepEqual(plan.assignments.map((item) => item.role), ['name', 'email', 'company', 'message']);
  assert.equal(plan.unmatchedRequired.length, 0);
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
