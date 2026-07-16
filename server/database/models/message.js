const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../init');

const MessageModel = {
  /**
   * Create a new message
   */
  create({ conversation_id, role, content }) {
    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, ?, ?)
    `).run(id, conversation_id, role, content);

    return this.getById(id);
  },

  /**
   * Bulk create messages (for saving full transcripts)
   */
  createBulk(messages) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = db.transaction((msgs) => {
      for (const msg of msgs) {
        stmt.run(uuidv4(), msg.conversation_id, msg.role, msg.content);
      }
    });

    insertMany(messages);
  },

  /**
   * Delete messages for a conversation
   */
  deleteForConversation(conversationId) {
    const db = getDb();
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
  },

  /**
   * Get message by ID
   */
  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  },

  /**
   * Get messages for a conversation
   */
  getByConversation(conversationId, limit = 100) {
    const db = getDb();
    return db.prepare(`
      SELECT m.*, r.action as review_action, r.corrected_response, r.reviewer_notes
      FROM messages m
      LEFT JOIN reviews r ON r.message_id = m.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
      LIMIT ?
    `).all(conversationId, limit);
  },

  /**
   * Get recent messages for RAG context
   */
  getRecentForContext(conversationId, limit = 10) {
    const db = getDb();
    return db.prepare(`
      SELECT role, content FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(conversationId, limit).reverse();
  },

  /**
   * Mark a message as reviewed
   */
  markReviewed(id) {
    const db = getDb();
    db.prepare('UPDATE messages SET reviewed = 1 WHERE id = ?').run(id);
    return this.getById(id);
  },

  /**
   * Add a review for a message
   */
  addReview(messageId, { action, reviewer_notes = '', corrected_response = '' }) {
    const db = getDb();
    const reviewId = uuidv4();

    db.prepare(`
      INSERT INTO reviews (id, message_id, action, reviewer_notes, corrected_response)
      VALUES (?, ?, ?, ?, ?)
    `).run(reviewId, messageId, action, reviewer_notes, corrected_response);

    // Mark the message as reviewed
    this.markReviewed(messageId);

    return {
      id: reviewId,
      message_id: messageId,
      action,
      reviewer_notes,
      corrected_response
    };
  },

  /**
   * Get unreviewed messages for a business
   */
  getUnreviewed(businessId, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT m.*, c.business_id, c.channel, c.caller_phone
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.business_id = ? AND m.role = 'assistant' AND m.reviewed = 0
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(businessId, limit);
  },

  /**
   * Get review history
   */
  getReviews(businessId, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, m.content as original_response, m.conversation_id
      FROM reviews r
      JOIN messages m ON m.id = r.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.business_id = ?
      ORDER BY r.reviewed_at DESC
      LIMIT ?
    `).all(businessId, limit);
  }
};

module.exports = MessageModel;
