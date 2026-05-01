const https = require('https');
const nodemailer = require('nodemailer');

const SMTP_USER = process.env.ZOHO_SMTP_USER || 'admin@gblpeptides.com';
const SMTP_PASS = process.env.ZOHO_SMTP_PASS;

async function notifyTelegram(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  const data = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { name, email, message } = JSON.parse(event.body);

    if (!name || !email || !message) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'All fields required' }) };
    }

    // Send email to admin
    if (SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: 'smtppro.zoho.com',
        port: 465,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      });

      await transporter.sendMail({
        from: `"Glacier BioLabs Website" <${SMTP_USER}>`,
        to: SMTP_USER,
        replyTo: email,
        subject: `Contact Form: ${name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;padding:20px">
            <h2 style="color:#0f172a">New Contact Form Message</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Message:</strong></p>
            <div style="background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid #2563eb">
              ${message.replace(/\n/g, '<br>')}
            </div>
            <p style="color:#94a3b8;font-size:12px;margin-top:20px">Sent from gblpeptides.com contact form at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
          </div>`,
        text: `New Contact Form Message\n\nName: ${name}\nEmail: ${email}\nMessage: ${message}`
      });
    }

    // Telegram notification
    await notifyTelegram(
      `📬 <b>New Contact Form Message</b>\n\n` +
      `<b>Name:</b> ${name}\n` +
      `<b>Email:</b> ${email}\n` +
      `<b>Message:</b>\n${message.substring(0, 500)}`
    );

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('Contact form error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to send' }) };
  }
};
