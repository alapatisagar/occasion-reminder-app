const https = require('https');
const querystring = require('querystring');
const { dbQuery } = require('./database');
const { sendOccasionEmail } = require('./mailer');

async function sendOccasionSMS({ toPhone, carrierGateway, recipientName, occasionType, customMessage }) {
  const provider = await dbQuery.get('SELECT value FROM settings WHERE key = "sms_provider"');
  const providerType = provider?.value || 'whatsapp_cloud';

  // Format your actual personalized custom message!
  let formattedMessage = customMessage
    .replace(/\{name\}/gi, recipientName)
    .replace(/\{occasion\}/gi, occasionType);

  const smsText = `🎉 Happy ${occasionType}, ${recipientName}!\n\n${formattedMessage}`;

  let cleanPhone = toPhone.replace(/[^0-9]/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
    // Keep country code
  } else if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone; // Default to India country code
  }

  // -------------------------------------------------------------------
  // METHOD 1: META WHATSAPP CLOUD API (Custom Text Message Dispatch)
  // -------------------------------------------------------------------
  if (providerType === 'whatsapp_cloud') {
    const waToken = await dbQuery.get('SELECT value FROM settings WHERE key = "whatsapp_cloud_token"');
    const waPhoneId = await dbQuery.get('SELECT value FROM settings WHERE key = "whatsapp_cloud_phone_id"');

    if (!waToken?.value || !waPhoneId?.value) {
      const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(smsText)}`;
      return {
        status: 'SUCCESS',
        messageId: `wa-link-${Date.now()}`,
        details: `WhatsApp Link Created for +${cleanPhone}: ${waLink}`,
        whatsappUrl: waLink
      };
    }

    // Send your actual custom text message directly to recipient's WhatsApp!
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: smsText
        }
      });

      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v18.0/${waPhoneId.value}/messages`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waToken.value.trim()}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                status: 'SUCCESS',
                messageId: parsed.messages ? parsed.messages[0].id : `wa-cloud-${Date.now()}`,
                details: `Custom WhatsApp message delivered to +${cleanPhone} (ID: ${parsed.messages[0].id})`
              });
            } else if (parsed.error && parsed.error.code === 190) {
              reject(new Error(`Meta Access Token Expired. Please copy the fresh token from your Meta Developers screen.`));
            } else {
              // Fallback to template if Meta requires template for initial outreach
              sendMetaTemplate({ waPhoneId: waPhoneId.value, waToken: waToken.value, cleanPhone })
                .then(resolve)
                .catch(() => reject(new Error(parsed.error ? parsed.error.message : `WhatsApp Cloud error ${res.statusCode}`)));
            }
          } catch (e) {
            reject(new Error(`WhatsApp Cloud parse error: ${body}`));
          }
        });
      });

      req.on('error', err => reject(new Error(`WhatsApp Cloud connection error: ${err.message}`)));
      req.write(postData);
      req.end();
    });
  }

  // -------------------------------------------------------------------
  // METHOD 2: FAST2SMS API
  // -------------------------------------------------------------------
  if (providerType === 'fast2sms') {
    const apiKey = await dbQuery.get('SELECT value FROM settings WHERE key = "fast2sms_api_key"');
    if (!apiKey?.value) {
      throw new Error('Fast2SMS API Key is missing! Please paste your API Key in Settings.');
    }

    let indianNumber = cleanPhone.slice(-10);

    return new Promise((resolve, reject) => {
      const queryParams = querystring.stringify({
        authorization: apiKey.value.trim(),
        route: 'q',
        message: smsText,
        language: 'english',
        flash: '0',
        numbers: indianNumber
      });

      const options = {
        hostname: 'www.fast2sms.com',
        port: 443,
        path: `/dev/bulkV2?${queryParams}`,
        method: 'GET'
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.return === true || parsed.status_code === 200) {
              resolve({
                status: 'SUCCESS',
                messageId: parsed.request_id || `fast2sms-${Date.now()}`,
                details: `Fast2SMS delivered to ${indianNumber}: ${parsed.message ? parsed.message[0] : 'SMS Dispatched'}`
              });
            } else {
              reject(new Error(parsed.message || `Fast2SMS error: ${body}`));
            }
          } catch (e) {
            reject(new Error(`Fast2SMS parse error: ${body}`));
          }
        });
      });

      req.on('error', err => reject(new Error(`Fast2SMS network error: ${err.message}`)));
      req.end();
    });
  }

  // -------------------------------------------------------------------
  // METHOD 3: FREE EMAIL
  // -------------------------------------------------------------------
  let smsEmail = toPhone;
  if (!toPhone.includes('@')) {
    if (carrierGateway && carrierGateway.includes('@')) {
      smsEmail = `${cleanPhone}${carrierGateway}`;
    } else {
      smsEmail = `${cleanPhone}@vtext.com`;
    }
  }

  try {
    const result = await sendOccasionEmail({
      to: smsEmail,
      recipientName: recipientName,
      occasionType: occasionType,
      customMessage: formattedMessage
    });

    return {
      status: 'SUCCESS',
      messageId: result.messageId || `free-sms-${Date.now()}`,
      details: `Free Message dispatched to ${smsEmail}`
    };
  } catch (err) {
    throw new Error(`Free Email error: ${err.message}`);
  }
}

function sendMetaTemplate({ waPhoneId, waToken, cleanPhone }) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: 'hello_world',
        language: { code: 'en_US' }
      }
    });

    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v18.0/${waPhoneId}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waToken.trim()}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              status: 'SUCCESS',
              messageId: parsed.messages ? parsed.messages[0].id : `wa-cloud-${Date.now()}`,
              details: `WhatsApp Cloud API test message delivered to +${cleanPhone}`
            });
          } else {
            reject(new Error(parsed.error ? parsed.error.message : `WhatsApp Cloud error ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`WhatsApp Cloud parse error: ${body}`));
        }
      });
    });

    req.on('error', err => reject(new Error(`WhatsApp Cloud connection error: ${err.message}`)));
    req.write(postData);
    req.end();
  });
}

module.exports = { sendOccasionSMS };
