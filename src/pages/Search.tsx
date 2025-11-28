import { useState } from 'react';
import { useSearch, SearchFilters } from '@/hooks/useSearch';
import { SearchBar } from '@/components/search/SearchBar';
import { FilterPanel } from '@/components/search/FilterPanel';
import { SearchResults } from '@/components/search/SearchResults';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Header from '@/components/layout/Header';

export default function Search() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data, isLoading } = useSearch({
    query,
    filters,
    page,
    perPage,
    enabled: query.trim().length > 0,
  });

  const results = data?.results || [];
  const pagination = data?.pagination;
  const isEmpty = !isLoading && results.length === 0 && query.trim().length > 0;

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1); // Reset to first page on new search
  };

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page on filter change
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Sök dokument</h1>
          <p className="text-muted-foreground">
            Sök bland {pagination?.total || 0} dokument i databasen
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <SearchBar onSearch={handleSearch} initialQuery={query} />
        </div>

        {/* Results Count */}
        {query && pagination && (
          <div className="mb-4 text-sm text-muted-foreground">
            Visar {results.length} av {pagination.total} resultat
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filter Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-4">
              <FilterPanel filters={filters} onFiltersChange={handleFiltersChange} />
            </div>
          </aside>

          {/* Results */}
          <div className="lg:col-span-3 space-y-6">
            <SearchResults
              results={results}
              isLoading={isLoading}
              isEmpty={isEmpty}
              query={query}
            />

            {/* Pagination */}
            {pagination && pagination.total_pages > 1 && (
              <Card>
                <CardContent className="pt-6">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => handlePageChange(Math.max(1, page - 1))}
                          className={
                            page === 1
                              ? 'pointer-events-none opacity-50'
                              : 'cursor-pointer'
                          }
                        />
                      </PaginationItem>

                      {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                        let pageNum: number;
                        if (pagination.total_pages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= pagination.total_pages - 2) {
                          pageNum = pagination.total_pages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }

                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => handlePageChange(pageNum)}
                              isActive={page === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            handlePageChange(Math.min(pagination.total_pages, page + 1))
                          }
                          className={
                            page === pagination.total_pages
                              ? 'pointer-events-none opacity-50'
                              : 'cursor-pointer'
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
