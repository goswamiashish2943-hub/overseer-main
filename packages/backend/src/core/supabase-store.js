'use strict';

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials are missing');
  }

  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

const DEMO_USER = {
  id: '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d',
  email: 'demo@local.dev',
};

function nowIso() {
  return new Date().toISOString();
}

function toJson(value) {
  return value == null ? null : value;
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

function normaliseIdentifier(identifier) {
  if (!identifier) return '';
  const value = String(identifier).trim();
  if (value.length === 64 && /^[0-9a-f]+$/i.test(value)) return value.toLowerCase();
  return crypto.createHash('sha256').update(value).digest('hex');
}

function localUser() {
  return { ...DEMO_USER };
}

async function resolveProject({ identifier, name, userId = DEMO_USER.id }) {
  const supabase = getSupabase();
  const normalised = normaliseIdentifier(identifier);
  const { data: existing, error: lookupError } = await supabase
    .from('projects')
    .select('project_id, created_at')
    .eq('user_id', userId)
    .eq('identifier', normalised)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    const { error: updateError } = await supabase
      .from('projects')
      .update({ last_seen: nowIso() })
      .eq('project_id', existing.project_id);
    if (updateError) throw updateError;
    return { project_id: existing.project_id, created: false };
  }

  const projectId = crypto.randomUUID();
  const now = nowIso();
  const { error: insertError } = await supabase.from('projects').insert({
    project_id: projectId,
    user_id: userId,
    name: (name && String(name).trim()) || `Project ${normalised.slice(0, 8)}`,
    identifier: normalised,
    created_at: now,
    last_seen: now,
  });
  if (insertError) throw insertError;
  return { project_id: projectId, created: true };
}

