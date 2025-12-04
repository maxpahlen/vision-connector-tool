import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileText, CheckCircle2, XCircle, Database } from 'lucide-react';

interface PropositionDoc {
  id: string;
  doc_number: string;
  title: string;
  pdf_url: string | null;
  raw_content: string | null;
  ministry: string | null;
}

interface ExtractionResult {
  docNumber: string;
  success: boolean;
  textLength?: number;
  pageCount?: number;
  error?: string;
}

interface ProcessSetupResult {
  docNumber: string;
  processId: string;
  processKey: string;
  success: boolean;
  error?: string;
}

// Pilot propositions - one from each ministry
const PILOT_DOC_NUMBERS = [
  'Prop. 2025/26:36', // Försvarsdepartementet
  'Prop. 2025/26:48', // Justitiedepartementet
  'Prop. 2025/26:42', // Finansdepartementet
];

export function PropositionTextExtractorTest() {
  const [propositions, setPropositions] = useState<PropositionDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [settingUpProcesses, setSettingUpProcesses] = useState(false);
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>([]);
  const [processResults, setProcessResults] = useState<ProcessSetupResult[]>([]);

  // Load pilot propositions
  const loadPilotPropositions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, doc_number, title, pdf_url, raw_content, ministry')
        .in('doc_number', PILOT_DOC_NUMBERS)
        .eq('doc_type', 'proposition');

      if (error) throw error;

      setPropositions(data || []);
      console.log('[Prop Text Extraction] Loaded pilot propositions:', data?.length);
      toast.success(`Loaded ${data?.length || 0} pilot propositions`);
    } catch (err) {
      console.error('[Prop Text Extraction] Error loading propositions:', err);
      toast.error('Failed to load propositions');
    } finally {
      setLoading(false);
    }
  };

  // Extract text for a single proposition
  const extractTextForProposition = async (prop: PropositionDoc): Promise<ExtractionResult> => {
    console.log(`[Prop Text Extraction] Starting { docNumber: "${prop.doc_number}", documentId: "${prop.id}" }`);

    if (!prop.pdf_url) {
      console.log(`[Prop Text Extraction] FAILED { error: "no_pdf_url", docNumber: "${prop.doc_number}" }`);
      return { docNumber: prop.doc_number, success: false, error: 'No PDF URL' };
    }

    if (prop.raw_content) {
      console.log(`[Prop Text Extraction] SKIPPED { reason: "already_has_text", docNumber: "${prop.doc_number}" }`);
      return { 
        docNumber: prop.doc_number, 
        success: true, 
        textLength: prop.raw_content.length,
        pageCount: 0 // Already extracted
      };
    }

    try {
      const { data, error } = await supabase.functions.invoke('process-sou-pdf', {
        body: { documentId: prop.id }
      });

      if (error) throw error;

      if (data?.success !== false && data?.metadata) {
        console.log(`[Prop Text Extraction] Completed { success: true, textLength: ${data.metadata.textLength}, pageCount: ${data.metadata.pageCount} }`);
        return {
          docNumber: prop.doc_number,
          success: true,
          textLength: data.metadata.textLength,
          pageCount: data.metadata.pageCount,
        };
      } else {
        console.log(`[Prop Text Extraction] FAILED { error: "${data?.error || 'unknown'}", docNumber: "${prop.doc_number}" }`);
        return { docNumber: prop.doc_number, success: false, error: data?.error || 'Extraction failed' };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[Prop Text Extraction] FAILED { error: "${errMsg}", docNumber: "${prop.doc_number}" }`);
      return { docNumber: prop.doc_number, success: false, error: errMsg };
    }
  };

  // Extract text for all propositions needing it
  const extractAllText = async () => {
    const propsNeedingText = propositions.filter(p => p.pdf_url && !p.raw_content);
    
    if (propsNeedingText.length === 0) {
      toast.info('All propositions already have text extracted');
      return;
    }

    setExtracting(true);
    setExtractionResults([]);

    const results: ExtractionResult[] = [];
    for (const prop of propsNeedingText) {
      const result = await extractTextForProposition(prop);
      results.push(result);
      setExtractionResults([...results]);
    }

    // Reload to see updated data
    await loadPilotPropositions();

    const succeeded = results.filter(r => r.success).length;
    toast.success(`Text extraction complete: ${succeeded}/${results.length} succeeded`);
    setExtracting(false);
  };

  // Normalize doc_number to process_key (e.g., "Prop. 2025/26:36" -> "prop-2025-26-36")
  const normalizeProcessKey = (docNumber: string): string => {
    return docNumber
      .toLowerCase()
      .replace(/\. /g, '-')
      .replace(/[/:]/g, '-')
      .replace(/--+/g, '-');
  };

  // Create process for a proposition
  const createProcessForProposition = async (prop: PropositionDoc): Promise<ProcessSetupResult> => {
    const processKey = normalizeProcessKey(prop.doc_number);
    
    console.log(`[Prop Process Setup] Creating process { docNumber: "${prop.doc_number}", processKey: "${processKey}" }`);

    try {
      // Check if process already exists
      const { data: existingProcess } = await supabase
        .from('processes')
        .select('id, process_key')
        .eq('process_key', processKey)
        .single();

      let processId: string;

      if (existingProcess) {
        processId = existingProcess.id;
        console.log(`[Prop Process Setup] Process already exists { processId: "${processId}", processKey: "${processKey}" }`);
      } else {
        // Create new process
        const { data: newProcess, error: processError } = await supabase
          .from('processes')
          .insert({
            process_key: processKey,
            title: prop.title,
            ministry: prop.ministry,
            current_stage: 'proposition',
          })
          .select('id')
          .single();

        if (processError) throw processError;
        processId = newProcess.id;
        console.log(`[Prop Process Setup] Created process { processId: "${processId}", processKey: "${processKey}", docNumber: "${prop.doc_number}" }`);
      }

      // Check if document is already linked
      const { data: existingLink } = await supabase
        .from('process_documents')
        .select('id')
        .eq('process_id', processId)
        .eq('document_id', prop.id)
        .single();

      if (!existingLink) {
        // Link document to process
        const { error: linkError } = await supabase
          .from('process_documents')
          .insert({
            process_id: processId,
            document_id: prop.id,
            role: 'proposition',
          });

        if (linkError) throw linkError;
        console.log(`[Prop Process Setup] Linked document to process { processId: "${processId}", documentId: "${prop.id}" }`);
      }

      return {
        docNumber: prop.doc_number,
        processId,
        processKey,
        success: true,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Prop Process Setup] FAILED { error: "${errMsg}", docNumber: "${prop.doc_number}" }`);
      return {
        docNumber: prop.doc_number,
        processId: '',
        processKey,
        success: false,
        error: errMsg,
      };
    }
  };

  // Create processes for all propositions
  const setupProcessesForAll = async () => {
    setSettingUpProcesses(true);
    setProcessResults([]);

    const results: ProcessSetupResult[] = [];
    for (const prop of propositions) {
      const result = await createProcessForProposition(prop);
      results.push(result);
      setProcessResults([...results]);
    }

    const succeeded = results.filter(r => r.success).length;
    toast.success(`Process setup complete: ${succeeded}/${results.length} succeeded`);
    setSettingUpProcesses(false);
  };

  const propsWithText = propositions.filter(p => p.raw_content).length;
  const propsWithPdf = propositions.filter(p => p.pdf_url).length;
  const propsNeedingText = propositions.filter(p => p.pdf_url && !p.raw_content).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Proposition Text Extraction & Process Setup (Pilot)
        </CardTitle>
        <CardDescription>
          Extract text from pilot propositions and create processes for agent testing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Load propositions */}
        <div className="flex items-center gap-4">
          <Button onClick={loadPilotPropositions} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load Pilot Propositions
          </Button>
          <span className="text-sm text-muted-foreground">
            Target: {PILOT_DOC_NUMBERS.join(', ')}
          </span>
        </div>

        {/* Status badges */}
        {propositions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Total: {propositions.length}
            </Badge>
            <Badge variant={propsWithPdf === propositions.length ? 'default' : 'secondary'}>
              With PDF: {propsWithPdf}
            </Badge>
            <Badge variant={propsWithText === propositions.length ? 'default' : 'secondary'}>
              With Text: {propsWithText}
            </Badge>
            {propsNeedingText > 0 && (
              <Badge variant="destructive">
                Need Extraction: {propsNeedingText}
              </Badge>
            )}
          </div>
        )}

        {/* Propositions list */}
        {propositions.length > 0 && (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Doc Number</th>
                  <th className="p-2 text-left">Ministry</th>
                  <th className="p-2 text-left">PDF</th>
                  <th className="p-2 text-left">Text</th>
                </tr>
              </thead>
              <tbody>
                {propositions.map(prop => (
                  <tr key={prop.id} className="border-b">
                    <td className="p-2 font-mono text-xs">{prop.doc_number}</td>
                    <td className="p-2 text-xs">{prop.ministry || '—'}</td>
                    <td className="p-2">
                      {prop.pdf_url ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </td>
                    <td className="p-2">
                      {prop.raw_content ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-xs text-muted-foreground">
                            {prop.raw_content.length.toLocaleString()} chars
                          </span>
                        </span>
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Actions */}
        {propositions.length > 0 && (
          <div className="flex gap-4">
            <Button 
              onClick={extractAllText} 
              disabled={extracting || propsNeedingText === 0}
              variant="default"
            >
              {extracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Extract Text ({propsNeedingText})
            </Button>
            
            <Button 
              onClick={setupProcessesForAll} 
              disabled={settingUpProcesses}
              variant="outline"
            >
              {settingUpProcesses && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Database className="mr-2 h-4 w-4" />
              Setup Processes
            </Button>
          </div>
        )}

        {/* Extraction results */}
        {extractionResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Extraction Results</h4>
            <div className="rounded-lg border p-3 space-y-1">
              {extractionResults.map((result, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-mono">{result.docNumber}</span>
                  {result.success && result.textLength ? (
                    <span className="text-muted-foreground">
                      — {result.textLength.toLocaleString()} chars, {result.pageCount} pages
                    </span>
                  ) : result.error ? (
                    <span className="text-destructive">— {result.error}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Process setup results */}
        {processResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Process Setup Results</h4>
            <div className="rounded-lg border p-3 space-y-1">
              {processResults.map((result, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-mono">{result.docNumber}</span>
                  {result.success ? (
                    <span className="text-muted-foreground">
                      → {result.processKey}
                    </span>
                  ) : (
                    <span className="text-destructive">— {result.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
