// packages/backend/src/core/memory-inmemory.js
// IN-MEMORY fallback — used on Vercel where SQLite native module is unavailable.
// Data lives only for the lifetime of the serverless function instance (not persistent).
// Switch to Supabase for persistence: set MEMORY_BACKEND=supabase

'use strict';

let _id = 0;
const store = []; // simple array acting as the table

function makeRow(session_id, project_id, file_path, diff_text, impact_radius, impact_data) {
  return {
    id:            ++_id,
    session_id:    session_id  || null,
    project_id,
    file_path,
    diff_text:     diff_text   || null,
    impact_radius: impact_radius || 0,
    impact_data:   impact_data  || null,
    timestamp:     new Date().toISOString(),
  };
}

async function storeChange(session_id, project_id, file_path, diff_text, impact_radius, impact_data) {
  const row = makeRow(session_id, project_id, file_path, diff_text, impact_radius, impact_data);
  store.push(row);
  return row.id;
}

async function queryChanges(projectId, limit = 50) {
  return store
    .filter(r => r.project_id === projectId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

async function getSummary(projectId) {
  const rows = store.filter(r => r.project_id === projectId);
  return {
    total_changes: rows.length,
    unique_files:  new Set(rows.map(r => r.file_path)).size,
  };
}

async function getChangeById(id) {
  return store.find(r => r.id === Number(id)) || null;
}

async function searchChanges(projectId, query) {
  const q = query.toLowerCase();
  return store
    .filter(r =>
      r.project_id === projectId &&
      (r.file_path?.toLowerCase().includes(q) || r.diff_text?.toLowerCase().includes(q))
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, 50);
}

async function getAllProjects() {
  const map = new Map();
  for (const r of store) {
    if (!map.has(r.project_id)) map.set(r.project_id, r.timestamp);
  }
  return [...map.entries()].map(([project_id, last_seen]) => ({ project_id, last_seen }));
}

module.exports = { storeChange, queryChanges, getSummary, getChangeById, searchChanges, getAllProjects };
