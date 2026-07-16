const { queryRelevant } = require('./embeddings');
const { generateResponse, generateSummary } = require('./llm');
const BusinessModel = require('../database/models/business');
const MessageModel = require('../database/models/message');
const ConversationModel = require('../database/models/conversation');
const config = require('../config');

/**
 * Build the system prompt for a business
 */
function buildSystemPrompt(business) {
  const hours = business.operating_hours;
  let hoursText = '';
  if (hours && typeof hours === 'object' && Object.keys(hours).length > 0) {
    hoursText = '\n\nOperating Hours:\n';
    for (const [day, time] of Object.entries(hours)) {
      hoursText += `  ${day}: ${time}\n`;
    }
  }

  return `You are an AI receptionist for "${business.name}", a ${business.type}.
${business.description ? `\nAbout the business: ${business.description}` : ''}
${business.phone ? `\nBusiness phone: ${business.phone}` : ''}
${business.email ? `\nBusiness email: ${business.email}` : ''}
${business.address ? `\nAddress: ${business.address}` : ''}
${hoursText}

Your personality: ${business.ai_personality || 'professional, friendly, and helpful'}

Guidelines:
- Be concise and conversational (this is a phone call, not an essay)
- Keep responses under 2-3 sentences when possible
- If asked to book an appointment, collect: name, preferred date/time, service needed, and phone number
- If you don't know something, say "I don't have that information, but I can have someone from our team call you back"
- Never make up information that isn't in your knowledge base
- Be warm and ${business.type === 'dental' ? 'reassuring — many callers may be nervous about dental visits' : 'welcoming — make callers feel excited about their visit'}
- Always end by asking if there's anything else you can help with`;
}

/**
 * Process a message through the RAG pipeline
 * This is the core brain of the AI receptionist
 */
async function processMessage({ businessId, conversationId, userMessage }) {
  // 1. Get business info
  const business = BusinessModel.getById(businessId);
  if (!business) throw new Error('Business not found');

  // 2. Get relevant knowledge chunks from vector store
  const relevantChunks = await queryRelevant(businessId, userMessage, config.ragTopK);

  // 3. Get conversation history for context
  const history = conversationId
    ? MessageModel.getRecentForContext(conversationId, config.maxConversationHistory)
    : [];

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(business);

  // 5. Generate response using Gemini
  const aiResponse = await generateResponse({
    systemPrompt,
    context: relevantChunks,
    conversationHistory: history,
    userMessage
  });

  // 6. Save messages to database
  if (conversationId) {
    MessageModel.create({ conversation_id: conversationId, role: 'user', content: userMessage });
    MessageModel.create({ conversation_id: conversationId, role: 'assistant', content: aiResponse });
  }

  return {
    response: aiResponse,
    context_used: relevantChunks.length,
    business_name: business.name
  };
}

/**
 * Process and respond for a Retell AI call (real-time)
 * This doesn't save to DB — Retell sends the full transcript later via webhook
 */
async function processCallMessage({ businessId, userMessage, conversationHistory = [] }) {
  // 1. Get business info
  const business = BusinessModel.getById(businessId);
  if (!business) throw new Error('Business not found');

  // 2. Get relevant knowledge
  const relevantChunks = await queryRelevant(businessId, userMessage, config.ragTopK);

  // 3. Build system prompt
  const systemPrompt = buildSystemPrompt(business);

  // 4. Generate response
  const aiResponse = await generateResponse({
    systemPrompt,
    context: relevantChunks,
    conversationHistory,
    userMessage
  });

  return {
    response: aiResponse,
    context_used: relevantChunks.length
  };
}

/**
 * Summarize and finalize a conversation after it ends
 */
async function finalizeConversation(conversationId) {
  const conversation = ConversationModel.getWithMessages(conversationId);
  if (!conversation || !conversation.messages.length) return;

  // Generate summary
  const summary = await generateSummary(conversation.messages);
  ConversationModel.updateSummary(conversationId, summary);
  ConversationModel.updateStatus(conversationId, 'completed');

  return { summary };
}

module.exports = { processMessage, processCallMessage, finalizeConversation, buildSystemPrompt };
