const https = require('https');
const { dbQuery } = require('../database');

(async () => {
  const tokenRow = await dbQuery.get("SELECT value FROM settings WHERE key = 'whatsapp_cloud_token'");
  const phoneIdRow = await dbQuery.get("SELECT value FROM settings WHERE key = 'whatsapp_cloud_phone_id'");

  console.log('Using Phone ID:', phoneIdRow?.value);
  console.log('Using Token:', tokenRow?.value ? tokenRow.value.substring(0, 25) + '...' : 'NULL');

  const postData = JSON.stringify({
    messaging_product: 'whatsapp',
    to: '919704225352',
    type: 'template',
    template: {
      name: 'hello_world',
      language: { code: 'en_US' }
    }
  });

  const options = {
    hostname: 'graph.facebook.com',
    port: 443,
    path: `/v18.0/${phoneIdRow.value}/messages`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokenRow.value}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Meta HTTP Status:', res.statusCode);
      console.log('Meta Response Body:', body);
      process.exit(0);
    });
  });
  req.on('error', err => {
    console.error('Network Error:', err);
    process.exit(1);
  });
  req.write(postData);
  req.end();
})();
