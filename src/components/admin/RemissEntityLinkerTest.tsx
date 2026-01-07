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
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Link2, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

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
  }>;
  message?: string;
}

interface LinkRemissvarResult {
  processed: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  unmatched: number;
  entities_created: number;
  errors: Array<{ response_id: string; error: string }>;
  low_confidence_matches: Array<{
    response_id: string;
    original_name: string;
    normalized_name: string;
    matched_name: string | null;
    similarity_score: number | null;
  }>;
  unmatched_orgs: string[];
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
  const [linkingLimit, setLinkingLimit] = useState(50);

  const handleProcessRemissinstanser = async () => {
    setInviteesLoading(true);
    setInviteesResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('process-remissinstanser', {
        body: {
          limit: inviteesLimit,
          dry_run: inviteesDryRun
        }
      });

      if (error) throw error;
      setInviteesResult(data);
    } catch (err) {
      console.error('Error processing remissinstanser:', err);
      setInviteesResult({
        processed: 0,
        invitees_extracted: 0,
        skipped: 0,
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
        body: {
          limit: linkingLimit,
          create_entities: createEntities,
          dry_run: linkingDryRun
        }
      });

      if (error) throw error;
      setLinkingResult(data);
    } catch (err) {
      console.error('Error linking remissvar:', err);
      setLinkingResult({
        processed: 0,
        high_confidence: 0,
        medium_confidence: 0,
        low_confidence: 0,
        unmatched: 0,
        entities_created: 0,
        errors: [{ response_id: 'N/A', error: err instanceof Error ? err.message : String(err) }],
        low_confidence_matches: [],
        unmatched_orgs: []
      });
    } finally {
      setLinkingLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Medium</Badge>;
      case 'low':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Low</Badge>;
      default:
        return <Badge variant="outline">Unmatched</Badge>;
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invitees">1. Parse Remissinstanser</TabsTrigger>
            <TabsTrigger value="linking">2. Link Entities</TabsTrigger>
          </TabsList>

          {/* Remissinstanser Tab */}
          <TabsContent value="invitees" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="invitees-dry-run">Dry Run (no database writes)</Label>
                  <Switch 
                    id="invitees-dry-run"
                    checked={inviteesDryRun} 
                    onCheckedChange={setInviteesDryRun} 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Limit: {inviteesLimit} remisser</Label>
                  <Slider
                    value={[inviteesLimit]}
                    onValueChange={(v) => setInviteesLimit(v[0])}
                    min={1}
                    max={54}
                    step={1}
                  />
                </div>
              </div>
              
              <div className="flex items-end">
                <Button 
                  onClick={handleProcessRemissinstanser} 
                  disabled={inviteesLoading}
                  className="w-full"
                >
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
                    <div className="text-2xl font-bold">{inviteesResult.skipped}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-red-400">{inviteesResult.errors.length}</div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>

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
                            <TableCell className="font-medium max-w-xs truncate">
                              {detail.title}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline">{detail.invitees_count}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                              {detail.sample_invitees.slice(0, 3).join(', ')}
                              {detail.sample_invitees.length > 3 && '...'}
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
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Errors</span>
                    </div>
                    <ul className="text-sm space-y-1">
                      {inviteesResult.errors.map((err, i) => (
                        <li key={i} className="text-muted-foreground">
                          {err.remiss_id}: {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Entity Linking Tab */}
          <TabsContent value="linking" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="linking-dry-run">Dry Run (no database writes)</Label>
                  <Switch 
                    id="linking-dry-run"
                    checked={linkingDryRun} 
                    onCheckedChange={setLinkingDryRun} 
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="create-entities">Create New Entities</Label>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <Switch 
                    id="create-entities"
                    checked={createEntities} 
                    onCheckedChange={setCreateEntities}
                    disabled={linkingDryRun}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Limit: {linkingLimit} responses</Label>
                  <Slider
                    value={[linkingLimit]}
                    onValueChange={(v) => setLinkingLimit(v[0])}
                    min={10}
                    max={500}
                    step={10}
                  />
                </div>
              </div>
              
              <div className="flex items-end">
                <Button 
                  onClick={handleLinkRemissvar} 
                  disabled={linkingLoading}
                  className="w-full"
                >
                  {linkingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Link2 className="mr-2 h-4 w-4" />
                  {linkingDryRun ? 'Preview Matching' : 'Link Entities'}
                </Button>
              </div>
            </div>

            {linkingResult && (
              <div className="space-y-4 mt-4">
                <div className="grid gap-2 md:grid-cols-6">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{linkingResult.processed}</div>
                    <div className="text-xs text-muted-foreground">Processed</div>
                  </div>
                  <div className="text-center p-3 bg-green-500/10 rounded-lg">
                    <div className="text-xl font-bold text-green-400">{linkingResult.high_confidence}</div>
                    <div className="text-xs text-muted-foreground">High</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                    <div className="text-xl font-bold text-yellow-400">{linkingResult.medium_confidence}</div>
                    <div className="text-xs text-muted-foreground">Medium</div>
                  </div>
                  <div className="text-center p-3 bg-orange-500/10 rounded-lg">
                    <div className="text-xl font-bold text-orange-400">{linkingResult.low_confidence}</div>
                    <div className="text-xs text-muted-foreground">Low</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{linkingResult.unmatched}</div>
                    <div className="text-xs text-muted-foreground">Unmatched</div>
                  </div>
                  <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                    <div className="text-xl font-bold text-blue-400">{linkingResult.entities_created}</div>
                    <div className="text-xs text-muted-foreground">Created</div>
                  </div>
                </div>

                {/* Low confidence matches for review */}
                {linkingResult.low_confidence_matches.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <HelpCircle className="h-4 w-4 text-orange-400" />
                      Low Confidence Matches (Review Recommended)
                    </div>
                    <ScrollArea className="h-48 border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Original Name</TableHead>
                            <TableHead>Matched To</TableHead>
                            <TableHead className="w-24">Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {linkingResult.low_confidence_matches.slice(0, 20).map((match) => (
                            <TableRow key={match.response_id}>
                              <TableCell className="text-sm">{match.normalized_name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {match.matched_name || '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {match.similarity_score?.toFixed(2) || '-'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}

                {/* Unmatched organizations */}
                {linkingResult.unmatched_orgs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Top Unmatched Organizations</div>
                    <div className="flex flex-wrap gap-1">
                      {linkingResult.unmatched_orgs.slice(0, 15).map((org, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {org}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {linkingResult.errors.length > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <div className="flex items-center gap-2 text-destructive mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Errors ({linkingResult.errors.length})</span>
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
