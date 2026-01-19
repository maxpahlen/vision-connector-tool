import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useParticipationMetrics } from "@/hooks/useParticipationMetrics";
import { Link } from "react-router-dom";
import { RefreshCw, Users, FileText, TrendingUp, AlertCircle, Search, Info, ArrowLeft } from "lucide-react";

const ParticipationDashboard = () => {
  const navigate = useNavigate();
  const { data, isLoading, refetch, isRefetching } = useParticipationMetrics(100);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter organizations by search query
  const filteredOrganizations = useMemo(() => {
    if (!data?.organizations) return [];
    if (!searchQuery.trim()) return data.organizations;
    
    const query = searchQuery.toLowerCase();
    return data.organizations.filter(org => 
      org.entity_name.toLowerCase().includes(query)
    );
  }, [data?.organizations, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
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
              <h1 className="text-3xl font-bold">Organisation Deltagande</h1>
              <p className="text-muted-foreground mt-1">
                Följ hur organisationer engagerar sig i remisser
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
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    Totalt antal svar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{data.total_responses.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Totalt antal inbjudningar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{data.total_invites.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Svarsfrekvens
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Svarsfrekvens = Svar / Inbjudningar × 100%</p>
                      </TooltipContent>
                    </Tooltip>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{data.overall_response_rate}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Aktiva organisationer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{data.total_entities.toLocaleString()}</div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Organizations Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Organisationer efter svarsvolym</CardTitle>
                  <CardDescription>
                    Organisationer rangordnade efter antal remissvar
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
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredOrganizations.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Organisation</TableHead>
                      <TableHead className="text-right">Svar</TableHead>
                      <TableHead className="text-right">Inbjudningar</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-1">
                          Svarsfrekvens
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Svarsfrekvens = Svar / Inbjudningar × 100%</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-1">
                          Oinbjudna
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Svar på remisser där organisationen inte stod på inbjudningslistan</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrganizations.map((org, index) => (
                      <TableRow key={org.entity_id}>
                        <TableCell className="font-medium text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/entity/${org.entity_id}`}
                            className="font-medium hover:underline"
                          >
                            {org.entity_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{org.response_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {org.invite_count}
                        </TableCell>
                        <TableCell className="text-right">
                          {org.response_rate !== null ? (
                            <Badge
                              variant={org.response_rate >= 80 ? "default" : org.response_rate >= 50 ? "secondary" : "outline"}
                            >
                              {org.response_rate}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {org.uninvited_responses > 0 ? (
                            <span className="flex items-center justify-end gap-1 text-amber-600">
                              <AlertCircle className="h-3 w-3" />
                              {org.uninvited_responses}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No participation data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ParticipationDashboard;
