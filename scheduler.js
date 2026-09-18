const cron = require('node-cron');
const { dbQuery } = require('./database');
const { sendOccasionEmail } = require('./mailer');

async function triggerDailyAutoDispatch() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();        // 1-31
  const todayDateStr = now.toISOString().split('T')[0];

  console.log(`[Auto-Dispatcher] Running daily check for date: ${currentMonth}/${currentDay} (${todayDateStr})`);

  try {
    // Find active occasions matching today's month & day
    const matchingOccasions = await dbQuery.all(
      `SELECT * FROM occasions WHERE is_active = 1 AND date_month = ? AND date_day = ?`,
      [currentMonth, currentDay]
    );

    console.log(`[Auto-Dispatcher] Found ${matchingOccasions.length} matching occasion(s) for today.`);

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const occasion of matchingOccasions) {
      // Check if message was already sent today for this occasion to prevent duplicate emails
      const alreadySent = await dbQuery.get(
        `SELECT id FROM logs WHERE occasion_id = ? AND status = 'SUCCESS' AND date(sent_at) = date('now')`,
        [occasion.id]
      );

      if (alreadySent) {
        console.log(`[Auto-Dispatcher] Skipping ID #${occasion.id} (${occasion.recipient_name}) - already sent today.`);
        skippedCount++;
        continue;
      }

      console.log(`[Auto-Dispatcher] Auto-sending ${occasion.occasion_type} email to ${occasion.recipient_name} (${occasion.recipient_email})...`);

      try {
        const result = await sendOccasionEmail({
          to: occasion.recipient_email,
          recipientName: occasion.recipient_name,
          occasionType: occasion.occasion_type,
          customMessage: occasion.custom_message
        });

        const detailMsg = result.previewUrl 
          ? `Sent via Test Account. Preview URL: ${result.previewUrl}`
          : `Message ID: ${result.messageId}`;

        await dbQuery.run(
          `INSERT INTO logs (occasion_id, recipient_name, recipient_email, occasion_type, status, details)
           VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
          [occasion.id, occasion.recipient_name, occasion.recipient_email, occasion.occasion_type, detailMsg]
        );

        console.log(`[Auto-Dispatcher] Successfully sent to ${occasion.recipient_email}`);
        sentCount++;
      } catch (sendErr) {
        console.error(`[Auto-Dispatcher] Failed sending to ${occasion.recipient_email}:`, sendErr.message);

        await dbQuery.run(
          `INSERT INTO logs (occasion_id, recipient_name, recipient_email, occasion_type, status, details)
           VALUES (?, ?, ?, ?, 'FAILED', ?)`,
          [occasion.id, occasion.recipient_name, occasion.recipient_email, occasion.occasion_type, sendErr.message]
        );
        failedCount++;
      }
    }

    return { sentCount, skippedCount, failedCount, totalMatched: matchingOccasions.length };
  } catch (err) {
    console.error('[Auto-Dispatcher] Error running auto-dispatch:', err);
    throw err;
  }
}

function startScheduler() {
  // Run automatically every morning at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler Cron] Triggered 08:00 AM automated dispatch...');
    await triggerDailyAutoDispatch();
  });

  // Also run every hour to check for any missed sends
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler Cron] Hourly check for pending occasion dispatches...');
    await triggerDailyAutoDispatch();
  });

  console.log('[Scheduler] Cron auto-dispatcher initialized (Scheduled at 08:00 AM daily and hourly checks).');
}

module.exports = { startScheduler, triggerDailyAutoDispatch };
