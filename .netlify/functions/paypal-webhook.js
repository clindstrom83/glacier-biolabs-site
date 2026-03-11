const https = require('https');
const crypto = require('crypto');

// Helper to verify PayPal webhook signature
function verifyWebhookSignature(headers, body, webhookId) {
  // PayPal sends these headers for verification
  const transmissionId = headers['paypal-transmission-id'];
  const transmissionTime = headers['paypal-transmission-time'];
  const certUrl = headers['paypal-cert-url'];
  const transmissionSig = headers['paypal-transmission-sig'];
  const authAlgo = headers['paypal-auth-algo'];

  // For now, we'll log and accept all webhooks
  // In production, you'd verify the signature against PayPal's cert
  return true;
}

// Helper to send notification to Telegram
async function notifyOwner(message) {
  console.log('NOTIFICATION:', message);
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.error('Missing Telegram credentials - set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Netlify env vars');
    return false;
  }
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
    
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ Telegram notification sent');
          resolve(true);
        } else {
          console.error(`Telegram API error: ${res.statusCode} ${responseData}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Telegram request error:', error);
      resolve(false);
    });
    
    req.write(data);
    req.end();
  });
}

// Main handler
exports.handler = async (event, context) => {
  console.log('PayPal webhook received');
  console.log('Headers:', event.headers);
  console.log('Body:', event.body);

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const webhookEvent = JSON.parse(event.body);
    const eventType = webhookEvent.event_type;

    console.log(`Event type: ${eventType}`);

    // Handle different event types
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCaptured(webhookEvent);
        break;
      
      case 'CHECKOUT.ORDER.COMPLETED':
        await handleOrderCompleted(webhookEvent);
        break;

      case 'PAYMENT.SALE.COMPLETED':
        await handleSaleCompleted(webhookEvent);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Always return 200 to acknowledge receipt
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };

  } catch (error) {
    console.error('Webhook processing error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function handlePaymentCaptured(event) {
  const resource = event.resource;
  const amount = resource.amount;
  const shipping = resource.shipping;
  
  const details = {
    transactionId: resource.id,
    amount: `${amount.currency_code} ${amount.value}`,
    status: resource.status,
    createTime: resource.create_time,
    customerName: shipping ? `${shipping.name.full_name}` : 'N/A',
    shippingAddress: shipping ? formatAddress(shipping.address) : 'N/A',
    email: resource.supplementary_data?.related_ids?.order_id || 'N/A'
  };

  console.log('💰 NEW SALE:', details);
  
  // Notify owner
  const message = `🎉 NEW SALE!\n\n` +
    `Amount: $${amount.value}\n` +
    `Customer: ${details.customerName}\n` +
    `Ship to: ${details.shippingAddress}\n` +
    `Transaction: ${resource.id}\n` +
    `Time: ${new Date(resource.create_time).toLocaleString('en-US', { timeZone: 'America/New_York' })}`;
  
  await notifyOwner(message);
}

async function handleOrderCompleted(event) {
  const resource = event.resource;
  const purchaseUnits = resource.purchase_units || [];
  
  if (purchaseUnits.length > 0) {
    const unit = purchaseUnits[0];
    const amount = unit.amount;
    const shipping = unit.shipping;
    const items = unit.items || [];
    
    const itemsList = items.map(item => 
      `  - ${item.name} x${item.quantity}: $${item.unit_amount.value}`
    ).join('\n');
    
    const message = `🎉 NEW ORDER!\n\n` +
      `Amount: $${amount.value}\n` +
      `Customer: ${shipping ? shipping.name.full_name : 'N/A'}\n` +
      `Ship to: ${shipping ? formatAddress(shipping.address) : 'N/A'}\n` +
      `Items:\n${itemsList}\n` +
      `Order ID: ${resource.id}\n` +
      `Time: ${new Date(resource.create_time).toLocaleString('en-US', { timeZone: 'America/New_York' })}`;
    
    console.log('💰 NEW ORDER:', message);
    await notifyOwner(message);
  }
}

async function handleSaleCompleted(event) {
  const resource = event.resource;
  const amount = resource.amount;
  
  const message = `💵 SALE COMPLETED!\n\n` +
    `Amount: $${amount.total}\n` +
    `Transaction: ${resource.id}\n` +
    `Time: ${new Date(resource.create_time).toLocaleString('en-US', { timeZone: 'America/New_York' })}`;
  
  console.log('✅ SALE:', message);
  await notifyOwner(message);
}

function formatAddress(address) {
  if (!address) return 'N/A';
  return `${address.address_line_1 || ''}, ${address.admin_area_2 || ''}, ${address.admin_area_1 || ''} ${address.postal_code || ''}`.trim();
}
