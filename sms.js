const https = require('https');
const querystring = require('querystring');
const { dbQuery } = require('./database');
const { sendOccasionEmail } = require('./mailer');

async function sendOccasionSMS({ toPhone, carrierGateway, recipientName, occasionType, customMessage }) {
  const provider = await dbQuery.get('SELECT value FROM settings WHERE key = "sms_provider"');
  const providerType = provider?.value || 'email_to_sms'; // 'email_to_sms', 'fast2sms', 'twilio'

  // Format message text
  let formattedMessage = customMessage
    .replace(/\{name\}/gi, recipientName)
    .replace(/\{occasion\}/gi, occasionType);

  const smsText = `🎉 Happy ${occasionType}, ${recipientName}! ${formattedMessage}`;

  // -------------------------------------------------------------------
  // METHOD 1: 100% FREE EMAIL-TO-SMS CARRIER GATEWAY (Zero Cost, No Cards)
  // -------------------------------------------------------------------
  if (providerType === 'email_to_sms') {
    let cleanPhone = toPhone.replace(/[^0-9]/g, '');
    let smsEmail = toPhone;

    if (carrierGateway && carrierGateway.includes('@')) {
      smsEmail = `${cleanPhone}${carrierGateway}`;
    } else if (!toPhone.includes('@')) {
      // Default to common carrier gateway if not specified
      smsEmail = `${cleanPhone}@vtext.com`; 
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
        details: `100% Free Carrier SMS dispatched to ${smsEmail}`
      };
    } catch (err) {
      throw new Error(`Free Email-to-SMS error: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------
  // METHOD 2: FAST2SMS (Free API Key for India)
  // -------------------------------------------------------------------
  if (providerType === 'fast2sms') {
    const apiKey = await dbQuery.get('SELECT value FROM settings WHERE key = "fast2sms_api_key"');
    if (!apiKey?.value) {
      throw new Error('Fast2SMS API Key is missing. Please save it in SMS Settings.');
    }

    let cleanPhone = toPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10); // 10 digit Indian number

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        route: 'q',
        message: smsText,
        language: 'english',
        flash: 0,
        numbers: cleanPhone
      });

      const options = {
        hostname: 'www.fast2sms.com',
        port: 443,
        path: '/dev/bulkV2',
        method: 'POST',
        headers: {
          'authorization': apiKey.value,
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
            if (parsed.return) {
              resolve({
                status: 'SUCCESS',
                messageId: parsed.request_id || `fast2sms-${Date.now()}`,
                details: `Fast2SMS delivered to ${cleanPhone}: ${parsed.message[0]}`
              });
            } else {
              reject(new Error(parsed.message || 'Fast2SMS API error'));
            }
          } catch (e) {
            reject(new Error(`Fast2SMS response parse error: ${body}`));
          }
        });
      });

      req.on('error', err => reject(new Error(`Fast2SMS connection error: ${err.message}`)));
      req.write(postData);
      req.end();
    });
  }

  // -------------------------------------------------------------------
  // METHOD 3: TWILIO REST API
  // -------------------------------------------------------------------
  if (providerType === 'twilio') {
    const accountSid = await dbQuery.get('SELECT value FROM settings WHERE key = "twilio_account_sid"');
    const authToken = await dbQuery.get('SELECT value FROM settings WHERE key = "twilio_auth_token"');
    const fromPhone = await dbQuery.get('SELECT value FROM settings WHERE key = "twilio_phone_number"');

    if (accountSid?.value && authToken?.value && fromPhone?.value) {
      return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
          To: toPhone,
          From: fromPhone.value,
          Body: smsText
        });

        const options = {
          hostname: 'api.twilio.com',
          port: 443,
          path: `/2010-04-01/Accounts/${accountSid.value}/Messages.json`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'Authorization': 'Basic ' + Buffer.from(`${accountSid.value}:${authToken.value}`).toString('base64')
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
                  messageId: parsed.sid,
                  details: `SMS delivered via Twilio (SID: ${parsed.sid})`
                });
              } else {
                reject(new Error(parsed.message || `Twilio error ${parsed.code}`));
              }
            } catch (e) {
              reject(new Error(`Twilio parse error: ${body}`));
            }
          });
        });

        req.on('error', err => reject(new Error(`Twilio connection error: ${err.message}`)));
        req.write(postData);
        req.end();
      });
    }
  }

  // Fallback Simulation Mode
  console.log(`[Simulated SMS Dispatch] Message to ${toPhone}: "${smsText}"`);
  return {
    status: 'SUCCESS',
    messageId: `simulated-sms-${Date.now()}`,
    isSimulated: true,
    details: `Simulated SMS text to ${toPhone}`
  };
}

module.exports = { sendOccasionSMS };
