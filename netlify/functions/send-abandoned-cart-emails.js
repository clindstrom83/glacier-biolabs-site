const https = require('https');
const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SMTP_USER = process.env.ZOHO_SMTP_USER || 'admin@gblpeptides.com';
const SMTP_PASS = process.env.ZOHO_SMTP_PASS;
const SITE_URL = process.env.URL || 'https://gblpeptides.com';

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

async function sendEmail({ to, subject, html, text }) {
  if (!SMTP_PASS) return;
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: `"Glacier BioLabs" <${SMTP_USER}>`,
      to,
      subject,
      html,
      text
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

function emailTemplate({ title, message, ctaText, ctaUrl, code, codeDesc }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:40px 32px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700">${title}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 20px;font-size:16px;color:#475569;line-height:1.6">${message}</p>
            ${code ? `
            <div style="background:#f0fdf4;border:2px solid #10b981;padding:24px;margin:24px 0;text-align:center;border-radius:12px">
              <p style="margin:0 0 8px;font-size:14px;color:#065f46;font-weight:600;text-transform:uppercase">Your Discount Code</p>
              <div style="font-size:32px;font-weight:900;color:#065f46;letter-spacing:2px;margin:8px 0">${code}</div>
              <p style="margin:8px 0 0;color:#065f46;font-size:14px">${codeDesc}</p>
            </div>` : ''}
            <div style="text-align:center;margin-top:32px">
              <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:16px 48px;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px">${ctaText}</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0">
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a">Glacier BioLabs</p>
            <p style="margin:0;font-size:12px;color:#94a3b8">Research-Grade Compounds</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.handler = async () => {
  if (!SUPABASE_SERVICE_KEY || !SMTP_PASS) {
    return { statusCode: 500, body: 'Not configured' };
  }

  try {
    const carts = await getAbandonedCarts();
    const now = Date.now();

    for (const cart of carts) {
      const lastUpdated = new Date(cart.last_updated).getTime();
      const hoursSince = (now - lastUpdated) / (1000 * 60 * 60);
      const emailsSent = cart.emails_sent || 0;

      // Email 1: 1 hour (reminder, no code)
      if (hoursSince >= 1 && hoursSince < 2 && emailsSent === 0) {
        await sendEmail({
          to: cart.email,
          subject: 'You left something behind...',
          html: emailTemplate({
            title: 'Complete Your Order',
            message: `You left items in your cart worth <strong>$${(cart.total_cents / 100).toFixed(2)}</strong>. We've saved them for you — complete your order now before they're gone!`,
            ctaText: 'Complete Your Order',
            ctaUrl: `${SITE_URL}/#/shop`
          }),
          text: `You left items in your cart at Glacier BioLabs ($${(cart.total_cents / 100).toFixed(2)}). Complete your order: ${SITE_URL}/#/shop`
        });
        await updateCartEmailsSent(cart.email, 1);
      }

      // Email 2: 12 hours (10% off)
      if (hoursSince >= 12 && hoursSince < 13 && emailsSent === 1) {
        await sendEmail({
          to: cart.email,
          subject: '10% off your order — just for you',
          html: emailTemplate({
            title: 'Here's 10% Off',
            message: `We noticed you didn't complete your order. Here's a special discount to help you decide:`,
            code: 'SAVE10',
            codeDesc: 'Use at checkout for 10% off',
            ctaText: 'Shop Now & Save',
            ctaUrl: `${SITE_URL}/#/shop`
          }),
          text: `10% off your Glacier BioLabs order! Use code SAVE10 at checkout: ${SITE_URL}/#/shop`
        });
        await updateCartEmailsSent(cart.email, 2);
      }

      // Email 3: 24 hours (20% off - final)
      if (hoursSince >= 24 && hoursSince < 25 && emailsSent === 2) {
        await sendEmail({
          to: cart.email,
          subject: 'Last chance: 20% off your order',
          html: emailTemplate({
            title: 'Final Reminder: 20% Off',
            message: `This is your last reminder. We're offering you our <strong>best discount ever</strong> — but this offer expires in 24 hours.`,
            code: 'SAVE20',
            codeDesc: '20% off — expires in 24 hours!',
            ctaText: 'Claim Your Discount Now',
            ctaUrl: `${SITE_URL}/#/shop`
          }),
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
