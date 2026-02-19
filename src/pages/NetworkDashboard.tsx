import { useState, useRef, useCallback } from 'react';
import Header from '@/components/layout/Header';
import NetworkHelpSection from '@/components/network/NetworkHelpSection';
import NetworkFilters from '@/components/network/NetworkFilters';
import NetworkGraph from '@/components/network/NetworkGraph';
import { useEntityNetwork } from '@/hooks/useEntityNetwork';

export default function NetworkDashboard() {
  const [minStrength, setMinStrength] = useState(0.1);
  const [maxNodes, setMaxNodes] = useState(150);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [frozen, setFrozen] = useState(false);

  const resetViewRef = useRef<(() => void) | null>(null);

  const { data, isLoading, error } = useEntityNetwork({
    minStrength,
    maxNodes,
    entityTypes,
  });

  const resetFilters = useCallback(() => {
    setMinStrength(0.1);
    setMaxNodes(150);
    setEntityTypes([]);
    setSearchTerm('');
  }, []);

  const resetView = useCallback(() => {
    resetViewRef.current?.();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Entitetsnätverk</h1>
          <p className="text-muted-foreground mt-1">
            Samförekomst av organisationer i remissprocesser
          </p>
        </div>

        <NetworkHelpSection />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <NetworkFilters
            minStrength={minStrength}
            maxNodes={maxNodes}
            entityTypes={entityTypes}
            searchTerm={searchTerm}
            frozen={frozen}
            data={data}
            onMinStrengthChange={setMinStrength}
            onMaxNodesChange={setMaxNodes}
            onEntityTypesChange={setEntityTypes}
            onSearchTermChange={setSearchTerm}
            onFrozenChange={setFrozen}
            onResetFilters={resetFilters}
            onResetView={resetView}
          />

          <NetworkGraph
            data={data}
            isLoading={isLoading}
            error={error}
            frozen={frozen}
            searchTerm={searchTerm}
            onFrozenChange={setFrozen}
            resetViewRef={resetViewRef}
          />
        </div>
      </div>
    </div>
  );
}
