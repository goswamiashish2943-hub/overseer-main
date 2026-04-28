-- 003_add_reviewed_columns.sql
-- Adds review tracking to sessions table.
-- Run this in the Supabase SQL Editor.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast filtering of unreviewed items
CREATE INDEX IF NOT EXISTS idx_sessions_reviewed ON sessions (reviewed);
