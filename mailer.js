const nodemailer = require('nodemailer');
const { dbQuery } = require('./database');

async function getTransporter() {
  const smtpHost = await dbQuery.get('SELECT value FROM settings WHERE key = "smtp_host"');
  const smtpPort = await dbQuery.get('SELECT value FROM settings WHERE key = "smtp_port"');
  const smtpUser = await dbQuery.get('SELECT value FROM settings WHERE key = "smtp_user"');
  const smtpPass = await dbQuery.get('SELECT value FROM settings WHERE key = "smtp_pass"');
  const smtpSecure = await dbQuery.get('SELECT value FROM settings WHERE key = "smtp_secure"');
  const senderName = await dbQuery.get('SELECT value FROM settings WHERE key = "sender_name"');

  if (smtpHost?.value && smtpUser?.value && smtpPass?.value) {
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost.value,
        port: parseInt(smtpPort?.value || '587', 10),
        secure: smtpSecure?.value === 'true',
        auth: {
          user: smtpUser.value,
          pass: smtpPass.value
        }
      }),
      from: `"${senderName?.value || 'Occasion Auto-Sender'}" <${smtpUser.value}>`,
      isCustom: true
    };
  }

  // Attempt to create free Ethereal test account with a 5-second timeout
  try {
    const testAccount = await Promise.race([
      nodemailer.createTestAccount(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ethereal connection timeout')), 5000))
    ]);

    const testTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    return {
      transporter: testTransporter,
      from: `"Occasion Auto-Sender (Test)" <${testAccount.user}>`,
      isEthereal: true
    };
  } catch (err) {
    // Local Simulation Mode if offline or Ethereal fails
    return {
      transporter: null,
      from: `"Occasion Auto-Sender (Simulated)" <no-reply@local.app>`,
      isSimulated: true,
      simulatedReason: err.message
    };
  }
}

async function sendOccasionEmail({ to, recipientName, occasionType, customMessage }) {
  const config = await getTransporter();

  // Personalize template placeholders
  let formattedMessage = customMessage
    .replace(/\{name\}/gi, recipientName)
    .replace(/\{occasion\}/gi, occasionType);

  const subject = `🎉 Happy ${occasionType}, ${recipientName}!`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; padding: 20px 0; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; border-radius: 8px;">
        <h1 style="margin: 0; font-size: 26px;">🎉 Happy ${occasionType}!</h1>
      </div>
      <div style="padding: 30px 20px; color: #333333; line-height: 1.6; font-size: 16px;">
        <p style="font-size: 18px; font-weight: bold; color: #4f46e5;">Dear ${recipientName},</p>
        <p style="white-space: pre-wrap; font-size: 16px; background-color: #f9fafb; padding: 16px; border-left: 4px solid #6366f1; border-radius: 4px;">${formattedMessage}</p>
        <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Warmest wishes on your special day! ❤️</p>
      </div>
      <div style="text-align: center; padding: 15px; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6;">
        Sent automatically with ❤️ via Occasion Scheduler
      </div>
    </div>
  `;

  if (config.isSimulated || !config.transporter) {
    console.log(`[Simulated Mail Dispatcher] Rendered email for ${recipientName} (${to}):\nSubject: ${subject}\nBody: ${formattedMessage}`);
    return {
      messageId: `simulated-${Date.now()}`,
      previewUrl: null,
      isSimulated: true,
      statusMessage: `Simulated Local Delivery (SMTP not configured)`
    };
  }

  const info = await config.transporter.sendMail({
    from: config.from,
    to: to,
    subject: subject,
    text: formattedMessage,
    html: htmlContent
  });

  let previewUrl = null;
  if (config.isEthereal) {
    previewUrl = nodemailer.getTestMessageUrl(info);
  }

  return {
    messageId: info.messageId,
    previewUrl: previewUrl,
    isEthereal: config.isEthereal
  };
}

module.exports = { sendOccasionEmail, getTransporter };
