// packages/backend/src/apiRoutes.js
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { queryChanges, getChangeById, getSummary, searchChanges } = require('./core/memory-database');

const dbPath = path.join(__dirname, '..', 'overseer-memory.db');

// Helper: get all distinct project IDs from the memory DB
function getAllProjects() {
    try {
        const db = new Database(dbPath, { readonly: true });
        const rows = db.prepare('SELECT DISTINCT project_id, MAX(timestamp) as last_seen FROM file_changes GROUP BY project_id ORDER BY last_seen DESC').all();
        db.close();
        return rows;
    } catch (e) {
        return [];
    }
}

const router = express.Router();

// /api/memory/projects — list all project IDs tracked in memory DB
router.get('/memory/projects', (req, res) => {
    res.json(getAllProjects());
});

// /api/changes/history
router.get('/changes/history', (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const history = queryChanges(project_id);
    res.json(history);
});

// /api/changes/:changeId/full
router.get('/changes/:changeId/full', (req, res) => {
    const change = getChangeById(req.params.changeId);
    if (!change) return res.status(404).json({ error: 'Change not found' });
    res.json(change);
});

// /api/codebase/evolution
router.get('/codebase/evolution', (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const history = queryChanges(project_id, 100);
    const evolution = history.map(h => ({
        timestamp: h.timestamp,
        filePath: h.file_path,
        impactRadius: h.impact_radius
    }));
    res.json(evolution);
});

// /api/search/changes
router.get('/search/changes', (req, res) => {
    const { project_id, q } = req.query;
    if (!project_id || !q) return res.status(400).json({ error: 'project_id and q required' });
    const results = searchChanges(project_id, q);
    res.json(results);
});

// /api/codebase/summary
router.get('/codebase/summary', (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const summary = getSummary(project_id);
    res.json(summary);
});

// /api/graph/dependencies
router.get('/graph/dependencies', (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    
    const history = queryChanges(project_id, 50);
    const nodes = new Map();
    const edges = [];
    
    history.forEach(change => {
        if (!nodes.has(change.file_path)) {
            nodes.set(change.file_path, { id: change.file_path, label: change.file_path });
        }
        if (change.impact_data && change.impact_data.dependencies) {
            change.impact_data.dependencies.forEach(dep => {
                if (!nodes.has(dep)) {
                    nodes.set(dep, { id: dep, label: dep });
                }
                edges.push({ source: change.file_path, target: dep });
            });
        }
    });
    
    res.json({ nodes: Array.from(nodes.values()), edges });
});

module.exports = router;
