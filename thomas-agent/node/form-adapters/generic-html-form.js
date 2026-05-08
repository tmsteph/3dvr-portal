const {
  DEFAULT_PHONE,
  buildScreenshotPath,
  hasDangerFields,
  inspectFormFields,
  planFieldAssignments,
  planSubmitControl,
  sameHost,
  siteUrlForLead,
} = require('../contact-form-core');

const id = 'generic-html-form';

function canHandle({ html = '' } = {}) {
  return /<form\b/i.test(html);
}

function extractFormAction(html, pageUrl) {
  const formMatch = String(html || '').match(/<form\b[\s\S]*?<\/form>/i);
  if (!formMatch) return '';
  const block = formMatch[0];
  const actionMatch = block.match(/\baction=["']([^"']*)["']/i);
  if (!actionMatch) return pageUrl;
  try {
    return new URL(actionMatch[1] || pageUrl, pageUrl).toString();
  } catch {
    return pageUrl;
  }
}

async function fill({ page, lead, message, options = {} }) {
  const targetUrl = options.targetUrl || siteUrlForLead(lead);
  const maxWaitMs = options.maxWaitMs || 15000;
  if (!targetUrl) {
    throw new Error(`No usable page URL for ${lead.name}. Use ask-send for direct email leads.`);
  }

  if (typeof page.goto === 'function') {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: maxWaitMs });
  }

  const html = typeof page.content === 'function' ? await page.content() : '';
  const fields = await inspectFormFields(page);
  const formCount = await page.locator('form').count();
  if (formCount === 0 && !/<form\b/i.test(html)) {
    throw new Error(`No form found on ${targetUrl}`);
  }

  const plan = planFieldAssignments(fields, lead, message);
  const fieldLocator = page.locator('input, textarea, select');
  const filled = [];

  for (const assignment of plan.assignments) {
    const locator = fieldLocator.nth(assignment.index);
    if (fields[assignment.index]?.tag === 'select') {
      const optionValue = String(assignment.value || '').trim();
      if (optionValue && typeof locator.selectOption === 'function') {
        await locator.selectOption({ label: optionValue }).catch(async () => {
          await locator.selectOption({ value: optionValue }).catch(async () => {
            await locator.selectOption({ index: 0 }).catch(() => {});
          });
        });
      }
    } else if (assignment.kind === 'check' || /^(checkbox|radio)$/i.test(fields[assignment.index]?.type || '')) {
      const wantChecked = Boolean(assignment.value);
      let applied = false;
      if (typeof locator.check === 'function') {
        await locator.check({ force: true }).catch(async () => {
          await locator.check().catch(() => {});
        });
        applied = true;
      } else if (typeof locator.click === 'function') {
        await locator.click({ force: true }).catch(async () => {
          await locator.click().catch(() => {});
        });
        applied = true;
      } else {
        await locator.fill(assignment.value ? 'on' : '');
        applied = true;
      }

      if (applied && wantChecked && typeof locator.isChecked === 'function') {
        const checked = await locator.isChecked().catch(() => false);
        if (!checked && typeof locator.evaluate === 'function') {
          await locator.evaluate((element) => {
            element.checked = true;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }).catch(() => {});
        }
      }
    } else {
      await locator.fill(assignment.value);
    }
    filled.push(assignment);
  }

  const screenshotPath = await buildScreenshotPath(lead.name, options.screenshotPath);
  if (typeof page.screenshot === 'function') {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  const result = {
    adapterId: id,
    route: 'form',
    targetUrl,
    formAction: extractFormAction(html, targetUrl),
    screenshotPath,
    filled,
    submitted: false,
    blocked: '',
    unmatchedRequired: plan.unmatchedRequired,
  };

  if (!options.submit) {
    return result;
  }

  if (hasDangerFields(fields)) {
    result.blocked = 'dangerous fields present';
    throw new Error('Refusing to submit: password, payment, or file-upload fields are present.');
  }

  if (plan.unmatchedRequired.length > 0) {
    result.blocked = 'unmatched required fields';
    const unresolved = plan.unmatchedRequired.map((field) => field.labelText || field.name || field.id || field.index);
    const phoneMissing = unresolved.some((value) => /phone|telephone|mobile|cell|tel/i.test(String(value))) && !DEFAULT_PHONE;
    const hint = phoneMissing ? ' Set THREEDVR_OUTREACH_PHONE to complete phone-required forms.' : '';
    throw new Error(`Refusing to submit: required fields remain unknown (${unresolved.join(', ')})${hint}`);
  }

  if (options.leadSiteUrl && !sameHost(targetUrl, options.leadSiteUrl) && !options.allowThirdPartyForm) {
    result.blocked = 'third-party host';
    throw new Error(`Refusing to submit a third-party form at ${targetUrl}. Review it manually first.`);
  }

  const formLocator = page.locator('form');
  const submitFormCount = typeof formLocator.count === 'function' ? await formLocator.count() : 0;
  const formSubmitLocator = submitFormCount > 0 && typeof formLocator.first === 'function'
    ? (() => {
      const form = formLocator.first();
      if (form && typeof form.locator === 'function') {
        return form.locator('button, input[type="submit"], input[type="button"]');
      }
      return page.locator('button, input[type="submit"], input[type="button"]');
    })()
    : null;
  const submitFields = formSubmitLocator
    ? await formSubmitLocator.evaluateAll((elements) => elements.map((element, index) => ({
      index,
      tag: String(element.tagName || '').toLowerCase(),
      type: String(element.getAttribute('type') || '').toLowerCase(),
      text: String(element.textContent || element.getAttribute('value') || '').trim(),
      ariaLabel: String(element.getAttribute('aria-label') || ''),
      name: String(element.getAttribute('name') || ''),
      id: String(element.getAttribute('id') || ''),
      labelText: element.labels ? Array.from(element.labels).map((label) => label.textContent || '').join(' ').trim() : '',
      disabled: Boolean(element.disabled || element.hasAttribute('disabled')),
      visible: !element.hidden
        && element.getAttribute('type') !== 'hidden'
        && element.getAttribute('aria-hidden') !== 'true'
        && (typeof element.getClientRects !== 'function' || element.getClientRects().length > 0),
    })))
    : [];

  const submitPlan = planSubmitControl(submitFields);
  if (submitPlan) {
    let clickSucceeded = false;
    try {
      await formSubmitLocator.nth(submitPlan.index).click({ force: true });
      clickSucceeded = true;
    } catch {
      clickSucceeded = false;
    }

    if (clickSucceeded) {
      if (typeof page.waitForLoadState === 'function') {
        await page.waitForLoadState('networkidle', { timeout: maxWaitMs }).catch(() => {});
      }
      result.submissionMethod = 'click';
      result.submitted = true;
      return result;
    }

    if (typeof formLocator.first === 'function' && submitFormCount > 0) {
      const submissionMethod = await formLocator.first().evaluate((form) => {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
          return 'requestSubmit';
        }
        if (typeof form.submit === 'function') {
          form.submit();
          return 'submit';
        }
        return '';
      }).catch(() => '');

      if (submissionMethod) {
        if (typeof page.waitForLoadState === 'function') {
          await page.waitForLoadState('networkidle', { timeout: maxWaitMs }).catch(() => {});
        }
        result.submissionMethod = submissionMethod;
        result.submitted = true;
        return result;
      }
    }
  }

  if (typeof formLocator.first === 'function' && submitFormCount > 0) {
    const submissionMethod = await formLocator.first().evaluate((form) => {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return 'requestSubmit';
      }
      if (typeof form.submit === 'function') {
        form.submit();
        return 'submit';
      }
      return '';
    }).catch(() => '');

    if (submissionMethod) {
      if (typeof page.waitForLoadState === 'function') {
        await page.waitForLoadState('networkidle', { timeout: maxWaitMs }).catch(() => {});
      }
      result.submissionMethod = submissionMethod;
      result.submitted = true;
      return result;
    }
  }

  throw new Error(`Could not find a safe submit control on ${targetUrl}`);
}

module.exports = {
  id,
  canHandle,
  fill,
};
