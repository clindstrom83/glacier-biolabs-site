const https = require('https');
const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SMTP_USER = process.env.ZOHO_SMTP_USER || 'admin@gblpeptides.com';
const SMTP_PASS = process.env.ZOHO_SMTP_PASS;
const ZOHO_IMAP_HOST = 'imappro.zoho.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Knowledge base for auto-responses
const KNOWLEDGE_BASE = `
You are the customer support agent for Glacier BioLabs (gblpeptides.com), a research peptide supplier.

COMPANY INFO:
- We sell research-grade peptides and compounds for laboratory use only
- All products are NOT for human or veterinary consumption
- Website: gblpeptides.com
- Support email: admin@gblpeptides.com

PRODUCTS:
- Retatrutide (10 mg) - $104.99
- GHK-Cu (Copper Peptide) 50 mg - $74.99
- Melanotan II (10 mg) - $49.99
- BPC-157 (10 mg) - $74.99
- Bacteriostatic Water (10 mL) - $11.99
- Sermorelin (10 mg) - $64.99
- Tesamorelin (10 mg) - price on site
- Ipamorelin (10 mg) - price on site
- MOTS-c (10 mg) - price on site
- Klow Blend - price on site

SHIPPING:
- Ships within 1-2 business days
- USPS standard shipping, 4-7 business days delivery
- Shipping cost: $6.00 flat rate
- US only
- Tracking provided via email once shipped

PAYMENT:
- We accept credit/debit cards via secure Stripe checkout
- All payments processed securely

RETURNS/REFUNDS:
- Contact us at admin@gblpeptides.com for any issues
- We handle returns/refunds on a case-by-case basis
- If product arrives damaged, we will replace it

CERTIFICATES OF ANALYSIS (COA):
- All products have COAs available on their product pages
- Third-party tested for purity and identity

DISCOUNT CODES:
- Check our website for current promotions
- Sign up for our newsletter for exclusive discounts

RULES FOR RESPONDING:
1. Be professional, friendly, and concise
2. Always remind customers products are for research use only
3. Never make health claims or suggest human use
4. If asked about dosing/administration for humans, politely decline and state products are for research only
5. If the question is about an existing order (tracking, status, issues), flag it for human review
6. Sign emails as "Glacier BioLabs Support Team"
7. Keep responses under 150 words
8. If you're not confident in the answer, flag for human review
`;

function imapFetch(host, port, user, pass, folder, limit) {
  return new Promise((resolve, reject) => {
    const tls = require('tls');
    const socket = tls.connect(port, host, { rejectUnauthorized: true });
    let buffer = '';
    let emails = [];
    let step = 0;
    let msgData = '';
    let collecting = false;
    let currentUid = null;

    const commands = [
      `a001 LOGIN ${user} ${pass}`,
      `a002 SELECT "${folder}"`,
      `a003 SEARCH UNSEEN`,
    ];

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (step === 0 && line.includes('OK')) {
          socket.write(commands[0] + '\r\n');
          step = 1;
        } else if (step === 1 && line.includes('a001 OK')) {
          socket.write(commands[1] + '\r\n');
          step = 2;
        } else if (step === 2 && line.includes('a002 OK')) {
          socket.write(commands[2] + '\r\n');
          step = 3;
        } else if (step === 3 && line.startsWith('* SEARCH')) {
          const uids = line.replace('* SEARCH', '').trim().split(' ').filter(Boolean);
          if (uids.length === 0) {
            socket.write('a099 LOGOUT\r\n');
            step = 99;
            resolve([]);
            return;
          }
          // Fetch the unseen messages (limit to most recent)
          const fetchUids = uids.slice(-limit).join(',');
          socket.write(`a004 FETCH ${fetchUids} (UID FLAGS BODY[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] BODY[TEXT])\r\n`);
          step = 4;
        } else if (step === 3 && line.includes('a003 OK')) {
          // No unseen messages found
          socket.write('a099 LOGOUT\r\n');
          step = 99;
          resolve([]);
        } else if (step === 4) {
          if (line.includes('a004 OK')) {
            socket.write('a099 LOGOUT\r\n');
            step = 99;
            resolve(emails);
          } else if (line.startsWith('* ') && line.includes('FETCH')) {
            if (msgData) {
              emails.push(parseEmail(msgData));
            }
            msgData = line + '\n';
            const uidMatch = line.match(/UID (\d+)/);
            currentUid = uidMatch ? uidMatch[1] : null;
          } else {
            msgData += line + '\n';
          }
        }
      }
    });

    socket.on('end', () => {
      if (msgData) emails.push(parseEmail(msgData));
      resolve(emails);
    });

    socket.on('error', (err) => reject(err));
    
    setTimeout(() => {
      try { socket.end(); } catch(e) {}
      resolve(emails);
    }, 25000);
  });
}

