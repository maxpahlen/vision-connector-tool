import { SearchResult } from '@/hooks/useSearch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Building2, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SearchResultCardProps {
  result: SearchResult;
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  return (
    <Link to={`/admin/scraper/document/${result.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg font-semibold leading-tight">
              {result.title}
            </CardTitle>
            <Badge variant="outline" className="shrink-0">
              {result.doc_type.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Metadata */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              <span>{result.doc_number}</span>
            </div>
            {result.ministry && (
              <div className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                <span>{result.ministry}</span>
              </div>
            )}
            {result.publication_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{new Date(result.publication_date).toLocaleDateString('sv-SE')}</span>
              </div>
            )}
            {result.stage && (
              <Badge variant="secondary" className="text-xs">
                {result.stage}
              </Badge>
            )}
          </div>

          {/* Highlights */}
          {result.highlights && result.highlights.length > 0 && (
            <div className="space-y-2">
              {result.highlights.map((highlight, idx) => (
                <div
                  key={idx}
                  className="text-sm text-muted-foreground bg-muted/30 p-2 rounded border-l-2 border-primary/50"
                  dangerouslySetInnerHTML={{ __html: highlight }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
