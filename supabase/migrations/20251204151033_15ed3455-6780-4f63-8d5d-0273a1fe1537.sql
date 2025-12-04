-- Add RLS policies for process_documents table (admin only)

CREATE POLICY "Admins can insert process_documents"
ON public.process_documents
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update process_documents"
ON public.process_documents
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete process_documents"
ON public.process_documents
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));