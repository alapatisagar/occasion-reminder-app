const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'occasions.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Occasions Table
  db.run(`
    CREATE TABLE IF NOT EXISTS occasions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_phone TEXT,
      occasion_type TEXT NOT NULL, -- Birthday, Anniversary, Custom
      date_month INTEGER NOT NULL, -- 1-12
      date_day INTEGER NOT NULL,   -- 1-31
      year INTEGER,                -- Optional birth/anniversary year
      custom_message TEXT NOT NULL,
      send_time TEXT DEFAULT '08:00', -- HH:MM 24hr format
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings Table (SMTP, Sender Info, Twilio, etc.)
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Message Logs Table
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occasion_id INTEGER,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      occasion_type TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL, -- SUCCESS, FAILED
      details TEXT,
      FOREIGN KEY(occasion_id) REFERENCES occasions(id) ON DELETE SET NULL
    )
  `);
});

// Helper Promise wrappers for SQLite
const dbQuery = {
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

module.exports = { db, dbQuery };
