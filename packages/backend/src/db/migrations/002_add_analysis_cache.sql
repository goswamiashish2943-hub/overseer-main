-- 002_add_analysis_cache.sql

-- Analysis Cache table for caching identical code chunks to avoid redundant LLM calls
CREATE TABLE IF NOT EXISTS public.analysis_cache (
    code_hash VARCHAR(255) PRIMARY KEY,
    analysis JSONB NOT NULL,
    hits INT DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: RLS is disabled by default for server-side only tables, 
-- but if we want this accessed defensively:
ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;

-- The server service_key bypasses RLS, so no policy strictly needed for the backend.
