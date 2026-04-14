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
  const nodemailer = require('nodemailer');
  const SMTP_USER = process.env.ZOHO_SMTP_USER || 'admin@gblpeptides.com';
  const SMTP_PASS = process.env.ZOHO_SMTP_PASS;
  
  if (!SMTP_PASS || !email) return;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:40px 32px;text-align:center">
                  <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700">Payment Confirmed ✓</h1>
                  <p style="color:#94a3b8;margin:12px 0 0;font-size:15px">Order confirmed and processing</p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:32px">
                  <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Hi ${name || 'there'},</p>
                  <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6">Thank you for your order! Your payment of <strong style="color:#0f172a">$${amount}</strong> has been successfully processed.</p>
                  
                  <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:8px">
                    <p style="margin:0 0 12px;font-weight:700;color:#065f46;font-size:15px">📦 What happens next:</p>
                    <ul style="margin:0;padding-left:20px;color:#065f46">
                      <li style="margin-bottom:8px">Your order will be carefully packaged and shipped within <strong>1–2 business days</strong></li>
                      <li style="margin-bottom:8px">You'll receive tracking information via email as soon as your order ships</li>
                      <li>Typical delivery time: <strong>4–7 business days via USPS</strong></li>
                    </ul>
                  </div>
                  
                  <p style="margin:24px 0 0;font-size:14px;color:#64748b">Questions or concerns? We're here to help! Email us at <a href="mailto:admin@gblpeptides.com" style="color:#2563eb;text-decoration:none">admin@gblpeptides.com</a></p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0">
                  <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a">Glacier BioLabs</p>
                  <p style="margin:0;font-size:12px;color:#94a3b8">Research-Grade Compounds • For Laboratory Use Only</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: `"Glacier BioLabs" <${SMTP_USER}>`,
      to: email,
      subject: '✓ Order Confirmed — Glacier BioLabs',
      html,
      text: `Payment Confirmed!\n\nHi ${name || 'there'},\n\nYour payment of $${amount} has been confirmed.\n\nWhat happens next:\n• Your order ships within 1–2 business days\n• You'll receive tracking info via email\n• Typical delivery: 4–7 business days via USPS\n\nQuestions? Email admin@gblpeptides.com\n\nGlacier BioLabs`
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
      const customerPhone = metadata.customer_phone || 'N/A';
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
            customer_phone: customerPhone,
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
        `Phone: ${customerPhone}\n` +
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
