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

  // Extract call ID from request URL path
  const pathname = req.url.split('?')[0]; // Strip query parameters
  const pathParts = pathname.split('/');
  const callId = pathParts[pathParts.length - 1];

  let businessId = null;
  let conversationHistory = [];

  console.log(`🔌 Call ID from WebSocket path: ${callId}`);

  // Fetch business ID from database by Retell Call ID
  if (callId && callId.startsWith('call_')) {
    const convo = ConversationModel.getByRetellCallId(callId);
    if (convo) {
      businessId = convo.business_id;
      const business = BusinessModel.getById(businessId);
      console.log(`🧠 Found business for call ${callId}: ${business ? business.name : 'Unknown'}`);
    } else {
      console.warn(`⚠️ No conversation found in DB for Retell Call ID: ${callId}`);
    }
  }

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`✉️ Retell WS message: ${message.interaction_type}`);
      if (message.interaction_type === 'call_details') {
        console.log('Metadata agent_id:', message.call?.agent_id);
      }

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

          // Save transcript in real-time to avoid dependency on webhook
          if (callId) {
            const convo = ConversationModel.getByRetellCallId(callId);
            if (convo) {
              const fullMessages = conversationHistory.map(m => ({
                conversation_id: convo.id,
                role: m.role,
                content: m.content
              }));
              // Append assistant response we just sent
              fullMessages.push({
                conversation_id: convo.id,
                role: 'assistant',
                content: result.response
              });

              // Overwrite current messages in DB with the updated full transcript
              MessageModel.deleteForConversation(convo.id);
              MessageModel.createBulk(fullMessages);

              // Update duration in real-time
              const elapsedSeconds = Math.round((Date.now() - new Date(convo.started_at + 'Z').getTime()) / 1000);
              if (elapsedSeconds > 0) {
                ConversationModel.updateDuration(convo.id, elapsedSeconds);
              }
            }
          }

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

  ws.on('close', async () => {
    console.log('🔌 Retell LLM WebSocket disconnected');
    if (callId) {
      try {
        const convo = ConversationModel.getByRetellCallId(callId);
        if (convo) {
          console.log(`🏁 Finalizing conversation ${convo.id} on WebSocket close...`);
          await finalizeConversation(convo.id);
          
          // Trigger polling to fetch the official recording URL from Retell API
          setTimeout(() => syncRetellCallData(callId), 5000);
        }
      } catch (err) {
        console.error('❌ Failed to finalize conversation on WS close:', err.message);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('❌ LLM WebSocket error:', error);
  });
}

/**
 * Sync call details (recording URL and duration) directly from Retell's API as a webhook backup
 */
async function syncRetellCallData(callId, attemptsLeft = 3) {
  try {
    console.log(`🔍 Syncing Retell call details for ${callId} (attempts left: ${attemptsLeft})...`);
    const details = await getCallDetails(callId);
    if (!details) return;

    const convo = ConversationModel.getByRetellCallId(callId);
    if (!convo) return;

    if (details.recording_url) {
      console.log(`💾 Retell recording URL found: ${details.recording_url}`);
      ConversationModel.updateRecordingUrl(convo.id, details.recording_url);
    }

    if (details.duration_ms) {
      ConversationModel.updateDuration(convo.id, Math.round(details.duration_ms / 1000));
    }

    // If recording URL is still missing, retry in 5 seconds
    if (!details.recording_url && attemptsLeft > 1) {
      setTimeout(() => syncRetellCallData(callId, attemptsLeft - 1), 5000);
    }
  } catch (err) {
    console.error('❌ Error syncing Retell call data:', err.message);
  }
}

module.exports = { router, handleRetellLLMWebSocket };
