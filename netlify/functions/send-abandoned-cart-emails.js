const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'orders@gblpeptides.com';
const FROM_NAME = 'Glacier BioLabs';
const SITE_URL = process.env.URL || 'https://gblpeptides.com';

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

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function sendEmail({ email, subject, html, text }) {
  if (!MAILERSEND_API_KEY) return;
  try {
    await httpsPost('api.mailersend.com', '/v1/email', {
      'Authorization': `Bearer ${MAILERSEND_API_KEY}`
    }, {
      from: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email }],
      subject, html, text
    });
  } catch (e) { console.error('Email error:', e); }
}

async function getAbandonedCarts() {
  const result = await httpsGet(
    SUPABASE_URL.replace('https://', ''),
    '/rest/v1/abandoned_carts?select=*&recovered=eq.false&order=last_updated.desc',
    {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  );
  return JSON.parse(result.body);
}

async function updateCartEmailsSent(email, count) {
  await httpsPost(
    SUPABASE_URL.replace('https://', ''),
    '/rest/v1/abandoned_carts?email=eq.' + encodeURIComponent(email),
    {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal'
    },
    { emails_sent: count }
  );
}

exports.handler = async () => {
  if (!SUPABASE_SERVICE_KEY || !MAILERSEND_API_KEY) {
    return { statusCode: 500, body: 'Not configured' };
  }

  try {
    const carts = await getAbandonedCarts();
    const now = Date.now();

    for (const cart of carts) {
      const lastUpdated = new Date(cart.last_updated).getTime();
      const hoursSince = (now - lastUpdated) / (1000 * 60 * 60);
      const emailsSent = cart.emails_sent || 0;

      // Email 1: 1 hour after abandonment (no code)
      if (hoursSince >= 1 && hoursSince < 2 && emailsSent === 0) {
        await sendEmail({
          email: cart.email,
          subject: 'You left something behind...',
          html: `
            <div style="max-width:600px;margin:0 auto;font-family:sans-serif">
              <h2>Still thinking it over?</h2>
              <p>Hi there,</p>
              <p>You left some items in your cart at Glacier BioLabs. We've saved them for you:</p>
              <p><strong>Total: $${(cart.total_cents / 100).toFixed(2)}</strong></p>
              <p><a href="${SITE_URL}/#/shop" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Complete Your Order</a></p>
              <p style="color:#64748b;font-size:13px">Questions? Reply to this email.</p>
            </div>`,
          text: `You left items in your cart at Glacier BioLabs. Complete your order: ${SITE_URL}/#/shop`
        });
        await updateCartEmailsSent(cart.email, 1);
      }

      // Email 2: 12 hours later (10% off)
      if (hoursSince >= 12 && hoursSince < 13 && emailsSent === 1) {
        await sendEmail({
          email: cart.email,
          subject: '10% off your order - just for you',
          html: `
            <div style="max-width:600px;margin:0 auto;font-family:sans-serif">
              <h2>Here's 10% off to help you decide</h2>
              <p>Hi there,</p>
              <p>We noticed you didn't complete your order. Here's a special discount just for you:</p>
              <div style="background:#f0fdf4;border:2px solid #10b981;padding:20px;text-align:center;border-radius:12px;margin:20px 0">
                <div style="font-size:32px;font-weight:900;color:#065f46">SAVE10</div>
                <div style="color:#065f46;margin-top:8px">Use code at checkout for 10% off</div>
              </div>
              <p><strong>Your cart: $${(cart.total_cents / 100).toFixed(2)}</strong></p>
              <p><a href="${SITE_URL}/#/shop" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Complete Your Order</a></p>
            </div>`,
          text: `10% off your Glacier BioLabs order! Use code SAVE10 at checkout: ${SITE_URL}/#/shop`
        });
        await updateCartEmailsSent(cart.email, 2);
      }

      // Email 3: 24 hours later (20% off - final)
      if (hoursSince >= 24 && hoursSince < 25 && emailsSent === 2) {
        await sendEmail({
          email: cart.email,
          subject: 'Last chance: 20% off your order',
          html: `
            <div style="max-width:600px;margin:0 auto;font-family:sans-serif">
              <h2>Final reminder: 20% off 🎁</h2>
              <p>Hi there,</p>
              <p>This is your last reminder. We're offering you our best discount:</p>
              <div style="background:#fef3c7;border:2px solid#fbbf24;padding:20px;text-align:center;border-radius:12px;margin:20px 0">
                <div style="font-size:32px;font-weight:900;color:#92400e">SAVE20</div>
                <div style="color:#78350f;margin-top:8px">20% off - expires in 24 hours</div>
              </div>
              <p><strong>Your cart: $${(cart.total_cents / 100).toFixed(2)}</strong></p>
              <p><a href="${SITE_URL}/#/shop" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Complete Your Order Now</a></p>
              <p style="color:#dc2626;font-weight:bold">This is our final email about this cart.</p>
            </div>`,
          text: `FINAL CHANCE: 20% off your Glacier BioLabs order! Use code SAVE20: ${SITE_URL}/#/shop`
        });
        await updateCartEmailsSent(cart.email, 3);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ processed: carts.length }) };
  } catch (error) {
    console.error('Abandoned cart email error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
