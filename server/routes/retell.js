const express = require('express');
const router = express.Router();
const { processCallMessage, finalizeConversation } = require('../services/rag');
const ConversationModel = require('../database/models/conversation');
const MessageModel = require('../database/models/message');
const BusinessModel = require('../database/models/business');
const { getCallDetails } = require('../services/retell');

/**
 * POST /api/retell/webhook
 * Retell sends call lifecycle events here
 */
router.post('/webhook', async (req, res) => {
  try {
    const { event, call } = req.body;

    console.log(`📞 Retell webhook event: ${event}`);

    switch (event) {
      case 'call_started': {
        // Find business by agent ID
        const business = BusinessModel.getByRetellAgentId(call.agent_id);
        if (!business) {
          console.error('❌ No business found for agent:', call.agent_id);
          return res.status(404).json({ error: 'Business not found' });
        }

        // Create conversation record
        const conversation = ConversationModel.create({
          business_id: business.id,
          channel: 'call',
          caller_phone: call.from_number || null,
          retell_call_id: call.call_id
        });

        console.log(`📞 Call started: ${call.call_id} → Business: ${business.name}`);
        break;
      }

      case 'call_ended': {
        // Find the conversation
        const conversation = ConversationModel.getByRetellCallId(call.call_id);
        if (!conversation) {
          console.error('❌ No conversation found for call:', call.call_id);
          return res.status(404).json({ error: 'Conversation not found' });
        }

        // Update duration and recording URL
        if (call.duration_ms) {
          ConversationModel.updateDuration(conversation.id, Math.round(call.duration_ms / 1000));
        }
        if (call.recording_url) {
          ConversationModel.updateRecordingUrl(conversation.id, call.recording_url);
        }

        // Save the full transcript
        if (call.transcript && call.transcript.length > 0) {
          const messages = call.transcript.map(t => ({
            conversation_id: conversation.id,
            role: t.role === 'agent' ? 'assistant' : 'user',
            content: t.content
          }));
          MessageModel.createBulk(messages);
        }

        // Finalize (generate summary, mark completed)
        await finalizeConversation(conversation.id);

        console.log(`📞 Call ended: ${call.call_id} (${Math.round((call.duration_ms || 0) / 1000)}s)`);
        break;
      }

      case 'call_analyzed': {
        // Post-call analysis from Retell (sentiment, etc.)
        const conversation = ConversationModel.getByRetellCallId(call.call_id);
        if (conversation && call.call_analysis) {
          ConversationModel.updateSummary(
            conversation.id,
            call.call_analysis.call_summary || conversation.summary
          );
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled Retell event: ${event}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Retell webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * WebSocket handler for Retell LLM
 * This is called during active calls for real-time conversation
 * Registered in server/index.js via the WebSocket upgrade
 */
async function handleRetellLLMWebSocket(ws, req) {
  console.log('🔌 Retell LLM WebSocket connected');

  let businessId = null;
  let conversationHistory = [];

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.interaction_type) {
        case 'call_details': {
          // First message — contains call metadata
          const agentId = message.call?.agent_id;
          const business = BusinessModel.getByRetellAgentId(agentId);

          if (business) {
            businessId = business.id;
            console.log(`🧠 LLM connected for business: ${business.name}`);

            // Send initial greeting
            const greeting = business.greeting_message || 'Thank you for calling. How can I help you today?';
            ws.send(JSON.stringify({
              response_id: message.response_id || 0,
              content: greeting,
              content_complete: true,
              end_call: false
            }));
          }
          break;
        }

        case 'response_required':
        case 'reminder_required': {
          // Caller said something — need to respond
          const userMessage = message.transcript?.[message.transcript.length - 1]?.content || '';

          if (!businessId || !userMessage) {
            ws.send(JSON.stringify({
              response_id: message.response_id || 0,
              content: "I'm sorry, could you repeat that?",
              content_complete: true,
              end_call: false
            }));
            break;
          }

          // Build conversation history from transcript
          conversationHistory = (message.transcript || []).map(t => ({
            role: t.role === 'agent' ? 'assistant' : 'user',
            content: t.content
          }));

          // Process through RAG
          const result = await processCallMessage({
            businessId,
            userMessage,
            conversationHistory: conversationHistory.slice(0, -1) // Exclude current message
          });

          // Send response back to Retell
          ws.send(JSON.stringify({
            response_id: message.response_id || 0,
            content: result.response,
            content_complete: true,
            end_call: false
          }));

          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ response_type: 'pong' }));
          break;
        }

        default:
          console.log(`ℹ️ Unhandled LLM message type: ${message.interaction_type}`);
      }
    } catch (error) {
      console.error('❌ LLM WebSocket error:', error);
      ws.send(JSON.stringify({
        response_id: 0,
        content: "I'm having a technical issue. Let me transfer you to our team. Please hold.",
        content_complete: true,
        end_call: false
      }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 Retell LLM WebSocket disconnected');
  });

  ws.on('error', (error) => {
    console.error('❌ LLM WebSocket error:', error);
  });
}

module.exports = { router, handleRetellLLMWebSocket };
