// packages/backend/src/index.js
// Local demo backend entry point.

'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const analyseRoute = require('./analyseRoute');
const wsServer = require('./websocket');
const { router: contextRoute } = require('./context');
const { router: projectRoute } = require('./projectRoute');
const reviewRoute = require('./reviewRoute');
const apiRoutes = require('./apiRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://overseer-main-dashboard.vercel.app'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '512kb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests - please slow down' },
});
app.use('/analyze', limiter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    ws_clients: wsServer.connectedCount(),
  });
});

app.use('/api/project', projectRoute);
app.use('/api/sessions', reviewRoute);
app.use('/api', apiRoutes);
app.use('/', analyseRoute);
app.use('/', contextRoute);
console.log('[Overseer] Context routes mounted at /api/context');
console.log('[Overseer] Review routes mounted at /api/sessions');

const httpServer = http.createServer(app);
wsServer.setup(httpServer);

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  [Overseer] Port ${PORT} is already in use. Stop the old backend or change PORT.\n`);
  } else {
    console.error('[Overseer] HTTP server error:', err.message);
  }
  process.exit(1);
});

if (process.env.NODE_ENV === 'production') {
  const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_INTERNAL_HOSTNAME;
  if (BACKEND_URL) {
    setInterval(async () => {
      try {
        await fetch(`${BACKEND_URL}/health`);
        console.log('[Keep-alive] Pinged health endpoint');
      } catch (e) {
        console.error('[Keep-alive] Ping failed:', e.message);
      }
    }, 4 * 60 * 1000);
  }
}

httpServer.listen(PORT, () => {
  console.log(`\n  Overseer backend running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health\n`);
});
