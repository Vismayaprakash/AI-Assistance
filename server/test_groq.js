const path = require('path');
require('dotenv').config();

const config = require('./config');
const llm = require('./services/llm');

console.log('🔍 Running Integration Tests for Groq & Gemini...');
console.log(`- Configured Groq Model: ${config.groqModel}`);
console.log(`- Groq API Key Configured: ${config.groqApiKey ? 'Yes' : 'No'}`);
console.log(`- Gemini API Key Configured: ${config.geminiApiKey ? 'Yes' : 'No'}`);

async function runTests() {
  // Test 1: Groq text generation
  try {
    console.log('\n--- 1. Testing Groq Text Generation ---');
    const response = await llm.generateResponse({
      systemPrompt: 'You are a dental receptionist named Kelly. Be extremely polite and keep responses to one short sentence.',
      context: [
        { title: 'Clinic Hours', content: 'We are open Monday to Friday, 9 AM to 5 PM.' }
      ],
      conversationHistory: [],
      userMessage: 'What are your hours on Monday?'
    });
    console.log('✅ Response Success!');
    console.log(`Output: "${response}"`);
  } catch (error) {
    console.error('❌ Text Generation Failed:', error.message);
  }

  // Test 2: Gemini Embeddings
  try {
    console.log('\n--- 2. Testing Gemini Embeddings ---');
    const embedding = await llm.generateEmbedding('Dental teeth cleaning cost and scheduling');
    console.log('✅ Embedding Success!');
    console.log(`Vector Dimensions: ${embedding.length}`);
    console.log(`Vector Start: [${embedding.slice(0, 5).join(', ')}, ...]`);
  } catch (error) {
    console.error('❌ Embedding Failed:', error.message);
  }

  // Test 3: Groq Summarization
  try {
    console.log('\n--- 3. Testing Groq Conversation Summarization ---');
    const summary = await llm.generateSummary([
      { role: 'user', content: 'Hi, I want to book a hair cut.' },
      { role: 'assistant', content: 'Sure, we have openings at 3 PM today. Does that work?' },
      { role: 'user', content: 'Yes, please book it.' }
    ]);
    console.log('✅ Summary Success!');
    console.log(`Summary: "${summary}"`);
  } catch (error) {
    console.error('❌ Summarization Failed:', error.message);
  }
}

runTests();
