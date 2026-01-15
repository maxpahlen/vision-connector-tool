-- Enable RLS on backup table (admin-only access for data recovery)
ALTER TABLE entities_duplicates_backup_20260115 ENABLE ROW LEVEL SECURITY;

-- Only admins can access backup data
CREATE POLICY "Admins can access entity backup"
ON entities_duplicates_backup_20260115
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));