import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileText, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface DocumentDoc {
  id: string;
  doc_number: string;
  doc_type: string;
  title: string;
  pdf_url: string | null;
  raw_content: string | null;
  ministry: string | null;
}

interface ExtractionResult {
  docNumber: string;
  docType: string;
  success: boolean;
  textLength?: number;
  pageCount?: number;
  error?: string;
}

export function DocumentTextExtractor() {
  const [documents, setDocuments] = useState<DocumentDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>([]);
  const [currentDoc, setCurrentDoc] = useState<string | null>(null);

  // Load documents needing text extraction
  const loadDocumentsNeedingExtraction = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, doc_number, doc_type, title, pdf_url, raw_content, ministry')
        .not('pdf_url', 'is', null)
        .is('raw_content', null)
        .order('doc_type')
        .order('doc_number');

      if (error) throw error;

      setDocuments(data || []);
      console.log('[Text Extraction] Loaded documents needing extraction:', data?.length);
      toast.success(`Found ${data?.length || 0} documents needing text extraction`);
    } catch (err) {
      console.error('[Text Extraction] Error loading documents:', err);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  // Extract text for a single document
  const extractTextForDocument = async (doc: DocumentDoc): Promise<ExtractionResult> => {
    console.log(`[Text Extraction] Starting { docNumber: "${doc.doc_number}", docType: "${doc.doc_type}", documentId: "${doc.id}" }`);

    if (!doc.pdf_url) {
      return { docNumber: doc.doc_number, docType: doc.doc_type, success: false, error: 'No PDF URL' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('process-sou-pdf', {
        body: { documentId: doc.id }
      });

      if (error) throw error;

      if (data?.success !== false && data?.metadata) {
        console.log(`[Text Extraction] Completed { success: true, textLength: ${data.metadata.textLength}, pageCount: ${data.metadata.pageCount} }`);
        return {
          docNumber: doc.doc_number,
          docType: doc.doc_type,
          success: true,
          textLength: data.metadata.textLength,
          pageCount: data.metadata.pageCount,
        };
      } else {
        console.log(`[Text Extraction] FAILED { error: "${data?.error || 'unknown'}", docNumber: "${doc.doc_number}" }`);
        return { docNumber: doc.doc_number, docType: doc.doc_type, success: false, error: data?.error || 'Extraction failed' };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[Text Extraction] FAILED { error: "${errMsg}", docNumber: "${doc.doc_number}" }`);
      return { docNumber: doc.doc_number, docType: doc.doc_type, success: false, error: errMsg };
    }
  };

  // Extract text for all documents
  const extractAllText = async () => {
    if (documents.length === 0) {
      toast.info('No documents need text extraction');
      return;
    }

    setExtracting(true);
    setExtractionResults([]);

    const results: ExtractionResult[] = [];
    for (const doc of documents) {
      setCurrentDoc(doc.doc_number);
      const result = await extractTextForDocument(doc);
      results.push(result);
      setExtractionResults([...results]);
    }

    setCurrentDoc(null);
    
    // Reload to see updated data
    await loadDocumentsNeedingExtraction();

    const succeeded = results.filter(r => r.success).length;
    toast.success(`Text extraction complete: ${succeeded}/${results.length} succeeded`);
    setExtracting(false);
  };

  // Group documents by type for display
  const groupedByType = documents.reduce((acc, doc) => {
    if (!acc[doc.doc_type]) acc[doc.doc_type] = [];
    acc[doc.doc_type].push(doc);
    return acc;
  }, {} as Record<string, DocumentDoc[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Document Text Extraction
        </CardTitle>
        <CardDescription>
          Extract text from PDFs for documents that have pdf_url but no raw_content
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Load documents */}
        <div className="flex items-center gap-4">
          <Button onClick={loadDocumentsNeedingExtraction} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <RefreshCw className="mr-2 h-4 w-4" />
            Find Documents Needing Extraction
          </Button>
        </div>

        {/* Status badges */}
        {documents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="destructive">
              Total Needing Extraction: {documents.length}
            </Badge>
            {Object.entries(groupedByType).map(([docType, docs]) => (
              <Badge key={docType} variant="outline">
                {docType}: {docs.length}
              </Badge>
            ))}
          </div>
        )}

        {documents.length === 0 && !loading && (
          <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-muted/50">
            No documents found needing text extraction. All documents with PDFs have been processed.
          </div>
        )}

        {/* Documents list */}
        {documents.length > 0 && (
          <div className="rounded-lg border max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Doc Number</th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left">PDF</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id} className="border-b">
                    <td className="p-2">
                      <Badge variant="secondary" className="text-xs">
                        {doc.doc_type}
                      </Badge>
                    </td>
                    <td className="p-2 font-mono text-xs">{doc.doc_number}</td>
                    <td className="p-2 text-xs truncate max-w-xs" title={doc.title}>
                      {doc.title.substring(0, 50)}...
                    </td>
                    <td className="p-2">
                      {doc.pdf_url ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
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
        {documents.length > 0 && (
          <div className="flex gap-4">
            <Button 
              onClick={extractAllText} 
              disabled={extracting}
              variant="default"
            >
              {extracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Extract All Text ({documents.length})
            </Button>
            {currentDoc && (
              <span className="text-sm text-muted-foreground flex items-center">
                Processing: {currentDoc}
              </span>
            )}
          </div>
        )}

        {/* Extraction results */}
        {extractionResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Extraction Results</h4>
            <div className="rounded-lg border p-3 space-y-1 max-h-60 overflow-auto">
              {extractionResults.map((result, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <Badge variant="outline" className="text-xs">{result.docType}</Badge>
                  <span className="font-mono text-xs">{result.docNumber}</span>
                  {result.success && result.textLength ? (
                    <span className="text-muted-foreground text-xs">
                      — {result.textLength.toLocaleString()} chars, {result.pageCount} pages
                    </span>
                  ) : result.error ? (
                    <span className="text-destructive text-xs">— {result.error}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
