import Stripe from 'stripe';
import {
  BILLING_ACTIVE_STATUSES,
  getBillingPlan,
  normalizeBillingEmail,
  normalizeBillingEmailList,
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
  const createdDelta = Number(right?.created || 0) - Number(left?.created || 0);
  if (createdDelta !== 0) {
    return createdDelta;
  }

  const planDelta = planWeight(right?.plan) - planWeight(left?.plan);
  if (planDelta !== 0) {
    return planDelta;
  }

  return String(right?.id || '').localeCompare(String(left?.id || ''));
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
    portalSuccessUrl: `${billingUrl}?manage=success${returnSuffix}`,
    portalCancelUrl: `${billingUrl}?manage=cancelled${returnSuffix}`
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

function billingEmailsFromCustomer(customer) {
  return normalizeBillingEmailList(
    customer?.email,
    customer?.metadata?.billing_email
  );
}

function billingEmailsFromRecords(records = []) {
  return normalizeBillingEmailList(
    (records || []).map(record => billingEmailsFromCustomer(record?.customer))
  );
}

function uniqueCustomers(customers = []) {
  const seen = new Set();
  return (customers || []).filter(customer => {
    const customerId = String(customer?.id || '').trim();
    if (!customer || customer.deleted || !customerId || seen.has(customerId)) {
      return false;
    }

    seen.add(customerId);
    return true;
  });
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

async function clearPortalLinkMetadata(stripeClient, customer, { canonicalCustomerId = '' } = {}) {
  if (!customer || !stripeClient?.customers?.update) {
    return customer;
  }

  const existingMetadata = customer.metadata && typeof customer.metadata === 'object'
    ? customer.metadata
    : {};
  const metadata = {
    ...existingMetadata,
    portal_pub: '',
    portal_alias: '',
    canonical_customer_id: normalizeMetadataField(canonicalCustomerId) || normalizeMetadataField(existingMetadata.canonical_customer_id)
  };

  try {
    return await stripeClient.customers.update(customer.id, { metadata });
  } catch (error) {
    console.warn('Unable to clear stale Stripe portal link', error);
    return {
      ...customer,
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

export function customerMatchesPortalAlias(customer, portalAlias = '') {
  const normalizedPortalAlias = normalizeMetadataField(portalAlias);
  if (!normalizedPortalAlias) {
    return false;
  }

  return normalizeMetadataField(customer?.metadata?.portal_alias) === normalizedPortalAlias;
}

export async function resolvePortalLinkedStripeCustomer({
  stripeClient,
  customerId = '',
  billingEmail = '',
  portalAlias = '',
  portalPub = '',
  createIfMissing = true,
  config = process.env
} = {}) {
  if (!stripeClient) {
    return { customer: null, source: 'missing-client' };
  }

  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedEmail = normalizeBillingEmail(billingEmail);
  const normalizedAlias = normalizeMetadataField(portalAlias);
  const normalizedPub = normalizeMetadataField(portalPub);

  if (!normalizedPub && !normalizedAlias) {
    return { customer: null, source: 'missing-portal-identity' };
  }

  const linkedCandidates = [];
  let linkedSource = 'not-found';
  if (normalizedCustomerId && stripeClient.customers?.retrieve) {
    try {
      const customer = await stripeClient.customers.retrieve(normalizedCustomerId);
      if (
        customer
        && !customer.deleted
        && (
          customerMatchesPortalPub(customer, normalizedPub)
          || customerMatchesPortalAlias(customer, normalizedAlias)
        )
      ) {
        linkedCandidates.push(customer);
      }
    } catch (error) {
      // Fall through to portal-linked metadata lookup.
    }
  }

  if (normalizedPub) {
    linkedCandidates.push(...await searchCustomersByMetadata(stripeClient, 'portal_pub', normalizedPub));
  }

  let uniqueLinkedCandidates = uniqueCustomers(linkedCandidates);
  if (uniqueLinkedCandidates.length) {
    linkedSource = uniqueLinkedCandidates.length > 1 ? 'portal_pub_multi' : 'portal_pub';
  } else if (normalizedAlias) {
    linkedCandidates.push(...await searchCustomersByMetadata(stripeClient, 'portal_alias', normalizedAlias));
    uniqueLinkedCandidates = uniqueCustomers(linkedCandidates);
    if (uniqueLinkedCandidates.length) {
      linkedSource = uniqueLinkedCandidates.length > 1 ? 'portal_alias_multi' : 'portal_alias';
    }
  }

  if (uniqueLinkedCandidates.length) {
    const syncedCandidates = [];
    for (const candidate of uniqueLinkedCandidates) {
      syncedCandidates.push(await updateCustomerHints(stripeClient, candidate, {
        billingEmail: normalizedEmail,
        portalAlias: normalizedAlias,
        portalPub: normalizedPub
      }));
    }

    const linkedRecords = [];
    for (const candidate of syncedCandidates) {
      const record = await summarizeBillingCustomerRecord(stripeClient, candidate, config);
      if (record) {
        linkedRecords.push(record);
      }
    }

    const combinedLinkedState = combineBillingCustomerRecords(linkedRecords);
    return {
      customer: combinedLinkedState.primary?.customer || syncedCandidates[0] || null,
      records: linkedRecords,
      source: linkedSource
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

export async function resolveLegacyStripeCustomersByEmails({
  stripeClient,
  billingEmail = '',
  billingEmails = [],
  config = process.env
} = {}) {
  const normalizedEmails = normalizeBillingEmailList(billingEmail, billingEmails);
  if (!stripeClient || !normalizedEmails.length || !stripeClient.customers?.list) {
    return {
      customer: null,
      source: 'missing-email',
      matchCount: 0,
      records: []
    };
  }

  const records = uniqueBillingCustomerRecords((await Promise.all(
    normalizedEmails.map(email => listLegacyStripeCustomerRecordsByEmail({
      stripeClient,
      billingEmail: email,
      config
    }))
  )).flat()).sort(compareBillingCustomerRecords);
  const activeMatches = records.filter(record => record.current);

  if (!activeMatches.length) {
    if (records.length) {
      const combinedHistoryState = combineBillingCustomerRecords(records);
      return {
        customer: combinedHistoryState.primary?.customer || null,
        current: null,
        active: [],
        duplicates: [],
        hasInvoiceHistory: combinedHistoryState.hasInvoiceHistory,
        source: 'legacy_email_history',
        matchCount: records.length,
        records
      };
    }

    return {
      customer: null,
      source: 'not-found',
      matchCount: 0,
      records: []
    };
  }

  if (activeMatches.length > 1) {
    const combinedActiveState = combineBillingCustomerRecords(activeMatches);

    return {
      customer: combinedActiveState.primary?.customer || activeMatches[0].customer,
      current: combinedActiveState.current,
      active: combinedActiveState.active,
      duplicates: combinedActiveState.duplicates,
      hasInvoiceHistory: combineBillingCustomerRecords(records).hasInvoiceHistory,
      source: 'legacy_email_ambiguous',
      matchCount: activeMatches.length,
      records
    };
  }

  return {
    customer: activeMatches[0].customer,
    current: activeMatches[0].current,
    active: activeMatches[0].active,
    duplicates: activeMatches[0].duplicates,
    hasInvoiceHistory: combineBillingCustomerRecords(records).hasInvoiceHistory,
    source: 'legacy_email',
    matchCount: 1,
    records
  };
}

export async function resolveLegacyStripeCustomerByEmail({
  stripeClient,
  billingEmail = '',
  config = process.env
} = {}) {
  return resolveLegacyStripeCustomersByEmails({
    stripeClient,
    billingEmail,
    config
  });
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

export async function listBillingInvoices(stripeClient, customerId = '', { limit = 1 } = {}) {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!stripeClient?.invoices?.list || !normalizedCustomerId) {
    return [];
  }

  const response = await stripeClient.invoices.list({
    customer: normalizedCustomerId,
    limit: Math.max(1, Math.min(Number(limit) || 1, 20))
  });

  return Array.isArray(response?.data) ? response.data : [];
}

export async function summarizeBillingCustomerRecord(stripeClient, customer, config = process.env) {
  if (!customer || customer.deleted) {
    return null;
  }

  const [subscriptions, invoices] = await Promise.all([
    listBillingSubscriptions(stripeClient, customer.id),
    listBillingInvoices(stripeClient, customer.id, { limit: 1 })
  ]);
  const billingState = pickCurrentBillingSubscription(subscriptions, config);
  const latestInvoice = invoices[0] || null;

  return {
    customer,
    current: billingState.current,
    active: billingState.active,
    duplicates: billingState.duplicates,
    hasInvoiceHistory: Boolean(latestInvoice),
    lastInvoiceAt: Number(latestInvoice?.created || 0)
  };
}

export function isPlaceholderBillingRecord(record) {
  return Boolean(record && !record.current && !record.hasInvoiceHistory);
}

export function compareBillingCustomerRecords(left, right) {
  const currentCreatedDelta = Number(right?.current?.created || 0) - Number(left?.current?.created || 0);
  if (currentCreatedDelta !== 0) {
    return currentCreatedDelta;
  }

  const planDelta = planWeight(right?.current?.plan || 'free') - planWeight(left?.current?.plan || 'free');
  if (planDelta !== 0) {
    return planDelta;
  }

  const invoiceDelta = Number(right?.lastInvoiceAt || 0) - Number(left?.lastInvoiceAt || 0);
  if (invoiceDelta !== 0) {
    return invoiceDelta;
  }

  return Number(right?.customer?.created || 0) - Number(left?.customer?.created || 0);
}

export function combineBillingCustomerRecords(records = []) {
  const normalizedRecords = (records || [])
    .filter(Boolean)
    .sort(compareBillingCustomerRecords);
  const active = normalizedRecords
    .flatMap(record => record.active || [])
    .sort(compareBillingSubscriptionPriority);

  return {
    primary: normalizedRecords[0] || null,
    current: active[0] || null,
    active,
    duplicates: active.slice(1),
    hasInvoiceHistory: normalizedRecords.some(record => record.hasInvoiceHistory),
    recordCount: normalizedRecords.length
  };
}

function uniqueBillingCustomerRecords(records = []) {
  const seen = new Set();
  return (records || []).filter(record => {
    const customerId = String(record?.customer?.id || '').trim();
    if (!record || !customerId || seen.has(customerId)) {
      return false;
    }

    seen.add(customerId);
    return true;
  });
}

function listOwnedActiveSubscriptions(records = []) {
  const seen = new Set();
  return uniqueBillingCustomerRecords(records)
    .flatMap(record => (record.active || []).filter(Boolean).map(subscription => ({
      customer: record.customer || null,
      subscription,
      record
    })))
    .filter(entry => {
      const subscriptionId = String(entry.subscription?.id || '').trim();
      if (!subscriptionId || seen.has(subscriptionId)) {
        return false;
      }

      seen.add(subscriptionId);
      return true;
    })
    .sort((left, right) => compareBillingSubscriptionPriority(left.subscription, right.subscription));
}

export async function cancelStripeSubscription(
  stripeClient,
  subscription,
  { invoiceNow = false, prorate = false } = {}
) {
  const subscriptionId = String(subscription?.id || subscription || '').trim();
  if (!subscriptionId || !stripeClient?.subscriptions?.cancel) {
    return null;
  }

  return stripeClient.subscriptions.cancel(subscriptionId, {
    invoice_now: Boolean(invoiceNow),
    prorate: Boolean(prorate)
  });
}

export function resolveManagedBillingPlanFromSubscription(subscription, config = process.env) {
  const planMap = resolvePricePlanMap(config);
  const item = firstActiveItem(subscription);
  const metadataPlan = normalizeBillingPlan(item?.price?.metadata?.plan || '');
  if (metadataPlan && getBillingPlan(metadataPlan)?.kind === 'subscription') {
    return metadataPlan;
  }

  const priceId = String(item?.price?.id || '').trim();
  if (priceId && planMap[priceId]) {
    const mappedPlan = normalizeBillingPlan(planMap[priceId]);
    if (mappedPlan && getBillingPlan(mappedPlan)?.kind === 'subscription') {
      return mappedPlan;
    }
  }

  const nicknamePlan = String(item?.price?.nickname || '').trim().toLowerCase();
  if (nicknamePlan.includes('builder') || nicknamePlan.includes('studio') || nicknamePlan.includes('partner')) {
    return 'builder';
  }
  if (nicknamePlan.includes('founder') || nicknamePlan.includes('pro')) {
    return 'pro';
  }
  if (
    nicknamePlan.includes('starter')
    || nicknamePlan.includes('supporter')
    || nicknamePlan.includes('family')
  ) {
    return 'starter';
  }

  return '';
}

export async function cancelRedundantBillingSubscriptions({
  stripeClient,
  customerId = '',
  billingEmail = '',
  billingEmails = [],
  portalAlias = '',
  portalPub = '',
  keepSubscriptionId = '',
  config = process.env
} = {}) {
  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedPortalAlias = normalizeMetadataField(portalAlias);
  const normalizedPortalPub = normalizeMetadataField(portalPub);
  const normalizedKeepSubscriptionId = String(keepSubscriptionId || '').trim();

  if (!stripeClient || !normalizedKeepSubscriptionId) {
    return {
      keptSubscriptionId: normalizedKeepSubscriptionId,
      cancelledSubscriptionIds: [],
      canceledCount: 0,
      autoLinkedLegacy: false
    };
  }

  let linkedRecords = [];
  let linkedCustomer = null;

  if (normalizedPortalPub || normalizedPortalAlias) {
    const linkedResolution = await resolvePortalLinkedStripeCustomer({
      stripeClient,
      customerId: normalizedCustomerId,
      billingEmail,
      portalAlias: normalizedPortalAlias,
      portalPub: normalizedPortalPub,
      createIfMissing: false,
      config
    });

    linkedRecords = uniqueBillingCustomerRecords(linkedResolution.records || []);
    linkedCustomer = linkedResolution.customer || null;
  }

  if (!linkedCustomer && normalizedCustomerId && stripeClient.customers?.retrieve) {
    try {
      const explicitCustomer = await stripeClient.customers.retrieve(normalizedCustomerId);
      if (explicitCustomer && !explicitCustomer.deleted) {
        linkedCustomer = explicitCustomer;
        const explicitRecord = await summarizeBillingCustomerRecord(stripeClient, explicitCustomer, config);
        linkedRecords = uniqueBillingCustomerRecords([
          ...linkedRecords,
          ...(explicitRecord ? [explicitRecord] : [])
        ]);
      }
    } catch (error) {
      console.warn('Unable to retrieve Stripe customer for duplicate cleanup', error);
    }
  }

  const resolvedBillingEmails = normalizeBillingEmailList(
    billingEmail,
    billingEmails,
    billingEmailsFromRecords(linkedRecords),
    billingEmailsFromCustomer(linkedCustomer)
  );

  const legacyResolution = await resolveLegacyStripeCustomersByEmails({
    stripeClient,
    billingEmail: resolvedBillingEmails[0],
    billingEmails: resolvedBillingEmails,
    config
  });

  const managedActiveSubscriptions = listOwnedActiveSubscriptions([
    ...linkedRecords,
    ...(legacyResolution.records || [])
  ]);

  const winner = managedActiveSubscriptions.find(item => item.subscription?.id === normalizedKeepSubscriptionId) || null;
  if (!winner) {
    return {
      keptSubscriptionId: normalizedKeepSubscriptionId,
      cancelledSubscriptionIds: [],
      canceledCount: 0,
      autoLinkedLegacy: false
    };
  }

  const cancelledSubscriptionIds = [];
  for (const entry of managedActiveSubscriptions) {
    const subscription = entry.subscription;
    if (subscription?.id === normalizedKeepSubscriptionId) {
      continue;
    }

    await cancelStripeSubscription(stripeClient, subscription, {
      invoiceNow: false,
      prorate: false
    });
    cancelledSubscriptionIds.push(subscription.id);
  }

  let autoLinkedLegacy = false;
  if (
    winner.customer
    && !customerHasPortalLink(winner.customer)
    && (normalizedPortalPub || normalizedPortalAlias)
  ) {
    await updateCustomerHints(stripeClient, winner.customer, {
      billingEmail: resolvedBillingEmails[0],
      portalAlias: normalizedPortalAlias,
      portalPub: normalizedPortalPub
    });
    autoLinkedLegacy = true;
  }

  return {
    keptSubscriptionId: normalizedKeepSubscriptionId,
    cancelledSubscriptionIds,
    canceledCount: cancelledSubscriptionIds.length,
    autoLinkedLegacy
  };
}

export async function reconcileDuplicateActiveSubscriptions({
  stripeClient,
  linkedRecords = [],
  legacyRecords = [],
  billingEmail = '',
  portalAlias = '',
  portalPub = ''
} = {}) {
  const activeSubscriptions = listOwnedActiveSubscriptions([
    ...(linkedRecords || []),
    ...(legacyRecords || [])
  ]);

  if (activeSubscriptions.length <= 1 || !stripeClient?.subscriptions?.cancel) {
    return {
      reconciled: false,
      winner: activeSubscriptions[0] || null,
      cancelledSubscriptionIds: [],
      autoLinkedLegacy: false
    };
  }

  const [winner, ...duplicates] = activeSubscriptions;
  const cancelledSubscriptionIds = [];

  for (const duplicate of duplicates) {
    await cancelStripeSubscription(stripeClient, duplicate.subscription, {
      invoiceNow: false,
      prorate: false
    });
    cancelledSubscriptionIds.push(duplicate.subscription.id);
  }

  let claimedCustomer = winner.customer || null;
  let autoLinkedLegacy = false;
  if (claimedCustomer && !customerHasPortalLink(claimedCustomer) && normalizeMetadataField(portalPub)) {
    claimedCustomer = await updateCustomerHints(stripeClient, claimedCustomer, {
      billingEmail,
      portalAlias,
      portalPub
    });
    autoLinkedLegacy = true;
  }

  return {
    reconciled: Boolean(cancelledSubscriptionIds.length),
    winner: winner
      ? {
          ...winner,
          customer: claimedCustomer
        }
      : null,
    cancelledSubscriptionIds,
    autoLinkedLegacy
  };
}

export function canAutoLinkLegacyStripeCustomer({
  legacyResolution,
  linkedRecords = []
} = {}) {
  if (!legacyResolution?.customer) {
    return false;
  }

  if (Number(legacyResolution.matchCount || 0) !== 1) {
    return false;
  }

  if (!legacyResolution.current && !legacyResolution.hasInvoiceHistory) {
    return false;
  }

  if ((legacyResolution.records || []).filter(Boolean).length !== 1) {
    return false;
  }

  return !(linkedRecords || []).filter(Boolean).some(record => record?.current);
}

export async function autoLinkLegacyStripeCustomer({
  stripeClient,
  legacyResolution,
  linkedRecords = [],
  billingEmail = '',
  portalAlias = '',
  portalPub = ''
} = {}) {
  if (!canAutoLinkLegacyStripeCustomer({ legacyResolution, linkedRecords })) {
    return {
      autoLinked: false,
      customer: null,
      releasedCustomerIds: []
    };
  }

  const claimedCustomer = await updateCustomerHints(stripeClient, legacyResolution.customer, {
    billingEmail,
    portalAlias,
    portalPub
  });
  const releasedCustomerIds = [];

  for (const record of linkedRecords || []) {
    const linkedCustomer = record?.customer;
    if (!linkedCustomer || linkedCustomer.id === claimedCustomer.id || !customerHasPortalLink(linkedCustomer)) {
      continue;
    }

    await clearPortalLinkMetadata(stripeClient, linkedCustomer, {
      canonicalCustomerId: claimedCustomer.id
    });
    releasedCustomerIds.push(linkedCustomer.id);
  }

  return {
    autoLinked: true,
    customer: claimedCustomer,
    releasedCustomerIds
  };
}

async function hydrateResolvedStripeBillingState({
  stripeClient,
  customerId = '',
  billingEmail = '',
  billingEmails = [],
  portalAlias = '',
  portalPub = '',
  config = process.env
} = {}) {
  const customerResolution = await resolvePortalLinkedStripeCustomer({
    stripeClient,
    customerId,
    billingEmail,
    portalAlias,
    portalPub,
    createIfMissing: false,
    config
  });
  const linkedState = combineBillingCustomerRecords(customerResolution.records || []);
  const linkedRecord = linkedState.primary
    || await summarizeBillingCustomerRecord(stripeClient, customerResolution.customer, config);
  const resolvedBillingEmails = normalizeBillingEmailList(
    billingEmail,
    billingEmails,
    billingEmailsFromRecords(customerResolution.records || []),
    billingEmailsFromCustomer(linkedRecord?.customer || customerResolution.customer)
  );
  const legacyResolution = await resolveLegacyStripeCustomersByEmails({
    stripeClient,
    billingEmail,
    billingEmails: resolvedBillingEmails,
    config
  });

  return {
    customerResolution,
    linkedState,
    linkedRecord,
    legacyResolution,
    billingEmails: resolvedBillingEmails
  };
}

export async function resolveStripeBillingState({
  stripeClient,
  customerId = '',
  billingEmail = '',
  billingEmails = [],
  portalAlias = '',
  portalPub = '',
  config = process.env
} = {}) {
  let resolvedCustomerId = String(customerId || '').trim();
  let resolvedBillingEmails = normalizeBillingEmailList(billingEmail, billingEmails);
  let autoLinkedLegacy = false;
  let customerResolution = null;
  let linkedState = combineBillingCustomerRecords();
  let linkedRecord = null;
  let legacyResolution = { customer: null, source: 'not-found' };

  async function refreshState(nextCustomerId = resolvedCustomerId) {
    resolvedCustomerId = String(nextCustomerId || '').trim();
    const resolved = await hydrateResolvedStripeBillingState({
      stripeClient,
      customerId: resolvedCustomerId,
      billingEmail,
      billingEmails: resolvedBillingEmails,
      portalAlias,
      portalPub,
      config
    });

    customerResolution = resolved.customerResolution;
    linkedState = resolved.linkedState;
    linkedRecord = resolved.linkedRecord;
    legacyResolution = resolved.legacyResolution;
    resolvedBillingEmails = resolved.billingEmails;
  }

  await refreshState(resolvedCustomerId);

  const preferredBillingEmail = normalizeBillingEmail(billingEmail) || resolvedBillingEmails[0] || '';
  const autoLinkResolution = await autoLinkLegacyStripeCustomer({
    stripeClient,
    legacyResolution,
    linkedRecords: customerResolution.records || [],
    billingEmail: preferredBillingEmail,
    portalAlias,
    portalPub
  });

  if (autoLinkResolution.autoLinked) {
    autoLinkedLegacy = true;
    await refreshState(autoLinkResolution.customer?.id || resolvedCustomerId);
  }

  const duplicateResolution = await reconcileDuplicateActiveSubscriptions({
    stripeClient,
    linkedRecords: customerResolution.records || [],
    legacyRecords: legacyResolution.records || [],
    billingEmail: preferredBillingEmail,
    portalAlias,
    portalPub
  });

  if (duplicateResolution.reconciled || duplicateResolution.autoLinkedLegacy) {
    autoLinkedLegacy = autoLinkedLegacy || duplicateResolution.autoLinkedLegacy;
    await refreshState(duplicateResolution.winner?.customer?.id || resolvedCustomerId);
  }

  const legacyState = combineBillingCustomerRecords(legacyResolution.records || []);
  const legacyRecord = legacyState.primary || null;
  const shouldPreferLegacy = Boolean(
    legacyResolution.customer
    && legacyRecord
    && (
      !linkedRecord
      || compareBillingCustomerRecords(legacyRecord, linkedRecord) < 0
    )
  );

  return {
    customerResolution,
    linkedState,
    linkedRecord,
    legacyResolution,
    legacyState,
    legacyRecord,
    shouldPreferLegacy,
    autoLinkedLegacy,
    duplicateResolution,
    billingEmails: resolvedBillingEmails
  };
}

export async function listLegacyStripeCustomerRecordsByEmail({
  stripeClient,
  billingEmail = '',
  config = process.env
} = {}) {
  const normalizedEmail = normalizeBillingEmail(billingEmail);
  if (!stripeClient || !normalizedEmail || !stripeClient.customers?.list) {
    return [];
  }

  const listed = await stripeClient.customers.list({ email: normalizedEmail, limit: 10 });
  const candidates = uniqueCustomers((listed?.data || []).filter(customer => {
    return customerMatchesEmail(customer, normalizedEmail) && !customerHasPortalLink(customer);
  }));

  const records = [];
  for (const customer of candidates) {
    const record = await summarizeBillingCustomerRecord(stripeClient, customer, config);
    if (!record) {
      continue;
    }

    if (record.current || record.hasInvoiceHistory) {
      records.push(record);
    }
  }

  return records.sort(compareBillingCustomerRecords);
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
  const activeSubscriptions = (subscriptions || [])
    .filter(item => BILLING_ACTIVE_STATUSES.includes(String(item?.status || '').toLowerCase()))
    .map(item => ({
      ...item,
      plan: resolveManagedBillingPlanFromSubscription(item, config)
    }))
    .filter(item => Boolean(item.plan))
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
  legacyNeedsLinking = false,
  hasInvoiceHistory = false,
  legacyBillingManagementAvailable = false,
  autoLinkedLegacy = false
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
    hasInvoiceHistory: Boolean(hasInvoiceHistory),
    legacyBillingManagementAvailable: Boolean(legacyBillingManagementAvailable),
    autoLinkedLegacy: Boolean(autoLinkedLegacy),
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

export function buildSubscriptionUpdateSelectionFlow({ subscription, returnUrl, successUrl }) {
  if (!subscription?.id) {
    throw new Error('An active Stripe subscription is required for plan changes.');
  }

  return {
    customer: subscription.customer,
    return_url: returnUrl,
    flow_data: {
      type: 'subscription_update',
      after_completion: {
        type: 'redirect',
        redirect: {
          return_url: successUrl
        }
      },
      subscription_update: {
        subscription: subscription.id
      }
    }
  };
}

export function buildSubscriptionCancelFlow({ subscription, returnUrl, successUrl }) {
  if (!subscription?.id) {
    throw new Error('An active Stripe subscription is required for cancellation.');
  }

  return {
    customer: subscription.customer,
    return_url: returnUrl,
    flow_data: {
      type: 'subscription_cancel',
      after_completion: {
        type: 'redirect',
        redirect: {
          return_url: successUrl
        }
      },
      subscription_cancel: {
        subscription: subscription.id
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
  const metadata = {
    ...buildBillingMetadata({
      plan: 'custom',
      portalAlias,
      portalPub,
      billingEmail
    }),
    custom_label: normalizeMetadataField(label) || 'Custom Project Payment',
    custom_description: normalizeMetadataField(description),
    custom_amount_cents: String(Number(amountCents) || 0)
  };
  const sessionMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => Boolean(value))
  );
  const productMetadata = {
    ...sessionMetadata,
    plan: 'custom',
    custom_amount_cents: String(Number(amountCents) || 0)
  };
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
            metadata: productMetadata
          }
        }
      }
    ],
    metadata: sessionMetadata,
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
