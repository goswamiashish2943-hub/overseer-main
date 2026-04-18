-- Migration 002: Add identifier column to projects table
-- Run in Supabase SQL Editor or via init.js
-- Allows daemon to resolve projects by git remote URL hash — no user config needed.
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS

ALTER TABLE projects ADD COLUMN IF NOT EXISTS identifier TEXT;

-- Unique per-user: one project per identifier per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_identifier
  ON projects (user_id, identifier);

-- Fast lookup by identifier alone (for admin queries)
CREATE INDEX IF NOT EXISTS idx_projects_identifier
  ON projects (identifier);
