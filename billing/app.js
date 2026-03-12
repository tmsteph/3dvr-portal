const gun = Gun({ peers: window.__GUN_PEERS__ || undefined })
const user = gun.user()
const portalRoot = gun.get('3dvr-portal')
// Gun graph:
// - 3dvr-portal/billing/customersByAlias/<alias> -> { alias, pub, email, customerId, currentPlan, usageTier, updatedAt }
// - 3dvr-portal/billing/customersByPub/<pub> -> same record for account-linked lookups
// - 3dvr-portal/billing/usageTier/<pub|alias> -> { tier, plan, alias, updatedAt, source }
const billingRoot = portalRoot.get('billing')
const customersByAliasNode = billingRoot.get('customersByAlias')
const customersByPubNode = billingRoot.get('customersByPub')
const usageTierNode = billingRoot.get('usageTier')

const sharedTierStorageKey = 'portal-usage-tier'
const openAiTierStorageKey = 'openai-workbench-tier'
const billingEmailStorageKey = 'portal-billing-email'
const billingCustomerIdStorageKey = 'portal-billing-customer-id'
const userPubStorageKey = 'userPubKey'

const accountSummary = document.getElementById('account-summary')
const billingSummary = document.getElementById('billing-summary')
const billingDetail = document.getElementById('billing-detail')
const duplicateWarning = document.getElementById('duplicate-warning')
const actionStatus = document.getElementById('action-status')
const flashMessage = document.getElementById('flash-message')
const billingEmailInput = document.getElementById('billing-email')
const signInLink = document.getElementById('sign-in-link')
const refreshAuthButton = document.getElementById('refresh-auth')
const refreshStatusButton = document.getElementById('refresh-status')
const manageBillingButton = document.getElementById('manage-billing')
const selectedPlanLabel = document.getElementById('selected-plan-label')
const customAmountInput = document.getElementById('custom-amount')
const customLabelInput = document.getElementById('custom-label')
const customDescriptionInput = document.getElementById('custom-description')
const customSubmitButton = document.getElementById('custom-submit')
const planButtons = Array.from(document.querySelectorAll('[data-plan-action]'))
const planCards = Array.from(document.querySelectorAll('[data-plan-card]'))

const PLAN_LABELS = {
  free: 'Free plan',
  starter: 'Family & Friends',
  pro: 'Founder Plan',
  builder: 'Builder Plan',
  custom: 'Custom project'
}

const state = {
  signedIn: false,
  alias: '',
  pub: '',
  username: '',
  billingEmail: '',
  customerId: '',
  currentPlan: 'free',
  usageTier: 'account',
  selectedPlan: '',
  currentResponse: null
}

function readStorage(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch (error) {
    return ''
  }
}

function writeStorage(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch (error) {
    console.warn('Failed to write local storage key', key, error)
  }
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function setStatus(element, message, tone = 'info') {
  if (!element) return
  element.textContent = message
  element.classList.remove('status--info', 'status--success', 'status--warning', 'status--error')
  element.classList.add(`status--${tone}`)
}

function setFlash(message = '') {
  if (!flashMessage) return
  if (!message) {
    flashMessage.hidden = true
    flashMessage.textContent = ''
    return
  }
  flashMessage.hidden = false
  flashMessage.textContent = message
}

function billingCenterHref() {
  return `${window.location.pathname}${window.location.search}`
}

function signInHref() {
  return `/sign-in.html?redirect=${encodeURIComponent(billingCenterHref())}`
}

function selectedPlanFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return String(params.get('plan') || '').trim().toLowerCase()
}

function labelForPlan(plan = '') {
  return PLAN_LABELS[plan] || plan || 'plan'
}

function highlightPlan(plan = '') {
  state.selectedPlan = plan
  planCards.forEach(card => {
    const targetPlan = card.dataset.planCard || ''
    card.classList.toggle('is-selected', Boolean(plan) && targetPlan === plan)
  })
  if (selectedPlanLabel) {
    if (plan) {
      selectedPlanLabel.textContent = `Selected: ${labelForPlan(plan)}`
    } else if (state.currentPlan && state.currentPlan !== 'free') {
      selectedPlanLabel.textContent = `Current paid plan: ${labelForPlan(state.currentPlan)}`
    } else {
      selectedPlanLabel.textContent = 'Pick a plan below. Existing subscribers will be sent to a safe switch flow.'
    }
  }
}

