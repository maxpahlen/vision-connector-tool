import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SearchFilters } from '@/hooks/useSearch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface FilterPanelProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

export function FilterPanel({ filters, onFiltersChange }: FilterPanelProps) {
  const [localFilters, setLocalFilters] = useState<SearchFilters>(filters);

  // Fetch available filter options
  const { data: docTypes = [] } = useQuery({
    queryKey: ['filter-doc-types'],
    queryFn: async () => {
      const { data } = await supabase
        .from('documents')
        .select('doc_type')
        .order('doc_type');
      return [...new Set(data?.map(d => d.doc_type) || [])];
    },
  });

  const { data: ministries = [] } = useQuery({
    queryKey: ['filter-ministries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('documents')
        .select('ministry')
        .not('ministry', 'is', null)
        .order('ministry');
      return [...new Set(data?.map(d => d.ministry!) || [])];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ['filter-stages'],
    queryFn: async () => {
      const { data } = await supabase
        .from('processes')
        .select('current_stage')
        .order('current_stage');
      return [...new Set(data?.map(p => p.current_stage) || [])];
    },
  });

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleCheckboxChange = (
    category: keyof SearchFilters,
    value: string,
    checked: boolean
  ) => {
    setLocalFilters(prev => {
      const current = (prev[category] as string[]) || [];
      const updated = checked
        ? [...current, value]
        : current.filter(v => v !== value);
      return { ...prev, [category]: updated.length > 0 ? updated : undefined };
    });
  };

  const handleDateChange = (field: 'date_from' | 'date_to', value: string) => {
    setLocalFilters(prev => ({
      ...prev,
      [field]: value || undefined,
    }));
  };

  const applyFilters = () => {
    onFiltersChange(localFilters);
  };

  const clearFilters = () => {
    const emptyFilters: SearchFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const hasActiveFilters = Object.values(localFilters).some(v => 
    Array.isArray(v) ? v.length > 0 : !!v
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Filter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Document Type Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Dokumenttyp</Label>
          <div className="space-y-2">
            {docTypes.map(type => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={`doctype-${type}`}
                  checked={localFilters.doc_types?.includes(type)}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange('doc_types', type, checked as boolean)
                  }
                />
                <Label
                  htmlFor={`doctype-${type}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {type.toUpperCase()}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Ministry Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Departement</Label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {ministries.map(ministry => (
              <div key={ministry} className="flex items-center space-x-2">
                <Checkbox
                  id={`ministry-${ministry}`}
                  checked={localFilters.ministries?.includes(ministry)}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange('ministries', ministry, checked as boolean)
                  }
                />
                <Label
                  htmlFor={`ministry-${ministry}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {ministry}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Stage Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Status</Label>
          <div className="space-y-2">
            {stages.map(stage => (
              <div key={stage} className="flex items-center space-x-2">
                <Checkbox
                  id={`stage-${stage}`}
                  checked={localFilters.stages?.includes(stage)}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange('stages', stage, checked as boolean)
                  }
                />
                <Label
                  htmlFor={`stage-${stage}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {stage}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Date Range Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Publiceringsdatum</Label>
          <div className="space-y-2">
            <div>
              <Label htmlFor="date-from" className="text-xs text-muted-foreground">
                Från
              </Label>
              <Input
                id="date-from"
                type="date"
                value={localFilters.date_from || ''}
                onChange={(e) => handleDateChange('date_from', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date-to" className="text-xs text-muted-foreground">
                Till
              </Label>
              <Input
                id="date-to"
                type="date"
                value={localFilters.date_to || ''}
                onChange={(e) => handleDateChange('date_to', e.target.value)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={applyFilters} className="flex-1">
            Tillämpa
          </Button>
          {hasActiveFilters && (
            <Button onClick={clearFilters} variant="outline">
              Rensa
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
