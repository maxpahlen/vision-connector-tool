-- Core table: processes - The central legislative journey
CREATE TABLE processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_key TEXT UNIQUE NOT NULL, -- e.g., 'sou-2023-45'
  title TEXT NOT NULL,
  main_document_id UUID, -- Reference to primary SOU document
  directive_number TEXT, -- e.g., 'Dir. 2023:45' (metadata)
  current_stage TEXT NOT NULL DEFAULT 'published', -- 'directive', 'writing', 'published', 'remiss', 'proposition', 'law'
  stage_explanation TEXT, -- What this stage means right now
  ministry TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_processes_key ON processes(process_key);
CREATE INDEX idx_processes_stage ON processes(current_stage);

-- Core table: documents - All legislative documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type TEXT NOT NULL, -- 'sou', 'directive', 'proposition', 'law', 'remiss_response'
  doc_number TEXT NOT NULL, -- e.g., 'SOU 2023:45'
  title TEXT NOT NULL,
  publication_date DATE,
  ministry TEXT,
  url TEXT, -- Official source link
  pdf_url TEXT,
  raw_content TEXT, -- Extracted PDF text
  processed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(doc_type, doc_number)
);

CREATE INDEX idx_documents_type ON documents(doc_type);
CREATE INDEX idx_documents_number ON documents(doc_number);

-- Junction table: process_documents - Links documents to processes
CREATE TABLE process_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'directive', 'main_sou', 'proposition', 'law', 'remiss_response'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(process_id, document_id)
);

CREATE INDEX idx_process_docs_process ON process_documents(process_id);
CREATE INDEX idx_process_docs_document ON process_documents(document_id);

-- Core table: entities - People, agencies, organizations
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'person', 'agency', 'ministry', 'remissinstans'
  name TEXT NOT NULL,
  role TEXT, -- 'utredare', 'sekretariat', 'expert', etc.
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(entity_type, name)
);

CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_name ON entities(name);

-- Core table: relations - Connections between documents/entities
CREATE TABLE relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL, -- 'document', 'entity', 'process'
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL,
  relation_type TEXT NOT NULL, -- 'leads_to', 'authored_by', 'reviewed_by', 'cites'
  metadata JSONB DEFAULT '{}'::jsonb, -- { source_page: 31, source_excerpt: "...", confidence: 0.95 }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_relations_source ON relations(source_id, source_type);
CREATE INDEX idx_relations_target ON relations(target_id, target_type);
CREATE INDEX idx_relations_type ON relations(relation_type);

-- Core table: timeline_events - Structured timeline with page-level citations
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'directive_issued', 'sou_published', 'remiss_started', etc.
  event_date DATE NOT NULL,
  description TEXT,
  source_url TEXT,
  source_page INTEGER, -- Page number in source document
  source_excerpt TEXT, -- Text excerpt from source
  actors JSONB DEFAULT '[]'::jsonb, -- Array of entity IDs involved
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_timeline_process ON timeline_events(process_id);
CREATE INDEX idx_timeline_date ON timeline_events(event_date);

-- Core table: agent_tasks - Multi-agent workflow coordination
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL, -- 'head_detective', 'timeline_agent', 'metadata_agent'
  task_type TEXT NOT NULL, -- 'analyze_sou', 'extract_timeline', 'identify_actors'
  process_id UUID REFERENCES processes(id),
  document_id UUID REFERENCES documents(id),
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  priority INTEGER DEFAULT 0,
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_agent_tasks_status ON agent_tasks(status, priority);
CREATE INDEX idx_agent_tasks_agent ON agent_tasks(agent_name);

-- User profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  organization TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Trigger function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$;

-- Trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security on all tables
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users can read all data
CREATE POLICY "Authenticated users read processes" ON processes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read documents" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read process_documents" ON process_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read entities" ON entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read relations" ON relations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read timeline_events" ON timeline_events FOR SELECT TO authenticated USING (true);

-- Profile policies
CREATE POLICY "Users read own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Agent tasks: Service role only (edge functions will use service_role)
-- No RLS policy needed as these will be managed by edge functions with service role

-- Add foreign key for main_document_id after documents table exists
ALTER TABLE processes ADD CONSTRAINT fk_processes_main_document 
  FOREIGN KEY (main_document_id) REFERENCES documents(id) ON DELETE SET NULL;

-- Full-text search index for documents (Swedish language)
CREATE INDEX idx_documents_content_search ON documents USING GIN(to_tsvector('swedish', COALESCE(raw_content, '')));