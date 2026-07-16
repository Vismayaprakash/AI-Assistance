const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const config = require('../config');

let genAI;
let model;
let groqClient;

function isMockEnabled() {
  const hasGemini = config.geminiApiKey && 
                    !config.geminiApiKey.includes('your_gemini') && 
                    config.geminiApiKey.trim() !== '';
  const hasGroq = config.groqApiKey && 
                  !config.groqApiKey.includes('your_groq') && 
                  config.groqApiKey.trim() !== '';
  return !hasGemini && !hasGroq;
}

function getGenAI() {
  if (!genAI && config.geminiApiKey && config.geminiApiKey.trim() !== '') {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: config.geminiModel });
  }
  return { genAI, model };
}

function getGroqClient() {
  if (!groqClient && config.groqApiKey && config.groqApiKey.trim() !== '') {
    groqClient = new Groq({ apiKey: config.groqApiKey });
  }
  return groqClient;
}

/**
 * Generate a mock response based on retrieved context chunks and heuristics
 */
function generateMockResponse(context, userMessage) {
  const query = userMessage.toLowerCase();
  
  if (context && context.length > 0) {
    let bestChunk = context[0];
    
    // Match keywords from query to find the best chunk
    for (const chunk of context) {
      const title = (chunk.title || '').toLowerCase();
      const content = (chunk.content || '').toLowerCase();
      const words = query.split(/\s+/).filter(w => w.length > 3);
      
      const hasMatch = words.some(word => title.includes(word) || content.includes(word));
      if (hasMatch) {
        bestChunk = chunk;
        break;
      }
    }
    
    // Keyword specific handlers for common receptionist questions
    if (query.includes('hour') || query.includes('open') || query.includes('close') || query.includes('time') || query.includes('saturday')) {
      const hoursChunk = context.find(c => 
        (c.category || '').toLowerCase() === 'hours' || 
        (c.title || '').toLowerCase().includes('hour') || 
        (c.content || '').toLowerCase().includes('open')
      );
      if (hoursChunk) {
        return `We are open: ${hoursChunk.content}. Is there anything else I can help you with?`;
      }
    }
    
    if (query.includes('service') || query.includes('cost') || query.includes('price') || query.includes('treatment') || query.includes('cut') || query.includes('clean')) {
      const serviceChunk = context.find(c => 
        (c.category || '').toLowerCase().includes('service') || 
        (c.title || '').toLowerCase().includes('service') || 
        (c.content || '').toLowerCase().includes('price') || 
        (c.content || '').toLowerCase().includes('cost')
      );
      if (serviceChunk) {
        return `Regarding services and pricing: ${serviceChunk.content}. Would you like to schedule an appointment for that?`;
      }
    }

    return `Yes! Here is what I found: ${bestChunk.content}. Does that answer your question?`;
  }
  
  // Direct response fallbacks
  if (query.includes('hello') || query.includes('hi ') || query.includes('hey')) {
    return "Hello! Thanks for calling. How can I help you today?";
  }
  
  if (query.includes('appointment') || query.includes('book') || query.includes('schedule')) {
    return "I can certainly help you book an appointment! Could you please tell me your name, preferred date and time, and which service you'd like to book?";
  }
  
  return "I don't have that information in my system, but I can take down your message and have someone from our team call you back. What is the best number to reach you at?";
}

/**
 * Generate a response using Groq (Llama 3.3) with Gemini as a fallback
 */
