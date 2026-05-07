import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPlaywrightContext,
  launchBrowserForTest,
  resolvePlaywrightBrowser
} from '../scripts/playwright/browser-targets.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const browserTarget = resolvePlaywrightBrowser(process.env.PLAYWRIGHT_BROWSER)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
}

const GUN_STUB_SOURCE = `
(() => {
  const store = new Map();

  function snapshotFor(path) {
    const key = path.join('/');
    if (store.has(key)) {
      return store.get(key);
    }

    const prefix = key ? key + '/' : '';
    const output = {};
    let found = false;

    for (const [storedKey, value] of store.entries()) {
      if (!storedKey.startsWith(prefix)) continue;
      const remainder = storedKey.slice(prefix.length);
      if (!remainder || remainder.includes('/')) continue;
      output[remainder] = value;
      found = true;
    }

    return found ? output : undefined;
  }

  function makeNode(path = []) {
    return {
      get(next) {
        return makeNode([...path, String(next)]);
      },
      put(value, callback) {
        store.set(path.join('/'), value);
        callback && callback({ ok: true });
        return this;
      },
      once(callback) {
        callback && callback(snapshotFor(path));
        return this;
      }
    };
  }

  function makeUser() {
    const listeners = new Map();
    return {
      is: null,
      _: { sea: null },
      recall() {
        const signedIn = window.localStorage.getItem('signedIn') === 'true';
        const storedPub = String(window.localStorage.getItem('userPubKey') || '').trim();
        if (signedIn && storedPub) {
          this.is = { pub: storedPub };
          this._ = { sea: { pub: storedPub } };
        }
      },
      auth(alias, password, callback) {
        const pub = 'pub_' + String(alias || 'user');
        this.is = { pub };
        this._ = { sea: { pub } };
        const handler = listeners.get('auth');
        if (handler) {
          handler();
        }
        callback && callback({ ok: true });
      },
      on(eventName, callback) {
        listeners.set(eventName, callback);
      }
    };
  }

  window.Gun = function Gun() {
    const user = makeUser();
    return {
      user() {
        return user;
      },
      get(key) {
        return makeNode([String(key)]);
      }
    };
  };

  window.Gun.SEA = {
    async sign(payload) {
      return JSON.stringify(payload);
    }
  };
  window.SEA = window.Gun.SEA;
})();
`

let server
let baseUrl
function createFreeStatus(overrides = {}) {
  return {
    ok: true,
    customerId: '',
    billingEmail: '',
    currentPlan: 'free',
    usageTier: 'account',
    activeSubscriptions: [],
    duplicateActiveCount: 0,
    hasDuplicateActiveSubscriptions: false,
    ...overrides
  }
}

async function launchBrowser(t) {
  return launchBrowserForTest(t, browserTarget)
}

async function createContext(browser) {
  return createPlaywrightContext(browser)
}

async function installGunRoutes(context) {
  await context.route('https://cdn.jsdelivr.net/npm/gun/gun.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: GUN_STUB_SOURCE
    })
  })

  await context.route('https://cdn.jsdelivr.net/npm/gun/sea.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.SEA = window.SEA || {};'
    })
  })
}

async function installExternalRoutes(context) {
  await context.route('https://fonts.googleapis.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: ''
    })
  })

  await context.route('https://fonts.gstatic.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      body: ''
    })
  })

  await context.route('**/_vercel/insights/script.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: ''
    })
  })
}

async function installBillingRoutes(context, options = {}) {
  const statusPosts = []
  const checkoutPosts = []
  const checkoutDiagnostics = {
    stripeConfigured: true,
    planPricesConfigured: {
      starter: true,
      pro: true,
      builder: true,
      embedded: true
    },
    customerPortalLoginConfigured: false,
    ...(options.checkoutDiagnostics || {})
  }
  const statusResponse = options.statusResponse || createFreeStatus()
  const checkoutResponse = options.checkoutResponse || {
    ok: true,
    customerId: 'cus_checkout',
    billingEmail: 'member@example.com',
    currentPlan: 'free',
    usageTier: 'account',
    activeSubscriptions: [],
    duplicateActiveCount: 0,
    hasDuplicateActiveSubscriptions: false,
    url: 'https://checkout.stripe.com/test-session'
  }

  await context.route('**/api/stripe/status', async route => {
    statusPosts.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(statusResponse)
    })
  })

  await context.route('**/api/stripe/checkout', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(checkoutDiagnostics)
      })
      return
    }

    checkoutPosts.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(checkoutResponse)
    })
  })

  return {
    statusPosts,
    checkoutPosts
  }
}

