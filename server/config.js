require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
  ngrokUrl: process.env.NGROK_URL || '',

  // Google Gemini
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiEmbeddingModel: 'gemini-embedding-001',

  // Groq
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  // Retell AI
  retellApiKey: process.env.RETELL_API_KEY || '',

  // Auth
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  dashboardUsername: process.env.DASHBOARD_USERNAME || 'admin',
  dashboardPassword: process.env.DASHBOARD_PASSWORD || 'admin123',

  // Database
  dbPath: './data/receptionist.db',
  chromaPath: './data/chroma',

  // RAG Settings
  ragTopK: 5,           // Number of knowledge chunks to retrieve
  maxConversationHistory: 10,  // Max messages to include in context

  // Conversation Settings
  callTimeoutMinutes: 30,  // Auto-close conversations after inactivity
};

module.exports = config;
