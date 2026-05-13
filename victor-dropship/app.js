const ORDER_NODE = 'victor-dropship-orders';
const GUN_PEERS = window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'];

const PRODUCTS = Object.freeze({
  'compact-desk-dock': Object.freeze({
    name: 'Compact Desk Dock',
    price: '$79',
    summary: 'Compact support for a cleaner laptop setup',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80',
    alt: 'Compact desk setup with laptop and accessories',
  }),
  'magnetic-cable-kit': Object.freeze({
    name: 'Magnetic Cable Kit',
    price: '$29',
    summary: 'Clips and ties for clean cable routing',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80',
    alt: 'Organized charging cables on a desk',
  }),
  'travel-tech-pouch': Object.freeze({
    name: 'Travel Tech Pouch',
    price: '$49',
    summary: 'Compact organizer for chargers and adapters',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1400&q=80',
    alt: 'Travel pouch with everyday carry accessories',
  }),
});

const form = document.getElementById('orderForm');
const statusEl = document.getElementById('status');
const checkoutButton = document.getElementById('checkoutButton');
const productImage = document.getElementById('productImage');
const productPrice = document.getElementById('productPrice');
const productSummary = document.getElementById('productSummary');

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
  const productId = String(formData.get('productId') || 'compact-desk-dock').trim();
  return {
    productId: PRODUCTS[productId] ? productId : 'compact-desk-dock',
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
  const product = PRODUCTS[payload.productId] || PRODUCTS['compact-desk-dock'];
  const orderId = createOrderId();
  const now = new Date().toISOString();

  checkoutButton.disabled = true;
  setStatus('Opening secure checkout...');

  await writeOrder(orderId, {
    id: orderId,
    productId: payload.productId,
    productName: product.name,
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
    setStatus('Order received. Watch your email for confirmation and shipping updates.');
  } else {
    setStatus('Checkout was cancelled before payment.', 'warning');
  }
}

function syncSelectedProduct() {
  const payload = readFormPayload();
  const product = PRODUCTS[payload.productId] || PRODUCTS['compact-desk-dock'];
  if (productImage) {
    productImage.src = product.image;
    productImage.alt = product.alt;
  }
  if (productPrice) {
    productPrice.textContent = product.price;
  }
  if (productSummary) {
    productSummary.textContent = product.summary;
  }
}

form.addEventListener('submit', handleSubmit);
form.addEventListener('change', event => {
  if (event.target?.name === 'productId') {
    syncSelectedProduct();
  }
});
syncSelectedProduct();
handleReturnState();
