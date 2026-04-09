const https = require('https');

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
  } catch (e) { console.error('Telegram error:', e); }
}

async function sendCustomerEmail({ email, name, items, totalCents, shippingAddress }) {
  if (!MAILERSEND_API_KEY || !email) return;

  const itemsList = (items || []).map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${i.quantity || i.qty || 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">$${((i.price * (i.quantity || i.qty || 1)) / 100).toFixed(2)}</td>
    </tr>`
  ).join('');

  const addr = shippingAddress ?
    [shippingAddress.addressLine1, shippingAddress.city, shippingAddress.state, shippingAddress.postalCode].filter(Boolean).join(', ') : 'N/A';

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:24px">Order Received! ✅</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px">We're processing your order</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e2e8f0">
        <p style="margin:0 0 16px">Hi ${name || 'there'},</p>
        <p style="margin:0 0 20px;color:#475569">Thank you for your order! We're currently upgrading our payment system to serve you better. In the meantime, we'll send you a secure payment link via email shortly to complete your purchase.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Item</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Total</th>
            </tr>
          </thead>
          <tbody>${itemsList}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:12px;font-weight:700;text-align:right;border-top:2px solid #e2e8f0">Total</td>
              <td style="padding:12px;font-weight:700;text-align:right;border-top:2px solid #e2e8f0">$${(totalCents / 100).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px">
          <p style="margin:0 0 4px;font-weight:700;font-size:13px;color:#64748b;text-transform:uppercase">Shipping To</p>
          <p style="margin:0;font-size:15px">${name || 'N/A'}<br>${addr}</p>
        </div>
        <div style="background:#fef3c7;border:1px solid #fbbf24;padding:16px;border-radius:8px;margin-bottom:20px">
          <p style="margin:0;font-weight:700;color:#92400e">What's next?</p>
          <ul style="margin:8px 0 0;padding-left:20px;color:#78350f;font-size:14px">
            <li>You'll receive a secure payment link via email within a few hours</li>
            <li>Once payment is confirmed, your order ships within 1–2 business days</li>
            <li>Typical delivery: 3–5 business days</li>
          </ul>
        </div>
        <p style="color:#64748b;font-size:13px;margin-top:20px">Questions? Email us at <a href="mailto:glacierbiolabs@outlook.com" style="color:#2563eb">glacierbiolabs@outlook.com</a></p>
      </div>
      <div style="background:#f8fafc;padding:20px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
        <p style="margin:0;font-size:12px;color:#94a3b8">Glacier BioLabs — Research-Grade Peptides</p>
      </div>
    </div>`;

  const text = `Order Received!\n\nHi ${name || 'there'},\n\nYour order of $${(totalCents / 100).toFixed(2)} has been received.\n\nItems:\n${(items || []).map(i => `- ${i.name} x${i.quantity || i.qty || 1}: $${((i.price * (i.quantity || i.qty || 1)) / 100).toFixed(2)}`).join('\n')}\n\nShipping to: ${addr}\n\nWe're upgrading our payment system — you'll receive a secure payment link via email within a few hours to complete your purchase.\n\nQuestions? Email glacierbiolabs@outlook.com\n\nGlacier BioLabs`;

  try {
    await httpsPost('api.mailersend.com', '/v1/email', {
      'Authorization': `Bearer ${MAILERSEND_API_KEY}`
    }, {
      from: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email, name: name || email }],
      subject: 'Order Received — Glacier BioLabs',
      html, text
    });
    console.log('✓ Order email sent to', email);
  } catch (e) { console.error('Email error:', e); }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { items, totalCents, buyerEmail, buyerName, shippingAddress } = JSON.parse(event.body);

    if (!buyerEmail || !buyerName || !shippingAddress || !shippingAddress.addressLine1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please fill out all fields' }) };
    }

    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    // Save to Supabase as PENDING_PAYMENT
    if (SUPABASE_SERVICE_KEY) {
      try {
        await httpsPost(SUPABASE_URL.replace('https://', ''), '/rest/v1/orders', {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        }, {
          payment_id: orderId,
          status: 'PENDING_PAYMENT',
          amount_cents: totalCents,
          currency: 'USD',
          customer_name: buyerName,
          customer_email: buyerEmail,
          shipping_address: shippingAddress.addressLine1,
          shipping_city: shippingAddress.city,
          shipping_state: shippingAddress.state,
          shipping_zip: shippingAddress.postalCode,
          items: items || [],
          receipt_url: null,
          notes: 'Manual payment — awaiting payment link'
        });
        console.log('✓ Order saved to Supabase');
      } catch (e) { console.error('Supabase error:', e); }
    }

    // Telegram notification
    const itemsList = (items || []).map(i => `  - ${i.name} x${i.quantity || i.qty || 1}: $${(i.price / 100).toFixed(2)}`).join('\n');
    const shipTo = `${shippingAddress.addressLine1}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}`;

    await notifyOwner(
      `🛒 NEW ORDER (Pending Payment)\n\nOrder: ${orderId}\nAmount: $${(totalCents / 100).toFixed(2)}\nCustomer: ${buyerName}\nEmail: ${buyerEmail}\nShip to: ${shipTo}\nItems:\n${itemsList}\n\n⚠️ Send payment link to customer!\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`
    );

    // Email customer
    await sendCustomerEmail({
      email: buyerEmail,
      name: buyerName,
      items, totalCents, shippingAddress
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, orderId })
    };
  } catch (error) {
    console.error('Order error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to place order. Please try again.' }) };
  }
};
