import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDocuments } from '@/hooks/useDocuments';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Clock, XCircle, FileText, ExternalLink, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DocumentList() {
  const {
    documents,
    isLoading,
    docTypeFilter,
    setDocTypeFilter,
    extractionStatusFilter,
    setExtractionStatusFilter,
  } = useDocuments();

  const getExtractionStatus = (doc: any) => {
    if (doc.raw_content && doc.raw_content.length > 1000) {
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
        label: 'Extracted',
        variant: 'default' as const,
      };
    } else if (doc.metadata?.pdf_status === 'found') {
      return {
        icon: <Clock className="h-4 w-4 text-yellow-600" />,
        label: 'Pending',
        variant: 'outline' as const,
      };
    } else {
      return {
        icon: <XCircle className="h-4 w-4 text-red-600" />,
        label: 'No PDF',
        variant: 'destructive' as const,
      };
    }
  };

  const formatTextLength = (length: number | null) => {
    if (!length) return '-';
    if (length < 1000) return `${length} chars`;
    if (length < 1000000) return `${(length / 1000).toFixed(1)}k chars`;
    return `${(length / 1000000).toFixed(2)}M chars`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document List</CardTitle>
        <CardDescription>All documents with extraction status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3">
          <Select value={docTypeFilter || 'all'} onValueChange={(v) => setDocTypeFilter(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="sou">SOU</SelectItem>
              <SelectItem value="directive">Directive</SelectItem>
              <SelectItem value="ds">Ds</SelectItem>
            </SelectContent>
          </Select>

          <Select value={extractionStatusFilter || 'all'} onValueChange={(v) => setExtractionStatusFilter(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="extracted">Extracted</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>PDF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Text Length</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No documents found
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc) => {
                  const status = getExtractionStatus(doc);
                  return (
                    <TableRow key={doc.id} className="group">
                      <TableCell className="font-mono text-xs">
                        {doc.doc_number}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.doc_type.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {doc.title}
                      </TableCell>
                      <TableCell>
                        {doc.pdf_url ? (
                          <a
                            href={doc.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FileText className="h-3 w-3" />
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {status.icon}
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTextLength(doc.raw_content?.length || null)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Link to={`/admin/scraper/document/${doc.id}`}>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
