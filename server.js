const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbQuery } = require('./database');
const { startScheduler, triggerDailyAutoDispatch } = require('./scheduler');
const { sendOccasionEmail, getTransporter } = require('./mailer');

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

// Get all occasions
app.get('/api/occasions', async (req, res) => {
  try {
    const occasions = await dbQuery.all(`SELECT * FROM occasions ORDER BY date_month ASC, date_day ASC`);
    res.json(occasions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch occasions', details: err.message });
  }
});

// Add new occasion
app.post('/api/occasions', async (req, res) => {
  try {
    const { recipient_name, recipient_email, recipient_phone, occasion_type, date_month, date_day, year, custom_message, send_time } = req.body;

    // Security & Input Validation
    if (!recipient_name || !recipient_email || !occasion_type || !date_month || !date_day || !custom_message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const monthInt = parseInt(date_month, 10);
    const dayInt = parseInt(date_day, 10);

    if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({ error: 'Invalid month (must be 1-12)' });
    }
    if (isNaN(dayInt) || dayInt < 1 || dayInt > 31) {
      return res.status(400).json({ error: 'Invalid day (must be 1-31)' });
    }

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient_email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const result = await dbQuery.run(
      `INSERT INTO occasions (recipient_name, recipient_email, recipient_phone, occasion_type, date_month, date_day, year, custom_message, send_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipient_name.trim(),
        recipient_email.trim(),
        recipient_phone ? recipient_phone.trim() : null,
        occasion_type.trim(),
        monthInt,
        dayInt,
        year ? parseInt(year, 10) : null,
        custom_message.trim(),
        send_time || '08:00'
      ]
    );

    res.status(201).json({ message: 'Occasion added successfully', id: result.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create occasion', details: err.message });
  }
});

// Update an existing occasion
app.put('/api/occasions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { recipient_name, recipient_email, recipient_phone, occasion_type, date_month, date_day, year, custom_message, is_active } = req.body;

    const result = await dbQuery.run(
      `UPDATE occasions 
       SET recipient_name = ?, recipient_email = ?, recipient_phone = ?, occasion_type = ?, 
           date_month = ?, date_day = ?, year = ?, custom_message = ?, is_active = ?
       WHERE id = ?`,
      [
        recipient_name,
        recipient_email,
        recipient_phone,
        occasion_type,
        parseInt(date_month, 10),
        parseInt(date_day, 10),
        year ? parseInt(year, 10) : null,
        custom_message,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        id
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

// Delete an occasion
app.delete('/api/occasions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbQuery.run(`DELETE FROM occasions WHERE id = ?`, [id]);
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

// Manually trigger today's auto-dispatcher
app.post('/api/trigger-dispatch', async (req, res) => {
  try {
    const result = await triggerDailyAutoDispatch();
    res.json({ message: 'Auto-dispatcher executed successfully', summary: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to run auto-dispatcher', details: err.message });
  }
});

// Send a test email for a specific occasion immediately
app.post('/api/send-now/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const occasion = await dbQuery.get(`SELECT * FROM occasions WHERE id = ?`, [id]);

    if (!occasion) {
      return res.status(404).json({ error: 'Occasion not found' });
    }

    const sendResult = await sendOccasionEmail({
      to: occasion.recipient_email,
      recipientName: occasion.recipient_name,
      occasionType: occasion.occasion_type,
      customMessage: occasion.custom_message
    });

    const detailMsg = sendResult.previewUrl 
      ? `Sent via Test Account. Preview: ${sendResult.previewUrl}`
      : `Message ID: ${sendResult.messageId}`;

    await dbQuery.run(
      `INSERT INTO logs (occasion_id, recipient_name, recipient_email, occasion_type, status, details)
       VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
      [occasion.id, occasion.recipient_name, occasion.recipient_email, occasion.occasion_type, detailMsg]
    );

    res.json({ message: `Message sent directly to ${occasion.recipient_email}!`, details: sendResult });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES: LOGS & SETTINGS
// -------------------------------------------------------------

// Get sent message logs
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await dbQuery.all(`SELECT * FROM logs ORDER BY sent_at DESC LIMIT 100`);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  }
});

// Get Settings (obscuring pass)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbQuery.all(`SELECT key, value FROM settings`);
    const settingsObj = {};
    settings.forEach(row => {
      settingsObj[row.key] = row.key === 'smtp_pass' ? '••••••••' : row.value;
    });
    res.json(settingsObj);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
  }
});

// Save Settings
app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'smtp_pass' && value === '••••••••') continue; // Don't overwrite with masked string
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

// Test SMTP connection
app.post('/api/test-smtp', async (req, res) => {
  try {
    const { transporter, isEthereal } = await getTransporter();
    await transporter.verify();
    res.json({ 
      status: 'SUCCESS', 
      message: isEthereal 
        ? 'Using free Ethereal test account (No SMTP required!)' 
        : 'Custom SMTP connection verified successfully!'
    });
  } catch (err) {
    res.status(400).json({ status: 'FAILED', message: `SMTP verification failed: ${err.message}` });
  }
});

// Start Express Server & Background Scheduler
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎉 Occasion Auto-Sender Web App running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
  startScheduler();
});
