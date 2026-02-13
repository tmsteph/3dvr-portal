import Stripe from 'stripe';
import nodemailer from 'nodemailer';

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
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { email } = req.body;

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
