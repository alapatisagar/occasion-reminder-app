const { dbQuery } = require('./database');
const { sendOccasionEmail } = require('./mailer');

async function sendOccasionSMS({ toPhone, carrierGateway, recipientName, occasionType, customMessage }) {
  const provider = await dbQuery.get('SELECT value FROM settings WHERE key = "sms_provider"');
  const providerType = provider?.value || 'email_to_sms'; // 'email_to_sms', 'whatsapp'

  // Format message text
  let formattedMessage = customMessage
    .replace(/\{name\}/gi, recipientName)
    .replace(/\{occasion\}/gi, occasionType);

  const messageText = `🎉 Happy ${occasionType}, ${recipientName}! ${formattedMessage}`;

  // -------------------------------------------------------------------
  // METHOD 1: WHATSAPP DIRECT MESSAGE
  // -------------------------------------------------------------------
  if (providerType === 'whatsapp') {
    let cleanPhone = toPhone.replace(/[^0-9]/g, '');
    const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(messageText)}`;
    
    console.log(`[WhatsApp Dispatcher] Link for ${recipientName} (${cleanPhone}): ${waLink}`);

    return {
      status: 'SUCCESS',
      messageId: `wa-${Date.now()}`,
      details: `WhatsApp Direct Link: ${waLink}`,
      whatsappUrl: waLink
    };
  }

  // -------------------------------------------------------------------
  // METHOD 2: 100% FREE EMAIL-TO-SMS CARRIER GATEWAY / DIRECT EMAIL
  // -------------------------------------------------------------------
  let smsEmail = toPhone;
  if (!toPhone.includes('@')) {
    let cleanPhone = toPhone.replace(/[^0-9]/g, '');
    if (carrierGateway && carrierGateway.includes('@')) {
      smsEmail = `${cleanPhone}${carrierGateway}`;
    } else {
      smsEmail = `${cleanPhone}@vtext.com`; // Default gateway
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
