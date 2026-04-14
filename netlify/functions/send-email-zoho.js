const nodemailer = require('nodemailer');

const SMTP_HOST = 'smtp.zoho.com';
const SMTP_PORT = 465;
const SMTP_USER = process.env.ZOHO_SMTP_USER || 'admin@arcticlabsupply.com';
const SMTP_PASS = process.env.ZOHO_SMTP_PASS;
const FROM_EMAIL = SMTP_USER;
const FROM_NAME = 'Glacier BioLabs';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (!SMTP_PASS) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SMTP not configured' }) };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: 'daner907@icloud.com',
      subject: 'GBL Email System Test (Zoho)',
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:sans-serif;padding:40px 20px">
          <h1 style="color:#2563eb">✅ Zoho Email Working!</h1>
          <p>This is a test email from Glacier BioLabs using Zoho Mail.</p>
          <p><strong>What's configured:</strong></p>
          <ul>
            <li>Order confirmation emails</li>
            <li>Abandoned cart recovery (3-email flow)</li>
            <li>Discount codes: SAVE10 (10% off), SAVE20 (20% off)</li>
          </ul>
          <p style="color:#64748b;font-size:13px;margin-top:30px">Sent via Zoho SMTP at: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
        </div>`,
      text: 'GBL Email System Test (Zoho) - All systems operational!'
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, message: 'Test email sent to daner907@icloud.com', messageId: info.messageId })
    };

  } catch (error) {
    console.error('Email error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
