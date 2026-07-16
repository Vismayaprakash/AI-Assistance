require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dbOps = require('./database');

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' }) : null;

// Status check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    gemini: !!model,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  });
});

// Start Session
app.post('/api/sessions', (req, res) => {
  try {
    const sessionId = dbOps.createSession();
    res.status(201).json({ session_id: sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assist & Retrieve (RAG query)
app.post('/api/assist', async (req, res) => {
  try {
    const { session_id, text } = req.body;

    if (!session_id || !text) {
      return res.status(400).json({ error: 'session_id and text are required' });
    }

    // Save user utterance in database
    dbOps.addMessage(session_id, 'user', text);

    // Query local knowledge base
    const matchedContexts = dbOps.queryKnowledge(text);

    if (matchedContexts.length === 0) {
      // Save assistant fallback
      const fallback = "I don't have this in my knowledge base. Can I look this up for you?";
      dbOps.addMessage(session_id, 'assistant', fallback);
      return res.json({
        answer: fallback,
        sources: []
      });
    }

    // If Gemini is configured, synthesize a professional RAG response
    let answer = '';
    if (model) {
      const contextText = matchedContexts.map((c, i) => `[${i+1}] ${c.title}: ${c.content}`).join('\n\n');
      const prompt = `You are a real-time support copilot for a dental/salon receptionist.
Based on the following knowledge base:
${contextText}

Synthesize a precise, natural, and helpful 1-2 sentence response to assist the agent.
Caller's Question/Input: "${text}"

Agent Assist Answer:`;
      
      const result = await model.generateContent(prompt);
      answer = result.response.text().trim();
    } else {
      // Heuristic fallback
      answer = matchedContexts[0].content;
    }

    // Save assistant response
    dbOps.addMessage(session_id, 'assistant', answer);

    res.json({
      answer,
      sources: matchedContexts.map(c => ({ title: c.title, category: c.category }))
    });
  } catch (error) {
    console.error('Assist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// End & Analyze Session
app.post('/api/sessions/:id/analyze', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const messages = dbOps.getSessionMessages(sessionId);

    if (messages.length === 0) {
      return res.json({
        summary: 'Empty session. No conversation recorded.',
        knowledge_gaps: []
      });
    }

    const transcriptText = messages.map(m => `${m.role === 'assistant' ? 'AI' : 'Agent'}: ${m.content}`).join('\n');

    let summary = 'Conversation between support agent and client.';
    let gaps = [];

    if (model) {
      const prompt = `You are a support supervisor. Analyze the following transcript of a support conversation.

TRANSCRIPT:
${transcriptText}

Task:
1. Provide a brief 2-sentence summary of the conversation.
2. Identify any knowledge gaps (questions or topics the agent/RAG system was asked but did not have clear, complete answers for).
3. Suggest new knowledge base additions to fix these gaps.

Return your response in strict JSON format:
{
  "summary": "your summary text",
  "knowledge_gaps": [
    {
      "question": "The question asked by client",
      "suggested_title": "Concise title for new FAQ entry",
      "suggested_content": "A complete, helpful answer card content"
    }
  ]
}

Only return valid JSON. Do not wrap in markdown blocks like \`\`\`json.`;

      try {
        const result = await model.generateContent(prompt);
        let rawText = result.response.text().trim();
        // Clean markdown code blocks if Gemini wrapped it
        if (rawText.startsWith('```')) {
          rawText = rawText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        }
        
        const analysis = JSON.parse(rawText);
        summary = analysis.summary || summary;
        gaps = analysis.knowledge_gaps || [];
      } catch (err) {
        console.error('Failed to parse Gemini analysis JSON:', err);
      }
    }

    // Save summary in database
    dbOps.endSession(sessionId, summary);

    res.json({
      summary,
      knowledge_gaps: gaps
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Knowledge Base Management
app.get('/api/knowledge', (req, res) => {
  try {
    const list = dbOps.getKnowledgeList();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/knowledge', (req, res) => {
  try {
    const { title, category, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }
    const entry = dbOps.addKnowledge(title, category || 'general', content);
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/knowledge/:id', (req, res) => {
  try {
    dbOps.deleteKnowledge(req.params.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log('');
  console.log('🎧 ═══════════════════════════════════════════');
  console.log('   AI LIVE SUPPORT COPILOT SERVER (ONLINE)');
  console.log('═══════════════════════════════════════════════');
  console.log(`   🌐 Workspace:  http://localhost:${PORT}`);
  console.log(`   📊 Status:     http://localhost:${PORT}/api/status`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
});
