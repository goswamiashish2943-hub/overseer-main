// test-sandbox/api-router.js
// Simulates a basic API router

const auth = require('./auth');
const db = require('./db-client');

const routes = new Map();
const rateLimitMap = new Map(); // tracks req count per IP
const RATE_LIMIT = 100; // per minute

function register(method, path, handler) {
  const key = `${method.toUpperCase()}:${path}`;
  routes.set(key, handler);
  console.log(`[Router] Registered ${key}`);
}

async function handle(method, path, ctx) {
  const key = `${method.toUpperCase()}:${path}`;
  const handler = routes.get(key);
  if (!handler) return { status: 404, body: { error: 'Not found' } };
  try {
    const result = await handler(ctx);
    return { status: 200, body: result };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// Register default routes
register('GET', '/ping', () => ({ pong: true, time: Date.now() }));
register('POST', '/login', (ctx) => {
  const token = auth.generateToken(ctx.body?.userId || 'anonymous');
  return { token };
});
// BUG: /admin has no auth check — anyone can access it!
register('GET', '/admin', (ctx) => {
  return { users: ['admin', 'root', 'superuser'], secret: 'exposed!' };
});

module.exports = { register, handle };