async function generateResponse({ systemPrompt, context, conversationHistory, userMessage }) {
  if (isMockEnabled()) {
    console.log('ℹ️ LLM key not configured or placeholder. Generating mock response.');
    return generateMockResponse(context, userMessage);
  }

  // Build the full prompt
  let fullPrompt = systemPrompt + '\n\n';

  if (context && context.length > 0) {
    fullPrompt += '--- RELEVANT KNOWLEDGE BASE INFORMATION ---\n';
    context.forEach((chunk, i) => {
      fullPrompt += `[${i + 1}] ${chunk.title || 'Info'}: ${chunk.content}\n\n`;
    });
    fullPrompt += '--- END OF KNOWLEDGE BASE ---\n\n';
  }

  fullPrompt += 'IMPORTANT: Only use the knowledge base information above to answer. ';
  fullPrompt += 'If the answer is not in the knowledge base, politely say you don\'t have that information ';
  fullPrompt += 'and suggest the caller contact the business directly.\n\n';

  // Build conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    fullPrompt += '--- CONVERSATION SO FAR ---\n';
    conversationHistory.forEach(msg => {
      const speaker = msg.role === 'assistant' ? 'You (AI Receptionist)' : 'Caller';
      fullPrompt += `${speaker}: ${msg.content}\n`;
    });
    fullPrompt += '--- END OF CONVERSATION ---\n\n';
  }

  fullPrompt += `Caller: ${userMessage}\n`;
  fullPrompt += 'You (AI Receptionist):';

  // 1. Try Groq first if key is configured
  if (config.groqApiKey && config.groqApiKey.trim() !== '') {
    try {
      console.log(`🤖 Routing call to Groq LLM (${config.groqModel})...`);
      const groq = getGroqClient();
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a professional AI phone receptionist. Respond directly, concisely, and keep answers short for natural phone conversation. Do not add markdown formatting (like asterisks or bullet points) since this text will be read aloud by TTS.'
          },
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        model: config.groqModel,
        temperature: 0.3,
        max_tokens: 150
      });
      const response = chatCompletion.choices[0].message.content;
      return response.trim();
    } catch (error) {
      console.error('❌ Groq API error:', error.message);
      if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
        throw error; // If no Gemini fallback, throw
      }
      console.log('🔄 Falling back to Gemini LLM...');
    }
  }

  // 2. Try Gemini
  const { model } = getGenAI();
  try {
    console.log('🤖 Routing call to Gemini LLM...');
    const result = await model.generateContent(fullPrompt);
    const response = result.response.text();
    return response.trim();
  } catch (error) {
    console.error('❌ Gemini API error:', error.message);
    throw error;
  }
}

/**
 * Generate embeddings using Gemini (generous free tier, essential for ChromaDB RAG search)
 */
async function generateEmbedding(text) {
  // If we don't have Gemini but we do have Groq, we fallback to a mock embedding or error.
  // We keep Gemini here because Groq doesn't provide embeddings.
  const hasGemini = config.geminiApiKey && 
                    !config.geminiApiKey.includes('your_gemini') && 
                    config.geminiApiKey.trim() !== '';
  
  if (!hasGemini) {
    console.log('ℹ️ Gemini API key not configured for embeddings. Generating mock embedding vector.');
    // Return a dummy vector of 768 values
    return Array.from({ length: 768 }, () => Math.random() - 0.5);
  }

  const { genAI } = getGenAI();
  const embeddingModel = genAI.getGenerativeModel({ model: config.geminiEmbeddingModel });

  try {
    const result = await embeddingModel.embedContent({
      content: { parts: [{ text: text }] },
      outputDimensionality: 768
    });
    return result.embedding.values;
  } catch (error) {
    console.error('❌ Embedding error:', error.message);
    throw error;
  }
}

/**
 * Generate a conversation summary using Groq with Gemini fallback
 */
async function generateSummary(messages) {
  if (isMockEnabled()) {
    return "Mock Summary: Caller inquired about business and receptionist answered questions using local knowledge base.";
  }

  const transcript = messages.map(m => {
    const speaker = m.role === 'assistant' ? 'AI' : 'Caller';
    return `${speaker}: ${m.content}`;
  }).join('\n');

  const prompt = `Summarize this phone conversation in 1-2 sentences. Focus on what the caller wanted and the outcome.\n\n${transcript}\n\nSummary:`;

  // 1. Try Groq first
  if (config.groqApiKey && config.groqApiKey.trim() !== '') {
    try {
      console.log('🤖 Routing summary to Groq...');
      const groq = getGroqClient();
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        model: config.groqModel,
        temperature: 0.2,
        max_tokens: 100
      });
      return chatCompletion.choices[0].message.content.trim();
    } catch (error) {
      console.error('❌ Groq summary generation error:', error.message);
      if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
        return 'Summary unavailable (Groq error)';
      }
      console.log('🔄 Falling back to Gemini for summary...');
    }
  }

  // 2. Try Gemini
  const { model } = getGenAI();
  try {
    console.log('🤖 Routing summary to Gemini...');
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('❌ Gemini summary generation error:', error.message);
    return 'Summary unavailable';
  }
}

module.exports = { generateResponse, generateEmbedding, generateSummary };
