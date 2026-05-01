const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjgrwedgahitrakwzoob.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SUPABASE_URL.replace('https://', ''),
      path, method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve([]); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function supabasePost(path, body) {
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
        'Prefer': 'resolution=merge-duplicates,return=minimal'
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

async function notifyTelegram(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  const data = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
  return new Promise((resolve, reject) => {
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
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async () => {
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: 'Not configured' };
  }

  try {
    // Fetch all orders
    const orders = await supabaseGet('/rest/v1/orders?select=*&order=created_at.desc&limit=500');
    if (!Array.isArray(orders) || orders.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No orders to analyze' }) };
    }

    // Fetch email subscribers
    const subscribers = await supabaseGet('/rest/v1/email_subscribers?select=*&active=eq.true');
    const subCount = Array.isArray(subscribers) ? subscribers.length : 0;

    // Fetch abandoned carts
    const abandonedCarts = await supabaseGet('/rest/v1/abandoned_carts?select=*');
    const totalAbandoned = Array.isArray(abandonedCarts) ? abandonedCarts.length : 0;
    const recoveredCarts = Array.isArray(abandonedCarts) ? abandonedCarts.filter(c => c.recovered).length : 0;

    // === Analytics ===
    const paidOrders = orders.filter(o => o.status === 'PAID');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0);
    const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

    // Repeat buyers
    const customerOrders = {};
    for (const o of paidOrders) {
      const key = (o.customer_email || o.customer_name || '').toLowerCase();
      if (!key) continue;
      if (!customerOrders[key]) customerOrders[key] = { name: o.customer_name, email: o.customer_email, orders: 0, totalSpent: 0 };
      customerOrders[key].orders++;
      customerOrders[key].totalSpent += (o.amount_cents || 0);
    }
    const repeatBuyers = Object.values(customerOrders).filter(c => c.orders > 1);
    const topCustomers = Object.values(customerOrders).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5);

    // Orders by time period
    const now = Date.now();
    const last7d = paidOrders.filter(o => (now - new Date(o.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000);
    const last30d = paidOrders.filter(o => (now - new Date(o.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000);

    // Popular products (parse from notes field)
    const productCounts = {};
    for (const o of paidOrders) {
      const notes = o.notes || '';
      const itemsMatch = notes.match(/Items:\s*(.+?)(?:\||$)/);
      if (itemsMatch) {
        const items = itemsMatch[1].split(',').map(s => s.trim());
        for (const item of items) {
          const nameMatch = item.match(/^(.+?)\s*x\d+/);
          const name = nameMatch ? nameMatch[1].trim() : item.trim();
          if (name) productCounts[name] = (productCounts[name] || 0) + 1;
        }
      }
    }
    const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Build intelligence report
    const report = {
      generated: new Date().toISOString(),
      revenue: {
        total: (totalRevenue / 100).toFixed(2),
        last7d: (last7d.reduce((s, o) => s + (o.amount_cents || 0), 0) / 100).toFixed(2),
        last30d: (last30d.reduce((s, o) => s + (o.amount_cents || 0), 0) / 100).toFixed(2),
        avgOrderValue: (avgOrderValue / 100).toFixed(2)
      },
      orders: {
        total: paidOrders.length,
        last7d: last7d.length,
        last30d: last30d.length,
        pending: orders.filter(o => o.status === 'PENDING_PAYMENT').length
      },
      customers: {
        total: Object.keys(customerOrders).length,
        repeatBuyers: repeatBuyers.length,
        repeatRate: Object.keys(customerOrders).length > 0 
          ? ((repeatBuyers.length / Object.keys(customerOrders).length) * 100).toFixed(1) + '%' 
          : '0%'
      },
      topCustomers: topCustomers.map(c => ({
        name: c.name,
        orders: c.orders,
        totalSpent: '$' + (c.totalSpent / 100).toFixed(2)
      })),
      topProducts: topProducts.map(([name, count]) => ({ name, orders: count })),
      emailSubscribers: subCount,
      abandonedCarts: {
        total: totalAbandoned,
        recovered: recoveredCarts,
        recoveryRate: totalAbandoned > 0 
          ? ((recoveredCarts / totalAbandoned) * 100).toFixed(1) + '%' 
          : '0%'
      }
    };

    // Save report to Supabase
    await supabasePost('/rest/v1/intelligence_reports', {
      report_date: new Date().toISOString().split('T')[0],
      data: report
    });

    // Send weekly Telegram digest (only on Mondays)
    const day = new Date().getDay();
    if (day === 1) { // Monday
      const msg = `📊 <b>Weekly Business Intelligence Report</b>\n\n` +
        `💰 <b>Revenue</b>\n` +
        `• Total: $${report.revenue.total}\n` +
        `• Last 7 days: $${report.revenue.last7d}\n` +
        `• Last 30 days: $${report.revenue.last30d}\n` +
        `• Avg order: $${report.revenue.avgOrderValue}\n\n` +
        `📦 <b>Orders</b>\n` +
        `• Total: ${report.orders.total} | Last 7d: ${report.orders.last7d} | Last 30d: ${report.orders.last30d}\n` +
        `• Pending payment: ${report.orders.pending}\n\n` +
        `👥 <b>Customers</b>\n` +
        `• Total: ${report.customers.total}\n` +
        `• Repeat buyers: ${report.customers.repeatBuyers} (${report.customers.repeatRate})\n\n` +
        `🏆 <b>Top Customers</b>\n` +
        topCustomers.slice(0, 3).map((c, i) => `${i + 1}. ${c.name} — $${(c.totalSpent / 100).toFixed(2)} (${c.orders} orders)`).join('\n') + '\n\n' +
        `🛍️ <b>Top Products</b>\n` +
        topProducts.slice(0, 3).map(([name, count]) => `• ${name} (${count} orders)`).join('\n') + '\n\n' +
        `📧 Email subscribers: ${subCount}\n` +
        `🛒 Abandoned carts: ${totalAbandoned} (${report.abandonedCarts.recoveryRate} recovered)`;

      await notifyTelegram(msg);
    }

    return { statusCode: 200, body: JSON.stringify(report) };
  } catch (error) {
    console.error('Intelligence error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
