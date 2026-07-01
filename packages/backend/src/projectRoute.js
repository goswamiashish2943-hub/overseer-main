// packages/backend/src/projectRoute.js
//
// POST /api/project/resolve
//
// Local demo mode: resolves or creates a project row in SQLite using the
// repo identifier the daemon sends.

'use strict';

const express = require('express');
const crypto = require('crypto');
const { resolveProject, localUser } = require('./core/supabase-store');

const router = express.Router();

router.post('/resolve', async (req, res) => {
  const { identifier, name } = req.body || {};

  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'identifier is required' });
  }

  try {
    const normalised = identifier.length === 64 && /^[0-9a-f]+$/i.test(identifier)
      ? identifier
      : crypto.createHash('sha256').update(identifier).digest('hex');

    const result = await resolveProject({
      identifier: normalised,
      name,
      userId: localUser().id,
    });

    return res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    console.error('[projectRoute] Resolve error:', err);
    return res.status(500).json({
      error: 'Failed to resolve project',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

module.exports = { router };
