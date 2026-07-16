const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'copilot.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  // 1. Create sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    )
  `);

  // 2. Create session_messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      role TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // 3. Create knowledge_base table
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id TEXT PRIMARY KEY,
      title TEXT,
      category TEXT,
      content TEXT
    )
  `);

  // Auto-seed if database is brand new and empty
  const count = db.prepare('SELECT COUNT(*) as count FROM knowledge_base').get().count;
  if (count === 0) {
    const seedData = [
      {
        title: 'Operating Hours',
        category: 'hours',
        content: 'We are open Monday through Friday from 9:00 AM to 6:00 PM, and Saturday from 9:00 AM to 1:00 PM. We are closed on Sundays.'
      },
      {
        title: 'Cavity Checkups & Fillings',
        category: 'services',
        content: 'Cavity checkups are $50. If a composite (white) filling is needed, the price ranges from $150 to $250 depending on the size of the cavity.'
      },
      {
        title: 'Root Canal Treatments',
        category: 'services',
        content: 'Root canal therapy starts at $600 for front teeth and ranges up to $900 for molars. An examination is required first to determine treatment feasibility.'
      },
      {
        title: 'Teeth Whitening special',
        category: 'pricing',
        content: 'We offer professional in-office teeth whitening for $299 (normally $450). It takes about 60 minutes and guarantees 4-8 shades lighter teeth.'
      },
      {
        title: 'Appointment Cancellations',
        category: 'policies',
        content: 'We require at least 24 hours notice for appointment cancellations or rescheduling. Cancellations with less than 24 hours notice may incur a $25 fee.'
      },
      {
        title: 'Insurance Accepted',
        category: 'billing',
        content: 'We accept most major dental PPO insurance plans including Delta Dental, MetLife, Cigna, Aetna, and Blue Cross. We do not accept HMO plans or Medicaid.'
      }
    ];

    const stmt = db.prepare('INSERT INTO knowledge_base (id, title, category, content) VALUES (?, ?, ?, ?)');
    for (const d of seedData) {
      stmt.run(uuidv4(), d.title, d.category, d.content);
    }
    console.log('✅ SQLite knowledge base successfully seeded with 6 starter FAQ cards');
  }
}

// ==========================================
// DB OPERATIONS
// ==========================================

const dbOps = {
  createSession() {
    const id = uuidv4();
    getDb().prepare('INSERT INTO sessions (id) VALUES (?)').run(id);
    return id;
  },

  addMessage(sessionId, role, content) {
    const id = uuidv4();
    getDb().prepare('INSERT INTO session_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)')
      .run(id, sessionId, role, content);
    return { id, sessionId, role, content };
  },

  getSessionMessages(sessionId) {
    return getDb().prepare('SELECT role, content, created_at FROM session_messages WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId);
  },

  endSession(sessionId, summary) {
    getDb().prepare('UPDATE sessions SET summary = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(summary, sessionId);
  },

  addKnowledge(title, category, content) {
    const id = uuidv4();
    getDb().prepare('INSERT INTO knowledge_base (id, title, category, content) VALUES (?, ?, ?, ?)')
      .run(id, title, category, content);
    return { id, title, category, content };
  },

  getKnowledgeList() {
    return getDb().prepare('SELECT * FROM knowledge_base').all();
  },

  deleteKnowledge(id) {
    return getDb().prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
  },

  queryKnowledge(queryText) {
    const words = queryText.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (words.length === 0) return [];

    // Search matches where title or content matches words
    const conditions = words.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
    const params = [];
    words.forEach(w => {
      params.push(`%${w}%`);
      params.push(`%${w}%`);
    });

    return getDb().prepare(`SELECT * FROM knowledge_base WHERE ${conditions} LIMIT 5`).all(...params);
  }
};

module.exports = dbOps;
