const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabaseRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const hostname = SUPABASE_URL.replace('https://', '');
    const opts = {
      hostname, path, method,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    const { email, source } = JSON.parse(event.body);

    if (!email || !email.includes('@')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
    }

    // Upsert into email_subscribers table (unique on email)
    const result = await supabaseRequest(
      '/rest/v1/email_subscribers',
      'POST',
      {
        email: email.toLowerCase().trim(),
        source: source || 'unknown',
        subscribed_at: new Date().toISOString(),
        active: true
      }
    );

    if (result.status >= 400) {
      console.error('Supabase error:', result.body);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save email' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('Save email error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
  }
};
