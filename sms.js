const https = require('https');
const querystring = require('querystring');
const { dbQuery } = require('./database');

async function sendOccasionSMS({ toPhone, recipientName, occasionType, customMessage }) {
  const accountSid = await dbQuery.get('SELECT value FROM settings WHERE key = "twilio_account_sid"');
  const authToken = await dbQuery.get('SELECT value FROM settings WHERE key = "twilio_auth_token"');
  const fromPhone = await dbQuery.get('SELECT value FROM settings WHERE key = "twilio_phone_number"');

  // Format message text
  let formattedMessage = customMessage
    .replace(/\{name\}/gi, recipientName)
    .replace(/\{occasion\}/gi, occasionType);

  const smsText = `🎉 Happy ${occasionType}, ${recipientName}! ${formattedMessage}`;

  // If Twilio credentials are configured, send real SMS via Twilio REST API
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
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                status: 'SUCCESS',
                messageId: parsed.sid,
                details: `SMS delivered via Twilio (SID: ${parsed.sid})`
              });
            } else {
              reject(new Error(parsed.message || `Twilio SMS error code ${parsed.code}`));
            }
          } catch (e) {
            reject(new Error(`Twilio response parsing error: ${responseBody}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Twilio connection error: ${err.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  // Simulation / Local Mode if Twilio SMS credentials not set yet
  console.log(`[SMS Dispatcher] Simulated SMS to ${toPhone}:\nMessage: "${smsText}"`);
  return {
    status: 'SUCCESS',
    messageId: `simulated-sms-${Date.now()}`,
    isSimulated: true,
    details: `Simulated SMS text to ${toPhone} (Configure Twilio in Settings for live SMS)`
  };
}

module.exports = { sendOccasionSMS };
