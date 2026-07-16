const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../init');

const BusinessModel = {
  /**
   * Create a new business
   */
  create({ name, type = 'general', description = '', phone = '', email = '', address = '', greeting_message, ai_personality }) {
    const db = getDb();
    const id = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO businesses (id, name, type, description, phone, email, address, greeting_message, ai_personality)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, name, type, description, phone, email, address,
      greeting_message || 'Thank you for calling. How can I help you today?',
      ai_personality || 'professional, friendly, and helpful'
    );

    return this.getById(id);
  },

  /**
   * Get business by ID
   */
  getById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
    if (row) {
      row.operating_hours = JSON.parse(row.operating_hours || '{}');
    }
    return row;
  },

  /**
   * Get all businesses
   */
  getAll() {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM businesses ORDER BY created_at DESC').all();
    return rows.map(row => {
      row.operating_hours = JSON.parse(row.operating_hours || '{}');
      return row;
    });
  },

  /**
   * Update a business
   */
  update(id, updates) {
    const db = getDb();
    const allowed = ['name', 'type', 'description', 'phone', 'email', 'address',
      'operating_hours', 'greeting_message', 'ai_personality', 'retell_agent_id', 'is_active'];

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'operating_hours' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE businesses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  },

  /**
   * Delete a business
   */
  delete(id) {
    const db = getDb();
    return db.prepare('DELETE FROM businesses WHERE id = ?').run(id);
  },

  /**
   * Get business by Retell agent ID
   */
  getByRetellAgentId(agentId) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM businesses WHERE retell_agent_id = ?').get(agentId);
    if (row) {
      row.operating_hours = JSON.parse(row.operating_hours || '{}');
    }
    return row;
  },

  /**
   * Get business by phone number
   */
  getByPhoneNumber(phoneNumber) {
    const db = getDb();
    const row = db.prepare(`
      SELECT b.* FROM businesses b
      JOIN phone_numbers p ON p.business_id = b.id
      WHERE p.phone_number = ? AND p.is_active = 1
    `).get(phoneNumber);

    if (row) {
      row.operating_hours = JSON.parse(row.operating_hours || '{}');
    }
    return row;
  },

  /**
   * Add a phone number to a business
   */
  addPhoneNumber(businessId, phoneNumber, provider = 'retell', providerId = null) {
    const db = getDb();
    const id = uuidv4();
    db.prepare(`
      INSERT INTO phone_numbers (id, phone_number, business_id, provider, provider_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, phoneNumber, businessId, provider, providerId);
    return { id, phone_number: phoneNumber, business_id: businessId, provider, provider_id: providerId };
  },

  /**
   * Get phone numbers for a business
   */
  getPhoneNumbers(businessId) {
    const db = getDb();
    return db.prepare('SELECT * FROM phone_numbers WHERE business_id = ? AND is_active = 1').all(businessId);
  }
};

module.exports = BusinessModel;
