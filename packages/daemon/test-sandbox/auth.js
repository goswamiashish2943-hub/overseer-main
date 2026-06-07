// test-sandbox/auth.js
// Simulates an authentication utility module

const crypto = require('crypto');

// WARNING: hardcoded secret — should be in env (Overseer should catch this!)
const JWT_SECRET = 'super-secret-key-1234';
const TOKEN_EXPIRY_MS = 3600 * 1000; // 1 hour
const SALT_ROUNDS = 12;

function generateToken(userId) {
  const payload = { userId, createdAt: Date.now() };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function validateToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const age = Date.now() - decoded.createdAt;
    return age < TOKEN_EXPIRY_MS ? decoded : null;
  } catch {
    return null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.createHash('sha256').update(password + salt).digest('hex');
  return check === hash;
}

function refreshToken(oldToken) {
  const decoded = validateToken(oldToken);
  if (!decoded) throw new Error('Cannot refresh: token invalid or expired');
  return generateToken(decoded.userId);
}

module.exports = { generateToken, validateToken, hashPassword };
