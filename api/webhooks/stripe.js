import nodemailer from 'nodemailer';
import {
  BILLING_ACTIVE_STATUSES,
  getBillingPlan,
  normalizeBillingPlan
} from '../../src/billing/plans.js';
import {
  cancelRedundantBillingSubscriptions,
  makeStripeClient,
  resolveManagedBillingPlanFromSubscription
} from '../../src/billing/stripe.js';

export const config = {
  api: {
    bodyParser: false
  }
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createTransporter(config = process.env) {
  const user = String(config.GMAIL_USER || '').trim();
  const pass = String(config.GMAIL_APP_PASSWORD || '').trim();
  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass
    }
  });
}

async function sendMailSafely(transporter, payload) {
  if (!transporter?.sendMail) {
    return null;
  }

  return transporter.sendMail(payload);
}

async function logStripeEvent(event, context = {}, { transporter, config } = {}) {
  const logEmail = String(config?.STRIPE_LOG_EMAIL || '').trim();
  const gmailUser = String(config?.GMAIL_USER || '').trim();
  if (!logEmail || !gmailUser) {
    return;
  }

  try {
    const summary = {
      id: event.id,
      type: event.type,
      created: event.created,
      ...context
    };

    await sendMailSafely(transporter, {
      from: `"3DVR.Tech Stripe Logger" <${gmailUser}>`,
      to: logEmail,
      subject: `[Stripe] ${event.type}`,
      text: JSON.stringify({ summary, event }, null, 2)
    });
  } catch (error) {
    console.error('Failed to send Stripe log email:', error?.message || error);
  }
}

