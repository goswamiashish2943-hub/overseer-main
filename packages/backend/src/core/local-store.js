'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const APP_DIR = path.join(os.homedir(), '.overseer');
const DB_PATH = process.env.OVERSEER_DB_PATH
  ? path.resolve(process.env.OVERSEER_DB_PATH)
  : path.join(APP_DIR, 'overseer-memory.db');
const DEMO_USER = {
  id: '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d',
  email: 'demo@local.dev',
};

let _db = null;

function nowIso() {
  return new Date().toISOString();
}

function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function fromJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getDb() {
  if (_db) return _db;

  if (!fs.existsSync(DB_PATH)) {
    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      identifier TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_identifier
      ON projects (user_id, identifier);

    CREATE INDEX IF NOT EXISTS idx_projects_identifier
      ON projects (identifier);

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      started_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project_id
      ON sessions (project_id);

    CREATE TABLE IF NOT EXISTS project_context_files (
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, file_name)
    );

    CREATE INDEX IF NOT EXISTS idx_context_files_project_id
      ON project_context_files (project_id);

    CREATE TABLE IF NOT EXISTS file_knowledge (
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      current_summary TEXT,
      times_modified INTEGER NOT NULL DEFAULT 0,
      open_risks TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_file_knowledge_project_path
      ON file_knowledge (project_id, file_path);

    CREATE TABLE IF NOT EXISTS code_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      diff_text TEXT,
      severity TEXT,
      suggestion TEXT,
      better_approach TEXT,
      alignment TEXT,
      decisions TEXT,
      change_analysis TEXT,
      explanations TEXT,
      used_fallback INTEGER NOT NULL DEFAULT 0,
      reviewed INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_code_sessions_project_id
      ON code_sessions (project_id);

    CREATE INDEX IF NOT EXISTS idx_code_sessions_file_path
      ON code_sessions (project_id, file_path);

    CREATE INDEX IF NOT EXISTS idx_code_sessions_reviewed
      ON code_sessions (reviewed);

    CREATE TABLE IF NOT EXISTS analysis_cache (
      code_hash TEXT PRIMARY KEY,
      analysis TEXT NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      last_accessed TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      diff_text TEXT,
      impact_radius INTEGER NOT NULL DEFAULT 0,
      impact_data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_changes_project_id
      ON memory_changes (project_id);

    CREATE INDEX IF NOT EXISTS idx_memory_changes_file_path
      ON memory_changes (project_id, file_path);

    CREATE INDEX IF NOT EXISTS idx_memory_changes_created_at
      ON memory_changes (project_id, created_at DESC);
  `);
}

function localUser() {
  return { ...DEMO_USER };
}

function normaliseIdentifier(identifier) {
  if (!identifier) return '';
  const value = String(identifier).trim();
  if (value.length === 64 && /^[0-9a-f]+$/i.test(value)) {
    return value.toLowerCase();
  }
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resolveProject({ identifier, name, userId = DEMO_USER.id }) {
  const db = getDb();
  const normalised = normaliseIdentifier(identifier);
  const existing = db.prepare(
    'SELECT project_id, created_at FROM projects WHERE user_id = ? AND identifier = ? LIMIT 1'
  ).get(userId, normalised);

  if (existing) {
    db.prepare('UPDATE projects SET last_seen = ? WHERE project_id = ?')
      .run(nowIso(), existing.project_id);
    return { project_id: existing.project_id, created: false };
  }

  const projectId = crypto.randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO projects (project_id, user_id, name, identifier, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    userId,
    (name && String(name).trim()) || `Project ${normalised.slice(0, 8)}`,
    normalised,
    now,
    now
  );

  return { project_id: projectId, created: true };
}

function getProjectById(projectId) {
  return getDb().prepare(
    'SELECT * FROM projects WHERE project_id = ? LIMIT 1'
  ).get(projectId) || null;
}

function listProjects() {
  return getDb().prepare(`
    SELECT project_id, MAX(last_seen) AS last_seen
    FROM projects
    GROUP BY project_id
    ORDER BY last_seen DESC
  `).all();
}

function ensureSession(sessionId, projectId, userId = DEMO_USER.id) {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO sessions (session_id, project_id, user_id, started_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, projectId, userId, nowIso());
}

function upsertContextFile(projectId, fileName, content) {
  const db = getDb();
  const now = nowIso();
  db.prepare(`
    INSERT INTO project_context_files (project_id, file_name, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id, file_name) DO UPDATE SET
      content = excluded.content,
      updated_at = excluded.updated_at
  `).run(projectId, String(fileName).slice(0, 255), String(content).slice(0, 65536), now, now);
}


function listContextFiles(projectId) {
  return getDb().prepare(`
    SELECT file_name, content, updated_at
    FROM project_context_files
    WHERE project_id = ?
    ORDER BY updated_at DESC
  `).all(projectId);
}
function fetchProjectContext(projectId) {
  if (!projectId) return '';
  const rows = getDb().prepare(`
    SELECT file_name, content
    FROM project_context_files
    WHERE project_id = ?
    ORDER BY file_name ASC
  `).all(projectId);

  if (!rows.length) return '';
  return rows.map((row) => `=== ${row.file_name} ===\n${row.content}`).join('\n\n');
}

function buildContext(projectId, filePath) {
  if (!projectId || !filePath) return null;
  const row = getDb().prepare(`
    SELECT current_summary, times_modified, open_risks
    FROM file_knowledge
    WHERE project_id = ? AND file_path = ?
    LIMIT 1
  `).get(projectId, filePath);

  if (!row) return null;

  const lines = [];
  if (row.current_summary) lines.push(`Previous summary of this file: ${row.current_summary}`);
  if (row.times_modified && row.times_modified > 0) {
    lines.push(`This file has been modified ${row.times_modified} time(s) in previous sessions.`);
  }

  const risks = fromJson(row.open_risks, []);
  if (Array.isArray(risks) && risks.length > 0) {
    lines.push(`Open risks from previous sessions: ${risks.join('; ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function upsertFileKnowledge(projectId, filePath, currentSummary, openRisks = []) {
  const db = getDb();
  const now = nowIso();
  const existing = db.prepare(`
    SELECT times_modified
    FROM file_knowledge
    WHERE project_id = ? AND file_path = ?
    LIMIT 1
  `).get(projectId, filePath);

  const nextTimesModified = existing ? Number(existing.times_modified || 0) + 1 : 1;

  db.prepare(`
    INSERT INTO file_knowledge (project_id, file_path, current_summary, times_modified, open_risks, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, file_path) DO UPDATE SET
      current_summary = excluded.current_summary,
      times_modified = excluded.times_modified,
      open_risks = excluded.open_risks,
      updated_at = excluded.updated_at
  `).run(
    projectId,
    filePath,
    currentSummary || null,
    nextTimesModified,
    toJson(openRisks || []),
    now
  );
}

function getFileKnowledge(projectId, filePath) {
  const row = getDb().prepare(`
    SELECT current_summary, times_modified, open_risks
    FROM file_knowledge
    WHERE project_id = ? AND file_path = ?
    LIMIT 1
  `).get(projectId, filePath);

  if (!row) return null;
  return {
    current_summary: row.current_summary,
    times_modified: row.times_modified,
    open_risks: fromJson(row.open_risks, []),
  };
}

function getAnalysisCache(codeHash) {
  const row = getDb().prepare(`
    SELECT * FROM analysis_cache
    WHERE code_hash = ?
    LIMIT 1
  `).get(codeHash);

  if (!row) return null;

  getDb().prepare(`
    UPDATE analysis_cache
    SET hits = hits + 1, last_accessed = ?
    WHERE code_hash = ?
  `).run(nowIso(), codeHash);

  return fromJson(row.analysis, null);
}

function saveAnalysisCache(codeHash, analysisResult) {
  const now = nowIso();
  getDb().prepare(`
    INSERT INTO analysis_cache (code_hash, analysis, hits, last_accessed, created_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(code_hash) DO UPDATE SET
      analysis = excluded.analysis,
      last_accessed = excluded.last_accessed
  `).run(codeHash, toJson(analysisResult), now, now);
}

function storeCodeSession({
  session_id,
  project_id,
  file_path,
  diff_text,
  severity,
  suggestion,
  better_approach,
  alignment,
  decisions,
  change_analysis,
  explanations,
  used_fallback = false,
  reviewed = false,
  reviewed_at = null,
  created_at,
}) {
  const info = getDb().prepare(`
    INSERT INTO code_sessions (
      project_id, session_id, file_path, diff_text, severity,
      suggestion, better_approach, alignment, decisions, change_analysis,
      explanations, used_fallback, reviewed, reviewed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project_id,
    session_id,
    file_path,
    diff_text || null,
    severity || 'info',
    toJson(suggestion),
    toJson(better_approach),
    toJson(alignment),
    toJson(decisions),
    toJson(change_analysis),
    explanations || null,
    used_fallback ? 1 : 0,
    reviewed ? 1 : 0,
    reviewed_at,
    created_at || nowIso()
  );

  return info.lastInsertRowid;
}

function parseCodeSession(row) {
  if (!row) return null;
  return {
    ...row,
    suggestion: fromJson(row.suggestion, null),
    better_approach: fromJson(row.better_approach, null),
    alignment: fromJson(row.alignment, null),
    decisions: fromJson(row.decisions, null),
    change_analysis: fromJson(row.change_analysis, []),
    used_fallback: Boolean(row.used_fallback),
    reviewed: Boolean(row.reviewed),
    timestamp: row.created_at,
  };
}

function listCodeSessions(projectId, { limit = 500, since = null } = {}) {
  let sql = `
    SELECT *
    FROM code_sessions
    WHERE project_id = ?
  `;
  const params = [projectId];

  if (since) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return getDb().prepare(sql).all(...params).map(parseCodeSession);
}

function getCodeSessionById(id) {
  return parseCodeSession(
    getDb().prepare('SELECT * FROM code_sessions WHERE id = ? LIMIT 1').get(id)
  );
}

function markCodeSessionReviewed(id) {
  const reviewedAt = nowIso();
  const info = getDb().prepare(`
    UPDATE code_sessions
    SET reviewed = 1, reviewed_at = ?
    WHERE id = ?
  `).run(reviewedAt, id);

  const row = getCodeSessionById(id);
  return info.changes > 0 ? row : null;
}

function getHistoryForProject(projectId, filter = 'all') {
  const now = new Date();
  let since = null;

  if (filter === 'today') {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (filter === 'week') {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (filter === 'month') {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  return listCodeSessions(projectId, { limit: 500, since });
}

function getSummary(projectId) {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS total_changes, COUNT(DISTINCT file_path) AS unique_files
    FROM memory_changes
    WHERE project_id = ?
  `).get(projectId);

  return {
    total_changes: row?.total_changes || 0,
    unique_files: row?.unique_files || 0,
  };
}

function queryChanges(projectId, limit = 50) {
  return getDb().prepare(`
    SELECT *
    FROM memory_changes
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(projectId, limit).map((row) => ({
    ...row,
    impact_data: fromJson(row.impact_data, null),
    timestamp: row.created_at,
  }));
}

function getChangeById(id) {
  const row = getDb().prepare('SELECT * FROM memory_changes WHERE id = ? LIMIT 1').get(id);
  if (!row) return null;
  return {
    ...row,
    impact_data: fromJson(row.impact_data, null),
    timestamp: row.created_at,
  };
}

function searchChanges(projectId, query) {
  const term = `%${String(query || '').toLowerCase()}%`;
  return getDb().prepare(`
    SELECT *
    FROM memory_changes
    WHERE project_id = ? AND (LOWER(file_path) LIKE ? OR LOWER(diff_text) LIKE ?)
    ORDER BY created_at DESC
    LIMIT 50
  `).all(projectId, term, term).map((row) => ({
    ...row,
    impact_data: fromJson(row.impact_data, null),
    timestamp: row.created_at,
  }));
}

function getAllProjects() {
  return getDb().prepare(`
    SELECT project_id, MAX(created_at) AS last_seen
    FROM memory_changes
    GROUP BY project_id
    ORDER BY last_seen DESC
  `).all();
}

function storeChange(sessionId, projectId, filePath, diffText, impactRadius, impactData) {
  const info = getDb().prepare(`
    INSERT INTO memory_changes (session_id, project_id, file_path, diff_text, impact_radius, impact_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId || null,
    projectId,
    filePath,
    diffText || null,
    impactRadius || 0,
    impactData ? toJson(impactData) : null,
    nowIso()
  );

  return info.lastInsertRowid;
}

module.exports = {
  DB_PATH,
  DEMO_USER,
  getDb,
  localUser,
  resolveProject,
  getProjectById,
  listProjects,
  ensureSession,
  upsertContextFile,
  listContextFiles,
  fetchProjectContext,
  buildContext,
  upsertFileKnowledge,
  getFileKnowledge,
  getAnalysisCache,
  saveAnalysisCache,
  storeCodeSession,
  listCodeSessions,
  getCodeSessionById,
  markCodeSessionReviewed,
  getHistoryForProject,
  getSummary,
  queryChanges,
  getChangeById,
  searchChanges,
  getAllProjects,
  storeChange,
};

