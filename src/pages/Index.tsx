import Header from "@/components/layout/Header";
import { useProcesses } from "@/hooks/useProcesses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Search, FileText, Building2 } from "lucide-react";

const Index = () => {
  const { processes, isLoading } = useProcesses();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="mb-4 text-4xl font-bold">SOU Policy Radar</h1>
          <p className="text-xl text-muted-foreground mb-6">
            Track and analyze Swedish legislative processes in real-time
          </p>
          <Link to="/search">
            <Button size="lg" className="gap-2">
              <Search className="h-4 w-4" />
              Search Documents
            </Button>
          </Link>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold mb-2">Recent Processes</h2>
            <p className="text-muted-foreground">Latest legislative initiatives and investigations</p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {processes.slice(0, 10).map((process) => (
                <Link key={process.id} to={`/process/${process.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg font-semibold leading-tight">
                          {process.title}
                        </CardTitle>
                        <Badge variant="outline">{process.current_stage}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          <span>{process.process_key}</span>
                        </div>
                        {process.ministry && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>{process.ministry}</span>
                          </div>
                        )}
                        {process.document_count !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            {process.document_count} document{process.document_count !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      {process.stage_explanation && (
                        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                          {process.stage_explanation}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
