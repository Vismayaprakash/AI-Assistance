const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../init');

const ConversationModel = {
  /**
   * Create a new conversation
   */
  create({ business_id, channel = 'call', caller_phone = null, visitor_id = null, retell_call_id = null, recording_url = null }) {
    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO conversations (id, business_id, channel, caller_phone, visitor_id, retell_call_id, recording_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, business_id, channel, caller_phone, visitor_id, retell_call_id, recording_url);

    return this.getById(id);
  },

  /**
   * Get conversation by ID
   */
  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  },

  /**
   * Get conversation by Retell call ID
   */
  getByRetellCallId(retellCallId) {
    const db = getDb();
    return db.prepare('SELECT * FROM conversations WHERE retell_call_id = ?').get(retellCallId);
  },

  /**
   * Get conversation with all its messages
   */
  getWithMessages(id) {
    const db = getDb();
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!conversation) return null;

    conversation.messages = db.prepare(`
      SELECT m.*, r.action as review_action, r.corrected_response, r.reviewer_notes
      FROM messages m
      LEFT JOIN reviews r ON r.message_id = m.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(id);

    return conversation;
  },

  /**
   * List conversations with filters
   */
  list({ business_id, channel, status, limit = 50, offset = 0 } = {}) {
    const db = getDb();
    let query = 'SELECT * FROM conversations WHERE 1=1';
    const params = [];

    if (business_id) {
      query += ' AND business_id = ?';
      params.push(business_id);
    }
    if (channel) {
      query += ' AND channel = ?';
      params.push(channel);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params);
  },

  /**
   * Update conversation status
   */
  updateStatus(id, status) {
    const db = getDb();
    const updates = { status };
    if (status === 'completed' || status === 'ended') {
      db.prepare(`
        UPDATE conversations SET status = ?, ended_at = datetime('now') WHERE id = ?
      `).run(status, id);
    } else {
      db.prepare('UPDATE conversations SET status = ? WHERE id = ?').run(status, id);
    }
    return this.getById(id);
  },

  /**
   * Update conversation duration
   */
  updateDuration(id, durationSeconds) {
    const db = getDb();
    db.prepare('UPDATE conversations SET duration_seconds = ? WHERE id = ?').run(durationSeconds, id);
    return this.getById(id);
  },

  /**
   * Update conversation recording URL
   */
  updateRecordingUrl(id, recordingUrl) {
    const db = getDb();
    db.prepare('UPDATE conversations SET recording_url = ? WHERE id = ?').run(recordingUrl, id);
    return this.getById(id);
  },

  /**
   * Update conversation summary
   */
  updateSummary(id, summary) {
    const db = getDb();
    db.prepare('UPDATE conversations SET summary = ? WHERE id = ?').run(summary, id);
    return this.getById(id);
  },

  /**
   * Get stats for a business
   */
  getStats(businessId) {
    const db = getDb();

    const total = db.prepare(
      'SELECT COUNT(*) as count FROM conversations WHERE business_id = ?'
    ).get(businessId);

    const today = db.prepare(`
      SELECT COUNT(*) as count FROM conversations
      WHERE business_id = ? AND date(started_at) = date('now')
    `).get(businessId);

    const thisWeek = db.prepare(`
      SELECT COUNT(*) as count FROM conversations
      WHERE business_id = ? AND started_at >= datetime('now', '-7 days')
    `).get(businessId);

    const avgDuration = db.prepare(`
      SELECT AVG(duration_seconds) as avg_duration FROM conversations
      WHERE business_id = ? AND duration_seconds > 0
    `).get(businessId);

    const pendingReviews = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.business_id = ? AND m.role = 'assistant' AND m.reviewed = 0
    `).get(businessId);

    const byChannel = db.prepare(`
      SELECT channel, COUNT(*) as count FROM conversations
      WHERE business_id = ? GROUP BY channel
    `).all(businessId);

    return {
      total: total.count,
      today: today.count,
      this_week: thisWeek.count,
      avg_duration_seconds: Math.round(avgDuration.avg_duration || 0),
      pending_reviews: pendingReviews.count,
      by_channel: byChannel
    };
  },

  /**
   * Delete a conversation and its messages
   */
  delete(id) {
    const db = getDb();
    return db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }
};

module.exports = ConversationModel;
