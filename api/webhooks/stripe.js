import Stripe from 'stripe';
import nodemailer from 'nodemailer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function logStripeEvent(event, context = {}) {
  if (!process.env.STRIPE_LOG_EMAIL) {
    return;
  }

  try {
    const summary = {
      id: event.id,
      type: event.type,
      created: event.created,
      ...context,
    };

    await transporter.sendMail({
      from: `"3DVR.Tech Stripe Logger" <${process.env.GMAIL_USER}>`,
      to: process.env.STRIPE_LOG_EMAIL,
      subject: `[Stripe] ${event.type}`,
      text: JSON.stringify({ summary, event }, null, 2),
    });

    console.log(`Stripe event logged automatically: ${event.type}`);
  } catch (err) {
    console.error('Failed to send Stripe log email:', err.message);
  }
}

async function sendWelcomeEmail(to) {
  try {
    const info = await transporter.sendMail({
      from: `"Thomas @ 3DVR.Tech" <${process.env.GMAIL_USER}>`,
      to,
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
      `,
    });
    console.log(`Welcome email sent to ${to}`, info.messageId);
  } catch (err) {
    console.error(`Failed to send welcome email to ${to}:`, err.message);
  }
}

async function notifyTeam(newUserEmail) {
  const team = [
    'tmsteph1290@gmail.com',
    'abrandon055@gmail.com',
    'gamboaesai@gmail.com',
    'mark.wells3050@gmail.com',
    'davidmartinezr@hotmail.com'
    // Add Bodhi when you find the correct email
  ];

  try {
    const info = await transporter.sendMail({
      from: `"3DVR.Tech Subscription Notifier" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      bcc: team,
      subject: `New Subscriber: ${newUserEmail}`,
      html: `<p>A new user just subscribed: <strong>${newUserEmail}</strong></p>`,
    });
    console.log(`Team notified of new subscriber ${newUserEmail}`, info.messageId);
  } catch (err) {
    console.error(`Failed to notify team:`, err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody.toString(),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  await logStripeEvent(event, { receivedAt: new Date().toISOString() });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;

    console.log('Stripe session:', JSON.stringify(session, null, 2));

    if (email) {
      console.log('New subscriber:', email);
      await sendWelcomeEmail(email);
      await notifyTeam(email);
    } else {
      console.warn('No email found in session.customer_details');
    }
  }

  res.status(200).json({ received: true });
}
