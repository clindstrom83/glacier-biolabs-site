const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'orders@gblpeptides.com';
const FROM_NAME = 'Glacier BioLabs';

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID || 'LFWWTP3HWZPC2';
const SQUARE_API_BASE = 'connect.squareup.com';

function squareRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const options = {
      hostname: SQUARE_API_BASE,
      path: path,
      method: method,
      headers: {
        'Square-Version': '2024-12-18',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject({ statusCode: res.statusCode, body: parsed });
        } catch (e) { reject({ statusCode: res.statusCode, body: responseData }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function notifyOwner(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return false;
  return new Promise((resolve) => {
    const data = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = https.request(options, (res) => {
      let r = '';
      res.on('data', c => r += c);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

async function sendOrderConfirmation({ email, name, items, totalCents, shippingAddress, paymentId, receiptUrl }) {
  if (!MAILERSEND_API_KEY || !email) return;

  const itemsHTML = (items || []).map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">$${((i.price * i.qty) / 100).toFixed(2)}</td>
    </tr>`
  ).join('');

  const address = shippingAddress ?
    [shippingAddress.addressLine1, shippingAddress.city, shippingAddress.state, shippingAddress.postalCode].filter(Boolean).join(', ') :
    'N/A';

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:24px">Order Confirmed! ✅</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px">Thank you for your purchase</p>
      </div>

      <div style="background:#fff;padding:24px;border:1px solid #e2e8f0">
        <p style="margin:0 0 16px">Hi ${name || 'there'},</p>
        <p style="margin:0 0 20px;color:#475569">Your order has been received and is being processed. Here's your order summary:</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Item</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:12px;font-weight:700;text-align:right;border-top:2px solid #e2e8f0">Total</td>
              <td style="padding:12px;font-weight:700;text-align:right;border-top:2px solid #e2e8f0">$${(totalCents / 100).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px">
          <p style="margin:0 0 4px;font-weight:700;font-size:13px;color:#64748b;text-transform:uppercase">Shipping To</p>
          <p style="margin:0;font-size:15px">${name || 'N/A'}<br>${address}</p>
        </div>

        <div style="background:#f0fdf4;border:1px solid #86efac;padding:16px;border-radius:8px;margin-bottom:20px">
          <p style="margin:0;font-weight:700;color:#16a34a">What's next?</p>
          <ul style="margin:8px 0 0;padding-left:20px;color:#15803d;font-size:14px">
            <li>Your order will ship within 1–2 business days</li>
            <li>You'll receive tracking info once shipped</li>
            <li>Typical delivery: 3–5 business days</li>
          </ul>
        </div>

        ${receiptUrl ? `<p style="text-align:center;margin:16px 0"><a href="${receiptUrl}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">View Receipt</a></p>` : ''}

        <p style="color:#64748b;font-size:13px;margin-top:20px">Payment ID: ${paymentId || 'N/A'}</p>
      </div>

      <div style="background:#f8fafc;padding:20px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
        <p style="margin:0;font-size:13px;color:#64748b">Questions? Email us at <a href="mailto:glacierbiolabs@outlook.com" style="color:#2563eb">glacierbiolabs@outlook.com</a></p>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Glacier BioLabs — Research-Grade Peptides</p>
      </div>
    </div>
  `;

  const emailData = JSON.stringify({
    from: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: email, name: name || email }],
    subject: 'Order Confirmed — Glacier BioLabs',
    html: html,
    text: `Order Confirmed!\n\nHi ${name || 'there'},\n\nThank you for your order of $${(totalCents / 100).toFixed(2)}.\n\nItems:\n${(items || []).map(i => `- ${i.name} x${i.qty}: $${((i.price * i.qty) / 100).toFixed(2)}`).join('\n')}\n\nShipping to: ${address}\n\nYour order will ship within 1-2 business days.\n\nQuestions? Email glacierbiolabs@outlook.com\n\nGlacier BioLabs`
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.mailersend.com',
      path: '/v1/email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAILERSEND_API_KEY}`,
        'Content-Length': Buffer.byteLength(emailData)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✓ Order confirmation email sent to', email);
        } else {
          console.error('MailerSend error:', res.statusCode, d);
        }
        resolve();
      });
    });
    req.on('error', (e) => { console.error('MailerSend request error:', e); resolve(); });
    req.write(emailData);
    req.end();
  });
}

function generateIdempotencyKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
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
  if (!SQUARE_ACCESS_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment configuration error' }) };

  try {
    const { sourceId, amount, currency, items, buyerEmail, buyerName, shippingAddress } = JSON.parse(event.body);
    if (!sourceId || !amount) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing payment source or amount' }) };

    const paymentBody = {
      idempotency_key: generateIdempotencyKey(),
      source_id: sourceId,
      amount_money: { amount: Math.round(amount), currency: currency || 'USD' },
      location_id: SQUARE_LOCATION_ID,
      autocomplete: true
    };
    if (buyerEmail) paymentBody.buyer_email_address = buyerEmail;
    if (items && items.length > 0) paymentBody.note = `Order: ${items.map(i => `${i.name} x${i.qty}`).join(', ')}`;
    if (shippingAddress) {
      paymentBody.shipping_address = {
        address_line_1: shippingAddress.addressLine1 || '',
        address_line_2: shippingAddress.addressLine2 || '',
        locality: shippingAddress.city || '',
        administrative_district_level_1: shippingAddress.state || '',
        postal_code: shippingAddress.postalCode || '',
        country: shippingAddress.country || 'US',
        first_name: shippingAddress.firstName || '',
        last_name: shippingAddress.lastName || ''
      };
    }

    const result = await squareRequest('/v2/payments', 'POST', paymentBody);
    const payment = result.payment;

    const itemsList = items ? items.map(i => `  - ${i.name} x${i.qty}: $${(i.price / 100).toFixed(2)}`).join('\n') : 'N/A';
    const customerName = buyerName || (shippingAddress ? `${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}`.trim() : 'N/A');
    const shipTo = shippingAddress ? `${shippingAddress.addressLine1 || ''}, ${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.postalCode || ''}` : 'N/A';

    // Save order to Supabase
    if (SUPABASE_SERVICE_KEY) {
      try {
        const orderData = JSON.stringify({
          payment_id: payment.id,
          status: payment.status,
          amount_cents: Math.round(amount),
          currency: currency || 'USD',
          customer_name: buyerName || customerName,
          customer_email: buyerEmail || null,
          shipping_address: shippingAddress ? shippingAddress.addressLine1 : null,
          shipping_city: shippingAddress ? shippingAddress.city : null,
          shipping_state: shippingAddress ? shippingAddress.state : null,
          shipping_zip: shippingAddress ? shippingAddress.postalCode : null,
          items: items || [],
          receipt_url: payment.receipt_url || null
        });
        await new Promise((resolve) => {
          const req = https.request({
            hostname: SUPABASE_URL.replace('https://', ''),
            path: '/rest/v1/orders',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Prefer': 'return=minimal',
              'Content-Length': Buffer.byteLength(orderData)
            }
          }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log('✓ Order saved to Supabase');
              } else {
                console.error('Supabase insert error:', res.statusCode, d);
              }
              resolve();
            });
          });
          req.on('error', (e) => { console.error('Supabase request error:', e); resolve(); });
          req.write(orderData);
          req.end();
        });
      } catch (e) {
        console.error('Failed to save order to Supabase:', e);
      }
    }

    await notifyOwner(
      `🎉 NEW SALE (Square)!\n\nAmount: $${(amount / 100).toFixed(2)}\nCustomer: ${customerName}\nEmail: ${buyerEmail || 'N/A'}\nShip to: ${shipTo}\nItems:\n${itemsList}\nPayment ID: ${payment.id}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`
    );

    // Send order confirmation email
    await sendOrderConfirmation({
      email: buyerEmail,
      name: buyerName || customerName,
      items: items,
      totalCents: Math.round(amount),
      shippingAddress: shippingAddress,
      paymentId: payment.id,
      receiptUrl: payment.receipt_url
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, paymentId: payment.id, status: payment.status, receiptUrl: payment.receipt_url })
    };
  } catch (error) {
    console.error('Payment error:', error);
    const errorMessage = error.body && error.body.errors ? error.body.errors.map(e => e.detail).join(', ') : (error.message || 'Payment processing failed');
    return { statusCode: error.statusCode || 500, headers, body: JSON.stringify({ error: errorMessage }) };
  }
};
