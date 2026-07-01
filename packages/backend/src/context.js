// packages/backend/src/context.js
//
// GET  /api/context?project_id=X  - fetch all stored context files for a project
// POST /api/context               - upsert a context file (project_id, file_name, content)
//
// Context files are .md / .json files the daemon detects and stores here.
// analyseRoute.js reads them to enrich prompts with project-level knowledge.

'use strict';

const express = require('express');
const { authMiddleware } = require('./authMiddleware');
const { upsertContextFile, listContextFiles, fetchProjectContext } = require('./core/supabase-store');

const router = express.Router();

router.get('/api/context', authMiddleware, async (req, res) => {
  const projectId = req.query.project_id;

  if (!projectId) {
    return res.status(400).json({ error: 'project_id query param is required' });
  }

  try {
    const files = await listContextFiles(projectId);
    const merged = await fetchProjectContext(projectId);

    return res.json({
      project_id: projectId,
      files,
      merged,
    });
  } catch (err) {
    console.error('[context] GET fatal:', err.message);
    return res.status(500).json({ error: 'Internal error fetching context' });
  }
});

router.post('/api/context', authMiddleware, async (req, res) => {
  const { project_id, file_name, content } = req.body;

  if (!project_id || !file_name || content === undefined) {
    return res.status(400).json({
      error: 'project_id, file_name, and content are required',
    });
  }

  try {
    await upsertContextFile(project_id, file_name, content);
    console.log(`[context] Saved context file: ${file_name} (project=${project_id})`);
    return res.json({ status: 'saved', project_id, file_name });
  } catch (err) {
    console.error('[context] POST fatal:', err.message);
    return res.status(500).json({ error: 'Internal error saving context' });
  }
});

module.exports = { router, fetchProjectContext };
