-- Add RLS policies for agent_tasks table to allow authenticated users to read task queue data
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all agent tasks (for monitoring)
CREATE POLICY "Authenticated users can read agent_tasks"
ON agent_tasks
FOR SELECT
TO authenticated
USING (true);

-- Note: Only the system (via service role in edge functions) should be able to 
-- insert/update/delete agent_tasks, so we don't add those policies here