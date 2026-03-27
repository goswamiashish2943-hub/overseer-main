// packages/backend/src/websocket.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// WebSocket server that runs on the same port as Express.
// Maps sessionId → connected dashboard WebSocket client.
// sendToSession() falls back to broadcast() when session IDs don't match.

'use strict';

const { WebSocketServer } = require('ws');

const _clients = new Map(); // sessionId → ws
let _wss = null;

// ─── setup ────────────────────────────────────────────────────────────────────

function setup(httpServer) {
  _wss = new WebSocketServer({ server: httpServer });

  _wss.on('connection', (ws, req) => {
    const url       = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('session');

    if (!sessionId) {
      ws.close(1008, 'session param required');
      return;
    }

    _clients.set(sessionId, ws);
    console.log(`[WebSocket] Client connected — session=${sessionId}`);

    ws.send(JSON.stringify({ type: 'connected', sessionId }));

    ws.on('close', () => {
      _clients.delete(sessionId);
      console.log(`[WebSocket] Client disconnected — session=${sessionId}`);
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] Error on session=${sessionId}:`, err.message);
      _clients.delete(sessionId);
    });
  });

  console.log('[WebSocket] Server attached to HTTP server');
}

// ─── getClient ────────────────────────────────────────────────────────────────

function getClient(sessionId) {
  const ws = _clients.get(sessionId);
  if (!ws) return null;
  if (ws.readyState !== 1) {
    _clients.delete(sessionId);
    return null;
  }
  return ws;
}

// ─── broadcast ────────────────────────────────────────────────────────────────

/**
 * Send a message to ALL connected clients.
 * Returns the number of clients that received the message.
 */
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  let count = 0;
  for (const [, ws] of _clients) {
    if (ws.readyState === 1) {
      ws.send(msg);
      count++;
    }
  }
  return count;
}

// ─── sendToSession ────────────────────────────────────────────────────────────

/**
 * Send a message to a specific session.
 * Falls back to broadcast() if no matching session found.
 * This handles the case where daemon and dashboard have different session IDs.
 */
function sendToSession(sessionId, payload) {
  const ws = getClient(sessionId);
  if (ws) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  // Fallback — session IDs don't match, broadcast to all connected clients
  const sent = broadcast(payload);
  if (sent > 0) {
    console.log(`[WebSocket] Session ${sessionId} not found — broadcast to ${sent} client(s)`);
  }
  return sent > 0;
}

function connectedCount() {
  return _clients.size;
}

module.exports = { setup, getClient, broadcast, sendToSession, connectedCount };
