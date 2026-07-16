const Retell = require('retell-sdk').default;
const config = require('../config');
const BusinessModel = require('../database/models/business');
const { buildSystemPrompt } = require('./rag');

let retellClient;

/**
 * Get Retell AI client
 */
function getRetellClient() {
  if (!retellClient) {
    retellClient = new Retell({ apiKey: config.retellApiKey });
  }
  return retellClient;
}

/**
 * Create a Retell AI agent for a business
 */
async function createAgent(business) {
  const client = getRetellClient();

  const wsUrl = config.ngrokUrl
    ? `${config.ngrokUrl.replace(/^http/, 'ws')}/api/retell/llm-websocket`
    : '';

  try {
    const agentParams = {
      agent_name: `Receptionist - ${business.name}`,
      response_engine: {
        type: 'custom-llm',
        llm_websocket_url: wsUrl || 'ws://localhost:3000/api/retell/llm-websocket' // fallback placeholder
      },
      voice_id: '11labs-Adrian', // Natural male voice
      language: 'en-US',
      opt_out_sensitive_data_storage: false,
      enable_backchannel: true, // Natural "uh-huh" responses
      backchannel_frequency: 0.8,
      ambient_sound: null,
      responsiveness: 0.8,
      interruption_sensitivity: 1.0,
      reminder_trigger_ms: 10000, // Remind after 10s of silence
      reminder_max_count: 2,
      end_call_after_silence_ms: 30000, // End call after 30s silence
    };

    const agent = await client.agent.create(agentParams);

    // Update business with agent ID
    BusinessModel.update(business.id, { retell_agent_id: agent.agent_id });

    console.log(`✅ Created Retell agent for "${business.name}": ${agent.agent_id}`);
    return agent;
  } catch (error) {
    console.error('❌ Failed to create Retell agent:', error.message);
    throw error;
  }
}

/**
 * Register a phone number with Retell and link to agent
 */
async function registerPhoneNumber(agentId) {
  const client = getRetellClient();

  try {
    const phoneNumber = await client.phoneNumber.create({
      agent_id: agentId,
    });

    console.log(`✅ Phone number registered: ${phoneNumber.phone_number}`);
    return phoneNumber;
  } catch (error) {
    console.error('❌ Failed to register phone number:', error.message);
    throw error;
  }
}

/**
 * Update agent's webhook URL (for custom LLM)
 */
async function updateAgentWebhook(agentId, webhookUrl) {
  const client = getRetellClient();

  try {
    const agent = await client.agent.update(agentId, {
      response_engine: {
        type: 'custom-llm',
        llm_websocket_url: webhookUrl,
      },
      interruption_sensitivity: 1.0,
    });

    console.log(`✅ Updated agent ${agentId} with custom LLM WebSocket URL: ${webhookUrl}`);
    return agent;
  } catch (error) {
    console.error('❌ Failed to update agent webhook:', error.message);
    throw error;
  }
}

/**
 * Get call details from Retell
 */
async function getCallDetails(callId) {
  const client = getRetellClient();

  try {
    return await client.call.retrieve(callId);
  } catch (error) {
    console.error('❌ Failed to get call details:', error.message);
    return null;
  }
}

/**
 * List phone numbers
 */
async function listPhoneNumbers() {
  const client = getRetellClient();

  try {
    return await client.phoneNumber.list();
  } catch (error) {
    console.error('❌ Failed to list phone numbers:', error.message);
    return [];
  }
}

/**
 * Create a Web Call session (returns access token)
 */
async function createWebCall(agentId) {
  const client = getRetellClient();

  try {
    const webCall = await client.call.createWebCall({
      agent_id: agentId,
    });
    console.log(`✅ Created Web Call session: ${webCall.call_id}`);
    return webCall;
  } catch (error) {
    console.error('❌ Failed to create Web Call session:', error.message);
    throw error;
  }
}

/**
 * Validate Retell webhook signature
 */
function validateWebhookSignature(payload, signature, apiKey) {
  // Retell uses the API key to sign webhooks
  // In production, validate the x-retell-signature header
  return true; // Simplified for MVP — add proper validation in production
}

module.exports = {
  getRetellClient,
  createAgent,
  registerPhoneNumber,
  updateAgentWebhook,
  getCallDetails,
  listPhoneNumbers,
  validateWebhookSignature,
  createWebCall
};