function onceAsync(node) {
  if (!node || typeof node.once !== 'function') {
    return Promise.resolve(undefined)
  }

  return new Promise(resolve => {
    node.once(data => resolve(data))
  })
}

function normalizeHintRecord(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  return {
    alias: String(record.alias || '').trim(),
    pub: String(record.pub || '').trim(),
    email: normalizeEmail(record.email),
    customerId: String(record.customerId || '').trim(),
    currentPlan: String(record.currentPlan || '').trim().toLowerCase(),
    usageTier: String(record.usageTier || '').trim().toLowerCase()
  }
}

async function readGunHints() {
  const candidates = []
  if (state.alias) {
    candidates.push(normalizeHintRecord(await onceAsync(customersByAliasNode.get(state.alias))))
  }
  if (state.pub) {
    candidates.push(normalizeHintRecord(await onceAsync(customersByPubNode.get(state.pub))))
  }

  return candidates.find(Boolean) || null
}

async function persistGunHints(payload = {}) {
  if (!state.alias && !state.pub) {
    return
  }

  const email = normalizeEmail(payload.billingEmail || state.billingEmail)
  const customerId = String(payload.customerId || state.customerId || '').trim()
  const currentPlan = String(payload.currentPlan || state.currentPlan || 'free').trim().toLowerCase()
  const usageTier = String(payload.usageTier || state.usageTier || 'account').trim().toLowerCase()
  const record = {
    alias: state.alias,
    pub: state.pub,
    email,
    customerId,
    currentPlan,
    usageTier,
    updatedAt: Date.now(),
    source: 'stripe-billing'
  }

  const writes = []
  if (state.alias) {
    writes.push(new Promise(resolve => {
      customersByAliasNode.get(state.alias).put(record, () => resolve())
    }))
    writes.push(new Promise(resolve => {
      usageTierNode.get(state.alias).put({
        tier: usageTier,
        plan: currentPlan,
        alias: state.alias,
        updatedAt: Date.now(),
        source: 'stripe-billing'
      }, () => resolve())
    }))
  }
  if (state.pub) {
    writes.push(new Promise(resolve => {
      customersByPubNode.get(state.pub).put(record, () => resolve())
    }))
    writes.push(new Promise(resolve => {
      usageTierNode.get(state.pub).put({
        tier: usageTier,
        plan: currentPlan,
        alias: state.alias,
        updatedAt: Date.now(),
        source: 'stripe-billing'
      }, () => resolve())
    }))
  }

  await Promise.all(writes)
}

function rememberLocalBilling(payload = {}) {
  const billingEmail = normalizeEmail(payload.billingEmail || payload.email || state.billingEmail)
  const customerId = String(payload.customerId || state.customerId || '').trim()
  const usageTier = String(payload.usageTier || state.usageTier || '').trim().toLowerCase()

  if (billingEmail) {
    state.billingEmail = billingEmail
    if (billingEmailInput) {
      billingEmailInput.value = billingEmail
    }
    writeStorage(billingEmailStorageKey, billingEmail)
  }

  if (customerId) {
    state.customerId = customerId
    writeStorage(billingCustomerIdStorageKey, customerId)
  }

  if (usageTier) {
    state.usageTier = usageTier
    writeStorage(sharedTierStorageKey, usageTier)
    writeStorage(openAiTierStorageKey, usageTier)
  }
}

function renderAccountSummary() {
  if (!accountSummary) return

  if (state.signedIn && state.alias) {
    const accountLabel = state.username && state.username.toLowerCase() !== 'guest'
      ? `${state.username} (${state.alias})`
      : state.alias
    const pubSuffix = state.pub ? ` · ${state.pub.slice(0, 10)}...` : ''
    setStatus(accountSummary, `Signed in as ${accountLabel}${pubSuffix}`, 'success')
    return
  }

  setStatus(
    accountSummary,
    'Sign in before starting or switching paid plans so the Stripe customer stays tied to one portal account.',
    'warning'
  )
}

