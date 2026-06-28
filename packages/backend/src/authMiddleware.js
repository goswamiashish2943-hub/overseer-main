// packages/backend/src/authMiddleware.js
// Local demo auth: accepts any request and attaches a stable demo user.

'use strict';

const { localUser } = require('./core/local-store');

async function authMiddleware(req, res, next) {
  req.user = localUser();
  next();
}

module.exports = { authMiddleware };
