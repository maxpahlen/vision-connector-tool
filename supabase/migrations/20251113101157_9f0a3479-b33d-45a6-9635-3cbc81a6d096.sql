-- Re-enable RLS on agent_tasks for security
-- Edge functions will use service_role key which bypasses RLS
-- No policies means authenticated users cannot access this table
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;