function renderBillingState(payload = null) {
  const currentPlan = String(payload?.currentPlan || state.currentPlan || 'free').trim().toLowerCase() || 'free'
  state.currentPlan = currentPlan
  state.currentResponse = payload
  highlightPlan(selectedPlanFromUrl() || (currentPlan !== 'free' ? currentPlan : ''))

  if (!payload) {
    setStatus(
      billingSummary,
      'We will look up your Stripe customer after sign-in.',
      'info'
    )
    if (duplicateWarning) {
      duplicateWarning.hidden = true
      duplicateWarning.textContent = ''
    }
    return
  }

  if (payload.hasDuplicateActiveSubscriptions) {
    if (duplicateWarning) {
      duplicateWarning.hidden = false
      duplicateWarning.textContent = `Warning: ${payload.duplicateActiveCount + 1} active subscriptions were found.`
    }
  } else if (duplicateWarning) {
    duplicateWarning.hidden = true
    duplicateWarning.textContent = ''
  }

  if (currentPlan === 'free' || !(payload.activeSubscriptions || []).length) {
    setStatus(billingSummary, 'No paid subscription is active yet.', 'info')
    if (billingDetail) {
      billingDetail.textContent = 'Choose a paid plan to create a Stripe checkout tied to this portal account.'
    }
    return
  }

  setStatus(
    billingSummary,
    `Current Stripe plan: ${labelForPlan(currentPlan)}.`,
    payload.hasDuplicateActiveSubscriptions ? 'warning' : 'success'
  )

  if (billingDetail) {
    const activeLabels = (payload.activeSubscriptions || [])
      .map(item => `${labelForPlan(item.plan)} (${item.status})`)
      .join(' • ')
    billingDetail.textContent = activeLabels
      ? `Active subscriptions: ${activeLabels}`
      : 'Stripe returned an active plan but no detailed line items.'
  }
}

async function syncHintsFromGun() {
  const gunHint = await readGunHints()
  if (!gunHint) {
    return
  }

  if (!state.billingEmail && gunHint.email) {
    state.billingEmail = gunHint.email
  }
  if (!state.customerId && gunHint.customerId) {
    state.customerId = gunHint.customerId
  }
  if (gunHint.usageTier && !state.usageTier) {
    state.usageTier = gunHint.usageTier
  }
  rememberLocalBilling({
    billingEmail: gunHint.email,
    customerId: gunHint.customerId,
    usageTier: gunHint.usageTier
  })
}

async function refreshAuthState() {
  if (signInLink) {
    signInLink.href = signInHref()
  }

  try {
    user.recall({ sessionStorage: true, localStorage: true })
  } catch (error) {
    console.warn('Unable to recall Gun session', error)
  }

  const storedAlias = String(readStorage('alias') || '').trim()
  const storedPassword = String(readStorage('password') || '').trim()
  const storedUsername = String(readStorage('username') || '').trim()
  const storedPub = String(readStorage(userPubStorageKey) || '').trim()
  const storedSignedIn = readStorage('signedIn') === 'true'

  if (storedSignedIn && storedAlias && storedPassword && !user?.is?.pub) {
    try {
      await new Promise(resolve => {
        user.auth(storedAlias, storedPassword, () => resolve())
      })
    } catch (error) {
      console.warn('Unable to refresh stored billing auth session', error)
    }
  }

  state.alias = storedAlias
  state.username = storedUsername
  state.pub = String(user?.is?.pub || storedPub || '').trim()
  state.signedIn = Boolean(storedSignedIn && storedAlias)

  renderAccountSummary()
  await syncHintsFromGun()
}

async function fetchJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  return body
}

async function refreshBillingStatus() {
  const billingEmail = normalizeEmail(billingEmailInput?.value || state.billingEmail)
  if (billingEmail) {
    state.billingEmail = billingEmail
  }

  if (!state.customerId && !state.billingEmail && !state.alias && !state.pub) {
    renderBillingState(null)
    return
  }

  setStatus(billingSummary, 'Checking Stripe billing status...', 'info')

  try {
    const payload = await fetchJson('/api/stripe/status', {
      customerId: state.customerId,
      billingEmail: state.billingEmail,
      portalAlias: state.alias,
      portalPub: state.pub
    })

    rememberLocalBilling(payload)
    await persistGunHints(payload)
    renderBillingState(payload)
  } catch (error) {
    setStatus(billingSummary, error?.message || 'Unable to load billing status.', 'error')
  }
}