function parseEmail(raw) {
  const fromMatch = raw.match(/From:\s*(.+)/i);
  const subjectMatch = raw.match(/Subject:\s*(.+)/i);
  const dateMatch = raw.match(/Date:\s*(.+)/i);
  const msgIdMatch = raw.match(/Message-ID:\s*(.+)/i);
  
  // Extract body (everything after the headers)
  const parts = raw.split(/\r?\n\r?\n/);
  const body = parts.slice(1).join('\n').replace(/\)$/, '').trim();

  return {
    from: fromMatch ? fromMatch[1].trim() : 'unknown',
    subject: subjectMatch ? subjectMatch[1].trim() : 'No subject',
    date: dateMatch ? dateMatch[1].trim() : '',
    messageId: msgIdMatch ? msgIdMatch[1].trim() : '',
    body: body.substring(0, 2000) // Limit body size
  };
}

function extractEmail(fromStr) {
  const match = fromStr.match(/<(.+?)>/) || fromStr.match(/([^\s<>]+@[^\s<>]+)/);
  return match ? match[1] : fromStr;
}

async function getAIResponse(email) {
  if (!OPENAI_API_KEY) return null;

  const prompt = `${KNOWLEDGE_BASE}

CUSTOMER EMAIL:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Respond to this customer email. If you need to flag it for human review (order issues, complex questions, complaints), respond with exactly "FLAG_FOR_HUMAN" followed by a brief reason.
Otherwise, write a professional email response.`;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.3
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          resolve(json.choices[0].message.content);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function sendReply({ to, subject, html, text }) {
  if (!SMTP_PASS || !to) return;
  const transporter = nodemailer.createTransport({
    host: 'smtppro.zoho.com',
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await transporter.sendMail({
    from: `"Glacier BioLabs Support" <${SMTP_USER}>`,
    to, subject, html, text
  });
}

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
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

async function supabasePost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: SUPABASE_URL.replace('https://', ''),
      path, method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Prefer': 'return=minimal'
      }
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

function responseToHtml(text) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:24px 32px;text-align:center">
            <h2 style="color:#fff;margin:0;font-size:20px;font-weight:700">Glacier BioLabs</h2>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            ${text.split('\n').map(p => `<p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.6">${p}</p>`).join('')}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0">
            <p style="margin:0;font-size:12px;color:#94a3b8">Glacier BioLabs • Research-Grade Compounds • gblpeptides.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.handler = async () => {
  if (!SMTP_PASS || !OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Not configured' }) };
  }

  try {
    // Fetch unread emails via IMAP
    const emails = await imapFetch(
      ZOHO_IMAP_HOST, 993, SMTP_USER, SMTP_PASS, 'INBOX', 10
    );

    if (!emails || emails.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No new emails', processed: 0 }) };
    }

    let processed = 0;
    let autoReplied = 0;
    let flagged = 0;

    for (const email of emails) {
      // Skip system emails, no-reply, own emails
      const fromEmail = extractEmail(email.from).toLowerCase();
      if (fromEmail.includes('noreply') || fromEmail.includes('no-reply') ||
          fromEmail.includes('zoho.com') || fromEmail.includes('gblpeptides.com') ||
          fromEmail.includes('mailer-daemon') || fromEmail.includes('postmaster')) {
        continue;
      }

      // Get AI response
      const aiResponse = await getAIResponse(email);
      if (!aiResponse) continue;

      if (aiResponse.startsWith('FLAG_FOR_HUMAN')) {
        // Notify owner via Telegram
        const reason = aiResponse.replace('FLAG_FOR_HUMAN', '').trim();
        await notifyTelegram(
          `📧 <b>Customer Email Needs Attention</b>\n\n` +
          `From: ${email.from}\n` +
          `Subject: ${email.subject}\n` +
          `Preview: ${email.body.substring(0, 200)}...\n\n` +
          `⚠️ Reason: ${reason || 'Complex issue'}\n\n` +
          `Reply at: admin@gblpeptides.com`
        );
        flagged++;
      } else {
        // Auto-reply
        const replySubject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
        await sendReply({
          to: fromEmail,
          subject: replySubject,
          html: responseToHtml(aiResponse),
          text: aiResponse
        });
        autoReplied++;

        // Notify owner about auto-reply
        await notifyTelegram(
          `🤖 <b>Auto-replied to customer</b>\n\n` +
          `To: ${fromEmail}\n` +
          `Subject: ${email.subject}\n` +
          `Response preview: ${aiResponse.substring(0, 150)}...`
        );
      }

      // Log to Supabase
      if (SUPABASE_SERVICE_KEY) {
        await supabasePost('/rest/v1/cs_interactions', {
          customer_email: fromEmail,
          subject: email.subject,
          message_preview: email.body.substring(0, 500),
          response_type: aiResponse.startsWith('FLAG_FOR_HUMAN') ? 'flagged' : 'auto_replied',
          response_preview: aiResponse.substring(0, 500),
          created_at: new Date().toISOString()
        }).catch(() => {});
      }

      processed++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ processed, autoReplied, flagged })
    };
  } catch (error) {
    console.error('CS Agent error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
