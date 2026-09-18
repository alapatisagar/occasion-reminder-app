const cron = require('node-cron');
const { dbQuery } = require('./database');
const { sendOccasionSMS } = require('./sms');

async function triggerDailyAutoDispatch() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();        // 1-31
  const todayDateStr = now.toISOString().split('T')[0];

  console.log(`[SMS Auto-Dispatcher] Running daily check for date: ${currentMonth}/${currentDay} (${todayDateStr})`);

  try {
    // Find active occasions matching today's month & day
    const matchingOccasions = await dbQuery.all(
      `SELECT * FROM occasions WHERE is_active = 1 AND date_month = ? AND date_day = ?`,
      [currentMonth, currentDay]
    );

    console.log(`[SMS Auto-Dispatcher] Found ${matchingOccasions.length} matching occasion(s) for today.`);

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const occasion of matchingOccasions) {
      // Check if message was already sent today for this occasion to prevent duplicate SMS
      const alreadySent = await dbQuery.get(
        `SELECT id FROM logs WHERE occasion_id = ? AND status = 'SUCCESS' AND date(sent_at) = date('now')`,
        [occasion.id]
      );

      if (alreadySent) {
        console.log(`[SMS Auto-Dispatcher] Skipping ID #${occasion.id} (${occasion.recipient_name}) - SMS already sent today.`);
        skippedCount++;
        continue;
      }

      const recipientContact = occasion.recipient_phone || occasion.recipient_email;
      console.log(`[SMS Auto-Dispatcher] Auto-sending ${occasion.occasion_type} SMS to ${occasion.recipient_name} (${recipientContact})...`);

      try {
        const result = await sendOccasionSMS({
          toPhone: occasion.recipient_phone || occasion.recipient_email,
          recipientName: occasion.recipient_name,
          occasionType: occasion.occasion_type,
          customMessage: occasion.custom_message
        });

        await dbQuery.run(
          `INSERT INTO logs (occasion_id, recipient_name, recipient_email, occasion_type, status, details)
           VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
          [occasion.id, occasion.recipient_name, recipientContact, occasion.occasion_type, result.details]
        );

        console.log(`[SMS Auto-Dispatcher] Successfully sent SMS to ${recipientContact}`);
        sentCount++;
      } catch (sendErr) {
        console.error(`[SMS Auto-Dispatcher] Failed sending SMS to ${recipientContact}:`, sendErr.message);

        await dbQuery.run(
          `INSERT INTO logs (occasion_id, recipient_name, recipient_email, occasion_type, status, details)
           VALUES (?, ?, ?, ?, 'FAILED', ?)`,
          [occasion.id, occasion.recipient_name, recipientContact, occasion.occasion_type, sendErr.message]
        );
        failedCount++;
      }
    }

    return { sentCount, skippedCount, failedCount, totalMatched: matchingOccasions.length };
  } catch (err) {
    console.error('[SMS Auto-Dispatcher] Error running auto-dispatch:', err);
    throw err;
  }
}

function startScheduler() {
  // Run automatically every morning at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler Cron] Triggered 08:00 AM automated SMS dispatch...');
    await triggerDailyAutoDispatch();
  });

  // Also run every hour to check for any missed sends
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler Cron] Hourly check for pending SMS dispatches...');
    await triggerDailyAutoDispatch();
  });

  console.log('[Scheduler] Cron SMS auto-dispatcher initialized (Scheduled at 08:00 AM daily and hourly checks).');
}

module.exports = { startScheduler, triggerDailyAutoDispatch };
