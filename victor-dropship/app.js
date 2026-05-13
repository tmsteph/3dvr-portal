const PRODUCT_ID = 'compact-desk-dock';
const ORDER_NODE = 'victor-dropship-orders';
const GUN_PEERS = window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'];

const form = document.getElementById('orderForm');
const statusEl = document.getElementById('status');
const checkoutButton = document.getElementById('checkoutButton');

let ordersNode = null;

function setStatus(message, tone = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`.trim();
}

function createOrderId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `order-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOrdersNode() {
  if (ordersNode) return ordersNode;
  if (typeof window.Gun !== 'function') return null;
  const gun = window.Gun(GUN_PEERS);
  ordersNode = gun.get('3dvr-portal').get(ORDER_NODE);
  return ordersNode;
}

function writeOrder(orderId, payload) {
  const node = getOrdersNode();
  if (!node) return Promise.resolve(false);

  return new Promise(resolve => {
    node.get(orderId).put(payload, ack => {
      resolve(Boolean(!ack || !ack.err));
    });
  });
}

function readFormPayload() {
  const formData = new FormData(form);
  return {
    customerName: String(formData.get('customerName') || '').trim(),
    customerEmail: String(formData.get('customerEmail') || '').trim(),
    quantity: Number.parseInt(formData.get('quantity') || '1', 10) || 1,
  };
}

async function createCheckout(orderId, payload) {
  const response = await fetch('/api/stripe/storefront-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      productId: PRODUCT_ID,
      ...payload,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Unable to open checkout.');
  }
  return body;
}

async function handleSubmit(event) {
  event.preventDefault();
  const payload = readFormPayload();
  const orderId = createOrderId();
  const now = new Date().toISOString();

  checkoutButton.disabled = true;
  setStatus('Saving order and opening checkout...');

  await writeOrder(orderId, {
    id: orderId,
    productId: PRODUCT_ID,
    productName: 'Compact Desk Dock',
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    quantity: payload.quantity,
    status: 'checkout_started',
    source: 'victor-dropship-sample',
    created: now,
    updated: now,
  });

  try {
    const checkout = await createCheckout(orderId, payload);
    await writeOrder(orderId, {
      stripeCheckoutSessionId: checkout.id || '',
      status: 'checkout_redirected',
      updated: new Date().toISOString(),
    });
    window.location.href = checkout.url;
  } catch (error) {
    checkoutButton.disabled = false;
    await writeOrder(orderId, {
      status: 'checkout_error',
      error: error.message || 'Checkout failed',
      updated: new Date().toISOString(),
    });
    setStatus(error.message || 'Checkout is unavailable right now.', 'warning');
  }
}

function handleReturnState() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  const orderId = params.get('order');
  const sessionId = params.get('session_id');

  if (!checkout || !orderId) return;

  const status = checkout === 'success' ? 'payment_returned_success' : 'checkout_cancelled';
  writeOrder(orderId, {
    status,
    stripeCheckoutSessionId: sessionId || '',
    updated: new Date().toISOString(),
  });

  if (checkout === 'success') {
    setStatus('Payment returned from Stripe. Victor can now review the order for vendor fulfillment.');
  } else {
    setStatus('Checkout was cancelled before payment.', 'warning');
  }
}

form.addEventListener('submit', handleSubmit);
handleReturnState();
