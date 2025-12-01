import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Building2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { useEntityAutocomplete } from '@/hooks/useEntityAutocomplete';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
}

const ENTITY_TYPE_ICONS = {
  person: User,
  ministry: Building2,
  committee: Users,
  organization: Building2,
} as const;

const ENTITY_TYPE_LABELS = {
  person: 'Person',
  ministry: 'Departement',
  committee: 'Kommitté',
  organization: 'Organisation',
} as const;

export function SearchBar({ onSearch, initialQuery = '' }: SearchBarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Debounce query for autocomplete
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Fetch entity suggestions
  const { data: autocompleteData, isLoading } = useEntityAutocomplete({
    query: debouncedQuery,
    enabled: debouncedQuery.length >= 2 && showAutocomplete,
  });

  const suggestions = autocompleteData?.results || [];

  // Show autocomplete when there are suggestions and input is focused
  useEffect(() => {
    if (suggestions.length > 0 && debouncedQuery.length >= 2) {
      setShowAutocomplete(true);
    }
  }, [suggestions, debouncedQuery]);

  // Hide autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setShowAutocomplete(false);
    }
  };

  const handleSelectEntity = (entityId: string, entityName: string) => {
    setQuery(entityName);
    setShowAutocomplete(false);
    navigate(`/entity/${entityId}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value.length >= 2) {
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full relative">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Sök efter SOU, direktiv, proposition eller person..."
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.length >= 2 && suggestions.length > 0) {
              setShowAutocomplete(true);
            }
          }}
          className="pl-10"
          autoComplete="off"
        />
        
        {/* Autocomplete dropdown */}
        {showAutocomplete && suggestions.length > 0 && (
          <div
            ref={autocompleteRef}
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border rounded-md shadow-md"
          >
            <Command>
              <CommandList>
                {isLoading ? (
                  <CommandEmpty>Söker...</CommandEmpty>
                ) : (
                  <CommandGroup heading="Entiteter">
                    {suggestions.map((entity) => {
                      const Icon = ENTITY_TYPE_ICONS[entity.entity_type as keyof typeof ENTITY_TYPE_ICONS] || User;
                      const typeLabel = ENTITY_TYPE_LABELS[entity.entity_type as keyof typeof ENTITY_TYPE_LABELS] || entity.entity_type;

                      return (
                        <CommandItem
                          key={entity.id}
                          onSelect={() => handleSelectEntity(entity.id, entity.name)}
                          className="cursor-pointer"
                        >
                          <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{entity.name}</div>
                              {entity.role && (
                                <div className="text-xs text-muted-foreground truncate">{entity.role}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="secondary" className="text-xs">
                                {typeLabel}
                              </Badge>
                              {entity.document_count > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {entity.document_count} dok
                                </span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </div>
        )}
      </div>
      <Button type="submit" disabled={!query.trim()}>
        Sök
      </Button>
    </form>
  );
}
