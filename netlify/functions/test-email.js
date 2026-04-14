const https = require('https');

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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (!MAILERSEND_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'MailerSend not configured' }) };
  }

  try {
    const result = await httpsPost('api.mailersend.com', '/v1/email', {
      'Authorization': `Bearer ${MAILERSEND_API_KEY}`
    }, {
      from: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: 'daner907@icloud.com', name: 'Test User' }],
      subject: 'GBL Email System Test',
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:sans-serif;padding:40px 20px">
          <h1 style="color:#2563eb">✅ Email System Working!</h1>
          <p>This is a test email from Glacier BioLabs.</p>
          <p><strong>What's configured:</strong></p>
          <ul>
            <li>Order confirmation emails</li>
            <li>Abandoned cart recovery (3-email flow)</li>
            <li>Discount codes: SAVE10 (10% off), SAVE20 (20% off)</li>
          </ul>
          <p style="color:#64748b;font-size:13px;margin-top:30px">Sent at: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
        </div>`,
      text: 'GBL Email System Test - All systems operational!'
    });

    if (result.status === 202 || result.status === 200) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, message: 'Test email sent to daner907@icloud.com' })
      };
    } else {
      console.error('MailerSend error:', result.body);
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'Email send failed', details: result.body })
      };
    }

  } catch (error) {
    console.error('Test email error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
