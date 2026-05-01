const https = require('https');
const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SMTP_USER = process.env.ZOHO_SMTP_USER || 'admin@gblpeptides.com';
const SMTP_PASS = process.env.ZOHO_SMTP_PASS;

function supabaseRequest(path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const hostname = SUPABASE_URL.replace('https://', '');
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname, path, method,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        ...headers
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function sendEmail({ to, subject, html, text }) {
  if (!SMTP_PASS || !to) return;
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    await transporter.sendMail({
      from: `"Glacier BioLabs" <${SMTP_USER}>`,
      to, subject, html, text
    });
  } catch (e) { console.error('Email error:', e); }
}

function confirmationEmail(name, status, items, amount) {
  const isPaid = status === 'PAID';
  const title = isPaid ? 'Payment Confirmed ✓' : 'Order Received ✓';
  const statusMsg = isPaid
    ? `Your payment of <strong>$${amount}</strong> has been confirmed.`
    : `We've received your order for <strong>$${amount}</strong>. You'll receive a payment link shortly.`;

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
            <p style="color:#94a3b8;margin:12px 0 0;font-size:15px">Order confirmed and processing</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Hi ${name || 'there'},</p>
            <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6">${statusMsg}</p>
            ${items ? `<p style="margin:0 0 24px;font-size:14px;color:#64748b">Items: ${items}</p>` : ''}
            <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:8px">
              <p style="margin:0 0 12px;font-weight:700;color:#065f46;font-size:15px">📦 What happens next:</p>
              <ul style="margin:0;padding-left:20px;color:#065f46">
                <li style="margin-bottom:8px">Your order will be packaged and shipped within <strong>1–2 business days</strong></li>
                <li style="margin-bottom:8px">You'll receive tracking info via email once shipped</li>
                <li>Typical delivery: <strong>4–7 business days via USPS</strong></li>
              </ul>
            </div>
            <p style="margin:24px 0 0;font-size:14px;color:#64748b">Questions? Email us at <a href="mailto:admin@gblpeptides.com" style="color:#2563eb">admin@gblpeptides.com</a></p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0">
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a">Glacier BioLabs</p>
            <p style="margin:0;font-size:12px;color:#94a3b8">Research-Grade Compounds • For Laboratory Use Only</p>
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
    // Get orders that haven't had a confirmation email sent yet
    const result = await supabaseRequest(
      '/rest/v1/orders?select=*&confirmation_sent=eq.false&order=created_at.desc',
      'GET', {}, null
    );

    let orders = [];
    try { orders = JSON.parse(result.body); } catch (e) { orders = []; }

    if (!Array.isArray(orders)) {
      // Column might not exist yet — try without the filter
      const fallback = await supabaseRequest(
        '/rest/v1/orders?select=*&order=created_at.desc&limit=20',
        'GET', {}, null
      );
      try { orders = JSON.parse(fallback.body); } catch (e) { orders = []; }
      if (!Array.isArray(orders)) orders = [];
      // Filter to only recent orders (last 24h) that might need confirmation
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      orders = orders.filter(o => new Date(o.created_at).getTime() > cutoff);
    }

    let sent = 0;
    for (const order of orders) {
      if (!order.customer_email) continue;
      // Skip if already marked
      if (order.confirmation_sent === true) continue;

      const amount = order.amount_cents ? (order.amount_cents / 100).toFixed(2) : '0.00';
      const itemsStr = order.notes || '';

      await sendEmail({
        to: order.customer_email,
        subject: order.status === 'PAID' ? '✓ Order Confirmed — Glacier BioLabs' : '✓ Order Received — Glacier BioLabs',
        html: confirmationEmail(order.customer_name, order.status, itemsStr, amount),
        text: `Hi ${order.customer_name || 'there'}, your order for $${amount} has been ${order.status === 'PAID' ? 'confirmed' : 'received'}. Ships within 1-2 business days. Questions? admin@gblpeptides.com`
      });

      // Mark as sent
      await supabaseRequest(
        '/rest/v1/orders?id=eq.' + order.id,
        'PATCH',
        { 'Prefer': 'return=minimal' },
        { confirmation_sent: true }
      );
      sent++;
    }

    return { statusCode: 200, body: JSON.stringify({ processed: orders.length, sent }) };
  } catch (error) {
    console.error('Order confirmation error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
