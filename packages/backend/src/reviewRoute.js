// packages/backend/src/reviewRoute.js
// Local demo routes for history and reviewed state.

'use strict';

const express = require('express');
const { getHistoryForProject, markCodeSessionReviewed } = require('./core/local-store');

const router = express.Router();

router.post('/:id/mark-reviewed', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const data = markCodeSessionReviewed(id);
    if (!data) {
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log(`[reviewRoute] Marked code_session ${id} as reviewed`);
    return res.json({ success: true, id: data.id, reviewed_at: data.reviewed_at });
  } catch (err) {
    console.error('[reviewRoute] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { filter } = req.query;
    const projectId = req.query.project_id;

    if (projectId) {
      return res.json(getHistoryForProject(projectId, filter || 'all'));
    }

    // Demo mode: when no project is provided, return the most recent project.
    const { getAllProjects } = require('./core/local-store');
    const projects = getAllProjects();
    if (!projects.length) return res.json([]);

    return res.json(getHistoryForProject(projects[0].project_id, filter || 'all'));
  } catch (err) {
    console.error('[reviewRoute] History error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
