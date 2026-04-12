// packages/backend/src/index.js //test — triggered for combined flow
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Express server entry point.
// Mounts: health check, rate limiter, analyseRoute.
// Attaches WebSocket server to the same HTTP server instance.

'use strict';

require('dotenv').config();

const http        = require('http');
const express     = require('express');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');

const analyseRoute = require('./analyseRoute');
const wsServer     = require('./websocket');
const { router: contextRoute } = require('./context');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '512kb' }));

// ── Rate limiter ──────────────────────────────────────────────────────────────
// 120 requests per minute per IP — generous for active coding sessions
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max:      120,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests — please slow down' },
});
app.use('/analyze', limiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    version:   '0.1.0',
    timestamp: new Date().toISOString(),
    ws_clients: wsServer.connectedCount(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/', analyseRoute);
app.use('/', contextRoute);
console.log('[Overseer] Context routes mounted at /api/context');

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);
wsServer.setup(httpServer);

// Keep-alive ping — prevents Railway free tier from sleeping
if (process.env.NODE_ENV === 'production') {
  const BACKEND_URL = process.env.RAILWAY_PUBLIC_URL;
  setInterval(async () => {
    try {
      await fetch(`${BACKEND_URL}/health`);
      console.log('[Keep-alive] Pinged health endpoint');
    } catch (e) {
      console.error('[Keep-alive] Ping failed:', e.message);
    }
  }, 4 * 60 * 1000); // every 4 minutes
}

httpServer.listen(PORT, () => {
  console.log(`\n  Overseer backend running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health\n`);
});
