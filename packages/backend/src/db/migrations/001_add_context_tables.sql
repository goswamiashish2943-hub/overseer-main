-- ============================================================
-- Migration 001: Add context tables for Overseer auto-context
-- Run via: npm run init (packages/backend/scripts/init.js)
-- Safe to re-run: all statements use IF NOT EXISTS
-- ============================================================

-- ── project_context_files ─────────────────────────────────────────────────────
-- Stores .md / .json context files uploaded by the daemon.
-- The daemon uploads file content; analyseRoute.js reads it back for prompts.

CREATE TABLE IF NOT EXISTS project_context_files (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  file_name   text        NOT NULL,           -- e.g. "README.md", "ARCHITECTURE.md"
  content     text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (project_id, file_name)              -- one row per file per project
);

-- Index for fast lookup by project
CREATE INDEX IF NOT EXISTS idx_context_files_project_id
  ON project_context_files (project_id);

-- ── sessions ─────────────────────────────────────────────────────────────
-- Stores full enhanced analysis sessions (one per file change).
-- Provides long-term pattern tracking beyond the events table.

CREATE TABLE IF NOT EXISTS sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  file_path       text        NOT NULL,
  diff_text       text,
  severity        text,
  suggestion      jsonb,      -- { severity, title, body, fix }
  better_approach jsonb,      -- { exists, description, reason }
  alignment       jsonb,      -- { aligned, score, issues, notes }
  decisions       jsonb,      -- { found, list, impact }
  change_analysis jsonb,      -- array of change items
  explanations    text,
  used_fallback   boolean     DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id
  ON sessions (project_id);

CREATE INDEX IF NOT EXISTS idx_sessions_file_path
  ON sessions (project_id, file_path);

-- ── codebase_patterns ─────────────────────────────────────────────────────────
-- Learned patterns over time (unused in v1, reserved for future use).
-- Pattern engine will populate this as sessions accumulate.

CREATE TABLE IF NOT EXISTS codebase_patterns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  pattern     text        NOT NULL,       -- short key, e.g. "auth_bypass_pattern"
  occurrences integer     NOT NULL DEFAULT 1,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  examples    jsonb                        -- sample diffs that triggered this pattern
);

CREATE INDEX IF NOT EXISTS idx_patterns_project_id
  ON codebase_patterns (project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_project_pattern
  ON codebase_patterns (project_id, pattern);
