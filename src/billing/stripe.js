import Stripe from 'stripe';
import {
  BILLING_ACTIVE_STATUSES,
  getBillingPlan,
  normalizeBillingEmail,
  normalizeBillingPlan,
  planWeight,
  resolveConfiguredPriceId,
  usageTierFromPlan
} from './plans.js';
import { resolvePlanFromSubscription } from '../money/access.js';

function trimTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function firstHeaderValue(value = '') {
  return String(value || '').split(',')[0].trim();
}

function escapeSearchTerm(value = '') {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function firstActiveItem(subscription) {
  return subscription?.items?.data?.[0] || null;
}

function normalizeMetadataField(value = '') {
  return String(value || '').trim();
}

function compareBillingSubscriptionPriority(left, right) {
  const planDelta = planWeight(right.plan) - planWeight(left.plan);
  if (planDelta !== 0) {
    return planDelta;
  }

  return Number(right?.created || 0) - Number(left?.created || 0);
}

function customerHasPortalLink(customer) {
  return Boolean(
    normalizeMetadataField(customer?.metadata?.portal_pub)
    || normalizeMetadataField(customer?.metadata?.portal_alias)
  );
}

export function makeStripeClient(config = process.env) {
  const secretKey = String(config?.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: '2023-10-16'
  });
}

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function getRequestOrigin(req, config = process.env) {
  const host = firstHeaderValue(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '');
  if (host) {
    const forwardedProto = firstHeaderValue(req?.headers?.['x-forwarded-proto'] || '').toLowerCase();
    const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const protocol = forwardedProto || (isLocalHost ? 'http' : 'https');
    return `${protocol}://${host}`;
  }

  const explicitOrigin = trimTrailingSlash(config?.PORTAL_ORIGIN || config?.BILLING_BASE_URL || '');
  if (explicitOrigin) {
    return explicitOrigin;
  }

  return 'https://portal.3dvr.tech';
}

export function buildBillingUrls({ origin, plan = '' } = {}) {
  const base = trimTrailingSlash(origin) || 'https://portal.3dvr.tech';
  const normalizedPlan = normalizeBillingPlan(plan);
  const planSuffix = normalizedPlan ? `?plan=${encodeURIComponent(normalizedPlan)}` : '';
  const returnSuffix = normalizedPlan ? `&plan=${encodeURIComponent(normalizedPlan)}` : '';
  const billingUrl = `${base}/billing/`;

  return {
    billingUrl: `${billingUrl}${planSuffix}`,
    checkoutSuccessUrl: `${billingUrl}?checkout=success${returnSuffix}&session_id={CHECKOUT_SESSION_ID}`,
    checkoutCancelUrl: `${billingUrl}?checkout=cancel${returnSuffix}`,
    portalReturnUrl: `${billingUrl}?manage=return${returnSuffix}`,
    portalSuccessUrl: `${billingUrl}?manage=success${returnSuffix}`
  };
}

export function buildBillingMetadata({
  plan = '',
  portalAlias = '',
  portalPub = '',
  billingEmail = ''
} = {}) {
  const output = {
    plan: normalizeBillingPlan(plan) || '',
    portal_alias: normalizeMetadataField(portalAlias),
    portal_pub: normalizeMetadataField(portalPub),
    billing_email: normalizeBillingEmail(billingEmail)
  };

  return Object.fromEntries(
    Object.entries(output).filter(([, value]) => Boolean(value))
  );
}

export async function searchCustomersByMetadata(stripeClient, metadataKey, value) {
  if (!stripeClient?.customers?.search || !metadataKey || !value) {
    return [];
  }

  try {
    const result = await stripeClient.customers.search({
      query: `metadata['${metadataKey}']:'${escapeSearchTerm(value)}'`,
      limit: 10
    });
    return Array.isArray(result?.data) ? result.data : [];
  } catch (error) {
    return [];
  }
}

function customerMatchesEmail(customer, email) {
  return normalizeBillingEmail(customer?.email) === normalizeBillingEmail(email);
}

