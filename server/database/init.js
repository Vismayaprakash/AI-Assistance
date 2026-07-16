const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db;

function getDb() {
  if (!db) {
    // Ensure data directory exists
    const dataDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(config.dbPath);

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    -- Businesses table
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'general',
      description TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      operating_hours TEXT DEFAULT '{}',
      greeting_message TEXT DEFAULT 'Thank you for calling. How can I help you today?',
      ai_personality TEXT DEFAULT 'professional, friendly, and helpful',
      retell_agent_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Phone numbers mapped to businesses
    CREATE TABLE IF NOT EXISTS phone_numbers (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL UNIQUE,
      business_id TEXT NOT NULL,
      provider TEXT DEFAULT 'retell',
      provider_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'call',
      caller_phone TEXT,
      visitor_id TEXT,
      status TEXT DEFAULT 'active',
      duration_seconds INTEGER DEFAULT 0,
      retell_call_id TEXT,
      recording_url TEXT,
      summary TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    -- Individual messages within conversations
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      reviewed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Human reviews of AI responses
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      reviewer_notes TEXT,
      corrected_response TEXT,
      action TEXT NOT NULL DEFAULT 'approve',
      reviewed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    -- Knowledge base entries
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    -- Dashboard users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      business_id TEXT,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL
    );

    -- Create indexes for frequent queries
    CREATE INDEX IF NOT EXISTS idx_conversations_business ON conversations(business_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_reviewed ON messages(reviewed);
    CREATE INDEX IF NOT EXISTS idx_knowledge_base_business ON knowledge_base(business_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_base_active ON knowledge_base(is_active);
    CREATE INDEX IF NOT EXISTS idx_phone_numbers_number ON phone_numbers(phone_number);
  `);

  console.log('✅ Database schema initialized');
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
