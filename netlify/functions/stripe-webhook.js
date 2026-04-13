const https = require('https');
const crypto = require('crypto');

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'orders@gblpeptides.com';
const FROM_NAME = 'Glacier BioLabs';

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function notifyOwner(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  try {
    await httpsPost('api.telegram.org', `/bot${botToken}/sendMessage`, {}, {
      chat_id: chatId, text: message, parse_mode: 'HTML'
    });
  } catch (e) { console.error('Telegram notify error:', e); }
}

async function sendConfirmationEmail({ email, name, amount, items }) {
  if (!MAILERSEND_API_KEY || !email) return;
  
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:24px">Payment Confirmed! ✅</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px">Your order is being prepared for shipment</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e2e8f0">
        <p>Hi ${name || 'there'},</p>
        <p>Your payment of <strong>$${amount}</strong> has been confirmed. We're preparing your order for shipment.</p>
        <p><strong>What's next:</strong></p>
        <ul>
          <li>Your order ships within 1–2 business days</li>
          <li>You'll receive tracking info via email</li>
          <li>Typical delivery: 3–5 business days</li>
        </ul>
        <p style="color:#64748b;font-size:13px;margin-top:20px">Questions? Email us at <a href="mailto:glacierbiolabs@outlook.com">glacierbiolabs@outlook.com</a></p>
      </div>
      <div style="background:#f8fafc;padding:20px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
        <p style="margin:0;font-size:12px;color:#94a3b8">Glacier BioLabs — Research-Grade Compounds</p>
      </div>
    </div>`;

  try {
    await httpsPost('api.mailersend.com', '/v1/email', {
      'Authorization': `Bearer ${MAILERSEND_API_KEY}`
    }, {
      from: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email, name: name || email }],
      subject: 'Payment Confirmed — Glacier BioLabs',
      html,
      text: `Payment Confirmed!\n\nHi ${name || 'there'},\n\nYour payment of $${amount} has been confirmed. Your order ships within 1-2 business days.\n\nQuestions? Email glacierbiolabs@outlook.com\n\nGlacier BioLabs`
    });
  } catch (e) { console.error('Email error:', e); }
}

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!secret) return true; // Skip verification if no secret configured
  
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  const timestamp = parts['t'];
  const signature = parts['v1'];
  
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const sig = event.headers['stripe-signature'];
    
    // Verify webhook signature if secret is configured
    if (STRIPE_WEBHOOK_SECRET && sig) {
      const valid = verifyStripeSignature(event.body, sig, STRIPE_WEBHOOK_SECRET);
      if (!valid) {
        console.error('Invalid Stripe signature');
        return { statusCode: 400, body: 'Invalid signature' };
      }
    }

    const stripeEvent = JSON.parse(event.body);

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const metadata = session.metadata || {};
      const amount = (session.amount_total / 100).toFixed(2);
      const customerEmail = session.customer_email || session.customer_details?.email;
      const customerName = metadata.customer_name || session.customer_details?.name || 'Unknown';
      const shippingAddress = metadata.shipping_address || 'N/A';
      const itemsSummary = metadata.items_summary || 'N/A';
      const discountCode = metadata.discount_code || '';

      // Save to Supabase
      if (SUPABASE_SERVICE_KEY) {
        try {
          await httpsPost(SUPABASE_URL.replace('https://', ''), '/rest/v1/orders', {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=minimal'
          }, {
            payment_id: session.payment_intent || session.id,
            status: 'PAID',
            amount_cents: session.amount_total,
            currency: 'USD',
            customer_name: customerName,
            customer_email: customerEmail,
            shipping_address: shippingAddress,
            items: [],
            receipt_url: session.url || null,
            notes: `Stripe checkout | ${discountCode ? 'Discount: ' + discountCode : 'No discount'} | Items: ${itemsSummary}`
          });
        } catch (e) { console.error('Supabase error:', e); }
      }

      // Telegram notification
      await notifyOwner(
        `💰 PAYMENT RECEIVED (Stripe)\n\n` +
        `Amount: $${amount}\n` +
        `Customer: ${customerName}\n` +
        `Email: ${customerEmail}\n` +
        `Ship to: ${shippingAddress}\n` +
        `Items: ${itemsSummary}\n` +
        `${discountCode ? 'Discount: ' + discountCode + '\n' : ''}` +
        `Stripe ID: ${session.payment_intent || session.id}\n` +
        `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}\n\n` +
        `✅ Payment confirmed — ship this order!`
      );

      // Send confirmation email
      await sendConfirmationEmail({
        email: customerEmail,
        name: customerName,
        amount,
        items: itemsSummary
      });
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 500, body: 'Webhook processing failed' };
  }
};