async function updateCustomerHints(stripeClient, customer, { billingEmail, portalAlias, portalPub }) {
  if (!customer || !stripeClient?.customers?.update) {
    return customer;
  }

  const existingMetadata = customer.metadata && typeof customer.metadata === 'object'
    ? customer.metadata
    : {};
  const metadata = {
    ...existingMetadata,
    ...buildBillingMetadata({
      billingEmail,
      portalAlias,
      portalPub
    })
  };

  const patch = {};
  if (JSON.stringify(metadata) !== JSON.stringify(existingMetadata)) {
    patch.metadata = metadata;
  }
  if (!customer?.email && normalizeBillingEmail(billingEmail)) {
    patch.email = normalizeBillingEmail(billingEmail);
  }

  if (!Object.keys(patch).length) {
    return customer;
  }

  try {
    return await stripeClient.customers.update(customer.id, patch);
  } catch (error) {
    console.warn('Unable to sync Stripe billing hints', error);
    return {
      ...customer,
      email: patch.email || customer?.email || '',
      metadata
    };
  }
}

export async function resolveStripeCustomer({
  stripeClient,
  customerId = '',
  billingEmail = '',
  portalAlias = '',
  portalPub = '',
  createIfMissing = true
} = {}) {
  if (!stripeClient) {
    return { customer: null, source: 'missing-client' };
  }

  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedEmail = normalizeBillingEmail(billingEmail);
  const normalizedAlias = normalizeMetadataField(portalAlias);
  const normalizedPub = normalizeMetadataField(portalPub);

  if (normalizedCustomerId && stripeClient.customers?.retrieve) {
    try {
      const customer = await stripeClient.customers.retrieve(normalizedCustomerId);
      if (customer && !customer.deleted) {
        return {
          customer: await updateCustomerHints(stripeClient, customer, {
            billingEmail: normalizedEmail,
            portalAlias: normalizedAlias,
            portalPub: normalizedPub
          }),
          source: 'customer_id'
        };
      }
    } catch (error) {
      // Fall through to other lookup methods.
    }
  }

  const metadataCandidates = [];
  if (normalizedPub) {
    metadataCandidates.push(...await searchCustomersByMetadata(stripeClient, 'portal_pub', normalizedPub));
  }
  if (normalizedAlias) {
    metadataCandidates.push(...await searchCustomersByMetadata(stripeClient, 'portal_alias', normalizedAlias));
  }

  const uniqueMetadataCandidates = metadataCandidates.filter((candidate, index, list) => {
    return candidate && !candidate.deleted && list.findIndex(item => item?.id === candidate.id) === index;
  });

  if (uniqueMetadataCandidates.length) {
    const customer = uniqueMetadataCandidates[0];
    return {
      customer: await updateCustomerHints(stripeClient, customer, {
        billingEmail: normalizedEmail,
        portalAlias: normalizedAlias,
        portalPub: normalizedPub
      }),
      source: 'metadata'
    };
  }

  if (normalizedEmail && stripeClient.customers?.list) {
    const listed = await stripeClient.customers.list({ email: normalizedEmail, limit: 10 });
    const customer = (listed?.data || []).find(item => customerMatchesEmail(item, normalizedEmail) && !item.deleted)
      || listed?.data?.[0]
      || null;
    if (customer) {
      return {
        customer: await updateCustomerHints(stripeClient, customer, {
          billingEmail: normalizedEmail,
          portalAlias: normalizedAlias,
          portalPub: normalizedPub
        }),
        source: 'email'
      };
    }
  }

  if (!createIfMissing || !stripeClient.customers?.create) {
    return { customer: null, source: 'not-found' };
  }

  const customer = await stripeClient.customers.create({
    email: normalizedEmail || undefined,
    metadata: buildBillingMetadata({
      billingEmail: normalizedEmail,
      portalAlias: normalizedAlias,
      portalPub: normalizedPub
    })
  });

  return {
    customer,
    source: 'created'
  };
}

export function customerMatchesPortalPub(customer, portalPub = '') {
  const normalizedPortalPub = normalizeMetadataField(portalPub);
  if (!normalizedPortalPub) {
    return false;
  }

  return normalizeMetadataField(customer?.metadata?.portal_pub) === normalizedPortalPub;
}

