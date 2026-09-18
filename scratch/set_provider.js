const { dbQuery } = require('../database');

(async () => {
  await dbQuery.run(
    `INSERT INTO settings (key, value) VALUES ('sms_provider', 'email_to_sms') ON CONFLICT(key) DO UPDATE SET value = 'email_to_sms'`
  );
  console.log('Successfully set default provider to email_to_sms!');
  process.exit(0);
})();
