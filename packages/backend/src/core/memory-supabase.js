// packages/backend/src/core/memory-supabase.js
// SUPABASE implementation of the memory storage interface.
// Activate by setting: MEMORY_BACKEND=supabase
// Also requires: migration 006_add_memory_changes.sql applied in Supabase.

'use strict';

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _supabase;
}

async function storeChange(session_id, project_id, file_path, diff_text, impact_radius, impact_data) {
  const { data, error } = await getSupabase()
    .from('memory_changes')
    .insert({ session_id: session_id || null, project_id, file_path, diff_text, impact_radius: impact_radius || 0, impact_data: impact_data || null })
    .select('id')
    .single();
  if (error) { console.error('[MemorySupabase] storeChange error:', error.message); return null; }
  return data?.id;
}

async function queryChanges(projectId, limit = 50) {
  const { data, error } = await getSupabase()
    .from('memory_changes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[MemorySupabase] queryChanges error:', error.message); return []; }
  return data || [];
}

async function getSummary(projectId) {
  const { data, error } = await getSupabase()
    .from('memory_changes')
    .select('file_path')
    .eq('project_id', projectId);
  if (error) { console.error('[MemorySupabase] getSummary error:', error.message); return { total_changes: 0, unique_files: 0 }; }
  return {
    total_changes: data?.length || 0,
    unique_files:  new Set(data?.map(r => r.file_path)).size,
  };
}

async function getChangeById(id) {
  const { data, error } = await getSupabase()
    .from('memory_changes')
    .select('*')
    .eq('id', id)
    .single();
  if (error) { console.error('[MemorySupabase] getChangeById error:', error.message); return null; }
  return data;
}

async function searchChanges(projectId, query) {
  const { data, error } = await getSupabase()
    .from('memory_changes')
    .select('*')
    .eq('project_id', projectId)
    .or(`file_path.ilike.%${query}%,diff_text.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('[MemorySupabase] searchChanges error:', error.message); return []; }
  return data || [];
}

async function getAllProjects() {
  const { data, error } = await getSupabase()
    .from('memory_changes')
    .select('project_id, created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('[MemorySupabase] getAllProjects error:', error.message); return []; }
  const map = new Map();
  for (const r of data || []) {
    if (!map.has(r.project_id)) map.set(r.project_id, r.created_at);
  }
  return [...map.entries()].map(([project_id, last_seen]) => ({ project_id, last_seen }));
}

module.exports = { storeChange, queryChanges, getSummary, getChangeById, searchChanges, getAllProjects };
