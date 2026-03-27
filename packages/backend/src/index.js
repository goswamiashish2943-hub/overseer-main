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

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. daemon curl, health checks)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST'],
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

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);
wsServer.setup(httpServer);

httpServer.listen(PORT, () => {
  console.log(`\n  Overseer backend running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health\n`);
});
