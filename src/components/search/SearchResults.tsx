import { SearchResult } from '@/hooks/useSearch';
import { SearchResultCard } from './SearchResultCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, SearchX } from 'lucide-react';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  isEmpty: boolean;
  query: string;
}

export function SearchResults({ results, isLoading, isEmpty, query }: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!query) {
    return (
      <Alert>
        <SearchX className="h-4 w-4" />
        <AlertDescription>
          Ange en sökterm för att börja söka i dokument.
        </AlertDescription>
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <Alert>
        <SearchX className="h-4 w-4" />
        <AlertDescription>
          Inga resultat hittades för "{query}". Prova en annan sökterm eller justera filtren.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {results.map(result => (
        <SearchResultCard key={result.id} result={result} />
      ))}
    </div>
  );
}
