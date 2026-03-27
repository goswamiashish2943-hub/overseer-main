---
name: supabase-patterns
description: Correct Supabase patterns for overseer. Load for any
  database read, write, migration, or auth task.
triggers:
  - "supabase"
  - "database"
  - "insert"
  - "query"
  - "migration"
  - "table"
  - "auth"
  - "rpc"
  - "vector"
  - "embedding"
---

# Supabase patterns for overseer

## Client init — backend (service key, full access)
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

## Client init — dashboard (anon key, RLS enforced)
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

## Insert an event
const { error } = await supabase
  .from('events')
  .insert({ session_id, project_id, file_path,
    diff_text, severity, analysis_text, embedding })
if (error) console.error('[Supabase] Event insert failed:', error.message)

## Upsert file_knowledge — ALWAYS upsert, NEVER plain insert
await supabase
  .from('file_knowledge')
  .upsert(
    { project_id, file_path, current_summary, open_risks,
      times_modified: supabase.rpc('increment', { row_id: id }) },
    { onConflict: 'project_id,file_path' }
  )

## Semantic search via pgvector
const { data, error } = await supabase.rpc('match_events', {
  query_embedding: embedding,
  match_project_id: projectId,
  match_threshold: 0.75,
  match_count: 10
})

## Verify user owns the project (ALWAYS do this)
const { data: project } = await supabase
  .from('projects')
  .select('project_id')
  .eq('project_id', projectId)
  .eq('user_id', req.user.id)  // prevent cross-user access
  .single()
if (!project) return res.status(403).json({ error: 'Forbidden' })

## NEVER do these
- Never use SUPABASE_SERVICE_KEY on the frontend
- Never skip the project_id ownership check
- Never use .insert() on file_knowledge — always .upsert()
- Never ignore error objects from Supabase calls
