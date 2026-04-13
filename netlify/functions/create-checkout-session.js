const https = require('https');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = process.env.URL || 'https://gblpeptides.com';

function sanitizeName() {
  return 'Item';
}

function stripeRequest(path, body) {
  return new Promise((resolve, reject) => {
    const formData = encodeBody(body);
    const req = https.request({
      hostname: 'api.stripe.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(formData);
    req.end();
  });
}

// Encode nested objects for Stripe's form-encoded API
function encodeBody(obj, prefix) {
  const parts = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      parts.push(encodeBody(val, fullKey));
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.join('&');
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

  if (!STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment system not configured' }) };
  }

  try {
    const { items, buyerEmail, buyerName, buyerPhone, shippingAddress, discountCode, discountPercent } = JSON.parse(event.body);

    if (!items || !items.length || !buyerEmail || !buyerName || !buyerPhone || !shippingAddress) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // Build line items with sanitized names
    const lineItems = {};
    items.forEach((item, i) => {
      const name = sanitizeName(item.slug, item.name);
      let unitAmount = item.price;

      // Apply discount per item if applicable
      if (discountPercent && discountPercent > 0) {
        unitAmount = Math.round(unitAmount * (1 - discountPercent / 100));
      }

      lineItems[`line_items[${i}][price_data][currency]`] = 'usd';
      lineItems[`line_items[${i}][price_data][product_data][name]`] = name;
      lineItems[`line_items[${i}][price_data][product_data][description]`] = 'Order item';
      lineItems[`line_items[${i}][price_data][unit_amount]`] = unitAmount;
      lineItems[`line_items[${i}][quantity]`] = item.quantity || item.qty || 1;
    });

    // Build metadata with original info (for our internal tracking)
    const itemSummary = items.map(i => `${i.name} x${i.quantity || i.qty || 1}`).join(', ');
    const shipAddr = `${shippingAddress.addressLine1}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}`;

    const body = {
      ...lineItems,
      mode: 'payment',
      'payment_method_types[0]': 'card',
      customer_email: buyerEmail,
      'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
      'shipping_options[0][shipping_rate_data][fixed_amount][amount]': 600,
      'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'usd',
      'shipping_options[0][shipping_rate_data][display_name]': 'Standard Shipping',
      success_url: `${SITE_URL}/#/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/#/shop`,
      'metadata[customer_name]': buyerName,
      'metadata[customer_phone]': buyerPhone,
      'metadata[shipping_address]': shipAddr,
      'metadata[items_summary]': itemSummary.substring(0, 500),
      'metadata[discount_code]': discountCode || '',
      'payment_intent_data[statement_descriptor]': 'GLACIER BIOLABS',
      'payment_intent_data[metadata][customer_name]': buyerName,
      'payment_intent_data[metadata][customer_phone]': buyerPhone,
      'payment_intent_data[metadata][shipping_address]': shipAddr,
    };

    const result = await stripeRequest('/v1/checkout/sessions', body);

    if (result.status !== 200 || !result.body.url) {
      console.error('Stripe error:', JSON.stringify(result.body));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create checkout session' }) };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ url: result.body.url, sessionId: result.body.id })
    };

  } catch (error) {
    console.error('Checkout error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create checkout' }) };
  }
};
