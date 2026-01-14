-- Allow admins to insert entities (for the Create Entity feature)
CREATE POLICY "Admins can insert entities"
  ON public.entities
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update entities
CREATE POLICY "Admins can update entities"
  ON public.entities
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));