describe('billing center subscriber flows', () => {
  before(async () => {
    server = createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`)
        let filePath = resolve(projectRoot, `.${requestUrl.pathname}`)
        if (requestUrl.pathname.endsWith('/')) {
          filePath = resolve(filePath, 'index.html')
        }
        const data = await readFile(filePath)
        const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': type })
        res.end(data)
      } catch (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
      }
    })

    await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer))
    const address = server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    if (server) {
      await new Promise(resolveServer => server.close(resolveServer))
    }
  })

  it('redirects signed-out plan selections into sign-in while preserving the chosen plan', async t => {
    const browser = await launchBrowser(t)
    if (!browser) {
      return
    }

    try {
      const context = await createContext(browser)
      await installGunRoutes(context)
      await installExternalRoutes(context)
      const requests = await installBillingRoutes(context, {
        statusResponse: createFreeStatus()
      })
      const page = await context.newPage()

      await page.goto(`${baseUrl}/billing/?plan=pro`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-plan-action="pro"]')

      await Promise.all([
        page.waitForFunction(() => {
          const { pathname, search } = window.location
          return pathname === '/sign-in.html' && search.includes('redirect=')
        }, { timeout: 10000 }),
        page.click('[data-plan-action="pro"]')
      ])

      const currentUrl = new URL(page.url())
      const redirect = decodeURIComponent(currentUrl.searchParams.get('redirect') || '')

      assert.equal(currentUrl.pathname, '/sign-in.html')
      assert.match(redirect, /\/billing\/\?plan=pro/)
      assert.equal(requests.checkoutPosts.length, 0)
    } finally {
      await browser.close()
    }
  }, { timeout: 45000 })

  it('disables unavailable paid plans and keeps manage billing out of the dead-end state', async t => {
    const browser = await launchBrowser(t)
    if (!browser) {
      return
    }

    try {
      const context = await createContext(browser)
      await installGunRoutes(context)
      await installExternalRoutes(context)
      await context.addInitScript(() => {
        localStorage.setItem('signedIn', 'true')
        localStorage.setItem('alias', 'pilot@3dvr')
        localStorage.setItem('username', 'Pilot')
        localStorage.setItem('userPubKey', 'pub_pilot')
      })
      await installBillingRoutes(context, {
        checkoutDiagnostics: {
          planPricesConfigured: {
            starter: true,
            pro: false,
            builder: true,
            embedded: true
          }
        },
        statusResponse: createFreeStatus()
      })
      const page = await context.newPage()

      await page.goto(`${baseUrl}/billing/?plan=pro`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-plan-action="pro"]')
        return button && button.textContent && button.textContent.includes('Temporarily unavailable')
      })

      const proLabel = (await page.textContent('[data-plan-action="pro"]')).trim()
      const manageLabel = (await page.textContent('#manage-billing')).trim()
      const manageDisabled = await page.getAttribute('#manage-billing', 'aria-disabled')
      const statusText = (await page.textContent('#action-status')).trim()

      assert.equal(proLabel, 'Temporarily unavailable')
      assert.equal(manageLabel, 'Choose a plan first')
      assert.equal(manageDisabled, 'true')
      assert.match(statusText, /founder plan is unavailable on this deployment/i)
      assert.match(statusText, /stripe_price_pro_id or stripe_price_founder_id/i)
    } finally {
      await browser.close()
    }
  }, { timeout: 45000 })

  it('guides duplicate subscribers toward choosing the plan to keep', async t => {
    const browser = await launchBrowser(t)
    if (!browser) {
      return
    }

    try {
      const context = await createContext(browser)
      await installGunRoutes(context)
      await installExternalRoutes(context)
      await context.addInitScript(() => {
        localStorage.setItem('signedIn', 'true')
        localStorage.setItem('alias', 'member@3dvr')
        localStorage.setItem('username', 'Member')
        localStorage.setItem('userPubKey', 'pub_member')
      })
      await installBillingRoutes(context, {
        statusResponse: createFreeStatus({
          customerId: 'cus_existing',
          billingEmail: 'member@example.com',
          currentPlan: 'builder',
          usageTier: 'builder',
          activeSubscriptions: [
            {
              id: 'sub_builder',
              status: 'active',
              plan: 'builder',
              priceId: 'price_builder'
            },
            {
              id: 'sub_starter',
              status: 'active',
              plan: 'starter',
              priceId: 'price_starter'
            }
          ],
          duplicateActiveCount: 1,
          hasDuplicateActiveSubscriptions: true
        })
      })
      const page = await context.newPage()

      await page.goto(`${baseUrl}/billing/`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => {
        const warning = document.getElementById('duplicate-warning')
        return warning && warning.textContent && warning.textContent.includes('Choose the plan you want to keep')
      })

      const duplicateText = (await page.textContent('#duplicate-warning')).trim()
      const manageLabel = (await page.textContent('#manage-billing')).trim()
      const manageDisabled = await page.getAttribute('#manage-billing', 'aria-disabled')
      const cancelLabel = (await page.textContent('#cancel-subscription')).trim()
      const statusText = (await page.textContent('#action-status')).trim()

      assert.match(duplicateText, /Choose the plan you want to keep/i)
      assert.match(duplicateText, /older paid plans will be canceled automatically/i)
      assert.equal(manageLabel, 'Manage in Stripe')
      assert.equal(manageDisabled, 'false')
      assert.equal(cancelLabel, 'Choose plan to keep')
      assert.match(statusText, /Choose the plan you want to keep/i)
    } finally {
      await browser.close()
    }
  }, { timeout: 45000 })

  it('shows a clean returning-subscriber path after duplicate cleanup', async t => {
    const browser = await launchBrowser(t)
    if (!browser) {
      return
    }

    try {
      const context = await createContext(browser)
      await installGunRoutes(context)
      await installExternalRoutes(context)
      await context.addInitScript(() => {
        localStorage.setItem('signedIn', 'true')
        localStorage.setItem('alias', 'member@3dvr')
        localStorage.setItem('username', 'Member')
        localStorage.setItem('userPubKey', 'pub_member')
      })
      await installBillingRoutes(context, {
        statusResponse: createFreeStatus({
          customerId: 'cus_existing',
          billingEmail: 'member@example.com',
          currentPlan: 'starter',
          usageTier: 'supporter',
          activeSubscriptions: [
            {
              id: 'sub_starter',
              status: 'active',
              plan: 'starter',
              priceId: 'price_starter'
            }
          ],
          duplicateActiveCount: 0,
          hasDuplicateActiveSubscriptions: false
        })
      })
      const page = await context.newPage()

      await page.goto(`${baseUrl}/billing/`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => {
        const button = document.getElementById('manage-billing')
        return button && button.textContent && button.textContent.includes('Manage in Stripe')
      })

      const duplicateHidden = await page.getAttribute('#duplicate-warning', 'hidden')
      const manageLabel = (await page.textContent('#manage-billing')).trim()
      const manageDisabled = await page.getAttribute('#manage-billing', 'aria-disabled')
      const statusText = (await page.textContent('#action-status')).trim()
      const billingEmail = await page.inputValue('#billing-email')

      assert.equal(duplicateHidden, '')
      assert.equal(manageLabel, 'Manage in Stripe')
      assert.equal(manageDisabled, 'false')
      assert.match(statusText, /open billing for invoices or payment methods/i)
      assert.equal(billingEmail, 'member@example.com')
    } finally {
      await browser.close()
    }
  }, { timeout: 45000 })

  it('keeps cancel enabled when a legacy active subscription is present even if currentPlan falls back to free', async t => {
    const browser = await launchBrowser(t)
    if (!browser) {
      return
    }

    try {
      const context = await createContext(browser)
      await installGunRoutes(context)
      await installExternalRoutes(context)
      await context.addInitScript(() => {
        localStorage.setItem('signedIn', 'true')
        localStorage.setItem('alias', 'legacy@3dvr')
        localStorage.setItem('username', 'Legacy')
        localStorage.setItem('userPubKey', 'pub_legacy')
      })
      await installBillingRoutes(context, {
        statusResponse: createFreeStatus({
          customerId: '',
          billingEmail: 'legacy@example.com',
          currentPlan: 'free',
          usageTier: 'account',
          legacyNeedsLinking: true,
          legacyBillingManagementAvailable: true,
          activeSubscriptions: [
            {
              id: 'sub_starter',
              status: 'active',
              plan: 'starter',
              priceId: 'price_starter'
            }
          ],
          duplicateActiveCount: 0,
          hasDuplicateActiveSubscriptions: false
        })
      })
      const page = await context.newPage()

      await page.goto(`${baseUrl}/billing/`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => {
        const button = document.getElementById('cancel-subscription')
        return button && button.textContent && button.textContent.includes('Stop $5 billing')
      })

      const manageLabel = (await page.textContent('#manage-billing')).trim()
      const cancelLabel = (await page.textContent('#cancel-subscription')).trim()
      const cancelDisabled = await page.getAttribute('#cancel-subscription', 'aria-disabled')

      assert.equal(manageLabel, 'Manage subscription')
      assert.equal(cancelLabel, 'Stop $5 billing')
      assert.equal(cancelDisabled, 'false')
    } finally {
      await browser.close()
    }
  }, { timeout: 45000 })
})
