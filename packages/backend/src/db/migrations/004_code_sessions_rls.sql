-- Enable RLS
ALTER TABLE code_sessions ENABLE ROW LEVEL SECURITY;

-- Allow users to read code_sessions for projects they own
CREATE POLICY "Users can read code_sessions for their projects"
ON code_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.project_id = code_sessions.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Allow backend to insert (backend uses service key so it bypasses RLS, but if it used anon it would need this)
-- Service key bypasses RLS, so this might be all that's needed for the dashboard to read.