function requireSignedInForPaidFlow() {
  if (state.signedIn && state.alias) {
    return true
  }

  setStatus(
    actionStatus,
    'Sign in first so the paid plan stays attached to one portal account.',
    'warning'
  )
  return false
}

async function startCheckoutAction(payload) {
  const billingEmail = normalizeEmail(billingEmailInput?.value || state.billingEmail)
  if (billingEmail) {
    state.billingEmail = billingEmail
  }

  rememberLocalBilling({ billingEmail: state.billingEmail, customerId: state.customerId })
  setStatus(actionStatus, 'Opening Stripe...', 'info')

  const response = await fetchJson('/api/stripe/checkout', {
    ...payload,
    customerId: state.customerId,
    billingEmail: state.billingEmail,
    portalAlias: state.alias,
    portalPub: state.pub
  })

  rememberLocalBilling(response)
  await persistGunHints(response)

  if (!response.url) {
    throw new Error('Stripe did not return a redirect URL.')
  }

  window.location.assign(response.url)
}

function handleFlashFromQuery() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('checkout') === 'success') {
    setFlash('Stripe checkout completed. Refreshing your billing status now.')
    return
  }
  if (params.get('manage') === 'success') {
    setFlash('Plan change confirmed in Stripe. Refreshing your billing status now.')
    return
  }
  if (params.get('checkout') === 'cancel') {
    setFlash('Checkout was canceled before payment completed.')
    return
  }
}

function bindEvents() {
  refreshAuthButton?.addEventListener('click', async () => {
    setStatus(accountSummary, 'Refreshing your portal account...', 'info')
    await refreshAuthState()
    await refreshBillingStatus()
  })

  refreshStatusButton?.addEventListener('click', async () => {
    await refreshBillingStatus()
  })

  manageBillingButton?.addEventListener('click', async () => {
    if (!requireSignedInForPaidFlow()) {
      return
    }

    try {
      await startCheckoutAction({ action: 'manage' })
    } catch (error) {
      setStatus(actionStatus, error?.message || 'Unable to open Stripe billing.', 'error')
    }
  })

  planButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const plan = String(button.dataset.planAction || '').trim().toLowerCase()
      highlightPlan(plan)

      if (!requireSignedInForPaidFlow()) {
        return
      }

      if (!normalizeEmail(billingEmailInput?.value || state.billingEmail)) {
        setStatus(actionStatus, 'Enter the billing email you want tied to this portal account.', 'warning')
        billingEmailInput?.focus()
        return
      }

      try {
        await startCheckoutAction({
          action: 'subscribe',
          plan
        })
      } catch (error) {
        setStatus(actionStatus, error?.message || 'Unable to open Stripe checkout.', 'error')
      }
    })
  })

  customSubmitButton?.addEventListener('click', async () => {
    if (!requireSignedInForPaidFlow()) {
      return
    }

    const amount = Number(customAmountInput?.value || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus(actionStatus, 'Enter a valid quoted amount before opening custom checkout.', 'warning')
      customAmountInput?.focus()
      return
    }

    if (!normalizeEmail(billingEmailInput?.value || state.billingEmail)) {
      setStatus(actionStatus, 'Enter the billing email you want tied to this portal account.', 'warning')
      billingEmailInput?.focus()
      return
    }

    try {
      await startCheckoutAction({
        action: 'subscribe',
        plan: 'custom',
        customAmount: amount,
        customLabel: String(customLabelInput?.value || '').trim(),
        customDescription: String(customDescriptionInput?.value || '').trim()
      })
    } catch (error) {
      setStatus(actionStatus, error?.message || 'Unable to open custom checkout.', 'error')
    }
  })
}

async function init() {
  rememberLocalBilling({
    billingEmail: readStorage(billingEmailStorageKey),
    customerId: readStorage(billingCustomerIdStorageKey),
    usageTier: readStorage(sharedTierStorageKey) || readStorage(openAiTierStorageKey)
  })

  handleFlashFromQuery()
  highlightPlan(selectedPlanFromUrl())
  bindEvents()
  await refreshAuthState()
  await refreshBillingStatus()
}

user.on('auth', async () => {
  const pub = String(user?.is?.pub || '').trim()
  if (pub) {
    state.pub = pub
    writeStorage(userPubStorageKey, pub)
  }
  await refreshAuthState()
  await refreshBillingStatus()
})

void init()
