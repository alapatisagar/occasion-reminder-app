const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbQuery } = require('./database');
const { startScheduler, triggerDailyAutoDispatch } = require('./scheduler');
const { sendOccasionSMS } = require('./sms');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com;"
  );
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// API ROUTES: OCCASIONS (CRUD)
// -------------------------------------------------------------

app.get('/api/occasions', async (req, res) => {
  try {
    const occasions = await dbQuery.all(`SELECT * FROM occasions ORDER BY date_month ASC, date_day ASC`);
    res.json(occasions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch occasions', details: err.message });
  }
});

app.post('/api/occasions', async (req, res) => {
  try {
    const { recipient_name, recipient_phone, recipient_email, occasion_type, date_month, date_day, year, custom_message, send_time } = req.body;

    if (!recipient_name || (!recipient_phone && !recipient_email) || !occasion_type || !date_month || !date_day || !custom_message) {
      return res.status(400).json({ error: 'Missing required fields (Name, Phone, Occasion, Month, Day, Message)' });
    }

    const monthInt = parseInt(date_month, 10);
    const dayInt = parseInt(date_day, 10);

    const result = await dbQuery.run(
      `INSERT INTO occasions (recipient_name, recipient_email, recipient_phone, occasion_type, date_month, date_day, year, custom_message, send_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipient_name.trim(),
        recipient_email ? recipient_email.trim() : recipient_phone.trim(),
        recipient_phone ? recipient_phone.trim() : recipient_email.trim(),
        occasion_type.trim(),
        monthInt,
        dayInt,
        year ? parseInt(year, 10) : null,
        custom_message.trim(),
        send_time || '08:00'
      ]
    );

    res.status(201).json({ message: 'SMS Contact added successfully', id: result.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create occasion', details: err.message });
  }
});

app.put('/api/occasions/:id', async (req, res) => {
  try {
    const idInt = parseInt(req.params.id, 10);
    const { recipient_name, recipient_email, recipient_phone, occasion_type, date_month, date_day, year, custom_message, is_active } = req.body;

    const result = await dbQuery.run(
      `UPDATE occasions 
       SET recipient_name = ?, recipient_email = ?, recipient_phone = ?, occasion_type = ?, 
           date_month = ?, date_day = ?, year = ?, custom_message = ?, is_active = ?
       WHERE id = ?`,
      [
        recipient_name,
        recipient_email || recipient_phone,
        recipient_phone || recipient_email,
        occasion_type,
        parseInt(date_month, 10),
        parseInt(date_day, 10),
        year ? parseInt(year, 10) : null,
        custom_message,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        idInt
      ]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Occasion not found' });
    }

    res.json({ message: 'Occasion updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update occasion', details: err.message });
  }
});

app.delete('/api/occasions/:id', async (req, res) => {
  try {
    const idInt = parseInt(req.params.id, 10);
    const result = await dbQuery.run(`DELETE FROM occasions WHERE id = ?`, [idInt]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Occasion not found' });
    }
    res.json({ message: 'Occasion deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete occasion', details: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES: MANUAL TRIGGER & TEST DISPATCH
// -------------------------------------------------------------

app.post('/api/trigger-dispatch', async (req, res) => {
  try {
    const result = await triggerDailyAutoDispatch();
    res.json({ message: 'SMS Auto-dispatcher executed successfully', summary: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to run auto-dispatcher', details: err.message });
  }
});

app.post('/api/send-now/:id', async (req, res) => {
  try {
    const idInt = parseInt(req.params.id, 10);
    let occasion = await dbQuery.get(`SELECT * FROM occasions WHERE id = ?`, [idInt]);

    // Fallback: If exact ID not found, fetch latest created occasion
    if (!occasion) {
      occasion = await dbQuery.get(`SELECT * FROM occasions ORDER BY id DESC LIMIT 1`);
    }

    if (!occasion) {
      return res.status(404).json({ error: 'No scheduled occasion found in database. Please click Add New Contact first.' });
    }

    const toPhone = occasion.recipient_phone || occasion.recipient_email;

    const sendResult = await sendOccasionSMS({
      toPhone: toPhone,
      recipientName: occasion.recipient_name,
      occasionType: occasion.occasion_type,
      customMessage: occasion.custom_message
    });

    await dbQuery.run(
      `INSERT INTO logs (occasion_id, recipient_name, recipient_email, occasion_type, status, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [occasion.id, occasion.recipient_name, toPhone, occasion.occasion_type, sendResult.status, sendResult.details]
    );

    res.json({ message: `SMS Text Message attempt finished for ${occasion.recipient_name} (${toPhone})!`, details: sendResult });
  } catch (err) {
    await dbQuery.run(
      `INSERT INTO logs (occasion_id, recipient_name, recipient_email, occasion_type, status, details)
       VALUES (?, ?, ?, ?, 'FAILED', ?)`,
      [parseInt(req.params.id, 10) || 0, 'Recipient', 'Unknown', 'SMS', err.message]
    );
    res.status(500).json({ error: err.message || 'Failed to send SMS' });
  }
});

// -------------------------------------------------------------
// API ROUTES: LOGS & SETTINGS
// -------------------------------------------------------------

app.get('/api/logs', async (req, res) => {
  try {
    const logs = await dbQuery.all(`SELECT * FROM logs ORDER BY sent_at DESC LIMIT 100`);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbQuery.all(`SELECT key, value FROM settings`);
    const settingsObj = {};
    settings.forEach(row => {
      settingsObj[row.key] = row.key.includes('token') || row.key.includes('pass') ? '••••••••' : row.value;
    });
    res.json(settingsObj);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      if (value === '••••••••') continue;
      await dbQuery.run(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value]
      );
    }
    res.json({ message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`📱 Occasion Auto-Sender Web App running on port ${PORT}!`);
  console.log(`====================================================`);
  startScheduler();
});
