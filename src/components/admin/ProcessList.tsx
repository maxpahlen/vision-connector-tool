import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProcesses } from '@/hooks/useProcesses';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export function ProcessList() {
  const { processes, isLoading } = useProcesses();

  const getStageBadge = (stage: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      published: 'outline',
      writing: 'secondary',
      completed: 'default',
    };
    return <Badge variant={variants[stage] || 'outline'}>{stage}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Process List</CardTitle>
        <CardDescription>All inquiry processes tracked in the system</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process Key</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Ministry</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : processes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No processes found
                  </TableCell>
                </TableRow>
              ) : (
                processes.map((process) => (
                  <TableRow key={process.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-mono text-xs">
                      {process.process_key}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {process.title}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {process.ministry || 'Unknown'}
                    </TableCell>
                    <TableCell>{getStageBadge(process.current_stage)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{process.document_count}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(process.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
