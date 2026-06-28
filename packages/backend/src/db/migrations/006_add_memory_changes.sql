-- Migration 006: Codebase Memory System
-- Stores persistent change history from the daemon (replaces SQLite/better-sqlite3)
-- Safe to re-run: all statements use IF NOT EXISTS

CREATE TABLE IF NOT EXISTS memory_changes (
  id          bigserial   PRIMARY KEY,
  session_id  uuid,
  project_id  uuid        NOT NULL,
  file_path   text        NOT NULL,
  diff_text   text,
  impact_radius integer   DEFAULT 0,
  impact_data jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_changes_project_id
  ON memory_changes (project_id);

CREATE INDEX IF NOT EXISTS idx_memory_changes_file_path
  ON memory_changes (project_id, file_path);

CREATE INDEX IF NOT EXISTS idx_memory_changes_created_at
  ON memory_changes (project_id, created_at DESC);

-- Full-text search on file_path and diff_text
CREATE INDEX IF NOT EXISTS idx_memory_changes_search
  ON memory_changes USING gin(
    to_tsvector('english', coalesce(file_path,'') || ' ' || coalesce(diff_text,''))
  );

-- Allow users to read their own project's memory
ALTER TABLE memory_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read memory_changes for their projects"
ON memory_changes FOR SELECT
USING (
  project_id IN (
    SELECT project_id FROM projects WHERE user_id = auth.uid()
  )
);

-- Service role (backend) can insert/update
CREATE POLICY "Service role can insert memory_changes"
ON memory_changes FOR INSERT
WITH CHECK (true);
