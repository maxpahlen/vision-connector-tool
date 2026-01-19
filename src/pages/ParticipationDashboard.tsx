import Header from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useParticipationMetrics } from "@/hooks/useParticipationMetrics";
import { Link } from "react-router-dom";
import { RefreshCw, Users, FileText, TrendingUp, AlertCircle } from "lucide-react";

const ParticipationDashboard = () => {
  const { data, isLoading, refetch, isRefetching } = useParticipationMetrics(100);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">Organization Participation</h1>
              <p className="text-muted-foreground mt-1">
                Track how organizations engage with remiss consultations
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
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
                    Total Responses
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
                    Total Invitations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{data.total_invites.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Overall Response Rate
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
                    Active Organizations
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
              <CardTitle>Top Organizations by Response Volume</CardTitle>
              <CardDescription>
                Organizations ranked by number of remissvar submitted
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : data?.organizations.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead className="text-right">Responses</TableHead>
                      <TableHead className="text-right">Invitations</TableHead>
                      <TableHead className="text-right">Response Rate</TableHead>
                      <TableHead className="text-right">Uninvited</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.organizations.map((org, index) => (
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
