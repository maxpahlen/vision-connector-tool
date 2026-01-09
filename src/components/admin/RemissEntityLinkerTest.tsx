import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Link2, AlertCircle, Database, ChevronDown, FileWarning } from 'lucide-react';

interface ProcessRemissinstansersResult {
  processed: number;
  invitees_extracted: number;
  skipped: number;
  errors: Array<{ remiss_id: string; error: string }>;
  details: Array<{
    remiss_id: string;
    title: string;
    invitees_count: number;
    sample_invitees: string[];
    parse_status: string;
  }>;
  skipped_details?: Array<{
    remiss_id: string;
    title: string;
    parse_status: string;
    parse_reason: string;
    sample_lines: string[];
  }>;
  message?: string;
}

interface LinkRemissvarResult {
  processed: number;
  linked: { high: number; total: number };
  not_linked: { medium: number; low: number; unmatched: number; total: number };
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  unmatched: number;
  entities_created: number;
  errors: Array<{ response_id: string; error: string }>;
  review_needed: Array<{
    response_id: string;
    original_name: string;
    normalized_name: string;
    matched_name: string | null;
    similarity_score: number | null;
    confidence: string;
  }>;
  unmatched_orgs: string[];
  message?: string;
}

interface BootstrapResult {
  invitee_rows_fetched: number;
  unique_raw_names: number;
  unique_normalized_names: number;
  entities_created: number;
  entities_already_exist: number;
  invalid_rejected: number;
  rejected_too_short: number;
  rejected_too_long: number;
  rejected_contact_info: number;
  rejected_blocked_phrase: number;
  skipped_low_occurrence: number;
  created: number;
  skipped_existing: number;
  skipped_invalid: number;
  total_candidates: number;
  dry_run: boolean;
  sample_created: string[];
  sample_skipped_invalid: string[];
  message?: string;
}

