const express = require('express');
const router = express.Router();
const { authMiddleware, login } = require('../middleware/auth');
const BusinessModel = require('../database/models/business');
const ConversationModel = require('../database/models/conversation');
const MessageModel = require('../database/models/message');
const KnowledgeModel = require('../database/models/knowledge');
const { syncKnowledgeBase, embedAndStore } = require('../services/embeddings');
const { createAgent, registerPhoneNumber, updateAgentWebhook } = require('../services/retell');
const { processMessage, finalizeConversation } = require('../services/rag');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// ==========================================
// PUBLIC WIDGET ROUTES
// ==========================================

router.post('/widget/chat', async (req, res) => {
  try {
    const { business_id, conversation_id, message } = req.body;

    if (!business_id || !message) {
      return res.status(400).json({ error: 'business_id and message are required' });
    }

    let activeConversationId = conversation_id;

    // Create a new conversation if not provided
    if (!activeConversationId) {
      const convo = ConversationModel.create({
        business_id,
        channel: 'web',
        caller_phone: 'Web visitor'
      });
      activeConversationId = convo.id;
    }

    // Process using RAG pipeline
    const result = await processMessage({
      businessId: business_id,
      conversationId: activeConversationId,
      userMessage: message
    });

    res.json({
      conversation_id: activeConversationId,
      response: result.response
    });
  } catch (error) {
    console.error('❌ Widget chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/widget/close', async (req, res) => {
  try {
    const { conversation_id } = req.body;
    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id is required' });
    }

    const result = await finalizeConversation(conversation_id);
    res.json({ success: true, summary: result ? result.summary : '' });
  } catch (error) {
    console.error('❌ Widget close error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/widget/business/:id', (req, res) => {
  try {
    const business = BusinessModel.getById(req.params.id);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    
    res.json({
      id: business.id,
      name: business.name,
      type: business.type,
      greeting_message: business.greeting_message,
      description: business.description
    });
  } catch (error) {
    console.error('❌ Widget business fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// AUTH
// ==========================================

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const result = login(username, password);
  if (!result) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json(result);
});

// All routes below require authentication
router.use(authMiddleware);

// ==========================================
// BUSINESS
// ==========================================

router.get('/business', (req, res) => {
  try {
    const businesses = BusinessModel.getAll();
    res.json(businesses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/business/:id', (req, res) => {
  try {
    const business = BusinessModel.getById(req.params.id);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    business.phone_numbers = BusinessModel.getPhoneNumbers(business.id);
    res.json(business);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/business', async (req, res) => {
  try {
    const { name, type, description, phone, email, address, greeting_message, ai_personality } = req.body;

    if (!name) return res.status(400).json({ error: 'Business name is required' });

    const business = BusinessModel.create({
      name, type, description, phone, email, address, greeting_message, ai_personality
    });

    res.status(201).json(business);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/business/:id', async (req, res) => {
  try {
    const business = BusinessModel.update(req.params.id, req.body);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    // If Retell is configured and agent exists, sync its WebSocket webhook URL
    if (config.retellApiKey && business.retell_agent_id && config.ngrokUrl) {
      try {
        const wsUrl = `${config.ngrokUrl.replace(/^http/, 'ws')}/api/retell/llm-websocket`;
        await updateAgentWebhook(business.retell_agent_id, wsUrl);
      } catch (err) {
        console.warn('⚠️ Failed to sync Retell Agent webhook:', err.message);
      }
    }

    res.json(business);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/business/:id', (req, res) => {
  try {
    BusinessModel.delete(req.params.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Setup phone number for a business (via Retell)
router.post('/business/:id/setup-phone', async (req, res) => {
  try {
    const business = BusinessModel.getById(req.params.id);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const { phone_number } = req.body;

    // Create Retell agent if not exists
    let agentId = business.retell_agent_id;
    if (!agentId) {
      const agent = await createAgent(business);
      agentId = agent.agent_id;
    }

    let finalNumber = '';
    let finalNumberId = null;

    if (phone_number) {
      finalNumber = phone_number.trim();
      finalNumberId = 'manual-link-' + Date.now();
    } else {
      // Register phone number via SDK
      const phoneResult = await registerPhoneNumber(agentId);
      finalNumber = phoneResult.phone_number;
      finalNumberId = phoneResult.phone_number_id;
    }

    // Save to database
    BusinessModel.addPhoneNumber(
      business.id,
      finalNumber,
      'retell',
      finalNumberId
    );

    res.json({
      phone_number: finalNumber,
      agent_id: agentId,
      message: 'Phone number setup successfully!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Setup Retell Web Call session
router.post('/business/:id/web-call', async (req, res) => {
  try {
    const business = BusinessModel.getById(req.params.id);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    let agentId = business.retell_agent_id;
    if (!agentId) {
      const agent = await createAgent(business);
      agentId = agent.agent_id;
    }

    const webCall = await createWebCall(agentId);

    // Create a new conversation record in our DB
    const convo = ConversationModel.create({
      business_id: business.id,
      channel: 'call',
      caller_phone: 'Web Call Simulator',
      retell_call_id: webCall.call_id
    });

    res.json({
      access_token: webCall.access_token,
      call_id: webCall.call_id,
      conversation_id: convo.id
    });
  } catch (error) {
    console.error('❌ Web Call creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CONVERSATIONS
// ==========================================

router.get('/conversations', (req, res) => {
  try {
    const { business_id, channel, status, limit, offset } = req.query;
    const conversations = ConversationModel.list({
      business_id, channel, status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/conversations/:id', (req, res) => {
  try {
    const conversation = ConversationModel.getWithMessages(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/conversations/:id/review', (req, res) => {
  try {
    const { message_id, action, reviewer_notes, corrected_response } = req.body;

    if (!message_id || !action) {
      return res.status(400).json({ error: 'message_id and action are required' });
    }

    if (!['approve', 'correct', 'flag'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve, correct, or flag' });
    }

    const review = MessageModel.addReview(message_id, {
      action, reviewer_notes, corrected_response
    });

    // If corrected, add the correction to knowledge base
    if (action === 'correct' && corrected_response) {
      const conversation = ConversationModel.getById(req.params.id);
      if (conversation) {
        const message = MessageModel.getById(message_id);
        // Find the user message that triggered this response
        const messages = MessageModel.getByConversation(conversation.id);
        const msgIndex = messages.findIndex(m => m.id === message_id);
        const userMessage = msgIndex > 0 ? messages[msgIndex - 1] : null;

        if (userMessage) {
          KnowledgeModel.create({
            business_id: conversation.business_id,
            title: `Correction: ${userMessage.content.substring(0, 50)}`,
            content: `When asked "${userMessage.content}", the correct response is: "${corrected_response}"`,
            category: 'corrections'
          });
        }
      }
    }

    res.json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/conversations/:id', (req, res) => {
  try {
    ConversationModel.delete(req.params.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// KNOWLEDGE BASE
// ==========================================

router.get('/knowledge', (req, res) => {
  try {
    const { business_id, category } = req.query;
    if (!business_id) return res.status(400).json({ error: 'business_id is required' });

    let entries;
    if (category) {
      entries = KnowledgeModel.getByCategory(business_id, category);
    } else {
      entries = KnowledgeModel.getByBusiness(business_id, false);
    }

    const categories = KnowledgeModel.getCategories(business_id);
    res.json({ entries, categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/knowledge', async (req, res) => {
  try {
    const { business_id, title, content, category } = req.body;

    if (!business_id || !title || !content) {
      return res.status(400).json({ error: 'business_id, title, and content are required' });
    }

    const entry = KnowledgeModel.create({ business_id, title, content, category });

    // Auto-embed the new entry
    try {
      await embedAndStore(business_id, entry);
    } catch (e) {
      console.error('Warning: Failed to auto-embed entry:', e.message);
    }

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/knowledge/:id', (req, res) => {
  try {
    const entry = KnowledgeModel.update(req.params.id, req.body);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/knowledge/:id', (req, res) => {
  try {
    KnowledgeModel.delete(req.params.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/knowledge/sync', async (req, res) => {
  try {
    const { business_id } = req.body;
    if (!business_id) return res.status(400).json({ error: 'business_id is required' });

    const entries = KnowledgeModel.getAllActiveText(business_id);
    const result = await syncKnowledgeBase(business_id, entries);

    res.json({ message: `Synced ${result.synced} entries to AI`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/knowledge/import-template', async (req, res) => {
  try {
    const { business_id, template } = req.body;

    if (!business_id || !template) {
      return res.status(400).json({ error: 'business_id and template are required' });
    }

    const templatePath = path.join(__dirname, '..', '..', 'templates', `${template}.json`);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: `Template "${template}" not found` });
    }

    const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));

    // Create entries
    const entries = templateData.entries.map(entry => ({
      business_id,
      title: entry.title,
      content: entry.content,
      category: entry.category
    }));

    KnowledgeModel.createBulk(entries);

    // Sync to vector store
    const allEntries = KnowledgeModel.getAllActiveText(business_id);
    await syncKnowledgeBase(business_id, allEntries);

    // Update business with template defaults
    if (templateData.defaults) {
      BusinessModel.update(business_id, {
        greeting_message: templateData.defaults.greeting_message,
        ai_personality: templateData.defaults.ai_personality
      });
    }

    res.json({
      message: `Imported ${entries.length} entries from "${template}" template`,
      count: entries.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// STATS
// ==========================================

router.get('/stats', (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ error: 'business_id is required' });

    const stats = ConversationModel.getStats(business_id);
    const knowledgeCount = KnowledgeModel.count(business_id);

    res.json({ ...stats, knowledge_entries: knowledgeCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RECORDING UPLOAD (For Local Web Calls)
// ==========================================

router.post('/widget/upload-recording', express.raw({ type: 'audio/webm', limit: '15mb' }), (req, res) => {
  try {
    const { conversation_id } = req.query;
    if (!conversation_id) return res.status(400).json({ error: 'conversation_id is required' });

    const buffer = req.body;
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'No audio data received' });
    }

    // Ensure recordings directory exists
    const dir = path.join(__dirname, '..', '..', 'data', 'recordings');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `recording-${conversation_id}.webm`;
    const filepath = path.join(dir, filename);

    // Save buffer to disk
    fs.writeFileSync(filepath, buffer);

    // Update conversation record
    const recordingUrl = `/recordings/${filename}`;
    ConversationModel.updateRecordingUrl(conversation_id, recordingUrl);

    console.log(`💾 Saved web call recording: ${filename}`);
    res.json({ success: true, url: recordingUrl });
  } catch (error) {
    console.error('❌ Failed to save web recording:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
