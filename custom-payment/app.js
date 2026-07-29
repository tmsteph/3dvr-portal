const gun = Gun({ peers: window.__GUN_PEERS__ || undefined })
const user = gun.user()
const form = document.getElementById('payment-form')
const signedOut = document.getElementById('signed-out')
const status = document.getElementById('status')
const createButton = document.getElementById('create-button')
const result = document.getElementById('result')
const paymentLink = document.getElementById('payment-link')
const previewLink = document.getElementById('preview-link')
const copyButton = document.getElementById('copy-button')
const shareButton = document.getElementById('share-button')
const newButton = document.getElementById('new-button')
const customerResult = document.getElementById('customer-result')
const customerResultTitle = document.getElementById('customer-result-title')
const customerResultCopy = document.getElementById('customer-result-copy')

function stored(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function currentPub() {
  return String(user?._?.sea?.pub || user?.is?.pub || '').trim()
}

async function waitForSession(timeoutMs = 2500) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (currentPub() && user?._?.sea) return true
    await new Promise(resolve => window.setTimeout(resolve, 100))
  }
  return false
}

async function restoreSession() {
  const paymentState = new URLSearchParams(window.location.search).get('payment')
  if (paymentState === 'success' || paymentState === 'cancel') {
    form.hidden = true
    signedOut.hidden = true
    customerResult.hidden = false
    if (paymentState === 'cancel') {
      customerResultTitle.textContent = 'Payment not completed'
      customerResultCopy.textContent = 'No charge was made. You can return to the Stripe checkout link whenever you are ready.'
    }
    return false
  }

  const alias = stored('alias').trim()
  const password = stored('password')
  const signedIn = stored('signedIn') === 'true'

  try {
    user.recall({ sessionStorage: true, localStorage: true })
  } catch {}

  if (signedIn && alias && password && !(await waitForSession(500))) {
    await new Promise(resolve => user.auth(alias, password, () => resolve()))
  }

  const ready = signedIn && alias && await waitForSession()
  form.hidden = !ready
  signedOut.hidden = ready
  return ready
}

async function buildAuth() {
  const alias = stored('alias').trim()
  const pub = currentPub()
  if (!alias || !pub || !user?._?.sea) {
    throw new Error('Sign in again to create a payment link.')
  }

  return {
    portalAlias: alias,
    portalPub: pub,
    authPub: pub,
    authProof: await Gun.SEA.sign({
      scope: 'stripe-billing',
      action: 'custom-payment',
      alias,
      pub,
      origin: window.location.origin,
      iat: Date.now()
    }, user._.sea)
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  createButton.disabled = true
  status.textContent = 'Creating secure Stripe checkout…'

  try {
    const fields = Object.fromEntries(new FormData(form))
    fields.collectCustomerEmail = !fields.customerEmail
    fields.collectMissingFields = true
    const auth = await buildAuth()
    const response = await fetch('/api/stripe/custom-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, ...auth })
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not create the payment link.')

    paymentLink.value = body.url
    previewLink.href = body.url
    form.hidden = true
    result.hidden = false
    status.textContent = ''
  } catch (error) {
    status.textContent = error.message
  } finally {
    createButton.disabled = false
  }
})

copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(paymentLink.value)
  copyButton.textContent = 'Copied'
  window.setTimeout(() => { copyButton.textContent = 'Copy link' }, 1600)
})

if (navigator.share) {
  shareButton.hidden = false
  shareButton.addEventListener('click', () => navigator.share({
    title: '3DVR payment',
    text: 'Here is your secure 3DVR payment link:',
    url: paymentLink.value
  }))
}

newButton.addEventListener('click', () => {
  form.reset()
  result.hidden = true
  form.hidden = false
  form.querySelector('input')?.focus()
})

void restoreSession()