export function RemissEntityLinkerTest() {
  const [activeTab, setActiveTab] = useState('invitees');
  
  // Remissinstanser state
  const [inviteesLoading, setInviteesLoading] = useState(false);
  const [inviteesResult, setInviteesResult] = useState<ProcessRemissinstansersResult | null>(null);
  const [inviteesDryRun, setInviteesDryRun] = useState(true);
  const [inviteesLimit, setInviteesLimit] = useState(5);

  // Entity linking state
  const [linkingLoading, setLinkingLoading] = useState(false);
  const [linkingResult, setLinkingResult] = useState<LinkRemissvarResult | null>(null);
  const [linkingDryRun, setLinkingDryRun] = useState(true);
  const [createEntities, setCreateEntities] = useState(false);
  const [linkingLimit, setLinkingLimit] = useState(500);

  // Bootstrap state
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult | null>(null);
  const [bootstrapDryRun, setBootstrapDryRun] = useState(true);
  const [bootstrapLimit, setBootstrapLimit] = useState(2000);
  const [minOccurrences, setMinOccurrences] = useState(1);

  const handleProcessRemissinstanser = async () => {
    setInviteesLoading(true);
    setInviteesResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('process-remissinstanser', {
        body: { limit: inviteesLimit, dry_run: inviteesDryRun }
      });

      if (error) throw error;
      setInviteesResult(data);
    } catch (err) {
      console.error('Error processing remissinstanser:', err);
      setInviteesResult({
        processed: 0, invitees_extracted: 0, skipped: 0,
        errors: [{ remiss_id: 'N/A', error: err instanceof Error ? err.message : String(err) }],
        details: []
      });
    } finally {
      setInviteesLoading(false);
    }
  };

  const handleLinkRemissvar = async () => {
    setLinkingLoading(true);
    setLinkingResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('link-remissvar-entities', {
        body: { limit: linkingLimit, create_entities: createEntities, dry_run: linkingDryRun }
      });

      if (error) throw error;
      setLinkingResult(data);
    } catch (err) {
      console.error('Error linking remissvar:', err);
      setLinkingResult({
        processed: 0, linked: { high: 0, total: 0 }, not_linked: { medium: 0, low: 0, unmatched: 0, total: 0 },
        high_confidence: 0, medium_confidence: 0, low_confidence: 0, unmatched: 0, entities_created: 0,
        errors: [{ response_id: 'N/A', error: err instanceof Error ? err.message : String(err) }],
        review_needed: [], unmatched_orgs: []
      });
    } finally {
      setLinkingLoading(false);
    }
  };

  const handleBootstrapEntities = async () => {
    setBootstrapLoading(true);
    setBootstrapResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('bootstrap-org-entities', {
        body: { limit: bootstrapLimit, dry_run: bootstrapDryRun, min_occurrences: minOccurrences }
      });

      if (error) throw error;
      setBootstrapResult(data);
    } catch (err) {
      console.error('Error bootstrapping entities:', err);
      setBootstrapResult({
        invitee_rows_fetched: 0, unique_raw_names: 0, unique_normalized_names: 0,
        entities_created: 0, entities_already_exist: 0, invalid_rejected: 0,
        rejected_too_short: 0, rejected_too_long: 0, rejected_contact_info: 0, rejected_blocked_phrase: 0,
        skipped_low_occurrence: 0, created: 0, skipped_existing: 0, skipped_invalid: 0, total_candidates: 0,
        dry_run: bootstrapDryRun, sample_created: [],
        sample_skipped_invalid: [err instanceof Error ? err.message : String(err)]
      });
    } finally {
      setBootstrapLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Phase 2.7: Remissinstanser & Entity Linking
        </CardTitle>
        <CardDescription>
          Extract invited organizations from remissinstanser PDFs and link remissvar to entities
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="invitees">1. Parse</TabsTrigger>
            <TabsTrigger value="bootstrap">2. Bootstrap</TabsTrigger>
            <TabsTrigger value="linking">3. Link</TabsTrigger>
          </TabsList>

          {/* Parse Tab */}
          <TabsContent value="invitees" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="invitees-dry-run">Dry Run</Label>
                  <Switch id="invitees-dry-run" checked={inviteesDryRun} onCheckedChange={setInviteesDryRun} />
                </div>
                <div className="space-y-2">
                  <Label>Limit: {inviteesLimit} remisser</Label>
                  <Slider value={[inviteesLimit]} onValueChange={(v) => setInviteesLimit(v[0])} min={1} max={54} step={1} />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleProcessRemissinstanser} disabled={inviteesLoading} className="w-full">
                  {inviteesLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {inviteesDryRun ? 'Preview Extraction' : 'Extract Invitees'}
                </Button>
              </div>
            </div>

            {inviteesResult && (
              <div className="space-y-4 mt-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{inviteesResult.processed}</div>
                    <div className="text-xs text-muted-foreground">Processed</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-green-400">{inviteesResult.invitees_extracted}</div>
                    <div className="text-xs text-muted-foreground">Invitees Extracted</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-yellow-400">{inviteesResult.skipped}</div>
                    <div className="text-xs text-muted-foreground">No Numbered Entries</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-red-400">{inviteesResult.errors.length}</div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>

                {/* Skipped PDFs with diagnostics */}
                {inviteesResult.skipped_details && inviteesResult.skipped_details.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-yellow-400">
                      <FileWarning className="h-4 w-4" />
                      {inviteesResult.skipped_details.length} PDFs with no numbered entries
                      <ChevronDown className="h-4 w-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <ScrollArea className="h-48 border rounded-md p-2">
                        {inviteesResult.skipped_details.map((skip) => (
                          <div key={skip.remiss_id} className="mb-4 p-2 bg-muted/50 rounded">
                            <div className="font-medium text-sm">{skip.title}</div>
                            <div className="text-xs text-muted-foreground">{skip.parse_reason}</div>
                            {skip.sample_lines.length > 0 && (
                              <div className="mt-1 text-xs font-mono bg-background p-1 rounded max-h-20 overflow-auto">
                                {skip.sample_lines.slice(0, 5).map((line, i) => (
                                  <div key={i} className="truncate">{line}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </ScrollArea>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {inviteesResult.details.length > 0 && (
                  <ScrollArea className="h-64 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Remiss</TableHead>
                          <TableHead className="w-24 text-right">Invitees</TableHead>
                          <TableHead>Sample Organizations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inviteesResult.details.map((detail) => (
                          <TableRow key={detail.remiss_id}>
                            <TableCell className="font-medium max-w-xs truncate">{detail.title}</TableCell>
                            <TableCell className="text-right"><Badge variant="outline">{detail.invitees_count}</Badge></TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                              {detail.sample_invitees.slice(0, 3).join(', ')}{detail.sample_invitees.length > 3 && '...'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}

                {inviteesResult.errors.length > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <div className="flex items-center gap-2 text-destructive mb-2">
                      <AlertCircle className="h-4 w-4" /><span className="font-medium">Errors</span>
                    </div>
                    <ul className="text-sm space-y-1">
                      {inviteesResult.errors.map((err, i) => (
                        <li key={i} className="text-muted-foreground">{err.remiss_id}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Bootstrap Tab */}
          <TabsContent value="bootstrap" className="space-y-4 mt-4">
            <div className="p-3 bg-muted/50 rounded-lg mb-4">
              <p className="text-sm text-muted-foreground">
                <Database className="h-4 w-4 inline mr-1" />
                Creates organization entities from parsed remiss invitees using pagination (no 1000-row limit).
              </p>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bootstrap-dry-run">Dry Run</Label>
                  <Switch id="bootstrap-dry-run" checked={bootstrapDryRun} onCheckedChange={setBootstrapDryRun} />
                </div>
                <div className="space-y-2">
                  <Label>Entity Limit: {bootstrapLimit}</Label>
                  <Slider value={[bootstrapLimit]} onValueChange={(v) => setBootstrapLimit(v[0])} min={100} max={5000} step={100} />
                </div>
                <div className="space-y-2">
                  <Label>Min Occurrences: {minOccurrences}</Label>
                  <Slider value={[minOccurrences]} onValueChange={(v) => setMinOccurrences(v[0])} min={1} max={5} step={1} />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleBootstrapEntities} disabled={bootstrapLoading} className="w-full">
                  {bootstrapLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {bootstrapDryRun ? 'Preview Bootstrap' : 'Create Entities'}
                </Button>
              </div>
            </div>

            {bootstrapResult && (
              <div className="space-y-4 mt-4">
                <div className="grid gap-2 md:grid-cols-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{bootstrapResult.invitee_rows_fetched}</div>
                    <div className="text-xs text-muted-foreground">Invitee Rows Fetched</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{bootstrapResult.unique_normalized_names}</div>
                    <div className="text-xs text-muted-foreground">Unique Orgs (normalized)</div>
                  </div>
                  <div className="text-center p-3 bg-green-500/10 rounded-lg">
                    <div className="text-xl font-bold text-green-400">{bootstrapResult.entities_created}</div>
                    <div className="text-xs text-muted-foreground">{bootstrapResult.dry_run ? 'Would Create' : 'Created'}</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                    <div className="text-xl font-bold text-yellow-400">{bootstrapResult.entities_already_exist}</div>
                    <div className="text-xs text-muted-foreground">Already Exist</div>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-lg font-bold text-orange-400">{bootstrapResult.invalid_rejected}</div>
                    <div className="text-xs text-muted-foreground">Invalid Rejected</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-sm">{bootstrapResult.rejected_blocked_phrase} blocked</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-sm">{bootstrapResult.rejected_contact_info} contact</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-sm">{bootstrapResult.rejected_too_long} too long</div>
                  </div>
                </div>

                {bootstrapResult.sample_created.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-green-400">Sample Entities</div>
                    <div className="flex flex-wrap gap-1">
                      {bootstrapResult.sample_created.map((name, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-green-500/10 border-green-500/30">{name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Link Tab */}
          <TabsContent value="linking" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="linking-dry-run">Dry Run</Label>
                  <Switch id="linking-dry-run" checked={linkingDryRun} onCheckedChange={setLinkingDryRun} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="create-entities">Create New Entities</Label>
                  <Switch id="create-entities" checked={createEntities} onCheckedChange={setCreateEntities} disabled={linkingDryRun} />
                </div>
                <div className="space-y-2">
                  <Label>Limit: {linkingLimit} responses</Label>
                  <Slider value={[linkingLimit]} onValueChange={(v) => setLinkingLimit(v[0])} min={10} max={1000} step={10} />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleLinkRemissvar} disabled={linkingLoading} className="w-full">
                  {linkingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Link2 className="mr-2 h-4 w-4" />
                  {linkingDryRun ? 'Preview Matching' : 'Link Entities'}
                </Button>
              </div>
            </div>

            {linkingResult && (
              <div className="space-y-4 mt-4">
                <div className="grid gap-2 md:grid-cols-5">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{linkingResult.processed}</div>
                    <div className="text-xs text-muted-foreground">Processed</div>
                  </div>
                  <div className="text-center p-3 bg-green-500/10 rounded-lg">
                    <div className="text-xl font-bold text-green-400">{linkingResult.linked?.total || linkingResult.high_confidence}</div>
                    <div className="text-xs text-muted-foreground">Linked (High)</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                    <div className="text-xl font-bold text-yellow-400">{linkingResult.not_linked?.medium || linkingResult.medium_confidence}</div>
                    <div className="text-xs text-muted-foreground">Review (Medium)</div>
                  </div>
                  <div className="text-center p-3 bg-orange-500/10 rounded-lg">
                    <div className="text-xl font-bold text-orange-400">{linkingResult.not_linked?.low || linkingResult.low_confidence}</div>
                    <div className="text-xs text-muted-foreground">Review (Low)</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{linkingResult.not_linked?.unmatched || linkingResult.unmatched}</div>
                    <div className="text-xs text-muted-foreground">Unmatched</div>
                  </div>
                </div>

                {linkingResult.review_needed && linkingResult.review_needed.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-yellow-400">
                      Review Needed ({linkingResult.review_needed.length})
                      <ChevronDown className="h-4 w-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ScrollArea className="h-48 border rounded-md mt-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Original</TableHead>
                              <TableHead>Matched To</TableHead>
                              <TableHead>Score</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {linkingResult.review_needed.slice(0, 20).map((m) => (
                              <TableRow key={m.response_id}>
                                <TableCell className="text-sm">{m.normalized_name}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{m.matched_name || '-'}</TableCell>
                                <TableCell><Badge variant="outline">{m.similarity_score?.toFixed(2)}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {linkingResult.unmatched_orgs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Top Unmatched Organizations</div>
                    <div className="flex flex-wrap gap-1">
                      {linkingResult.unmatched_orgs.slice(0, 15).map((org, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{org}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
