import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, Search, Users, Zap, PlayCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Document {
  id: string;
  doc_number: string;
  title: string;
  doc_type: string;
}

interface MetadataTestResult {
  success: boolean;
  output_data: {
    agent_version: string;
    model_used: string;
    completed_at: string;
    processing_time_ms: number;
    entities_reported: number;
    entities_created: number;
    entities_reused: number;
    relations_created: number;
    entity_breakdown: {
      person: number;
      ministry: number;
      committee: number;
    };
    analyzed_sections: string[];
    skipped_sections: string[];
    uncertainties: string[];
  };
}

export function MetadataAgentTest() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MetadataTestResult | null>(null);
  const [unprocessedCount, setUnprocessedCount] = useState<number>(0);
  const [processingBatch, setProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ processed: number; total: number } | null>(null);

  const loadUnprocessedCount = async () => {
    try {
      // Count documents with content but no entities
      const { count, error } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .not("raw_content", "is", null)
        .filter("id", "not.in", `(SELECT DISTINCT source_document_id FROM entities WHERE source_document_id IS NOT NULL)`);

      if (error) throw error;
      setUnprocessedCount(count || 0);
    } catch (error) {
      console.error("Error counting unprocessed documents:", error);
    }
  };

  const loadDocuments = async () => {
    setLoadingDocuments(true);
    try {
      // Build query based on filter
      let query = supabase
        .from("documents")
        .select("id, doc_number, title, doc_type")
        .not("raw_content", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

      // Apply doc_type filter
      if (docTypeFilter === "sou") {
        query = query.eq("doc_type", "sou");
      } else if (docTypeFilter === "directive") {
        query = query.eq("doc_type", "dir");
      }
      // "all" means no filter

      const { data: docs, error } = await query;

      if (error) throw error;

      setDocuments(docs || []);
      
      const filterLabel = docTypeFilter === "all" ? "all" : docTypeFilter === "sou" ? "SOU" : "directive";
      toast({
        title: "Documents Loaded",
        description: `Found ${docs?.length || 0} ${filterLabel} documents with content`,
      });

      // Also load unprocessed count
      await loadUnprocessedCount();
    } catch (error) {
      console.error("Error loading documents:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoadingDocuments(false);
    }
  };

  const processBatchDocuments = async (limit: number | null) => {
    setProcessingBatch(true);
    setBatchProgress(null);

    try {
      // Get unprocessed documents
      const { data: unprocessedDocs, error: queryError } = await supabase
        .from("documents")
        .select("id, doc_number")
        .not("raw_content", "is", null)
        .filter("id", "not.in", `(SELECT DISTINCT source_document_id FROM entities WHERE source_document_id IS NOT NULL)`)
        .order("created_at", { ascending: false })
        .limit(limit || 1000);

      if (queryError) throw queryError;

      if (!unprocessedDocs || unprocessedDocs.length === 0) {
        toast({
          title: "No Documents to Process",
          description: "All documents with content already have entities extracted",
        });
        return;
      }

      const total = unprocessedDocs.length;
      setBatchProgress({ processed: 0, total });

      toast({
        title: "Batch Processing Started",
        description: `Creating tasks for ${total} documents...`,
      });

      // Create tasks for each document
      let tasksCreated = 0;
      for (const doc of unprocessedDocs) {
        // Get process_id if exists
        const { data: processDoc } = await supabase
          .from("process_documents")
          .select("process_id")
          .eq("document_id", doc.id)
          .maybeSingle();

        // Create task
        const { error: taskError } = await supabase
          .from("agent_tasks")
          .insert({
            task_type: "metadata_extraction",
            agent_name: "agent-metadata",
            status: "pending",
            priority: 5,
            document_id: doc.id,
            process_id: processDoc?.process_id || null,
            input_data: {
              document_id: doc.id,
              process_id: processDoc?.process_id || null,
            },
          });

        if (!taskError) {
          tasksCreated++;
          setBatchProgress({ processed: tasksCreated, total });
        }
      }

      toast({
        title: "Batch Tasks Created",
        description: `Created ${tasksCreated} metadata extraction tasks. Use Task Queue Monitor to process them.`,
      });

      // Refresh unprocessed count
      await loadUnprocessedCount();
    } catch (error) {
      console.error("Error processing batch:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process batch",
        variant: "destructive",
      });
    } finally {
      setProcessingBatch(false);
      setBatchProgress(null);
    }
  };

  const runMetadataAgent = async () => {
    if (!selectedDocumentId) {
      toast({
        title: "Error",
        description: "Please select a document first",
        variant: "destructive",
      });
      return;
    }

    setRunning(true);
    setResult(null);

    try {
      // Get process_id for the document
      const { data: processDoc, error: processError } = await supabase
        .from("process_documents")
        .select("process_id")
        .eq("document_id", selectedDocumentId)
        .maybeSingle();

      if (processError) throw processError;

      const processId = processDoc?.process_id || null;

      // Call metadata agent directly
      const { data, error } = await supabase.functions.invoke("agent-metadata", {
        body: {
          document_id: selectedDocumentId,
          process_id: processId,
        },
      });

      if (error) throw error;

      setResult(data as MetadataTestResult);

      const outputData = (data as MetadataTestResult).output_data;
      toast({
        title: data.success ? "Success" : "Skipped",
        description: data.success
          ? `Extracted ${outputData.entities_reported} entities (${outputData.entities_created} new, ${outputData.entities_reused} reused)`
          : "No metadata found in document",
      });
    } catch (error) {
      console.error("Error running Metadata Agent:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run Metadata Agent",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Metadata Agent v1 Test
          </CardTitle>
          <CardDescription>
            Extract lead investigators and committee names from documents with forensic citations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Document Type Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Document Type:</label>
            <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Documents</SelectItem>
                <SelectItem value="sou">SOUs Only</SelectItem>
                <SelectItem value="directive">Directives Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Load Documents */}
          <div className="flex gap-2">
            <Button onClick={loadDocuments} disabled={loadingDocuments} variant="outline" className="gap-2">
              {loadingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Load Documents
            </Button>
            {documents.length > 0 && <Badge variant="secondary">{documents.length} documents</Badge>}
            {unprocessedCount > 0 && <Badge variant="outline">{unprocessedCount} unprocessed</Badge>}
          </div>

          {/* Batch Processing */}
          {unprocessedCount > 0 && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="text-sm font-medium">Batch Processing</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => processBatchDocuments(10)}
                  disabled={processingBatch}
                  variant="secondary"
                  className="gap-2"
                >
                  {processingBatch ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Process 10 Documents
                </Button>
                <Button
                  onClick={() => processBatchDocuments(null)}
                  disabled={processingBatch}
                  variant="default"
                  className="gap-2"
                >
                  {processingBatch ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Process All ({unprocessedCount})
                </Button>
              </div>
              {batchProgress && (
                <div className="text-sm text-muted-foreground">
                  Creating tasks: {batchProgress.processed} / {batchProgress.total}
                </div>
              )}
              <Alert>
                <AlertDescription className="text-xs">
                  These buttons create tasks in the queue. Use the <strong>Task Queue Monitor</strong> below to process them with rate limiting.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Document Selection */}
          {documents.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Document:</label>
              <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a document..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.doc_number} - {doc.title.substring(0, 60)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Run Button */}
          <div className="flex gap-2">
            <Button onClick={runMetadataAgent} disabled={running || !selectedDocumentId} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Extract Metadata
            </Button>
          </div>

          {/* Info Alert */}
          <Alert>
            <AlertDescription className="text-sm">
              <strong>v1 Scope:</strong> Extracts only lead investigators (actual names, not roles) and committee names.
              Ministry data comes from scraper (already in documents.ministry). Secretariat members, experts, and reference groups will be added in future phases.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Results Display */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Extraction Results</CardTitle>
            <CardDescription>
              {result.success ? "Metadata extracted successfully" : "No metadata found"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.success && result.output_data && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Entities Reported</div>
                    <div className="text-2xl font-bold">{result.output_data.entities_reported}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">New Entities</div>
                    <div className="text-2xl font-bold text-green-600">{result.output_data.entities_created}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Reused Entities</div>
                    <div className="text-2xl font-bold text-blue-600">{result.output_data.entities_reused}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Relations Created</div>
                    <div className="text-2xl font-bold">{result.output_data.relations_created}</div>
                  </div>
                </div>

                {/* Entity Breakdown */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Entity Breakdown:</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="default">People: {result.output_data.entity_breakdown.person}</Badge>
                    <Badge variant="outline">Committees: {result.output_data.entity_breakdown.committee}</Badge>
                  </div>
                </div>

                {/* Processing Info */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Processing Details:</div>
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-muted-foreground">Model:</span> {result.output_data.model_used}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Processing Time:</span>{" "}
                      {(result.output_data.processing_time_ms / 1000).toFixed(2)}s
                    </div>
                    <div>
                      <span className="text-muted-foreground">Agent Version:</span> {result.output_data.agent_version}
                    </div>
                  </div>
                </div>

                {/* Sections Analyzed */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Analyzed Sections:</div>
                  <div className="text-sm text-muted-foreground">{result.output_data.analyzed_sections.join(", ")}</div>
                </div>

                {/* Skipped Sections */}
                {result.output_data.skipped_sections.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Skipped Sections:</div>
                    <div className="text-sm text-muted-foreground">
                      {result.output_data.skipped_sections.join(", ")}
                    </div>
                  </div>
                )}

                {/* Uncertainties */}
                {result.output_data.uncertainties.length > 0 && (
                  <Alert>
                    <AlertDescription>
                      <div className="text-sm font-medium mb-1">Uncertainties:</div>
                      <ul className="text-sm space-y-1">
                        {result.output_data.uncertainties.map((uncertainty, idx) => (
                          <li key={idx}>• {uncertainty}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Raw JSON */}
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium mb-2">View Raw Output</summary>
                  <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96">
                    {JSON.stringify(result.output_data, null, 2)}
                  </pre>
                </details>
              </>
            )}

            {!result.success && (
              <Alert>
                <AlertDescription>
                  No metadata entities found in the document. This could be normal if the document doesn't have clear
                  entity information in the analyzed sections.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
