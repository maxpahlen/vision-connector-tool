import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Clock, Building2, TrendingUp, Info, Calendar, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import { useVelocityMetrics } from "@/hooks/useVelocityMetrics";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Cell 
} from "recharts";

const VelocityDashboard = () => {
  const navigate = useNavigate();
  const { data, isLoading, refetch, isRefetching } = useVelocityMetrics();
  const [searchQuery, setSearchQuery] = useState("");
  const [showChart, setShowChart] = useState(true);

  // Filter processes by search query
  const filteredProcesses = useMemo(() => {
    if (!data?.processes) return [];
    if (!searchQuery.trim()) return data.processes;

    const query = searchQuery.toLowerCase();
    return data.processes.filter(
      (p) =>
        p.process_title.toLowerCase().includes(query) ||
        p.ministry.toLowerCase().includes(query)
    );
  }, [data?.processes, searchQuery]);

  // Format days to readable duration
  const formatDuration = (days: number): string => {
    if (days < 30) return `${days} dagar`;
    if (days < 365) {
      const months = Math.round(days / 30);
      return `${months} mån`;
    }
    const years = Math.floor(days / 365);
    const remainingMonths = Math.round((days % 365) / 30);
    if (remainingMonths === 0) return `${years} år`;
    return `${years} år ${remainingMonths} mån`;
  };

  // Chart data for ministry comparison
  const chartData = useMemo(() => {
    if (!data?.ministry_stats) return [];
    return data.ministry_stats
      .filter((m) => m.process_count >= 1)
      .slice(0, 10)
      .map((m) => ({
        name: m.ministry.length > 25 ? m.ministry.substring(0, 22) + "..." : m.ministry,
        fullName: m.ministry,
        avg: m.avg_days,
        count: m.process_count,
      }));
  }, [data?.ministry_stats]);

  // Color scale for bar chart
  const getBarColor = (days: number): string => {
    if (days < 200) return "hsl(var(--chart-1))";
    if (days < 400) return "hsl(var(--chart-2))";
    if (days < 600) return "hsl(var(--chart-3))";
    return "hsl(var(--chart-4))";
  };

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
              <h1 className="text-3xl font-bold">Remissperioder</h1>
              <p className="text-muted-foreground mt-1">
                Tid från direktiv utfärdat till remissdeadline per departement
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
                    <BarChart3 className="h-4 w-4" />
                    Antal processer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{data.total_processes}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Genomsnitt</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>Genomsnittlig tid från direktiv utfärdat till remissdeadline</span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{formatDuration(data.overall_avg_days)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Snabbast
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{formatDuration(data.overall_min_days)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Längst
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{formatDuration(data.overall_max_days)}</div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Ministry Comparison Chart */}
          {!isLoading && data && chartData.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Genomsnitt per departement</CardTitle>
                    <CardDescription>
                      Tid från direktiv till remissdeadline (dagar)
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChart(!showChart)}
                  >
                    {showChart ? "Dölj diagram" : "Visa diagram"}
                  </Button>
                </div>
              </CardHeader>
              {showChart && (
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={180}
                          tick={{ fontSize: 12 }}
                        />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                                  <p className="font-medium text-sm">{data.fullName}</p>
                                  <p className="text-muted-foreground text-sm">
                                    Genomsnitt: {formatDuration(data.avg)}
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    Antal processer: {data.count}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.avg)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Ministry Stats Table */}
          {isLoading ? (
            <Card className="mb-8">
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : data && data.ministry_stats.length > 0 ? (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Statistik per departement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Departement</TableHead>
                      <TableHead className="text-right">Processer</TableHead>
                      <TableHead className="text-right">Genomsnitt</TableHead>
                      <TableHead className="text-right">Median</TableHead>
                      <TableHead className="text-right">Snabbast</TableHead>
                      <TableHead className="text-right">Längst</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.ministry_stats.map((ministry) => (
                      <TableRow key={ministry.ministry}>
                        <TableCell className="font-medium">{ministry.ministry}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{ministry.process_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatDuration(ministry.avg_days)}</TableCell>
                        <TableCell className="text-right">{formatDuration(ministry.median_days)}</TableCell>
                        <TableCell className="text-right text-primary">{formatDuration(ministry.min_days)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatDuration(ministry.max_days)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {/* Individual Processes Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Alla processer ({filteredProcesses.length})
                </CardTitle>
                <div className="w-full md:w-80">
                  <Input
                    type="text"
                    placeholder="Sök process eller departement..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredProcesses.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Process</TableHead>
                      <TableHead>Departement</TableHead>
                      <TableHead className="text-right">Direktiv</TableHead>
                      <TableHead className="text-right">Remissdeadline</TableHead>
                      <TableHead className="text-right">Varaktighet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProcesses.map((process) => (
                      <TableRow key={process.process_id}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/process/${process.process_id}`}
                            className="text-primary hover:underline line-clamp-2"
                          >
                            {process.process_title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {process.ministry}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {new Date(process.directive_date).toLocaleDateString("sv-SE")}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {new Date(process.remiss_deadline).toLocaleDateString("sv-SE")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={process.days_to_remiss < 200 ? "default" : process.days_to_remiss < 400 ? "secondary" : "outline"}
                          >
                            {formatDuration(process.days_to_remiss)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Ingen processdata tillgänglig
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default VelocityDashboard;
