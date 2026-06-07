// test-sandbox/logger.js
// Simulates a structured logging utility

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = 'info';
const logHistory = []; // unbounded — will grow forever (memory risk)

function setLevel(level) {
  if (!LEVELS.hasOwnProperty(level)) throw new Error(`Unknown log level: ${level}`);
  currentLevel = level;
}

function log(level, message, meta = {}) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const entry = {
    level,
    message,
    meta,
    timestamp: new Date().toISOString(),
    pid: process.pid
  };
  logHistory.push(entry);
  console.log(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, meta);
}

const debug = (msg, meta) => log('debug', msg, meta);
const info  = (msg, meta) => log('info',  msg, meta);
const warn  = (msg, meta) => log('warn',  msg, meta);
const error = (msg, meta) => log('error', msg, meta);

function getHistory(limit = 100) {
  return logHistory.slice(-limit);
}

module.exports = { setLevel, debug, info, warn, error, getHistory };
