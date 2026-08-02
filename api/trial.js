import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import { saveNewsletterSubscriber } from './_lib/newsletter-store.js';
import { callChatPushStore } from './_lib/chat-push-store.js';

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

export function createTrialHandler(options = {}) {
  const { 
    stripeClient,
    mailTransport,
    config = process.env,
    chatPushStore = callChatPushStore,
  } = options;

  const stripe = stripeClient || (config.STRIPE_SECRET_KEY ? createStripeClient(config.STRIPE_SECRET_KEY) : null);
  const transporter = mailTransport || createMailTransport(config);

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

    if (req.method === 'GET') {
      return res.status(200).json({
        stripeConfigured: Boolean(config.STRIPE_SECRET_KEY),
        priceConfigured: Boolean(config.STRIPE_PRICE_ID),
        mailConfigured: Boolean(config.GMAIL_USER && config.GMAIL_APP_PASSWORD),
        chatPushPublicKey: String(config.CHAT_PUSH_VAPID_PUBLIC_KEY || ''),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { email, kind, consent, source } = req.body || {};

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
        // Postgres is the canonical subscriber ledger. The mailbox copy below
        // remains a recovery trail while the rest of the CRM moves off Gun.
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
        // A structured mailbox copy is the durable source while the optional
        // Gun CRM mirror is offline. The inbox worker can import it later.
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