async function getProjectById(projectId) {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listProjects() {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('project_id, last_seen')
    .order('last_seen', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function ensureSession(sessionId, projectId, userId = DEMO_USER.id) {
  const { error } = await getSupabase().from('sessions').upsert({
    session_id: sessionId,
    project_id: projectId,
    user_id: userId,
    started_at: nowIso(),
  });
  if (error) throw error;
}

async function upsertContextFile(projectId, fileName, content) {
  const { error } = await getSupabase().from('project_context_files').upsert({
    project_id: projectId,
    file_name: String(fileName).slice(0, 255),
    content: String(content).slice(0, 65536),
    updated_at: nowIso(),
  }, { onConflict: 'project_id,file_name' });
  if (error) throw error;
}

async function listContextFiles(projectId) {
  const { data, error } = await getSupabase()
    .from('project_context_files')
    .select('file_name, content, updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchProjectContext(projectId) {
  if (!projectId) return '';
  const rows = await listContextFiles(projectId);
  if (!rows.length) return '';
  return rows.map((row) => `=== ${row.file_name} ===\n${row.content}`).join('\n\n');
}

async function buildContext(projectId, filePath) {
  if (!projectId || !filePath) return null;
  const { data, error } = await getSupabase()
    .from('file_knowledge')
    .select('current_summary, times_modified, open_risks')
    .eq('project_id', projectId)
    .eq('file_path', filePath)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lines = [];
  if (data.current_summary) lines.push(`Previous summary of this file: ${data.current_summary}`);
  if (data.times_modified && data.times_modified > 0) {
    lines.push(`This file has been modified ${data.times_modified} time(s) in previous sessions.`);
  }
  const risks = fromJson(data.open_risks, []);
  if (Array.isArray(risks) && risks.length > 0) {
    lines.push(`Open risks from previous sessions: ${risks.join('; ')}`);
  }
  return lines.length ? lines.join('\n') : null;
}

async function upsertFileKnowledge(projectId, filePath, currentSummary, openRisks = []) {
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('file_knowledge')
    .select('times_modified')
    .eq('project_id', projectId)
    .eq('file_path', filePath)
    .maybeSingle();
  const nextTimesModified = existing ? Number(existing.times_modified || 0) + 1 : 1;
  const { error } = await supabase.from('file_knowledge').upsert({
    project_id: projectId,
    file_path: filePath,
    current_summary: currentSummary || null,
    times_modified: nextTimesModified,
    open_risks: openRisks || [],
    updated_at: nowIso(),
  }, { onConflict: 'project_id,file_path' });
  if (error) throw error;
}

async function getFileKnowledge(projectId, filePath) {
  const { data, error } = await getSupabase()
    .from('file_knowledge')
    .select('current_summary, times_modified, open_risks')
    .eq('project_id', projectId)
    .eq('file_path', filePath)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { current_summary: data.current_summary, times_modified: data.times_modified, open_risks: fromJson(data.open_risks, []) };
}

async function getAnalysisCache(codeHash) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('analysis_cache').select('*').eq('code_hash', codeHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await supabase.from('analysis_cache').update({ hits: (data.hits || 0) + 1, last_accessed: nowIso() }).eq('code_hash', codeHash);
  return fromJson(data.analysis, null);
}

async function saveAnalysisCache(codeHash, analysisResult) {
  const { error } = await getSupabase().from('analysis_cache').upsert({
    code_hash: codeHash,
    analysis: analysisResult,
    hits: 0,
    last_accessed: nowIso(),
    created_at: nowIso(),
  });
  if (error) throw error;
}

async function storeCodeSession({
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
  const { data, error } = await getSupabase().from('code_sessions').insert({
    project_id,
    session_id,
    file_path,
    diff_text: diff_text || null,
    severity: severity || 'info',
    suggestion: toJson(suggestion),
    better_approach: toJson(better_approach),
    alignment: toJson(alignment),
    decisions: toJson(decisions),
    change_analysis: toJson(change_analysis),
    explanations: explanations || null,
    used_fallback: used_fallback ? true : false,
    reviewed: reviewed ? true : false,
    reviewed_at,
    created_at: created_at || nowIso(),
  }).select('id').single();
  if (error) throw error;
  return data?.id;
}

async function listCodeSessions(projectId, { limit = 500, since = null } = {}) {
  let query = getSupabase().from('code_sessions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
  if (since) query = query.gte('created_at', since);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    suggestion: fromJson(row.suggestion, null),
    better_approach: fromJson(row.better_approach, null),
    alignment: fromJson(row.alignment, null),
    decisions: fromJson(row.decisions, null),
    change_analysis: fromJson(row.change_analysis, []),
    used_fallback: Boolean(row.used_fallback),
    reviewed: Boolean(row.reviewed),
    timestamp: row.created_at,
  }));
}

async function getCodeSessionById(id) {
  const { data, error } = await getSupabase().from('code_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function markCodeSessionReviewed(id) {
  const reviewedAt = nowIso();
  const { error } = await getSupabase().from('code_sessions').update({ reviewed: true, reviewed_at: reviewedAt }).eq('id', id);
  if (error) throw error;
  return getCodeSessionById(id);
}

async function getHistoryForProject(projectId, filter = 'all') {
  const now = new Date();
  let since = null;
  if (filter === 'today') since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  else if (filter === 'week') since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  else if (filter === 'month') since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return listCodeSessions(projectId, { limit: 500, since });
}

async function getSummary(projectId) {
  const { data, error } = await getSupabase().from('memory_changes').select('file_path').eq('project_id', projectId);
  if (error) throw error;
  return { total_changes: data?.length || 0, unique_files: new Set((data || []).map((r) => r.file_path)).size };
}

async function queryChanges(projectId, limit = 50) {
  const { data, error } = await getSupabase().from('memory_changes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, impact_data: fromJson(row.impact_data, null), timestamp: row.created_at }));
}

async function getChangeById(id) {
  const { data, error } = await getSupabase().from('memory_changes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, impact_data: fromJson(data.impact_data, null), timestamp: data.created_at } : null;
}

async function searchChanges(projectId, query) {
  const q = `%${String(query || '').toLowerCase()}%`;
  const { data, error } = await getSupabase().from('memory_changes').select('*').eq('project_id', projectId).or(`file_path.ilike.${q},diff_text.ilike.${q}`).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, impact_data: fromJson(row.impact_data, null), timestamp: row.created_at }));
}

async function getAllProjects() {
  const { data, error } = await getSupabase().from('memory_changes').select('project_id, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.project_id)) map.set(row.project_id, row.created_at);
  }
  return [...map.entries()].map(([project_id, last_seen]) => ({ project_id, last_seen }));
}

async function storeChange(sessionId, projectId, filePath, diffText, impactRadius, impactData) {
  const { data, error } = await getSupabase().from('memory_changes').insert({
    session_id: sessionId || null,
    project_id: projectId,
    file_path: filePath,
    diff_text: diffText || null,
    impact_radius: impactRadius || 0,
    impact_data: impactData || null,
  }).select('id').single();
  if (error) throw error;
  return data?.id;
}

module.exports = {
  DEMO_USER,
  getSupabase,
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
