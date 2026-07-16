require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  console.log('🔑 API Key (first 6 chars):', apiKey ? apiKey.substring(0, 6) + '...' : 'Missing');
  console.log('🤖 Model Name:', modelName);

  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not defined in your environment.');
    process.exit(1);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    console.log('🔄 Sending test prompt to Gemini...');
    const result = await model.generateContent('Say hello in exactly 3 words.');
    console.log('✅ Success! Gemini response:', result.response.text().trim());
  } catch (error) {
    console.error('❌ Gemini request failed:');
    console.error(error.message);
    if (error.status) console.error('Status Code:', error.status);
  }
}

main();
