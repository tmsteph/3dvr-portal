const gun = Gun({ peers: window.__GUN_PEERS__ || undefined })
const user = gun.user()
const portalRoot = gun.get('3dvr-portal')
// Gun graph:
// - 3dvr-portal/billing/customersByAlias/<alias> -> { alias, pub, email, linkedBillingEmails, customerId, currentPlan, usageTier, updatedAt }
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
const linkedBillingEmailsStorageKey = 'portal-linked-billing-emails'
const userPubStorageKey = 'userPubKey'

const accountSummary = document.getElementById('account-summary')
const billingSummary = document.getElementById('billing-summary')
const billingDetail = document.getElementById('billing-detail')
const duplicateWarning = document.getElementById('duplicate-warning')
const actionStatus = document.getElementById('action-status')
const flashMessage = document.getElementById('flash-message')
const billingEmailInput = document.getElementById('billing-email')
const linkedBillingEmailsList = document.getElementById('linked-billing-emails')
const saveBillingEmailButton = document.getElementById('save-billing-email')
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

const PAID_PLAN_SET = new Set(['starter', 'pro', 'builder'])
const STRIPE_PLAN_SET = new Set(['starter', 'pro', 'builder', 'custom'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_DIAGNOSTICS = Object.freeze({
  loaded: false,
  stripeConfigured: true,
  customerPortalLoginConfigured: false,
  planPricesConfigured: {
    starter: true,
    pro: true,
    builder: true
  }
})

function createDiagnosticsState(overrides = {}) {
  return {
    loaded: Boolean(overrides.loaded),
    stripeConfigured: overrides.stripeConfigured !== false,
    customerPortalLoginConfigured: Boolean(overrides.customerPortalLoginConfigured),
    planPricesConfigured: {
      ...DEFAULT_DIAGNOSTICS.planPricesConfigured,
      ...(overrides.planPricesConfigured || {})
    }
  }
}

const state = {
  signedIn: false,
  alias: '',
  pub: '',
  username: '',
  billingEmail: '',
  linkedBillingEmails: [],
  customerId: '',
  currentPlan: 'free',
  usageTier: 'account',
  selectedPlan: '',
  currentResponse: null,
  diagnostics: createDiagnosticsState()
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

function sanitizeBillingEmail(value = '') {
  const normalized = normalizeEmail(value)
  if (!normalized || !EMAIL_PATTERN.test(normalized)) {
    return ''
  }

  return normalized
}

function normalizeBillingEmailList(values = []) {
  const seen = new Set()
  const emails = []

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (!value) {
      return
    }

    const normalized = sanitizeBillingEmail(value)
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    emails.push(normalized)
  }

  visit(values)
  return emails.slice(0, 6)
}

function buildLinkedBillingEmailMap(emails = []) {
  return Object.fromEntries(
    normalizeBillingEmailList(emails).map(email => [email, email])
  )
}

function normalizeLinkedBillingEmailRecord(value) {
  if (Array.isArray(value)) {
    return normalizeBillingEmailList(value)
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const objectValues = Object.values(value)
  if (objectValues.length) {
    return normalizeBillingEmailList(objectValues)
  }

  return normalizeBillingEmailList(Object.keys(value))
}

function currentAccountStorageKey() {
  return String(state.pub || state.alias || '').trim()
}

function readStoredLinkedBillingEmails(accountKey = currentAccountStorageKey()) {
  if (!accountKey) {
    return []
  }

  try {
    const parsed = JSON.parse(readStorage(linkedBillingEmailsStorageKey) || '{}')
    if (!parsed || typeof parsed !== 'object') {
      return []
    }
    return normalizeBillingEmailList(parsed[accountKey] || [])
  } catch (error) {
    return []
  }
}

function writeStoredLinkedBillingEmails(emails = [], accountKey = currentAccountStorageKey()) {
  if (!accountKey) {
    return
  }

  const normalizedEmails = normalizeBillingEmailList(emails)

  try {
    const parsed = JSON.parse(readStorage(linkedBillingEmailsStorageKey) || '{}')
    const next = parsed && typeof parsed === 'object' ? parsed : {}
    if (normalizedEmails.length) {
      next[accountKey] = normalizedEmails
    } else {
      delete next[accountKey]
    }
    writeStorage(linkedBillingEmailsStorageKey, JSON.stringify(next))
  } catch (error) {
    console.warn('Failed to store linked billing emails', error)
  }
}

function hasTypedInvalidBillingEmail() {
  const rawValue = String(billingEmailInput?.value || '').trim()
  return Boolean(rawValue) && !sanitizeBillingEmail(rawValue)
}

function currentBillingEmail() {
  const typedEmail = sanitizeBillingEmail(billingEmailInput?.value || '')
  return typedEmail || sanitizeBillingEmail(state.billingEmail)
}

function billingEmailsForLookup() {
  return normalizeBillingEmailList([currentBillingEmail(), state.linkedBillingEmails])
}

function hasKnownCustomer() {
  return Boolean(String(state.currentResponse?.customerId || state.customerId || '').trim())
}

function hasLegacyUnlinkedSubscription() {
  return Boolean(state.currentResponse?.legacyNeedsLinking)
}

function hasLegacyActiveSubscription() {
  return Boolean(
    hasLegacyUnlinkedSubscription()
    && Array.isArray(state.currentResponse?.activeSubscriptions)
    && state.currentResponse.activeSubscriptions.length
  )
}

function canManageLegacyBilling() {
  return Boolean(
    hasLegacyUnlinkedSubscription()
    && state.currentResponse?.legacyBillingManagementAvailable
  )
}

function currentSessionPub() {
  return String(user?._?.sea?.pub || user?.is?.pub || '').trim()
}

function hasConsistentSessionPub() {
  const seaPub = String(user?._?.sea?.pub || '').trim()
  const sessionPub = String(user?.is?.pub || '').trim()
  if (!seaPub || !sessionPub) {
    return true
  }
  return seaPub === sessionPub
}

async function waitForBillingSessionReady(timeoutMs = 2500) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const livePub = currentSessionPub()
    if (livePub && user?._?.sea && hasConsistentSessionPub()) {
      return true
    }
    await new Promise(resolve => window.setTimeout(resolve, 100))
  }

  return Boolean(currentSessionPub() && user?._?.sea && hasConsistentSessionPub())
}

function isBillingAuthErrorMessage(message = '') {
  const normalized = String(message || '').trim().toLowerCase()
  return normalized.includes('verify billing access')
    || normalized.includes('sign in again before opening stripe billing')
    || normalized.includes('refresh your portal sign-in before opening stripe billing')
}

function hasVerifiedBillingSession() {
  const livePub = currentSessionPub()
  return Boolean(
    state.signedIn
    && state.alias
    && livePub
    && user?._?.sea
    && hasConsistentSessionPub()
    && (!state.pub || state.pub === livePub)
  )
}

function needsBillingAuthRefresh() {
  return Boolean(state.signedIn && state.alias && !hasVerifiedBillingSession())
}

function hasActivePaidSubscription() {
  return Boolean(
    state.currentPlan !== 'free'
    && Array.isArray(state.currentResponse?.activeSubscriptions)
    && state.currentResponse.activeSubscriptions.length
  )
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

function updatePlanQuery(plan = '') {
  const nextUrl = new URL(window.location.href)
  if (plan) {
    nextUrl.searchParams.set('plan', plan)
  } else {
    nextUrl.searchParams.delete('plan')
  }

  window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
}

function billingCenterHref(plan = '') {
  const nextUrl = new URL(window.location.href)
  const selectedPlan = plan || state.selectedPlan || selectedPlanFromUrl()
  if (selectedPlan) {
    nextUrl.searchParams.set('plan', selectedPlan)
  }

  return `${nextUrl.pathname}${nextUrl.search}`
}

function signInHref(plan = '') {
  return `/sign-in.html?redirect=${encodeURIComponent(billingCenterHref(plan))}`
}

function refreshSignInLink(plan = '') {
  if (signInLink) {
    signInLink.href = signInHref(plan)
  }
}

function selectedPlanFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return String(params.get('plan') || '').trim().toLowerCase()
}

function labelForPlan(plan = '') {
  return PLAN_LABELS[plan] || plan || 'plan'
}

function highlightPlan(plan = '', options = {}) {
  const { updateUrl = false } = options

  state.selectedPlan = plan
  planCards.forEach(card => {
    const targetPlan = card.dataset.planCard || ''
    card.classList.toggle('is-selected', Boolean(plan) && targetPlan === plan)
  })

  if (updateUrl) {
    updatePlanQuery(plan)
  }
  refreshSignInLink(plan)

  if (!selectedPlanLabel) {
    return
  }

  if (plan) {
    selectedPlanLabel.textContent = `Selected: ${labelForPlan(plan)}`
    return
  }

  if (state.currentPlan && state.currentPlan !== 'free') {
    selectedPlanLabel.textContent = `Current paid plan: ${labelForPlan(state.currentPlan)}`
    return
  }

  selectedPlanLabel.textContent = 'Pick a plan below. Existing subscribers will be sent to a safe switch flow.'
}

function isPlanAvailable(plan = '') {
  if (!state.diagnostics.loaded) {
    return true
  }

  if (plan === 'custom') {
    return Boolean(state.diagnostics.stripeConfigured)
  }

  if (!PAID_PLAN_SET.has(plan)) {
    return true
  }

  return Boolean(state.diagnostics.stripeConfigured && state.diagnostics.planPricesConfigured?.[plan])
}

function applyButtonAvailability(button, enabled, unavailableLabel = 'Temporarily unavailable') {
  if (!button) {
    return
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent.trim()
  }

  button.disabled = !enabled
  button.setAttribute('aria-disabled', String(!enabled))
  button.textContent = enabled ? button.dataset.defaultLabel : unavailableLabel
}

function applyBillingDiagnostics() {
  planButtons.forEach(button => {
    const plan = String(button.dataset.planAction || '').trim().toLowerCase()
    const enabled = isPlanAvailable(plan)
    applyButtonAvailability(button, enabled)
    button.closest('.plan-card')?.classList.toggle('is-unavailable', !enabled)
  })

  applyButtonAvailability(customSubmitButton, isPlanAvailable('custom'), 'Checkout unavailable')
}

function formatBillingEmailList(emails = []) {
  return normalizeBillingEmailList(emails).join(', ')
}

function usesSavedBillingEmailLookup(payload = state.currentResponse) {
  return Array.isArray(payload?.searchedBillingEmails) && payload.searchedBillingEmails.length > 1
}

function billingLookupLabel(payload = state.currentResponse) {
  const matchedEmails = normalizeBillingEmailList([
    payload?.matchedBillingEmails || [],
    payload?.billingEmail || ''
  ])

  if (usesSavedBillingEmailLookup(payload)) {
    return matchedEmails.length
      ? `saved billing emails (${formatBillingEmailList(matchedEmails)})`
      : 'saved billing emails'
  }

  return 'this billing email'
}

function legacyLookupLead(payload = state.currentResponse) {
  return usesSavedBillingEmailLookup(payload)
    ? `Found across ${billingLookupLabel(payload)} from the older system:`
    : 'Found by billing email from the older system:'
}

function updateSaveBillingEmailButton() {
  if (!saveBillingEmailButton) {
    return
  }

  const email = sanitizeBillingEmail(billingEmailInput?.value || '')
  const alreadySaved = Boolean(email && state.linkedBillingEmails.includes(email))
  let enabled = Boolean(email) && hasVerifiedBillingSession() && !alreadySaved
  let label = 'Save this email'

  if (!hasVerifiedBillingSession()) {
    enabled = false
    label = needsBillingAuthRefresh() ? 'Refresh to save' : 'Sign in to save'
  } else if (hasTypedInvalidBillingEmail()) {
    enabled = false
    label = 'Enter valid email'
  } else if (alreadySaved) {
    enabled = false
    label = 'Saved to account'
  }

  saveBillingEmailButton.disabled = !enabled
  saveBillingEmailButton.setAttribute('aria-disabled', String(!enabled))
  saveBillingEmailButton.textContent = label
}

function renderLinkedBillingEmails() {
  if (!linkedBillingEmailsList) {
    return
  }

  linkedBillingEmailsList.textContent = ''
  if (!state.linkedBillingEmails.length) {
    const empty = document.createElement('p')
    empty.className = 'meta saved-emails__empty'
    empty.textContent = state.signedIn
      ? 'No saved billing emails for this account yet.'
      : 'Sign in to save the billing emails this account should search.'
    linkedBillingEmailsList.append(empty)
    updateSaveBillingEmailButton()
    return
  }

  state.linkedBillingEmails.forEach(email => {
    const pill = document.createElement('div')
    pill.className = 'email-pill'

    const useButton = document.createElement('button')
    useButton.type = 'button'
    useButton.className = 'email-pill__use'
    useButton.dataset.linkedEmailAction = 'use'
    useButton.dataset.email = email
    useButton.textContent = email

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'email-pill__remove'
    removeButton.dataset.linkedEmailAction = 'remove'
    removeButton.dataset.email = email
    removeButton.setAttribute('aria-label', `Remove saved billing email ${email}`)
    removeButton.textContent = 'x'

    pill.append(useButton, removeButton)
    linkedBillingEmailsList.append(pill)
  })

  updateSaveBillingEmailButton()
}

function setLinkedBillingEmails(emails = []) {
  state.linkedBillingEmails = normalizeBillingEmailList(emails)
  writeStoredLinkedBillingEmails(state.linkedBillingEmails)
  renderLinkedBillingEmails()
}

function updateManageButton() {
  if (!manageBillingButton) {
    return
  }

  if (!manageBillingButton.dataset.defaultLabel) {
    manageBillingButton.dataset.defaultLabel = manageBillingButton.textContent.trim()
  }

  let enabled = true
  let label = manageBillingButton.dataset.defaultLabel || 'Manage billing'

  if (state.diagnostics.loaded && !state.diagnostics.stripeConfigured) {
    enabled = false
    label = 'Billing offline'
  } else if (needsBillingAuthRefresh()) {
    enabled = false
    label = 'Refresh account first'
  } else if (!hasVerifiedBillingSession()) {
    enabled = false
    label = 'Sign in first'
  } else if (hasLegacyUnlinkedSubscription()) {
    enabled = canManageLegacyBilling()
    if (state.currentResponse?.hasDuplicateActiveSubscriptions) {
      label = canManageLegacyBilling() ? 'Open one legacy record' : 'Legacy duplicates'
    } else if (hasLegacyActiveSubscription()) {
      label = canManageLegacyBilling() ? 'Open legacy billing' : 'Legacy subscription'
    } else {
      label = canManageLegacyBilling() ? 'View legacy invoices' : 'Legacy history'
    }
  } else if (state.currentResponse?.hasDuplicateActiveSubscriptions) {
    enabled = true
    label = 'Review duplicates'
  } else if (!hasKnownCustomer()) {
    enabled = false
    label = 'Choose a plan first'
  } else if (!hasActivePaidSubscription()) {
    enabled = true
    label = 'Billing history'
  }

  manageBillingButton.disabled = !enabled
  manageBillingButton.setAttribute('aria-disabled', String(!enabled))
  manageBillingButton.textContent = label
}

function renderActionPrompt() {
  if (!actionStatus) {
    return
  }

  if (state.diagnostics.loaded && !state.diagnostics.stripeConfigured) {
    setStatus(actionStatus, 'Stripe billing is temporarily unavailable. Try again after the server configuration is finished.', 'warning')
    return
  }

  if (state.selectedPlan && !isPlanAvailable(state.selectedPlan)) {
    setStatus(actionStatus, `${labelForPlan(state.selectedPlan)} is temporarily unavailable right now.`, 'warning')
    return
  }

  if (state.currentResponse?.hasDuplicateActiveSubscriptions) {
    if (hasLegacyUnlinkedSubscription()) {
      setStatus(
        actionStatus,
        canManageLegacyBilling()
          ? `Multiple older Stripe subscriptions were found across ${billingLookupLabel()}. Manage billing opens one record at a time. If you cancel the subscription you see and this warning remains after refresh, open billing again to reach the other record.`
          : `Multiple older Stripe subscriptions were found across ${billingLookupLabel()}. This billing center can show their status here, but checkout and management stay blocked until those records are linked or cleaned up.`,
        'warning'
      )
      return
    }

    setStatus(
      actionStatus,
      'More than one active subscription was found. Open billing to cancel the extra plan and keep one clean account-linked subscription.',
      'warning'
    )
    return
  }

  if (needsBillingAuthRefresh()) {
    setStatus(actionStatus, 'Refresh account to continue with Stripe billing on this tab.', 'warning')
    return
  }

  if (!hasVerifiedBillingSession()) {
    if (state.selectedPlan && STRIPE_PLAN_SET.has(state.selectedPlan)) {
      setStatus(actionStatus, `Selected ${labelForPlan(state.selectedPlan)}. Sign in to continue.`, 'info')
      return
    }

    setStatus(actionStatus, 'Sign in to start a paid plan or manage an existing subscription.', 'info')
    return
  }

  if (hasTypedInvalidBillingEmail()) {
    setStatus(actionStatus, 'Enter a valid billing email address to continue.', 'warning')
    return
  }

  if (hasLegacyUnlinkedSubscription()) {
    setStatus(
      actionStatus,
      hasLegacyActiveSubscription()
        ? canManageLegacyBilling()
          ? `An older Stripe subscription was found across ${billingLookupLabel()}. Open legacy billing to review invoices or payment methods. New checkout stays blocked to avoid creating a duplicate plan.`
          : `An older Stripe subscription was found across ${billingLookupLabel()}. We are showing its status here, but new checkout is blocked to avoid creating a duplicate plan.`
        : canManageLegacyBilling()
          ? `Older Stripe billing history was found across ${billingLookupLabel()}. Open legacy billing to review invoices or payment methods, or choose a new plan below if you want to start a fresh portal-linked subscription.`
          : `Older Stripe billing history was found across ${billingLookupLabel()}. Review it before starting a new portal-linked subscription.`,
      hasLegacyActiveSubscription() ? 'warning' : 'info'
    )
    return
  }

  if (state.selectedPlan === 'custom') {
    if (!currentBillingEmail()) {
      setStatus(actionStatus, 'Enter your billing email, then open the custom checkout.', 'info')
      return
    }

    setStatus(actionStatus, 'Ready to open a one-time Stripe checkout for the agreed amount.', 'info')
    return
  }

  if (PAID_PLAN_SET.has(state.selectedPlan)) {
    if (!currentBillingEmail()) {
      setStatus(actionStatus, `Enter your billing email, then continue with ${labelForPlan(state.selectedPlan)}.`, 'info')
      return
    }

    if (state.currentPlan === state.selectedPlan && hasActivePaidSubscription()) {
      setStatus(
        actionStatus,
        `You are already on ${labelForPlan(state.selectedPlan)}. Open billing for invoices, payment method updates, or cancellation.`,
        'info'
      )
      return
    }

    setStatus(actionStatus, `Ready to continue with ${labelForPlan(state.selectedPlan)}. Stripe will open next.`, 'info')
    return
  }

  if (hasActivePaidSubscription()) {
    setStatus(actionStatus, 'Need invoices, cancellation, or payment method updates? Open Stripe billing.', 'info')
    return
  }

  if (hasKnownCustomer()) {
    setStatus(actionStatus, 'No paid plan is active right now. Choose a plan below or open your billing history.', 'info')
    return
  }

  setStatus(actionStatus, 'Sign in, confirm your billing email, then choose a plan.', 'info')
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
    email: sanitizeBillingEmail(record.email),
    linkedBillingEmails: normalizeLinkedBillingEmailRecord(record.linkedBillingEmails),
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

  const records = candidates.filter(Boolean)
  if (!records.length) {
    return null
  }

  return {
    alias: records.find(record => record.alias)?.alias || '',
    pub: records.find(record => record.pub)?.pub || '',
    email: records.find(record => record.email)?.email || '',
    linkedBillingEmails: normalizeBillingEmailList(records.flatMap(record => record.linkedBillingEmails || [])),
    customerId: records.find(record => record.customerId)?.customerId || '',
    currentPlan: records.find(record => record.currentPlan)?.currentPlan || '',
    usageTier: records.find(record => record.usageTier)?.usageTier || ''
  }
}

async function persistGunHints(payload = {}) {
  if (!state.alias && !state.pub) {
    return
  }

  const email = sanitizeBillingEmail(payload.billingEmail || state.billingEmail)
  const linkedBillingEmails = normalizeBillingEmailList([
    payload.linkedBillingEmails || [],
    payload.matchedBillingEmails || [],
    state.linkedBillingEmails,
    email
  ])
  const customerId = String(payload.customerId || state.customerId || '').trim()
  const currentPlan = String(payload.currentPlan || state.currentPlan || 'free').trim().toLowerCase()
  const usageTier = String(payload.usageTier || state.usageTier || 'account').trim().toLowerCase()
  const record = {
    alias: state.alias,
    pub: state.pub,
    email,
    linkedBillingEmails: buildLinkedBillingEmailMap(linkedBillingEmails),
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
  const billingEmail = sanitizeBillingEmail(payload.billingEmail || payload.email || state.billingEmail)
  const linkedBillingEmails = normalizeBillingEmailList([
    payload.linkedBillingEmails || [],
    payload.matchedBillingEmails || [],
    state.signedIn ? (payload.billingEmail || payload.email || '') : '',
    state.linkedBillingEmails
  ])
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

  setLinkedBillingEmails(linkedBillingEmails)
}

function renderAccountSummary() {
  if (!accountSummary) return

  const accountLabel = state.username && state.username.toLowerCase() !== 'guest'
    ? `${state.username} (${state.alias})`
    : state.alias
  const pubSuffix = state.pub ? ` · ${state.pub.slice(0, 10)}...` : ''

  if (needsBillingAuthRefresh()) {
    setStatus(accountSummary, `Signed in as ${accountLabel}${pubSuffix}. Refresh account to re-verify billing access in this tab.`, 'warning')
    return
  }

  if (state.signedIn && state.alias) {
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
    setStatus(billingSummary, 'We will look up your Stripe customer after sign-in.', 'info')
    if (billingDetail) {
      billingDetail.textContent = 'If you already subscribe, the plan buttons below will route you through a safe switch flow instead of starting a second subscription.'
    }
    if (duplicateWarning) {
      duplicateWarning.hidden = true
      duplicateWarning.textContent = ''
    }
    updateManageButton()
    renderActionPrompt()
    return
  }

  if (payload.hasDuplicateActiveSubscriptions) {
    if (duplicateWarning) {
      duplicateWarning.hidden = false
      duplicateWarning.textContent = payload.legacyNeedsLinking
        ? canManageLegacyBilling()
          ? `Warning: ${payload.duplicateActiveCount + 1} older Stripe subscriptions were found across ${billingLookupLabel(payload)} on separate Stripe records. Manage billing opens one record at a time, not all of them at once. If this warning remains after you review or cancel the visible subscription, return here, refresh, and open billing again to reach the next record.`
          : `Warning: ${payload.duplicateActiveCount + 1} older Stripe subscriptions were found across ${billingLookupLabel(payload)}. This page can show their status, but it cannot manage those records yet.`
        : `Warning: ${payload.duplicateActiveCount + 1} active subscriptions were found. Open billing and cancel the extra plan.`
    }
  } else if (duplicateWarning) {
    duplicateWarning.hidden = true
    duplicateWarning.textContent = ''
  }

  if (payload.legacyNeedsLinking) {
    const activeLabels = (payload.activeSubscriptions || [])
      .map(item => `${labelForPlan(item.plan)} (${item.status})`)
      .join(' • ')
    const hasLegacyActive = Boolean((payload.activeSubscriptions || []).length)

    setStatus(
      billingSummary,
      hasLegacyActive
        ? usesSavedBillingEmailLookup(payload)
          ? `Legacy Stripe plan found across saved billing emails: ${labelForPlan(currentPlan)}.`
          : `Legacy Stripe plan found: ${labelForPlan(currentPlan)}.`
        : payload.hasInvoiceHistory
          ? usesSavedBillingEmailLookup(payload)
            ? 'Legacy Stripe billing history found across saved billing emails.'
            : 'Legacy Stripe billing history found for this email.'
          : usesSavedBillingEmailLookup(payload)
            ? 'Legacy Stripe record found across saved billing emails.'
            : 'Legacy Stripe record found for this email.',
      payload.hasDuplicateActiveSubscriptions ? 'warning' : hasLegacyActive ? 'info' : 'warning'
    )

    if (billingDetail) {
      if (activeLabels) {
        billingDetail.textContent = canManageLegacyBilling()
          ? payload.hasDuplicateActiveSubscriptions
            ? `${legacyLookupLead(payload)} ${activeLabels}. These live on separate Stripe records, so Manage billing opens one record at a time. Review or cancel the visible subscription, return here, refresh, and if the duplicate warning remains, open billing again to reach the other record. New checkout stays blocked until the duplicate records are cleaned up.`
            : `${legacyLookupLead(payload)} ${activeLabels}. Open legacy billing to review invoices or payment methods. New checkout stays blocked until this record is linked.`
          : `${legacyLookupLead(payload)} ${activeLabels}. These subscriptions are not linked to this portal account yet, so billing actions stay limited here.`
      } else if (payload.hasInvoiceHistory) {
        billingDetail.textContent = canManageLegacyBilling()
          ? `Older Stripe billing history was found across ${billingLookupLabel(payload)}. Open legacy billing to review invoices, payment methods, or older cancellations. You can still start a fresh portal-linked plan below if you need a new active subscription.`
          : `Older Stripe billing history was found across ${billingLookupLabel(payload)}, but this page cannot open it directly yet.`
      } else {
        billingDetail.textContent = `A legacy Stripe subscription was found across ${billingLookupLabel(payload)}, but detailed line items were unavailable.`
      }
    }

    updateManageButton()
    renderActionPrompt()
    return
  }

  if (currentPlan === 'free' || !(payload.activeSubscriptions || []).length) {
    setStatus(billingSummary, 'No paid subscription is active yet.', 'info')
    if (billingDetail) {
      billingDetail.textContent = payload.autoLinkedLegacy
        ? 'We linked an older Stripe billing record to this portal account automatically. No paid subscription is active right now, but you can open billing history if you need past invoices.'
        : hasKnownCustomer()
          ? 'This account already has billing history. Choose a paid plan or open billing history if you need past invoices.'
          : 'Choose a paid plan to create a Stripe checkout tied to this portal account.'
    }
    updateManageButton()
    renderActionPrompt()
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
      ? payload.autoLinkedLegacy
        ? `Recovered and linked from an older Stripe record. Active subscriptions: ${activeLabels}`
        : `Active subscriptions: ${activeLabels}`
      : 'Stripe returned an active plan but no detailed line items.'
  }

  updateManageButton()
  renderActionPrompt()
}

async function syncHintsFromGun() {
  const gunHint = await readGunHints()
  if (!gunHint) {
    renderLinkedBillingEmails()
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
    linkedBillingEmails: gunHint.linkedBillingEmails,
    customerId: gunHint.customerId,
    usageTier: gunHint.usageTier
  })
}

async function restoreStoredBillingAuth({ storedAlias = '', storedPassword = '', storedPub = '', forceReauth = false } = {}) {
  const livePub = currentSessionPub()
  const needsFreshAuth = Boolean(
    storedAlias
    && storedPassword
    && (
      forceReauth
      || !livePub
      || !user?._?.sea
      || (storedPub && livePub && storedPub !== livePub)
    )
  )

  if (!needsFreshAuth) {
    return
  }

  if ((forceReauth || livePub || user?._?.sea) && typeof user?.leave === 'function') {
    try {
      await Promise.resolve(user.leave())
    } catch (error) {
      console.warn('Unable to clear stale billing auth session', error)
    }
  }

  const ack = await new Promise(resolve => {
    user.auth(storedAlias, storedPassword, authAck => resolve(authAck || {}))
  })

  if (ack?.err) {
    throw new Error(String(ack.err))
  }

  await waitForBillingSessionReady()
}

async function refreshAuthState(options = {}) {
  const { forceReauth = false } = options
  refreshSignInLink()

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

  if (storedSignedIn && storedAlias && storedPassword) {
    try {
      await restoreStoredBillingAuth({
        storedAlias,
        storedPassword,
        storedPub,
        forceReauth
      })
    } catch (error) {
      console.warn('Unable to refresh stored billing auth session', error)
    }
  }

  const livePub = currentSessionPub()
  if (livePub) {
    writeStorage(userPubStorageKey, livePub)
  }

  state.alias = storedAlias
  state.username = storedUsername
  state.pub = String(livePub || storedPub || '').trim()
  state.signedIn = Boolean(storedSignedIn && storedAlias)
  state.linkedBillingEmails = state.signedIn
    ? normalizeBillingEmailList([
        readStoredLinkedBillingEmails(String(livePub || storedPub || storedAlias || '').trim()),
        state.linkedBillingEmails
      ])
    : []

  renderAccountSummary()
  renderLinkedBillingEmails()
  await syncHintsFromGun()
  updateManageButton()
  renderActionPrompt()
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

async function buildBillingAuthPayload(action = 'status') {
  if (!hasVerifiedBillingSession()) {
    throw new Error('Sign in again before opening Stripe billing.')
  }

  const livePub = currentSessionPub()
  if (!Gun?.SEA || typeof Gun.SEA.sign !== 'function' || !user?._?.sea || !livePub) {
    throw new Error('Refresh your portal sign-in before opening Stripe billing.')
  }

  if (state.pub !== livePub) {
    state.pub = livePub
    writeStorage(userPubStorageKey, livePub)
    renderAccountSummary()
  }

  const authProof = await Gun.SEA.sign({
    scope: 'stripe-billing',
    action,
    alias: state.alias,
    pub: livePub,
    origin: window.location.origin,
    iat: Date.now()
  }, user._.sea)

  return {
    authPub: livePub,
    authProof
  }
}

async function recoverBillingAuthSession() {
  await refreshAuthState({ forceReauth: true })
  const sessionReady = await waitForBillingSessionReady()
  if (!sessionReady || !hasVerifiedBillingSession()) {
    throw new Error('Refresh your portal sign-in before opening Stripe billing.')
  }
}

async function refreshBillingDiagnostics() {
  try {
    const response = await fetch('/api/stripe/checkout', {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(body?.error || `Request failed (${response.status})`)
    }

    state.diagnostics = createDiagnosticsState({
      loaded: true,
      stripeConfigured: Boolean(body?.stripeConfigured),
      customerPortalLoginConfigured: Boolean(body?.customerPortalLoginConfigured),
      planPricesConfigured: body?.planPricesConfigured || {}
    })
  } catch (error) {
    state.diagnostics = createDiagnosticsState()
  }

  applyBillingDiagnostics()
  updateManageButton()
  renderActionPrompt()
}

async function refreshBillingStatus() {
  return refreshBillingStatusAttempt(false)
}

async function refreshBillingStatusAttempt(retriedAuth) {
  const billingEmail = currentBillingEmail()
  if (billingEmail) {
    state.billingEmail = billingEmail
  }

  if (!hasVerifiedBillingSession()) {
    if (hasTypedInvalidBillingEmail()) {
      setStatus(billingSummary, 'Enter a valid billing email to check status, or sign in to use your portal account.', 'warning')
      updateManageButton()
      renderActionPrompt()
      return
    }

    renderBillingState(null)
    return
  }

  setStatus(billingSummary, 'Checking Stripe billing status...', 'info')

  try {
    const authPayload = await buildBillingAuthPayload('status')
    const payload = await fetchJson('/api/stripe/status', {
      ...authPayload,
      customerId: state.customerId,
      billingEmail,
      billingEmails: billingEmailsForLookup(),
      portalAlias: state.alias,
      portalPub: state.pub
    })

    rememberLocalBilling(
      payload?.legacyNeedsLinking
        ? {
            billingEmail: payload.billingEmail,
            matchedBillingEmails: payload.matchedBillingEmails
          }
        : payload
    )
    if (!payload?.legacyNeedsLinking) {
      await persistGunHints(payload)
    }
    renderBillingState(payload)
    if (payload?.autoLinkedLegacy) {
      setFlash('We linked your older Stripe billing record to this portal account automatically.')
    }
  } catch (error) {
    if (!retriedAuth && isBillingAuthErrorMessage(error?.message)) {
      try {
        await recoverBillingAuthSession()
        return await refreshBillingStatusAttempt(true)
      } catch (retryError) {
        error = retryError
      }
    }

    setStatus(billingSummary, error?.message || 'Unable to load billing status.', 'error')
    updateManageButton()
    renderActionPrompt()
  }
}

function redirectToSignIn(plan = '') {
  const targetPlan = plan || state.selectedPlan || selectedPlanFromUrl()
  if (targetPlan) {
    updatePlanQuery(targetPlan)
  }
  refreshSignInLink(targetPlan)
  window.location.assign(signInHref(targetPlan))
}

function requireSignedInForPaidFlow(options = {}) {
  const { plan = '', redirectOnFailure = false } = options

  if (hasVerifiedBillingSession()) {
    return true
  }

  if (needsBillingAuthRefresh()) {
    const targetPlan = plan || state.selectedPlan || selectedPlanFromUrl()
    refreshSignInLink(targetPlan)
    setStatus(
      actionStatus,
      targetPlan
        ? `Selected ${labelForPlan(targetPlan)}. Refresh account first so Stripe stays attached to this portal identity.`
        : 'Refresh account first so Stripe stays attached to this portal identity.',
      'warning'
    )
    refreshAuthButton?.focus()
    return false
  }

  const targetPlan = plan || state.selectedPlan || selectedPlanFromUrl()
  refreshSignInLink(targetPlan)
  setStatus(
    actionStatus,
    targetPlan
      ? `Selected ${labelForPlan(targetPlan)}. Sign in first so the plan stays attached to one portal account.`
      : 'Sign in first so the paid plan stays attached to one portal account.',
    'warning'
  )
  signInLink?.focus()

  if (redirectOnFailure) {
    redirectToSignIn(targetPlan)
  }

  return false
}

async function startCheckoutAction(payload) {
  return startCheckoutActionAttempt(payload, false)
}

async function startCheckoutActionAttempt(payload, retriedAuth) {
  const billingEmail = currentBillingEmail()
  if (billingEmail) {
    state.billingEmail = billingEmail
  }

  rememberLocalBilling({ billingEmail: state.billingEmail, customerId: state.customerId })
  setStatus(actionStatus, 'Opening Stripe...', 'info')

  try {
    const authPayload = await buildBillingAuthPayload(payload?.action || 'subscribe')
    const response = await fetchJson('/api/stripe/checkout', {
      ...authPayload,
      ...payload,
      customerId: state.customerId,
      billingEmail: state.billingEmail,
      billingEmails: billingEmailsForLookup(),
      portalAlias: state.alias,
      portalPub: state.pub
    })

    rememberLocalBilling(response)
    await persistGunHints(response)

    if (!response.url) {
      throw new Error('Stripe did not return a redirect URL.')
    }

    window.location.assign(response.url)
  } catch (error) {
    if (!retriedAuth && isBillingAuthErrorMessage(error?.message)) {
      await recoverBillingAuthSession()
      return startCheckoutActionAttempt(payload, true)
    }
    throw error
  }
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
  if (params.get('manage') === 'return') {
    setFlash('Returned from Stripe billing. Review your status below.')
    return
  }
  if (params.get('checkout') === 'cancel') {
    setFlash('Checkout was canceled before payment completed.')
  }
}

function bindEvents() {
  billingEmailInput?.addEventListener('input', () => {
    const rawValue = String(billingEmailInput.value || '').trim()
    if (!rawValue) {
      state.billingEmail = ''
      writeStorage(billingEmailStorageKey, '')
    } else {
      const email = sanitizeBillingEmail(rawValue)
      if (email) {
        state.billingEmail = email
        writeStorage(billingEmailStorageKey, email)
      }
    }

    updateSaveBillingEmailButton()
    renderActionPrompt()
  })

  billingEmailInput?.addEventListener('blur', () => {
    const email = sanitizeBillingEmail(billingEmailInput.value || '')
    if (email) {
      billingEmailInput.value = email
      rememberLocalBilling({ billingEmail: email })
    }

    updateSaveBillingEmailButton()
    renderActionPrompt()
  })

  saveBillingEmailButton?.addEventListener('click', async () => {
    const email = sanitizeBillingEmail(billingEmailInput?.value || '')
    if (!email || !hasVerifiedBillingSession()) {
      updateSaveBillingEmailButton()
      return
    }

    if (state.linkedBillingEmails.includes(email)) {
      updateSaveBillingEmailButton()
      return
    }

    const nextEmails = normalizeBillingEmailList([state.linkedBillingEmails, email])
    setLinkedBillingEmails(nextEmails)
    await persistGunHints({
      billingEmail: state.billingEmail,
      linkedBillingEmails: nextEmails
    })
    setFlash(`Saved ${email} to this portal account for legacy billing lookup.`)
    renderActionPrompt()
  })

  linkedBillingEmailsList?.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-linked-email-action]')
    if (!button) {
      return
    }

    const action = String(button.dataset.linkedEmailAction || '').trim()
    const email = sanitizeBillingEmail(button.dataset.email || '')
    if (!email) {
      return
    }

    if (action === 'use') {
      if (billingEmailInput) {
        billingEmailInput.value = email
      }
      rememberLocalBilling({ billingEmail: email })
      updateSaveBillingEmailButton()
      renderActionPrompt()
      return
    }

    if (action === 'remove') {
      const nextEmails = state.linkedBillingEmails.filter(candidate => candidate !== email)
      setLinkedBillingEmails(nextEmails)
      await persistGunHints({
        billingEmail: state.billingEmail,
        linkedBillingEmails: nextEmails
      })
      setFlash(`Removed ${email} from this portal account.`)
      renderActionPrompt()
    }
  })

  refreshAuthButton?.addEventListener('click', async () => {
    setStatus(accountSummary, 'Refreshing your portal account...', 'info')
    await refreshAuthState({ forceReauth: true })
    await refreshBillingStatus()
  })

  refreshStatusButton?.addEventListener('click', async () => {
    await refreshBillingStatus()
  })

  manageBillingButton?.addEventListener('click', async () => {
    if (manageBillingButton.disabled) {
      return
    }

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
      if (button.disabled) {
        return
      }

      const plan = String(button.dataset.planAction || '').trim().toLowerCase()
      highlightPlan(plan, { updateUrl: true })

      if (!requireSignedInForPaidFlow({ plan, redirectOnFailure: true })) {
        return
      }

      if (hasLegacyActiveSubscription()) {
        renderActionPrompt()
        return
      }

      if (hasTypedInvalidBillingEmail()) {
        setStatus(actionStatus, 'Enter a valid billing email address to continue.', 'warning')
        billingEmailInput?.focus()
        return
      }

      if (!currentBillingEmail()) {
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
    if (customSubmitButton.disabled) {
      return
    }

    highlightPlan('custom', { updateUrl: true })

    if (!requireSignedInForPaidFlow({ plan: 'custom', redirectOnFailure: true })) {
      return
    }

    if (hasLegacyActiveSubscription()) {
      renderActionPrompt()
      return
    }

    const amount = Number(customAmountInput?.value || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus(actionStatus, 'Enter a valid quoted amount before opening custom checkout.', 'warning')
      customAmountInput?.focus()
      return
    }

    if (hasTypedInvalidBillingEmail()) {
      setStatus(actionStatus, 'Enter a valid billing email address to continue.', 'warning')
      billingEmailInput?.focus()
      return
    }

    if (!currentBillingEmail()) {
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
  renderLinkedBillingEmails()
  await refreshBillingDiagnostics()
  await refreshAuthState()
  await refreshBillingStatus()
}

user.on('auth', async () => {
  const pub = currentSessionPub()
  if (pub) {
    state.pub = pub
    writeStorage(userPubStorageKey, pub)
  }
  await refreshAuthState()
  await refreshBillingStatus()
})

void init()
