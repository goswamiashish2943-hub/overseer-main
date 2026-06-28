// packages/backend/src/apiRoutes.js
// Local memory and codebase analytics routes.

'use strict';

const express = require('express');
const {
  queryChanges,
  getChangeById,
  getSummary,
  searchChanges,
  getAllProjects,
} = require('./core/local-store');

const router = express.Router();

router.get('/memory/projects', async (req, res) => {
  try {
    const projects = getAllProjects();
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/changes/history', async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  try {
    const history = queryChanges(project_id);
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/changes/:changeId/full', async (req, res) => {
  try {
    const change = getChangeById(req.params.changeId);
    if (!change) return res.status(404).json({ error: 'Change not found' });
    res.json(change);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/codebase/evolution', async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  try {
    const history = queryChanges(project_id, 100);
    const evolution = history.map((h) => ({
      timestamp: h.created_at,
      filePath: h.file_path,
      impactRadius: h.impact_radius || 0,
    }));
    res.json(evolution);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/search/changes', async (req, res) => {
  const { project_id, q } = req.query;
  if (!project_id || !q) return res.status(400).json({ error: 'project_id and q required' });
  try {
    const results = searchChanges(project_id, q);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/codebase/summary', async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  try {
    const summary = getSummary(project_id);
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/graph/dependencies', async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  try {
    const history = queryChanges(project_id, 50);
    const nodes = new Map();
    const edges = [];

    history.forEach((change) => {
      if (!nodes.has(change.file_path)) {
        nodes.set(change.file_path, { id: change.file_path, label: change.file_path });
      }
      const deps = change.impact_data?.dependencies || [];
      deps.forEach((dep) => {
        if (!nodes.has(dep)) {
          nodes.set(dep, { id: dep, label: dep });
        }
        edges.push({ source: change.file_path, target: dep });
      });
    });

    res.json({ nodes: Array.from(nodes.values()), edges });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