export async function resolvePortalLinkedStripeCustomer({
  stripeClient,
  customerId = '',
  billingEmail = '',
  portalAlias = '',
  portalPub = '',
  createIfMissing = true
} = {}) {
  if (!stripeClient) {
    return { customer: null, source: 'missing-client' };
  }

  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedEmail = normalizeBillingEmail(billingEmail);
  const normalizedAlias = normalizeMetadataField(portalAlias);
  const normalizedPub = normalizeMetadataField(portalPub);

  if (!normalizedPub) {
    return { customer: null, source: 'missing-portal-pub' };
  }

  if (normalizedCustomerId && stripeClient.customers?.retrieve) {
    try {
      const customer = await stripeClient.customers.retrieve(normalizedCustomerId);
      if (customer && !customer.deleted && customerMatchesPortalPub(customer, normalizedPub)) {
        return {
          customer: await updateCustomerHints(stripeClient, customer, {
            billingEmail: normalizedEmail,
            portalAlias: normalizedAlias,
            portalPub: normalizedPub
          }),
          source: 'customer_id'
        };
      }
    } catch (error) {
      // Fall through to portal-linked metadata lookup.
    }
  }

  const metadataCandidates = await searchCustomersByMetadata(stripeClient, 'portal_pub', normalizedPub);
  const customer = metadataCandidates.find(candidate => candidate && !candidate.deleted) || null;
  if (customer) {
    return {
      customer: await updateCustomerHints(stripeClient, customer, {
        billingEmail: normalizedEmail,
        portalAlias: normalizedAlias,
        portalPub: normalizedPub
      }),
      source: 'portal_pub'
    };
  }

  if (!createIfMissing || !stripeClient.customers?.create) {
    return { customer: null, source: 'not-found' };
  }

  const createdCustomer = await stripeClient.customers.create({
    email: normalizedEmail || undefined,
    metadata: buildBillingMetadata({
      billingEmail: normalizedEmail,
      portalAlias: normalizedAlias,
      portalPub: normalizedPub
    })
  });

  return {
    customer: createdCustomer,
    source: 'created'
  };
}

export async function resolveLegacyStripeCustomerByEmail({
  stripeClient,
  billingEmail = '',
  config = process.env
} = {}) {
  const normalizedEmail = normalizeBillingEmail(billingEmail);
  if (!stripeClient || !normalizedEmail || !stripeClient.customers?.list) {
    return { customer: null, source: 'missing-email' };
  }

  const listed = await stripeClient.customers.list({ email: normalizedEmail, limit: 10 });
  const candidates = (listed?.data || []).filter(customer => {
    return customer
      && !customer.deleted
      && customerMatchesEmail(customer, normalizedEmail)
      && !customerHasPortalLink(customer);
  });

  const activeMatches = [];
  for (const customer of candidates) {
    const subscriptions = await listBillingSubscriptions(stripeClient, customer.id);
    const billingState = pickCurrentBillingSubscription(subscriptions, config);
    if (!billingState.current) {
      continue;
    }
    activeMatches.push({
      customer,
      current: billingState.current,
      active: billingState.active,
      duplicates: billingState.duplicates
    });
  }

  if (!activeMatches.length) {
    return {
      customer: null,
      source: 'not-found'
    };
  }

  if (activeMatches.length > 1) {
    const active = activeMatches
      .flatMap(match => match.active || [])
      .sort(compareBillingSubscriptionPriority);

    return {
      customer: activeMatches[0].customer,
      current: active[0] || null,
      active,
      duplicates: active.slice(1),
      source: 'legacy_email_ambiguous',
      matchCount: activeMatches.length
    };
  }

  return {
    ...activeMatches[0],
    source: 'legacy_email',
    matchCount: 1
  };
}

export async function listBillingSubscriptions(stripeClient, customerId = '') {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!stripeClient?.subscriptions?.list || !normalizedCustomerId) {
    return [];
  }

  const response = await stripeClient.subscriptions.list({
    customer: normalizedCustomerId,
    status: 'all',
    limit: 20
  });

  return Array.isArray(response?.data) ? response.data : [];
}

export function resolveBillingPlanFromSubscription(subscription, pricePlanMap = {}) {
  return normalizeBillingPlan(resolvePlanFromSubscription(subscription, pricePlanMap)) || 'starter';
}

export function resolvePricePlanMap(config = process.env) {
  const configured = {
    [String(config?.STRIPE_PRICE_STARTER_ID || config?.STRIPE_PRICE_SUPPORTER_ID || '').trim()]: 'starter',
    [String(config?.STRIPE_PRICE_PRO_ID || config?.STRIPE_PRICE_FOUNDER_ID || '').trim()]: 'pro',
    [String(config?.STRIPE_PRICE_BUILDER_ID || config?.STRIPE_PRICE_STUDIO_ID || '').trim()]: 'builder'
  };

  return Object.fromEntries(
    Object.entries(configured).filter(([key]) => Boolean(String(key || '').trim()))
  );
}

