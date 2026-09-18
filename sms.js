const https = require('https');
const querystring = require('querystring');
const { dbQuery } = require('./database');
const { sendOccasionEmail } = require('./mailer');

async function sendOccasionSMS({ toPhone, carrierGateway, recipientName, occasionType, customMessage }) {
  const provider = await dbQuery.get('SELECT value FROM settings WHERE key = "sms_provider"');
  const providerType = provider?.value || 'fast2sms'; // Default to fast2sms or email_to_sms

  // Format message text
  let formattedMessage = customMessage
    .replace(/\{name\}/gi, recipientName)
    .replace(/\{occasion\}/gi, occasionType);

  const smsText = `🎉 Happy ${occasionType}, ${recipientName}! ${formattedMessage}`;
  let cleanPhone = toPhone.replace(/[^0-9]/g, '');
  if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10); // 10 digit Indian number

  // -------------------------------------------------------------------
  // METHOD 1: FAST2SMS API (DLT-Free Quick SMS Route)
  // -------------------------------------------------------------------
  if (providerType === 'fast2sms') {
    const apiKey = await dbQuery.get('SELECT value FROM settings WHERE key = "fast2sms_api_key"');
    if (!apiKey?.value) {
      throw new Error('Fast2SMS API Key is missing! Please paste your API Key in Settings.');
    }

    return new Promise((resolve, reject) => {
      const queryParams = querystring.stringify({
        authorization: apiKey.value.trim(),
        route: 'q',
        message: smsText,
        language: 'english',
        flash: '0',
        numbers: cleanPhone
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
                details: `Fast2SMS delivered to ${cleanPhone}: ${parsed.message ? parsed.message[0] : 'SMS Dispatched'}`
              });
            } else {
              reject(new Error(parsed.message || `Fast2SMS error (Code: ${parsed.status_code})`));
            }
          } catch (e) {
            reject(new Error(`Fast2SMS response parse error: ${body}`));
          }
        });
      });

      req.on('error', err => reject(new Error(`Fast2SMS network error: ${err.message}`)));
      req.end();
    });
  }

  // -------------------------------------------------------------------
  // METHOD 2: WHATSAPP DIRECT MESSAGE
  // -------------------------------------------------------------------
  if (providerType === 'whatsapp') {
    const waLink = `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(smsText)}`;
    return {
      status: 'SUCCESS',
      messageId: `wa-${Date.now()}`,
      details: `WhatsApp Direct Link Created: ${waLink}`,
      whatsappUrl: waLink
    };
  }

  // -------------------------------------------------------------------
  // METHOD 3: 100% FREE EMAIL-TO-SMS CARRIER GATEWAY
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
    throw new Error(`Free Email-to-SMS error: ${err.message}`);
  }
}

module.exports = { sendOccasionSMS };