async function sendWelcomeEmail(email, { transporter, config } = {}) {
  const gmailUser = String(config?.GMAIL_USER || '').trim();
  if (!email || !gmailUser) {
    return;
  }

  try {
    await sendMailSafely(transporter, {
      from: `"Thomas @ 3DVR.Tech" <${gmailUser}>`,
      to: email,
      subject: 'You’re in! Welcome to 3DVR.Tech',
      text: `Hey there — thanks for subscribing to 3DVR.Tech!\nYou're now part of a growing open tech movement.\nFeel free to reach out if you ever have questions or ideas.\n\n- Thomas`,
      html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.5;">
          <h2 style="color: #333;">Welcome to 3DVR.Tech!</h2>
          <p>Hey there — I’m Thomas, the founder of 3DVR.</p>
          <p>Thanks for signing up! You’re now part of a growing open-source tech movement.</p>
          <p>We’re here to help you build, learn, and collaborate. If you ever need anything or have ideas, don’t hesitate to reach out — just reply to this email.</p>
          <p>Let’s build something amazing together.</p>
          <p style="margin-top: 30px;">Cheers,<br>Thomas<br>Founder, 3DVR.Tech</p>
        </div>
      `
    });
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error?.message || error);
  }
}

async function notifyTeam(newUserEmail, { transporter, config } = {}) {
  const gmailUser = String(config?.GMAIL_USER || '').trim();
  if (!newUserEmail || !gmailUser) {
    return;
  }

  const team = [
    'tmsteph1290@gmail.com',
    'abrandon055@gmail.com',
    'gamboaesai@gmail.com',
    'mark.wells3050@gmail.com',
    'davidmartinezr@hotmail.com'
  ];

  try {
    await sendMailSafely(transporter, {
      from: `"3DVR.Tech Subscription Notifier" <${gmailUser}>`,
      to: gmailUser,
      bcc: team,
      subject: `New Subscriber: ${newUserEmail}`,
      html: `<p>A new user just subscribed: <strong>${newUserEmail}</strong></p>`
    });
  } catch (error) {
    console.error('Failed to notify team:', error?.message || error);
  }
}

function resolveInvoiceLinePlan(line, config = process.env) {
  const priceId = String(line?.price?.id || '').trim();
  const priceMap = {
    [String(config?.STRIPE_PRICE_STARTER_ID || config?.STRIPE_PRICE_SUPPORTER_ID || '').trim()]: 'starter',
    [String(config?.STRIPE_PRICE_PRO_ID || config?.STRIPE_PRICE_FOUNDER_ID || '').trim()]: 'pro',
    [String(config?.STRIPE_PRICE_BUILDER_ID || config?.STRIPE_PRICE_STUDIO_ID || '').trim()]: 'builder',
    [String(config?.STRIPE_PRICE_EMBEDDED_ID || config?.STRIPE_PRICE_EXECUTION_ID || config?.STRIPE_PRICE_200_ID || '').trim()]: 'embedded'
  };

  if (priceId && priceMap[priceId]) {
    return normalizeBillingPlan(priceMap[priceId]);
  }

  const nickname = String(line?.price?.nickname || line?.description || '').trim().toLowerCase();
  if (nickname.includes('embedded') || nickname.includes('execution')) {
    return 'embedded';
  }
  if (nickname.includes('builder') || nickname.includes('studio') || nickname.includes('partner')) {
    return 'builder';
  }
  if (nickname.includes('founder') || nickname.includes('pro')) {
    return 'pro';
  }
  if (nickname.includes('starter') || nickname.includes('supporter') || nickname.includes('family')) {
    return 'starter';
  }

  return '';
}

function readSubscriptionUpdateDetails(invoice = {}, config = process.env) {
  const lines = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  const chargeToday = formatCurrencyAmount(invoice?.amount_paid, invoice?.currency);
  const positiveLine = lines
    .filter(line => Number(line?.amount) > 0)
    .sort((left, right) => Number(right?.amount || 0) - Number(left?.amount || 0))[0] || null;
  const targetPlan = resolveInvoiceLinePlan(positiveLine, config);
  const targetLabel = getBillingPlan(targetPlan)?.label || 'Updated subscription';
  const lineSummary = lines
    .map(line => {
      const amount = formatCurrencyAmount(line?.amount, invoice?.currency);
      const description = String(line?.description || '').trim();
      return amount && description ? `${amount}: ${description}` : '';
    })
    .filter(Boolean);

  return {
    targetPlan,
    targetLabel,
    chargeToday,
    lineSummary
  };
}

async function sendSubscriptionUpdateEmail(email, details = {}, { transporter, config } = {}) {
  const gmailUser = String(config?.GMAIL_USER || '').trim();
  if (!email || !gmailUser) {
    return;
  }

  const targetLabel = String(details.targetLabel || 'your subscription').trim();
  const chargeToday = String(details.chargeToday || '').trim() || 'the prorated amount shown in Stripe';
  const lineSummary = Array.isArray(details.lineSummary) ? details.lineSummary.filter(Boolean) : [];
  const textLines = lineSummary.length
    ? `\n\nStripe invoice details:\n- ${lineSummary.join('\n- ')}`
    : '';
  const htmlLines = lineSummary.length
    ? `<ul>${lineSummary.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : '';

  try {
    await sendMailSafely(transporter, {
      from: `"Thomas @ 3DVR.Tech" <${gmailUser}>`,
      to: email,
      subject: `Plan updated: ${targetLabel}`,
      text: `Hey there — Stripe confirmed your plan change to ${targetLabel}.\nAmount charged today: ${chargeToday}.${textLines}\n\nThanks,\nThomas`,
      html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.5;">
          <h2 style="color: #333;">Plan updated</h2>
          <p>Stripe confirmed your plan change to <strong>${escapeHtml(targetLabel)}</strong>.</p>
          <p><strong>Amount charged today:</strong> ${escapeHtml(chargeToday)}</p>
          ${htmlLines}
          <p style="margin-top: 30px;">Thanks,<br>Thomas<br>Founder, 3DVR.Tech</p>
        </div>
      `
    });
  } catch (error) {
    console.error(`Failed to send subscription update email to ${email}:`, error?.message || error);
  }
}

async function notifyTeamOfSubscriptionUpdate(email, details = {}, { transporter, config } = {}) {
  const gmailUser = String(config?.GMAIL_USER || '').trim();
  if (!email || !gmailUser) {
    return;
  }

  const team = [
    'tmsteph1290@gmail.com',
    'abrandon055@gmail.com',
    'gamboaesai@gmail.com',
    'mark.wells3050@gmail.com',
    'davidmartinezr@hotmail.com'
  ];
  const targetLabel = String(details.targetLabel || 'Updated subscription').trim();
  const chargeToday = String(details.chargeToday || '').trim() || 'unknown amount';
  const lineSummary = Array.isArray(details.lineSummary) ? details.lineSummary.filter(Boolean) : [];
  const htmlLines = lineSummary.length
    ? `<ul>${lineSummary.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : '';

  try {
    await sendMailSafely(transporter, {
      from: `"3DVR.Tech Subscription Notifier" <${gmailUser}>`,
      to: gmailUser,
      bcc: team,
      subject: `Subscription update: ${email} -> ${targetLabel} (${chargeToday})`,
      html: `
        <p><strong>${escapeHtml(email)}</strong> changed plans.</p>
        <p><strong>New plan:</strong> ${escapeHtml(targetLabel)}</p>
        <p><strong>Amount charged today:</strong> ${escapeHtml(chargeToday)}</p>
        ${htmlLines}
      `
    });
  } catch (error) {
    console.error('Failed to notify team of subscription update:', error?.message || error);
  }
}

function formatCurrencyAmount(amountCents, currency = 'usd') {
  const normalizedCurrency = String(currency || 'usd').trim().toUpperCase() || 'USD';
  const normalizedAmountCents = Number(amountCents);
  if (!Number.isFinite(normalizedAmountCents)) {
    return '';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency
    }).format(normalizedAmountCents / 100);
  } catch (error) {
    return `${(normalizedAmountCents / 100).toFixed(2)} ${normalizedCurrency}`;
  }
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readOneTimePaymentDetails(session = {}) {
  const metadata = session?.metadata && typeof session.metadata === 'object'
    ? session.metadata
    : {};
  const amountCents = Number(session?.amount_total || metadata.custom_amount_cents || 0);
  const currency = String(session?.currency || 'usd').trim() || 'usd';
  const reason = String(metadata.custom_label || '').trim() || 'Custom one-time payment';
  const description = String(metadata.custom_description || '').trim();
  const amount = formatCurrencyAmount(amountCents, currency);

  return {
    amount,
    amountCents,
    currency,
    reason,
    description
  };
}

async function sendOneTimePaymentEmail(email, details = {}, { transporter, config } = {}) {
  const gmailUser = String(config?.GMAIL_USER || '').trim();
  if (!email || !gmailUser) {
    return;
  }

  const amount = details.amount || formatCurrencyAmount(details.amountCents, details.currency) || 'the agreed amount';
  const reason = String(details.reason || 'Custom one-time payment').trim();
  const description = String(details.description || '').trim();
  const descriptionText = description ? `\nDetails: ${description}` : '';
  const descriptionHtml = description ? `<p><strong>Details:</strong> ${escapeHtml(description)}</p>` : '';

  try {
    await sendMailSafely(transporter, {
      from: `"Thomas @ 3DVR.Tech" <${gmailUser}>`,
      to: email,
      subject: `Payment received: ${amount} for ${reason}`,
      text: `Hey there — we received your one-time payment of ${amount} for ${reason}.${descriptionText}\n\nThanks,\nThomas`,
      html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.5;">
          <h2 style="color: #333;">Payment received</h2>
          <p>We received your one-time payment.</p>
          <p><strong>Amount:</strong> ${escapeHtml(amount)}</p>
          <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
          ${descriptionHtml}
          <p style="margin-top: 30px;">Thanks,<br>Thomas<br>Founder, 3DVR.Tech</p>
        </div>
      `
    });
  } catch (error) {
    console.error(`Failed to send one-time payment email to ${email}:`, error?.message || error);
  }
}

async function notifyTeamOfOneTimePayment(email, details = {}, { transporter, config } = {}) {
  const gmailUser = String(config?.GMAIL_USER || '').trim();
  if (!email || !gmailUser) {
    return;
  }

  const team = [
    'tmsteph1290@gmail.com',
    'abrandon055@gmail.com',
    'gamboaesai@gmail.com',
    'mark.wells3050@gmail.com',
    'davidmartinezr@hotmail.com'
  ];
  const amount = details.amount || formatCurrencyAmount(details.amountCents, details.currency) || 'unknown amount';
  const reason = String(details.reason || 'Custom one-time payment').trim();
  const description = String(details.description || '').trim();
  const descriptionHtml = description ? `<p><strong>Details:</strong> ${escapeHtml(description)}</p>` : '';

  try {
    await sendMailSafely(transporter, {
      from: `"3DVR.Tech Payment Notifier" <${gmailUser}>`,
      to: gmailUser,
      bcc: team,
      subject: `One-Time Payment: ${email} (${amount})`,
      html: `
        <p><strong>${escapeHtml(email)}</strong> completed a one-time payment.</p>
        <p><strong>Amount:</strong> ${escapeHtml(amount)}</p>
        <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
        ${descriptionHtml}
      `
    });
  } catch (error) {
    console.error('Failed to notify team of one-time payment:', error?.message || error);
  }
}

function readCheckoutPlan(session = {}) {
  const metadataPlan = normalizeBillingPlan(session?.metadata?.plan || session?.subscription_details?.metadata?.plan || '');
  if (metadataPlan && getBillingPlan(metadataPlan)?.kind === 'subscription') {
    return metadataPlan;
  }
  return '';
}

async function syncSubscriptionPlanMetadata(subscription, { stripeClient, config } = {}) {
  const subscriptionId = String(subscription?.id || '').trim();
  if (!subscriptionId || !stripeClient?.subscriptions?.update) {
    return;
  }

  const resolvedPlan = resolveManagedBillingPlanFromSubscription(subscription, config);
  if (!resolvedPlan) {
    return;
  }

  const existingMetadata = subscription?.metadata && typeof subscription.metadata === 'object'
    ? subscription.metadata
    : {};
  const existingPlan = normalizeBillingPlan(existingMetadata.plan || '');
  if (existingPlan === resolvedPlan) {
    return;
  }

  try {
    await stripeClient.subscriptions.update(subscriptionId, {
      metadata: {
        ...existingMetadata,
        plan: resolvedPlan
      }
    });
  } catch (error) {
    console.warn('Failed to sync Stripe subscription plan metadata', {
      subscriptionId,
      resolvedPlan,
      error: error?.message || error
    });
  }
}

async function autoReplaceLegacySubscriptions(event, { stripeClient, config } = {}) {
  if (!stripeClient) {
    return { cleaned: false, canceledCount: 0, cancelledSubscriptionIds: [] };
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object || {};
    const requestedPlan = readCheckoutPlan(session);
    const customerId = String(session.customer?.id || session.customer || '').trim();
    const keepSubscriptionId = String(session.subscription?.id || session.subscription || '').trim();
    const billingEmail = String(
      session.customer_details?.email
      || session.metadata?.billing_email
      || session.subscription_details?.metadata?.billing_email
      || ''
    ).trim();
    const billingEmails = Array.isArray(session.metadata?.billing_emails)
      ? session.metadata.billing_emails
      : [];
    const portalAlias = String(session.metadata?.portal_alias || session.subscription_details?.metadata?.portal_alias || '').trim();
    const portalPub = String(session.metadata?.portal_pub || session.subscription_details?.metadata?.portal_pub || '').trim();

    if (session.mode !== 'subscription' || !requestedPlan || !customerId || !keepSubscriptionId) {
      return { cleaned: false, canceledCount: 0, cancelledSubscriptionIds: [] };
    }

    const cleanup = await cancelRedundantBillingSubscriptions({
      stripeClient,
      customerId,
      billingEmail,
      billingEmails,
      portalAlias,
      portalPub,
      keepSubscriptionId,
      config
    });

    return {
      cleaned: cleanup.canceledCount > 0,
      ...cleanup
    };
  }

  if (!['customer.subscription.created', 'customer.subscription.updated'].includes(event.type)) {
    return { cleaned: false, canceledCount: 0, cancelledSubscriptionIds: [] };
  }

  const subscription = event.data?.object || {};
  const status = String(subscription.status || '').trim().toLowerCase();
  if (!BILLING_ACTIVE_STATUSES.includes(status)) {
    return { cleaned: false, canceledCount: 0, cancelledSubscriptionIds: [] };
  }

  const managedPlan = resolveManagedBillingPlanFromSubscription(subscription, config);
  if (!managedPlan) {
    return { cleaned: false, canceledCount: 0, cancelledSubscriptionIds: [] };
  }

  const cleanup = await cancelRedundantBillingSubscriptions({
    stripeClient,
    customerId: subscription.customer,
    billingEmail: subscription.metadata?.billing_email,
    portalAlias: subscription.metadata?.portal_alias,
    portalPub: subscription.metadata?.portal_pub,
    keepSubscriptionId: subscription.id,
    config
  });

  return {
    cleaned: cleanup.canceledCount > 0,
    ...cleanup
  };
}

export function createStripeWebhookHandler(options = {}) {
  const runtimeConfig = options.config || process.env;
  const stripeClient = options.stripeClient || makeStripeClient(runtimeConfig);
  const transporter = options.transporter === undefined
    ? createTransporter(runtimeConfig)
    : options.transporter;
  const readRawBodyImpl = options.readRawBody || getRawBody;
  const constructEvent = options.constructEvent || ((payload, signature) => {
    if (!stripeClient?.webhooks?.constructEvent) {
      throw new Error('Stripe webhook verification is not configured.');
    }

    return stripeClient.webhooks.constructEvent(
      payload,
      signature,
      runtimeConfig.STRIPE_WEBHOOK_SECRET
    );
  });

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end('Method Not Allowed');
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
      const rawBody = await readRawBodyImpl(req);
      event = constructEvent(rawBody.toString(), sig);
    } catch (error) {
      console.error('Webhook error:', error?.message || error);
      if (typeof res.send === 'function') {
        return res.status(400).send(`Webhook Error: ${error?.message || error}`);
      }
      return res.status(400).end(`Webhook Error: ${error?.message || error}`);
    }

    const cleanupResult = await autoReplaceLegacySubscriptions(event, {
      stripeClient,
      config: runtimeConfig
    });

    if (['customer.subscription.created', 'customer.subscription.updated'].includes(event.type)) {
      await syncSubscriptionPlanMetadata(event.data?.object || {}, {
        stripeClient,
        config: runtimeConfig
      });
    }

    await logStripeEvent(event, {
      receivedAt: new Date().toISOString(),
      canceledCount: cleanupResult.canceledCount || 0,
      cancelledSubscriptionIds: cleanupResult.cancelledSubscriptionIds || []
    }, {
      transporter,
      config: runtimeConfig
    });

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = String(
        session.customer_details?.email
        || session.metadata?.billing_email
        || ''
      ).trim();

      console.log('Stripe session:', JSON.stringify(session, null, 2));

      if (email) {
        if (session.mode === 'payment' || normalizeBillingPlan(session.metadata?.plan || '') === 'custom') {
          const paymentDetails = readOneTimePaymentDetails(session);
          console.log('One-time payment:', email, paymentDetails.amount || paymentDetails.amountCents);
          await sendOneTimePaymentEmail(email, paymentDetails, { transporter, config: runtimeConfig });
          await notifyTeamOfOneTimePayment(email, paymentDetails, { transporter, config: runtimeConfig });
        } else {
          console.log('New subscriber:', email);
          await sendWelcomeEmail(email, { transporter, config: runtimeConfig });
          await notifyTeam(email, { transporter, config: runtimeConfig });
        }
      } else {
        console.warn('No email found in session.customer_details');
      }
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data?.object || {};
      const email = String(invoice.customer_email || '').trim();
      const billingReason = String(invoice.billing_reason || '').trim().toLowerCase();

      if (email && billingReason === 'subscription_update') {
        const updateDetails = readSubscriptionUpdateDetails(invoice, runtimeConfig);
        await sendSubscriptionUpdateEmail(email, updateDetails, { transporter, config: runtimeConfig });
        await notifyTeamOfSubscriptionUpdate(email, updateDetails, { transporter, config: runtimeConfig });
      }
    }

    return res.status(200).json({
      received: true,
      cleanup: {
        canceledCount: cleanupResult.canceledCount || 0,
        cancelledSubscriptionIds: cleanupResult.cancelledSubscriptionIds || []
      }
    });
  };
}

const handler = createStripeWebhookHandler();
export default handler;
