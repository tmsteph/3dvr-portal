import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import { saveNewsletterSubscriber, callChatPushStore } from '../src/services/newsletter-store-client.js';
import {
  createBusinessCardOrderHandler,
  getBusinessCardCheckoutConfig,
} from '../src/billing/api-business-card-order.js';
import { createChallengeHandler } from '../src/challenge/api.js';
import { createCleaningNetworkService } from '../src/cleaning-network/service.js';

const AV_BOOKING_RATES = Object.freeze({
  lead: { label: 'Lead technician', dayRate: 750 },
  support: { label: 'Support technician', dayRate: 500 },
});

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function createStripeClient(secretKey) {
  return new Stripe(secretKey, {
    apiVersion: '2023-10-16',
  });
}

function createMailTransport(config) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.GMAIL_USER,
      pass: config.GMAIL_APP_PASSWORD,
    },
  });
}

function normalizeLine(value, maxLength = 180) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeLongText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = normalizeLine(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function boundedInteger(value, minimum, maximum) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Expected an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

export function calculateAvBookingEstimate(input = {}) {
  const level = normalizeLine(input.level, 24).toLowerCase();
  const rate = AV_BOOKING_RATES[level];
  if (!rate) {
    throw new Error('Choose a valid technician level.');
  }

  const technicians = boundedInteger(input.technicians, 1, 8);
  const days = boundedInteger(input.days, 1, 14);
  const hoursPerDay = boundedInteger(input.hoursPerDay, 4, 18);
  const overtimeHoursPerDay = Math.max(hoursPerDay - 10, 0);
  const overtimeRate = (rate.dayRate / 10) * 1.5;
  const baseTotal = rate.dayRate * technicians * days;
  const overtimeTotal = Math.round(overtimeHoursPerDay * overtimeRate * technicians * days);

  return {
    level,
    label: rate.label,
    dayRate: rate.dayRate,
    technicians,
    days,
    hoursPerDay,
    overtimeHoursPerDay,
    overtimeRate,
    baseTotal,
    overtimeTotal,
    total: baseTotal + overtimeTotal,
  };
}

export function createTrialHandler(options = {}) {
  const {
    stripeClient,
    mailTransport,
    config = process.env,
    chatPushStore = callChatPushStore,
  } = options;

  const stripe = stripeClient || (config.STRIPE_SECRET_KEY ? createStripeClient(config.STRIPE_SECRET_KEY) : null);
  const transporter = mailTransport || createMailTransport(config);
  const businessCardOrderHandler = createBusinessCardOrderHandler({
    stripeClient: stripe,
    mailTransport: transporter,
    config,
  });
  const businessChallengeHandler = createChallengeHandler({
    mailTransport: transporter,
    config,
  });
  const cleaningNetworkService = createCleaningNetworkService({
    mailTransport: transporter,
    config,
    idFactory: options.idFactory,
    now: options.now,
    rateLimiter: options.cleaningRateLimiter,
  });

  async function sendWelcomeEmail(to) {
    await transporter.sendMail({
      from: `"Thomas @ 3DVR.Tech" <${config.GMAIL_USER}>`,
      to,
      subject: 'Welcome to 3DVR.Tech!',
      html: `
        <div style="font-family: sans-serif; font-size: 16px;">
          <h2>Welcome to 3DVR.Tech!</h2>
          <p>You’ve started your free trial — no credit card required. Excited to have you on board!</p>
          <p>Let’s build something amazing together. If you have questions, reply to this email anytime.</p>
          <p>– Thomas</p>
        </div>
      `,
    });
  }

  async function notifyTeam(email) {
    const teamEmails = [
      'tmsteph1290@gmail.com',
      'abrandon055@gmail.com',
      'gamboaesai@gmail.com',
      'mark.wells3050@gmail.com',
      'davidmartinezr@hotmail.com'
    ];

    await transporter.sendMail({
      from: `"3DVR.Tech Bot" <${config.GMAIL_USER}>`,
      to: config.GMAIL_USER,
      bcc: teamEmails,
      subject: `New Free Trial Started: ${email}`,
      html: `<p><strong>${email}</strong> just signed up for a free trial.</p>`
    });
  }

  async function logStripeActivity(subject, payload) {
    if (!config.STRIPE_LOG_EMAIL) {
      return;
    }

    try {
      await transporter.sendMail({
        from: `"3DVR.Tech Stripe Logger" <${config.GMAIL_USER}>`,
        to: config.STRIPE_LOG_EMAIL,
        subject,
        text: JSON.stringify(payload, null, 2),
      });

      console.log(`Stripe activity logged automatically: ${subject}`);
    } catch (err) {
      console.error('Failed to log Stripe activity:', err.message);
    }
  }

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET' && String(req.query?.kind || '') === 'cleaning-partner') {
      return cleaningNetworkService.getPartnerProfile(req, res);
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        stripeConfigured: Boolean(config.STRIPE_SECRET_KEY),
        priceConfigured: Boolean(config.STRIPE_PRICE_ID),
        mailConfigured: Boolean(config.GMAIL_USER && config.GMAIL_APP_PASSWORD),
        chatPushPublicKey: String(config.CHAT_PUSH_VAPID_PUBLIC_KEY || ''),
        businessCardCheckout: getBusinessCardCheckoutConfig({
          stripeConfigured: Boolean(stripe),
          artworkUploadConfigured: Boolean(config.GMAIL_USER && config.GMAIL_APP_PASSWORD),
        }),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { email, kind, consent, source } = req.body || {};

    if (kind === 'business-challenge') {
      return businessChallengeHandler(req, res);
    }

    if (kind === 'business-card-order') {
      return businessCardOrderHandler(req, res);
    }

    if (kind === 'chat-push') {
      const action = String(req.body?.action || '');
      if (!['subscribe', 'unsubscribe'].includes(action)) {
        return res.status(400).json({ error: 'Invalid chat push action.' });
      }

      try {
        const result = await chatPushStore(action, req.body || {}, config);
        return res.status(200).json(result);
      } catch (error) {
        console.error('Chat push request failed:', error);
        return res.status(503).json({ error: 'Chat notifications are temporarily unavailable.' });
      }
    }

    if (kind === 'chat-message') {
      const action = String(req.body?.action || '');
      if (!['publish', 'sync'].includes(action)) {
        return res.status(400).json({ error: 'Invalid chat message action.' });
      }

      try {
        const result = await chatPushStore(action, req.body || {}, config);
        return res.status(200).json(result);
      } catch (error) {
        console.error('Chat message request failed:', error);
        return res.status(503).json({ error: 'Chat sync is temporarily unavailable.' });
      }
    }

    if (kind === 'cleaning-lead') {
      return cleaningNetworkService.handleLead(req, res);
    }

    if (kind === 'cleaning-partner-interest') {
      return cleaningNetworkService.handlePartnerInterest(req, res);
    }

    // Reuse this existing serverless route for booking intake so the public site
    // does not add another Vercel function. Requests are emailed privately and
    // are not written to public Gun nodes.
    if (kind === 'av-booking-request') {
      const honeyPot = normalizeLine(req.body?.companyWebsite, 200);
      if (honeyPot) {
        return res.status(200).json({ success: true });
      }

      const normalizedEmail = normalizeEmail(email);
      const name = normalizeLine(req.body?.name, 120);
      const company = normalizeLine(req.body?.company, 160);
      const phone = normalizeLine(req.body?.phone, 80);
      const eventDate = normalizeLine(req.body?.eventDate, 20);
      const venue = normalizeLine(req.body?.venue, 180);
      const role = normalizeLine(req.body?.role || 'AV technician', 120);
      const notes = normalizeLongText(req.body?.notes, 2000);
      const normalizedSource = normalizeLine(source || '3dvr.tech/hire-av', 160);

      if (!name || !normalizedEmail || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !venue) {
        return res.status(400).json({ error: 'Add your name, email, event date, and venue.' });
      }

      let estimate;
      try {
        estimate = calculateAvBookingEstimate(req.body || {});
      } catch {
        return res.status(400).json({ error: 'Check the crew size, days, hours, and technician level.' });
      }

      if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD) {
        return res.status(503).json({ error: 'Booking requests are temporarily unavailable.' });
      }

      const destination = normalizeEmail(config.OPERATOR_EMAIL_TO) || normalizeEmail(config.GMAIL_USER);
      const submittedAt = new Date().toISOString();
      const requestRecord = {
        type: 'av-booking-request',
        name,
        email: normalizedEmail,
        phone,
        company,
        eventDate,
        venue,
        role,
        source: normalizedSource,
        estimate: {
          label: estimate.label,
          dayRate: estimate.dayRate,
          technicians: estimate.technicians,
          days: estimate.days,
          hoursPerDay: estimate.hoursPerDay,
          overtimeHoursPerDay: estimate.overtimeHoursPerDay,
          total: estimate.total,
          currency: 'USD',
        },
        notes,
        submittedAt,
      };

      try {
        await transporter.sendMail({
          from: `"3DVR AV Booking" <${config.GMAIL_USER}>`,
          to: destination,
          replyTo: normalizedEmail,
          subject: `AV booking request: ${eventDate} · ${venue}`,
          text: JSON.stringify(requestRecord, null, 2),
          headers: {
            'X-3DVR-Request-Type': 'av-booking-request',
            'X-3DVR-Request-Source': normalizedSource,
          },
        });
        return res.status(200).json({
          success: true,
          estimate: estimate.total,
          currency: 'USD',
        });
      } catch (err) {
        console.error('AV booking request email failed:', err.message);
        return res.status(503).json({ error: 'Booking requests are temporarily unavailable.' });
      }
    }

    // Keep the blog form on an existing serverless route. The Hobby plan has a
    // function limit, and this route already has the configured mail transport.
    if (kind === 'blog-signup') {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedSource = String(source || 'blog').trim().slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || consent !== true) {
        return res.status(400).json({ error: 'Enter an email and check the box.' });
      }
      if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD) {
        return res.status(503).json({ error: 'Email is not ready yet.' });
      }
      const signedUpAt = new Date().toISOString();
      try {
        await saveNewsletterSubscriber({
          email: normalizedEmail,
          source: normalizedSource,
          consentedAt: signedUpAt,
          resubscribe: true
        }, config);
        await transporter.sendMail({
          from: `"3DVR Field Guide" <${config.GMAIL_USER}>`,
          to: normalizedEmail,
          replyTo: config.GMAIL_USER,
          subject: 'You are on the 3DVR list',
          text: `Hi,\n\nYou are on the list. You will get one short note each week.\n\nTo stop these emails, reply with unsubscribe.\n\n— Thomas / 3DVR`,
          headers: { 'List-Unsubscribe': `<mailto:${config.GMAIL_USER}?subject=unsubscribe>`, 'Precedence': 'bulk', 'X-3DVR-Blog-Signup': 'confirmed' }
        });
        await transporter.sendMail({
          from: `"3DVR Blog Signup" <${config.GMAIL_USER}>`,
          to: config.GMAIL_USER,
          subject: `Blog signup: ${normalizedEmail}`,
          text: JSON.stringify({ type: 'blog-signup', email: normalizedEmail, consent: true, source: normalizedSource, at: signedUpAt }),
          headers: { 'X-3DVR-Blog-Signup': 'record' }
        });
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('Blog signup failed:', err);
        return res.status(503).json({ error: 'Email is not ready yet. Please try again soon.' });
      }
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (!config.STRIPE_SECRET_KEY || !config.STRIPE_PRICE_ID) {
      return res.status(500).json({ error: 'Stripe configuration is missing.' });
    }

    try {
      console.log('📩 Creating customer for:', email);

      const existingCustomers = await stripe.customers.list({ email, limit: 1 });
      const customer = existingCustomers.data[0] || await stripe.customers.create({ email });

      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 1,
      });

      const alreadySubscribed = subs.data.some(sub => sub.status === 'active' || sub.status === 'trialing');

      if (alreadySubscribed) {
        return res.status(409).json({ error: 'You already have an active or trialing subscription.' });
      }

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: config.STRIPE_PRICE_ID }],
        trial_period_days: 14,
        payment_behavior: 'default_incomplete',
      });

      console.log('✅ Trial started:', subscription.id);

      await sendWelcomeEmail(email);
      await notifyTeam(email);
      await logStripeActivity('Trial subscription started', {
        email,
        subscriptionId: subscription.id,
        customerId: customer.id,
      });

      return res.status(200).json({ success: true, subscriptionId: subscription.id });
    } catch (err) {
      console.error('🔥 FINAL ERROR:', err);
      await logStripeActivity('Trial signup failed', {
        email,
        error: err.message,
        stack: err.stack,
      });
      return res.status(500).json({ error: err.message || 'Unexpected error occurred.' });
    }
  };
}

const handler = createTrialHandler();
export default handler;
