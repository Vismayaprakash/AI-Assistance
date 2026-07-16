const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const config = require('./config');
const { getDb, closeDb } = require('./database/init');
const { ensureDefaultUser } = require('./middleware/auth');
const apiRoutes = require('./routes/api');
const { router: retellRoutes, handleRetellLLMWebSocket } = require('./routes/retell');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const server = http.createServer(app);

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.path === '/api/auth/login') {
    console.log(`Login payload: username="${req.body.username}", password="${req.body.password}"`);
  }
  next();
});

// ==========================================
// STATIC FILES
// ==========================================
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
app.use('/widget', express.static(path.join(__dirname, '..', 'widget')));
app.use('/recordings', express.static(path.join(__dirname, '..', 'data', 'recordings')));

// ==========================================
// ROUTES
// ==========================================
app.use('/api', apiRoutes);
app.use('/api/retell', retellRoutes);
app.use('/', dashboardRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root redirect to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard/login.html');
});

// ==========================================
// WEBSOCKET FOR RETELL LLM
// ==========================================
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  console.log(`🔌 Incoming WebSocket Upgrade Request for path: ${pathname}`);

  if (pathname.startsWith('/api/retell/llm-websocket')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleRetellLLMWebSocket(ws, request);
    });
  } else {
    console.log(`❌ Rejecting upgrade for path: ${pathname}`);
    socket.destroy();
  }
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==========================================
// STARTUP
// ==========================================
async function start() {
  try {
    // Initialize database
    getDb();
    console.log('✅ Database connected');

    // Ensure default admin user exists
    ensureDefaultUser();

    // Start server
    server.listen(config.port, () => {
      console.log('');
      console.log('🤖 ═══════════════════════════════════════════');
      console.log('   AI RECEPTIONIST SERVER');
      console.log('═══════════════════════════════════════════════');
      console.log(`   🌐 Server:      http://localhost:${config.port}`);
      console.log(`   📊 Dashboard:   http://localhost:${config.port}/dashboard/login.html`);
      console.log(`   🔌 Health:      http://localhost:${config.port}/health`);
      console.log(`   📞 Retell WS:   ws://localhost:${config.port}/api/retell/llm-websocket`);
      console.log('═══════════════════════════════════════════════');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  closeDb();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  closeDb();
  server.close(() => process.exit(0));
});

start();
