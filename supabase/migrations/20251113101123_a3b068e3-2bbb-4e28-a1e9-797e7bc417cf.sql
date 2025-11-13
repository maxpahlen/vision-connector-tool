-- agent_tasks is a backend coordination table used only by edge functions with service_role
-- It should not have RLS enabled as it's not accessed by authenticated users
ALTER TABLE agent_tasks DISABLE ROW LEVEL SECURITY;