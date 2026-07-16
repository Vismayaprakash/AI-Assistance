# 🤖 AI Receptionist

A RAG-powered AI receptionist that answers phone calls 24/7 for dental clinics and salons. It stores all interactions, records call audio, and provides a business dashboard to review transcripts, play back recordings, and continuously improve AI responses.

Powered by **Meta's Llama 3.3 70B on Groq** for ultra-low latency conversational speed (200+ tokens/second), and **Google Gemini** for high-accuracy vector embeddings.

## Features

- 📞 **AI Voice Calls** — Answers phone calls naturally using Retell AI + Llama 3.3 on Groq
- 🧠 **RAG Knowledge Base** — AI responds using your business-specific information
- 📊 **Business Dashboard** — Review transcripts, play back audio recordings, correct AI responses, and manage knowledge
- 🎙️ **Voice Call Recording** — Records caller audio (browser simulator & Retell) and serves playback in transcripts
- 🦷 **Pre-built Templates** — Ready-to-use knowledge bases for dental clinics and salons
- 👥 **Multi-tenant** — Support multiple businesses from a single installation
- ✅ **Human Review** — Approve, correct, or flag AI responses to continuously improve

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Vector Store | ChromaDB |
| LLM (Chat/Summary) | Meta Llama 3.3 70B (via Groq API) |
| Embeddings (RAG) | Google Gemini API (gemini-embedding-001) |
| Voice | Retell AI |
| Audio Playback | Web Speech API + MediaRecorder (Local Simulator) |
| Dashboard | Vanilla HTML/CSS/JS |

## Quick Start

### 1. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
- **GROQ_API_KEY** — Get from [Groq Console](https://console.groq.com/) (Used for text generation)
- **GEMINI_API_KEY** — Get from [Google AI Studio](https://aistudio.google.com/apikey) (Used for RAG vector embeddings)
- **RETELL_API_KEY** — Get from [Retell AI](https://www.retellai.com/) (Used for voice connection)

### 3. Start the Server

```bash
npm run dev
```

### 4. Open Dashboard

Visit `http://localhost:3000/dashboard/login.html`

Default login: `admin` / `admin123`

### 5. Setup Your Business

1. Create a business in the dashboard
2. Import a knowledge base template (dental clinic or salon)
3. Click "Sync to AI" to embed the knowledge base
4. Setup a phone number via Retell AI

### 6. For Local Development (Retell webhooks)

```bash
# In a separate terminal
ngrok http 3000
```

Update your Retell agent's webhook URL to the ngrok URL.

## Project Structure

```
├── server/
│   ├── index.js              # Express server entry
│   ├── config.js             # Environment config
│   ├── database/             # SQLite schema & models
│   ├── services/             # RAG, LLM, Embeddings, Retell
│   ├── routes/               # REST API & webhook routes
│   └── middleware/           # Auth middleware
├── dashboard/                # Business owner dashboard
├── templates/                # Knowledge base templates
├── data/                     # SQLite & ChromaDB data (gitignored)
└── package.json
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/login` | POST | Dashboard login |
| `/api/business` | GET/POST | List/create businesses |
| `/api/business/:id` | GET/PUT/DELETE | Manage business |
| `/api/conversations` | GET | List conversations |
| `/api/conversations/:id` | GET | Get transcript |
| `/api/conversations/:id/review` | POST | Review AI response |
| `/api/knowledge` | GET/POST | List/add knowledge |
| `/api/knowledge/:id` | PUT/DELETE | Manage entries |
| `/api/knowledge/sync` | POST | Sync to vector store |
| `/api/knowledge/import-template` | POST | Import template |
| `/api/stats` | GET | Dashboard statistics |

## License

MIT
