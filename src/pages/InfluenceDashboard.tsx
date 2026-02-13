import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useStakeholderInfluence, type AggregatedInfluence } from "@/hooks/useStakeholderInfluence";
import {
  RefreshCw, Search, ArrowLeft, ArrowUpDown, TrendingUp,
  Users, FileText, Target, BarChart3, Info
} from "lucide-react";

type SortKey = "composite_score" | "remissvar_frequency" | "invitation_rate" | "stance_consistency" | "cross_case_breadth" | "total_submissions";

const SORT_LABELS: Record<SortKey, string> = {
  composite_score: "Sammansatt poäng",
  remissvar_frequency: "Remissvar",
  invitation_rate: "Inbjudningar",
  stance_consistency: "Konsekvens",
  cross_case_breadth: "Bredd",
  total_submissions: "Antal svar",
};

const ScoreBar = ({ score, max = 100 }: { score: number; max?: number }) => (
  <div className="flex items-center gap-2 min-w-[120px]">
    <Progress value={Math.min((score / max) * 100, 100)} className="h-2 flex-1" />
    <span className="text-xs text-muted-foreground w-10 text-right">{score.toFixed(0)}</span>
  </div>
);

const InfluenceDashboard = () => {
  const navigate = useNavigate();
  const { data, isLoading, refetch, isRefetching } = useStakeholderInfluence();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("composite_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<AggregatedInfluence | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortableHeader = ({ label, sortField, tooltip }: { label: string; sortField: SortKey; tooltip?: string }) => (
    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort(sortField)}>
      <span className="flex items-center justify-end gap-1">
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent><p>{tooltip}</p></TooltipContent>
          </Tooltip>
        )}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortField ? "text-foreground" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((org) => org.entity_name.toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? diff : -diff;
    });
    return result;
  }, [data, searchQuery, sortKey, sortAsc]);

  const summaryStats = useMemo(() => {
    if (!data || data.length === 0) return null;
    const totalOrgs = data.length;
    const avgComposite = data.reduce((s, o) => s + o.composite_score, 0) / totalOrgs;
    const totalSubmissions = data.reduce((s, o) => s + o.total_submissions, 0);
    const maxCases = Math.max(...data.map((o) => o.case_count));
    return { totalOrgs, avgComposite, totalSubmissions, maxCases };
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="text-muted-foreground hover:text-foreground mb-2 -ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Tillbaka
              </Button>
              <h1 className="text-3xl font-bold">Påverkansanalys</h1>
              <p className="text-muted-foreground mt-1">
                Mät hur organisationer påverkar lagstiftningsprocessen
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Uppdatera
            </Button>
          </div>

          {/* Summary Cards */}
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
              ))}
            </div>
          ) : summaryStats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Organisationer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{summaryStats.totalOrgs}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    Totalt remissvar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{summaryStats.totalSubmissions.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Snittpoäng
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{summaryStats.avgComposite.toFixed(1)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Target className="h-4 w-4" />
                    Max ärenden
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{summaryStats.maxCases}</div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Main Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Påverkansrankning
                  </CardTitle>
                  <CardDescription>
                    Klicka på en organisation för detaljerad analys. Sortera genom att klicka på kolumnrubrikerna.
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sök organisation..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filtered.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Organisation</TableHead>
                        <SortableHeader label="Poäng" sortField="composite_score" tooltip="Sammansatt poäng (35% frekvens, 25% inbjudningar, 15% konsekvens, 25% bredd)" />
                        <SortableHeader label="Antal svar" sortField="total_submissions" />
                        <SortableHeader label="Frekvens" sortField="remissvar_frequency" tooltip="Normaliserad poäng baserad på antal inlämnade remissvar" />
                        <SortableHeader label="Inbjudan" sortField="invitation_rate" tooltip="Normaliserad poäng baserad på antal inbjudningar till remisser" />
                        <SortableHeader label="Konsekvens" sortField="stance_consistency" tooltip="Hur konsekvent organisationen tar ställning (% dominerande hållning)" />
                        <SortableHeader label="Bredd" sortField="cross_case_breadth" tooltip="Hur många olika remissprocesser organisationen deltar i" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((org, index) => (
                        <TableRow
                          key={org.entity_id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedOrg(org)}
                        >
                          <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                          <TableCell>
                            <span className="font-medium">{org.entity_name}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={org.composite_score >= 50 ? "default" : org.composite_score >= 20 ? "secondary" : "outline"}>
                              {org.composite_score.toFixed(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{org.total_submissions}</TableCell>
                          <TableCell><ScoreBar score={org.remissvar_frequency} /></TableCell>
                          <TableCell><ScoreBar score={org.invitation_rate} /></TableCell>
                          <TableCell><ScoreBar score={org.stance_consistency} /></TableCell>
                          <TableCell><ScoreBar score={org.cross_case_breadth} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? "Inga organisationer matchar sökningen" : "Ingen påverkansdata tillgänglig. Kör beräkningen först."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Organization Detail Modal */}
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        {selectedOrg && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl">{selectedOrg.entity_name}</DialogTitle>
              <DialogDescription>Detaljerad påverkansanalys</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Composite Score */}
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Sammansatt poäng</p>
                <p className="text-4xl font-bold">{selectedOrg.composite_score.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-1">av 100</p>
              </div>

              {/* Individual Scores */}
              <div className="space-y-4">
                <ScoreRow
                  label="Remissvarfrekvens"
                  score={selectedOrg.remissvar_frequency}
                  detail={`${selectedOrg.total_submissions} inlämnade svar`}
                  weight="35%"
                />
                <ScoreRow
                  label="Inbjudningsfrekvens"
                  score={selectedOrg.invitation_rate}
                  detail={`Normaliserat mot mest inbjudna organisation`}
                  weight="25%"
                />
                <ScoreRow
                  label="Hållningskonsekvens"
                  score={selectedOrg.stance_consistency}
                  detail={formatStanceEvidence(selectedOrg.evidence?.stance_consistency)}
                  weight="15%"
                />
                <ScoreRow
                  label="Ärendebredd"
                  score={selectedOrg.cross_case_breadth}
                  detail={`${selectedOrg.case_count} unika remissprocesser`}
                  weight="25%"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/entity/${selectedOrg.entity_id}`}>
                    Visa entitetsdetaljer
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};

const ScoreRow = ({ label, score, detail, weight }: { label: string; score: number; detail: string; weight: string }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">vikt: {weight}</span>
    </div>
    <Progress value={Math.min(score, 100)} className="h-3 mb-1" />
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{detail}</span>
      <span className="text-sm font-medium">{score.toFixed(1)}</span>
    </div>
  </div>
);

function formatStanceEvidence(evidence: Record<string, unknown> | undefined): string {
  if (!evidence) return "Ingen hållningsdata";
  const dist = evidence.stance_distribution as Record<string, number> | undefined;
  if (!dist || Object.keys(dist).length === 0) return "Ingen hållningsdata";
  return Object.entries(dist)
    .map(([stance, count]) => `${stance}: ${count}`)
    .join(", ");
}

export default InfluenceDashboard;
