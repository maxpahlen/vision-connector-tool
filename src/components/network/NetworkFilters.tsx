import { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pause, Play, Search, RotateCcw, Maximize } from 'lucide-react';
import { TYPE_LABELS, getNodeColor } from './network-constants';
import type { NetworkData } from '@/hooks/useEntityNetwork';

interface NetworkFiltersProps {
  minStrength: number;
  maxNodes: number;
  entityTypes: string[];
  searchTerm: string;
  frozen: boolean;
  data: NetworkData | undefined;
  onMinStrengthChange: (v: number) => void;
  onMaxNodesChange: (v: number) => void;
  onEntityTypesChange: (types: string[]) => void;
  onSearchTermChange: (term: string) => void;
  onFrozenChange: (frozen: boolean) => void;
  onResetFilters: () => void;
  onResetView: () => void;
}

export default function NetworkFilters({
  minStrength,
  maxNodes,
  entityTypes,
  searchTerm,
  frozen,
  data,
  onMinStrengthChange,
  onMaxNodesChange,
  onEntityTypesChange,
  onSearchTermChange,
  onFrozenChange,
  onResetFilters,
  onResetView,
}: NetworkFiltersProps) {
  const toggleEntityType = useCallback(
    (type: string) => {
      onEntityTypesChange(
        entityTypes.includes(type)
          ? entityTypes.filter((t) => t !== type)
          : [...entityTypes, type]
      );
    },
    [entityTypes, onEntityTypesChange]
  );

  const typeCounts = data?.type_counts ?? {};

  return (
    <Card className="lg:col-span-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Filter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Search */}
        <div className="space-y-2">
          <Label className="text-sm">Sök entitet</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Sök namn..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Min strength */}
        <div className="space-y-2">
          <Label className="text-sm">
            Min. styrka: {minStrength.toFixed(2)}
          </Label>
          <Slider
            value={[minStrength]}
            onValueChange={([v]) => onMinStrengthChange(v)}
            min={0}
            max={1}
            step={0.05}
          />
        </div>

        {/* Max nodes */}
        <div className="space-y-2">
          <Label className="text-sm">Max noder: {maxNodes}</Label>
          <Slider
            value={[maxNodes]}
            onValueChange={([v]) => onMaxNodesChange(v)}
            min={20}
            max={200}
            step={10}
          />
        </div>

        {/* Entity types */}
        <div className="space-y-2">
          <Label className="text-sm">Entitetstyper</Label>
          {Object.entries(TYPE_LABELS).map(([type, label]) => {
            const count = typeCounts[type] ?? 0;
            const hasData = count > 0;

            return (
              <div key={type} className="flex items-center gap-2">
                <Checkbox
                  id={`type-${type}`}
                  checked={
                    hasData && (entityTypes.length === 0 || entityTypes.includes(type))
                  }
                  onCheckedChange={() => hasData && toggleEntityType(type)}
                  disabled={!hasData}
                />
                <label
                  htmlFor={`type-${type}`}
                  className={`text-sm flex items-center gap-2 ${!hasData ? 'opacity-40' : ''}`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: getNodeColor(type) }}
                  />
                  {label}
                  <span className="text-xs text-muted-foreground">
                    {hasData ? `(${count})` : '(ingen data)'}
                  </span>
                </label>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onFrozenChange(!frozen)}
            className="flex-1"
          >
            {frozen ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
            {frozen ? 'Starta' : 'Frys'}
          </Button>
          <Button variant="outline" size="sm" onClick={onResetView} title="Återställ vy">
            <Maximize className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onResetFilters} title="Återställ filter">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats */}
        {data && (
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p>Noder: {data.nodes.length}</p>
            <p>Kanter: {data.edges.length}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
