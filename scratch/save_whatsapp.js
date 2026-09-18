const { dbQuery } = require('../database');

(async () => {
  const phoneId = '1357953644068702';
  // Full access token from screenshot
  const token = 'EAAX44etZAsFABSqRhgU2jO1298JsRJhS0YdDnamCZCH9MGZBmoV9JSaFno4Fk2j0B45Mz2ZBVXscKGlK6ZChsMsBicEMIVvqzEuwJ1GGWj6ucaM0';

  await dbQuery.run(
    `INSERT INTO settings (key, value) VALUES ('whatsapp_cloud_phone_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [phoneId]
  );
  await dbQuery.run(
    `INSERT INTO settings (key, value) VALUES ('whatsapp_cloud_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [token]
  );
  await dbQuery.run(
    `INSERT INTO settings (key, value) VALUES ('sms_provider', 'whatsapp_cloud') ON CONFLICT(key) DO UPDATE SET value = 'whatsapp_cloud'`
  );

  console.log('Successfully saved WhatsApp Cloud API Credentials!');
  console.log('Current Settings:', await dbQuery.all('SELECT * FROM settings'));
  process.exit(0);
})();
