import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { FlaskConical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function StateMachineTest() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleTest = async () => {
    setLoading(true);
    toast.info('Testing process stage machine...');

    try {
      const { data, error } = await supabase.functions.invoke('test-stage-machine');

      if (error) throw error;

      setResults(data);
      const { summary } = data;
      
      if (summary.mismatches === 0) {
        toast.success(`All ${summary.total_processes} processes match computed stages!`);
      } else {
        toast.warning(`Found ${summary.mismatches} mismatches out of ${summary.total_processes} processes`);
      }
    } catch (error: any) {
      toast.error(`Test failed: ${error.message}`);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Process Stage Machine Test</CardTitle>
        <CardDescription>
          Validate stage computation logic against existing process data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleTest} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4 mr-2" />
          )}
          Test State Machine
        </Button>

        {results && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{results.summary.total_processes}</div>
                <div className="text-xs text-muted-foreground">Total Processes</div>
              </div>
              <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/20">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {results.summary.matches}
                </div>
                <div className="text-xs text-muted-foreground">Matches</div>
              </div>
              <div className="rounded-lg border p-3 bg-yellow-50 dark:bg-yellow-950/20">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {results.summary.mismatches}
                </div>
                <div className="text-xs text-muted-foreground">Mismatches</div>
              </div>
              <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/20">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {results.summary.invalid_transitions}
                </div>
                <div className="text-xs text-muted-foreground">Invalid</div>
              </div>
            </div>

            {results.results.length > 0 && (
              <div className="rounded-lg border">
                <div className="p-3 bg-muted font-medium text-sm border-b">
                  Test Results {results.summary.mismatches > 0 && '(Mismatches shown first)'}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {results.results.map((result: any) => (
                    <div
                      key={result.process_id}
                      className={`p-3 border-b last:border-b-0 ${
                        !result.matches ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{result.title}</div>
                          <div className="text-xs text-muted-foreground">{result.process_key}</div>
                        </div>
                        <div className="flex gap-2 items-center shrink-0">
                          <span className="text-xs px-2 py-1 rounded bg-muted whitespace-nowrap">
                            {result.current_stage}
                          </span>
                          {!result.matches && (
                            <>
                              <span className="text-xs">→</span>
                              <span className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground whitespace-nowrap">
                                {result.computed_stage}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {!result.matches && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {result.computed_explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
