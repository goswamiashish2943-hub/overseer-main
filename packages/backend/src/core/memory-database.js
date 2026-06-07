// packages/backend/src/core/memory-database.js
const Database = require('better-sqlite3');
const path = require('path');

// Auto-create overseer-memory.db in the backend root
const dbPath = path.join(__dirname, '..', '..', 'overseer-memory.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    project_id TEXT,
    file_path TEXT,
    diff_text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    impact_radius INTEGER DEFAULT 0,
    impact_data TEXT
  );
`);

function storeChange(session_id, project_id, file_path, diff_text, impact_radius, impact_data) {
    const stmt = db.prepare(`
        INSERT INTO file_changes (session_id, project_id, file_path, diff_text, impact_radius, impact_data)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(session_id, project_id, file_path, diff_text, impact_radius, JSON.stringify(impact_data));
    return info.lastInsertRowid;
}

function queryChanges(projectId, limit = 50) {
    const stmt = db.prepare(`
        SELECT * FROM file_changes
        WHERE project_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
    `);
    return stmt.all(projectId, limit).map(row => ({
        ...row,
        impact_data: row.impact_data ? JSON.parse(row.impact_data) : null
    }));
}

function getSummary(projectId) {
    const stmt = db.prepare(`
        SELECT COUNT(*) as total_changes, COUNT(DISTINCT file_path) as unique_files
        FROM file_changes
        WHERE project_id = ?
    `);
    return stmt.get(projectId);
}

function getChangeById(id) {
    const stmt = db.prepare(`SELECT * FROM file_changes WHERE id = ?`);
    const row = stmt.get(id);
    if (row && row.impact_data) {
        row.impact_data = JSON.parse(row.impact_data);
    }
    return row;
}

function searchChanges(projectId, query) {
    const stmt = db.prepare(`
        SELECT * FROM file_changes
        WHERE project_id = ? AND (file_path LIKE ? OR diff_text LIKE ?)
        ORDER BY timestamp DESC
        LIMIT 50
    `);
    const term = `%${query}%`;
    return stmt.all(projectId, term, term).map(row => ({
        ...row,
        impact_data: row.impact_data ? JSON.parse(row.impact_data) : null
    }));
}

module.exports = {
    storeChange,
    queryChanges,
    getSummary,
    getChangeById,
    searchChanges
};