export function pickCurrentBillingSubscription(subscriptions = [], config = process.env) {
  const planMap = resolvePricePlanMap(config);
  const activeSubscriptions = (subscriptions || [])
    .filter(item => BILLING_ACTIVE_STATUSES.includes(String(item?.status || '').toLowerCase()))
    .map(item => ({
      ...item,
      plan: resolveBillingPlanFromSubscription(item, planMap)
    }))
    .sort(compareBillingSubscriptionPriority);

  return {
    current: activeSubscriptions[0] || null,
    active: activeSubscriptions,
    duplicates: activeSubscriptions.slice(1)
  };
}

export function buildStatusPayload({
  customer,
  current,
  active,
  duplicates,
  exposeCustomerId = true,
  portalLinked = true,
  statusSource = portalLinked ? 'portal_linked' : 'not_found',
  legacyNeedsLinking = false
}) {
  const normalizedPlan = current?.plan || 'free';
  return {
    ok: true,
    customerId: exposeCustomerId ? String(customer?.id || '').trim() : '',
    billingEmail: normalizeBillingEmail(customer?.email || customer?.metadata?.billing_email || ''),
    currentPlan: normalizedPlan,
    usageTier: usageTierFromPlan(normalizedPlan),
    portalLinked: Boolean(portalLinked),
    statusSource: String(statusSource || '').trim() || 'portal_linked',
    legacyNeedsLinking: Boolean(legacyNeedsLinking),
    activeSubscriptions: (active || []).map(item => ({
      id: item.id,
      status: item.status,
      plan: item.plan,
      priceId: String(firstActiveItem(item)?.price?.id || '').trim()
    })),
    duplicateActiveCount: duplicates?.length || 0,
    hasDuplicateActiveSubscriptions: Boolean(duplicates?.length)
  };
}

export function buildSubscriptionUpdateFlow({ subscription, nextPriceId, returnUrl, successUrl }) {
  const item = firstActiveItem(subscription);
  if (!subscription?.id || !item?.id || !nextPriceId) {
    throw new Error('An active Stripe subscription item is required for plan changes.');
  }

  return {
    customer: subscription.customer,
    return_url: returnUrl,
    flow_data: {
      type: 'subscription_update_confirm',
      after_completion: {
        type: 'redirect',
        redirect: {
          return_url: successUrl
        }
      },
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [
          {
            id: item.id,
            price: nextPriceId,
            quantity: item.quantity || 1
          }
        ]
      }
    }
  };
}

export function buildCheckoutSessionPayload({
  customer,
  plan,
  priceId,
  origin,
  portalAlias = '',
  portalPub = '',
  billingEmail = ''
} = {}) {
  const urls = buildBillingUrls({ origin, plan });
  const metadata = buildBillingMetadata({
    plan,
    portalAlias,
    portalPub,
    billingEmail
  });
  const accountReference = portalPub || portalAlias || normalizeBillingEmail(billingEmail) || customer?.id || '';

  return {
    mode: 'subscription',
    customer: customer.id,
    allow_promotion_codes: true,
    client_reference_id: accountReference.slice(0, 200) || undefined,
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    metadata,
    subscription_data: {
      metadata
    },
    success_url: urls.checkoutSuccessUrl,
    cancel_url: urls.checkoutCancelUrl
  };
}

export function buildCustomPaymentSessionPayload({
  customer,
  amountCents,
  label,
  description = '',
  origin,
  portalAlias = '',
  portalPub = '',
  billingEmail = ''
} = {}) {
  const urls = buildBillingUrls({ origin, plan: 'custom' });
  const metadata = buildBillingMetadata({
    plan: 'custom',
    portalAlias,
    portalPub,
    billingEmail
  });
  const accountReference = portalPub || portalAlias || normalizeBillingEmail(billingEmail) || customer?.id || '';

  return {
    mode: 'payment',
    customer: customer.id,
    allow_promotion_codes: true,
    client_reference_id: accountReference.slice(0, 200) || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: label,
            description: description || undefined,
            metadata
          }
        }
      }
    ],
    metadata,
    success_url: urls.checkoutSuccessUrl,
    cancel_url: urls.checkoutCancelUrl
  };
}

export function resolvePlanDiagnostics(config = process.env) {
  return {
    starter: Boolean(resolveConfiguredPriceId('starter', config)),
    pro: Boolean(resolveConfiguredPriceId('pro', config)),
    builder: Boolean(resolveConfiguredPriceId('builder', config))
  };
}

export function requireConfiguredPlanPrice(plan, config = process.env) {
  const priceId = resolveConfiguredPriceId(plan, config);
  if (!priceId) {
    const planLabel = getBillingPlan(plan)?.label || plan;
    throw new Error(`Missing Stripe price configuration for ${planLabel}.`);
  }
  return priceId;
}
