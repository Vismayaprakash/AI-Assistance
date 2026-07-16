const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../init');

const KnowledgeModel = {
  /**
   * Create a new knowledge base entry
   */
  create({ business_id, title, content, category = 'general' }) {
    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO knowledge_base (id, business_id, title, content, category)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, business_id, title, content, category);

    return this.getById(id);
  },

  /**
   * Bulk create entries (for template import)
   */
  createBulk(entries) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO knowledge_base (id, business_id, title, content, category)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      const created = [];
      for (const item of items) {
        const id = uuidv4();
        stmt.run(id, item.business_id, item.title, item.content, item.category || 'general');
        created.push(id);
      }
      return created;
    });

    return insertMany(entries);
  },

  /**
   * Get entry by ID
   */
  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);
  },

  /**
   * Get all entries for a business
   */
  getByBusiness(businessId, activeOnly = true) {
    const db = getDb();
    let query = 'SELECT * FROM knowledge_base WHERE business_id = ?';
    if (activeOnly) query += ' AND is_active = 1';
    query += ' ORDER BY category, title';
    return db.prepare(query).all(businessId);
  },

  /**
   * Get entries by category
   */
  getByCategory(businessId, category) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM knowledge_base
      WHERE business_id = ? AND category = ? AND is_active = 1
      ORDER BY title
    `).all(businessId, category);
  },

  /**
   * Get all active entries as text (for embedding)
   */
  getAllActiveText(businessId) {
    const db = getDb();
    return db.prepare(`
      SELECT id, title, content, category FROM knowledge_base
      WHERE business_id = ? AND is_active = 1
      ORDER BY category, title
    `).all(businessId);
  },

  /**
   * Get categories for a business
   */
  getCategories(businessId) {
    const db = getDb();
    return db.prepare(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM knowledge_base
      WHERE business_id = ? AND is_active = 1
      GROUP BY category
      ORDER BY category
    `).all(businessId);
  },

  /**
   * Update an entry
   */
  update(id, updates) {
    const db = getDb();
    const allowed = ['title', 'content', 'category', 'is_active'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE knowledge_base SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  },

  /**
   * Toggle active status
   */
  toggleActive(id) {
    const db = getDb();
    db.prepare(`
      UPDATE knowledge_base SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
      updated_at = datetime('now') WHERE id = ?
    `).run(id);
    return this.getById(id);
  },

  /**
   * Delete an entry
   */
  delete(id) {
    const db = getDb();
    return db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
  },

  /**
   * Delete all entries for a business (used before re-importing template)
   */
  deleteAllForBusiness(businessId) {
    const db = getDb();
    return db.prepare('DELETE FROM knowledge_base WHERE business_id = ?').run(businessId);
  },

  /**
   * Count entries for a business
   */
  count(businessId, activeOnly = true) {
    const db = getDb();
    let query = 'SELECT COUNT(*) as count FROM knowledge_base WHERE business_id = ?';
    if (activeOnly) query += ' AND is_active = 1';
    return db.prepare(query).get(businessId).count;
  }
};

module.exports = KnowledgeModel;
