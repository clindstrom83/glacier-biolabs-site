// Discount code validation function
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { code, originalAmount } = JSON.parse(event.body);

    if (!code || !originalAmount) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing code or amount' })
      };
    }

    const codeUpper = code.toUpperCase().trim();
    const amount = parseFloat(originalAmount);

    if (isNaN(amount) || amount <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid amount' })
      };
    }

    // Active discount codes
    const discounts = {
      'FEB15': {
        percent: 15,
        expires: new Date('2026-02-23T23:59:59-05:00'), // Feb 23, 2026 11:59 PM EST
        description: '15% off all orders'
      }
    };

    const discount = discounts[codeUpper];

    if (!discount) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          message: 'Invalid discount code'
        })
      };
    }

    // Check expiration
    const now = new Date();
    if (now > discount.expires) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          message: 'This discount code has expired'
        })
      };
    }

    // Calculate discount
    const discountAmount = amount * (discount.percent / 100);
    const finalAmount = amount - discountAmount;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        code: codeUpper,
        originalAmount: amount.toFixed(2),
        discountPercent: discount.percent,
        discountAmount: discountAmount.toFixed(2),
        finalAmount: finalAmount.toFixed(2),
        message: discount.description
      })
    };

  } catch (err) {
    console.error('Discount validation error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error' })
    };
  }
};
