const https = require('https');

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID || 'LBQSYJSGKW87F';
const SQUARE_API_BASE = 'connect.squareupsandbox.com';

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

    await notifyOwner(
      `🎉 NEW SALE (Square)!\n\nAmount: $${(amount / 100).toFixed(2)}\nCustomer: ${customerName}\nEmail: ${buyerEmail || 'N/A'}\nShip to: ${shipTo}\nItems:\n${itemsList}\nPayment ID: ${payment.id}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`
    );

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
