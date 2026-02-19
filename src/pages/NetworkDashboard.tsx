import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pause, Play, Search, RotateCcw } from 'lucide-react';
import { useEntityNetwork, type NetworkNode, type NetworkEdge } from '@/hooks/useEntityNetwork';

interface SimNode extends SimulationNodeDatum, NetworkNode {
  x: number;
  y: number;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
  weight: number;
  invite_count: number;
  response_count: number;
  shared_cases_count: number;
}

const TYPE_COLORS: Record<string, string> = {
  organization: 'hsl(210, 70%, 50%)',
  person: 'hsl(140, 60%, 45%)',
  committee: 'hsl(30, 80%, 55%)',
  government_body: 'hsl(260, 50%, 55%)',
  political_party: 'hsl(0, 65%, 55%)',
};

const TYPE_LABELS: Record<string, string> = {
  organization: 'Organisation',
  person: 'Person',
  committee: 'Kommitté',
  government_body: 'Myndighet',
  political_party: 'Politiskt parti',
};

function getNodeColor(type: string): string {
  return TYPE_COLORS[type] ?? 'hsl(var(--muted-foreground))';
}

function getNodeRadius(degree: number, maxDegree: number): number {
  const min = 4;
  const max = 20;
  if (maxDegree === 0) return min;
  return min + ((degree / maxDegree) * (max - min));
}

export default function NetworkDashboard() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const tickCountRef = useRef(0);

  // Filters
  const [minStrength, setMinStrength] = useState(0.1);
  const [maxNodes, setMaxNodes] = useState(150);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [frozen, setFrozen] = useState(false);

  // Simulation state
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { data, isLoading, error } = useEntityNetwork({
    minStrength,
    maxNodes,
    entityTypes,
  });

  const maxDegree = useMemo(
    () => (data?.nodes ?? []).reduce((m, n) => Math.max(m, n.degree), 0),
    [data]
  );

  // Initialize simulation when data changes
  useEffect(() => {
    if (!data || data.nodes.length === 0) {
      setSimNodes([]);
      setSimLinks([]);
      return;
    }

    const width = 800;
    const height = 600;

    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = data.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight,
        invite_count: e.invite_count,
        response_count: e.response_count,
        shared_cases_count: e.shared_cases_count,
      }));

    // Stop existing simulation
    if (simRef.current) {
      simRef.current.stop();
    }

    tickCountRef.current = 0;

    const sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => 100 / (1 + d.weight * 2))
          .strength((d) => d.weight)
      )
      .force('charge', forceManyBody().strength(-80))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimNode>().radius((d) => getNodeRadius(d.degree, maxDegree) + 2))
      .on('tick', () => {
        tickCountRef.current++;
        // Throttle: update React state every 3 ticks
        if (tickCountRef.current % 3 === 0) {
          setSimNodes([...nodes]);
          setSimLinks([...links]);
        }
      });

    simRef.current = sim;
    setFrozen(false);

    return () => {
      sim.stop();
    };
  }, [data, maxDegree]);

  // Handle freeze/unfreeze
  useEffect(() => {
    if (!simRef.current) return;
    if (frozen) {
      simRef.current.stop();
    } else {
      simRef.current.alpha(0.3).restart();
    }
  }, [frozen]);

  const highlightedId = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const lower = searchTerm.toLowerCase();
    const match = simNodes.find((n) => n.name.toLowerCase().includes(lower));
    return match?.id ?? null;
  }, [searchTerm, simNodes]);

  const toggleEntityType = useCallback((type: string) => {
    setEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const resetFilters = useCallback(() => {
    setMinStrength(0.1);
    setMaxNodes(150);
    setEntityTypes([]);
    setSearchTerm('');
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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters sidebar */}
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
                    onChange={(e) => setSearchTerm(e.target.value)}
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
                  onValueChange={([v]) => setMinStrength(v)}
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
                  onValueChange={([v]) => setMaxNodes(v)}
                  min={20}
                  max={200}
                  step={10}
                />
              </div>

              {/* Entity types */}
              <div className="space-y-2">
                <Label className="text-sm">Entitetstyper</Label>
                {Object.entries(TYPE_LABELS).map(([type, label]) => (
                  <div key={type} className="flex items-center gap-2">
                    <Checkbox
                      id={`type-${type}`}
                      checked={entityTypes.length === 0 || entityTypes.includes(type)}
                      onCheckedChange={() => toggleEntityType(type)}
                    />
                    <label htmlFor={`type-${type}`} className="text-sm flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: getNodeColor(type) }}
                      />
                      {label}
                    </label>
                  </div>
                ))}
              </div>

              {/* Controls */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFrozen(!frozen)}
                  className="flex-1"
                >
                  {frozen ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                  {frozen ? 'Starta' : 'Frys'}
                </Button>
                <Button variant="outline" size="sm" onClick={resetFilters}>
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

          {/* Graph */}
          <Card className="lg:col-span-3">
            <CardContent className="p-0 relative">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <div className="p-8 text-center text-destructive">
                  Fel: {error instanceof Error ? error.message : String(error)}
                </div>
              )}

              {!isLoading && data?.nodes.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  Inga samförekomster hittades. Kör "Compute Co-Occurrence" på admin-sidan först.
                </div>
              )}

              <svg
                ref={svgRef}
                viewBox="0 0 800 600"
                className="w-full h-[600px]"
                style={{ cursor: 'grab' }}
              >
                {/* Edges */}
                {simLinks.map((link, i) => {
                  const s = link.source as SimNode;
                  const t = link.target as SimNode;
                  return (
                    <line
                      key={i}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke="hsl(var(--border))"
                      strokeWidth={Math.max(0.5, link.weight * 4)}
                      strokeOpacity={0.4 + link.weight * 0.4}
                    />
                  );
                })}

                {/* Nodes */}
                {simNodes.map((node) => {
                  const r = getNodeRadius(node.degree, maxDegree);
                  const isHighlighted = highlightedId === node.id;
                  const isHovered = hoveredNode?.id === node.id;

                  return (
                    <g key={node.id}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isHighlighted ? r + 4 : r}
                        fill={getNodeColor(node.entity_type)}
                        fillOpacity={isHighlighted || isHovered ? 1 : 0.8}
                        stroke={isHighlighted ? 'hsl(var(--primary))' : isHovered ? 'hsl(var(--foreground))' : 'none'}
                        strokeWidth={isHighlighted ? 3 : isHovered ? 2 : 0}
                        className="cursor-pointer transition-opacity"
                        onClick={() => navigate(`/entity/${node.id}`)}
                        onMouseEnter={(e) => {
                          setHoveredNode(node);
                          const svg = svgRef.current;
                          if (svg) {
                            const rect = svg.getBoundingClientRect();
                            const scaleX = rect.width / 800;
                            const scaleY = rect.height / 600;
                            setTooltipPos({
                              x: rect.left + node.x * scaleX,
                              y: rect.top + node.y * scaleY - r * scaleY - 8,
                            });
                          }
                        }}
                        onMouseLeave={() => setHoveredNode(null)}
                      />
                      {/* Label for large nodes */}
                      {r >= 10 && (
                        <text
                          x={node.x}
                          y={node.y + r + 12}
                          textAnchor="middle"
                          fontSize="8"
                          fill="hsl(var(--foreground))"
                          className="pointer-events-none select-none"
                          opacity={0.7}
                        >
                          {node.name.length > 20
                            ? node.name.slice(0, 18) + '…'
                            : node.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip */}
              {hoveredNode && (
                <div
                  className="fixed z-50 bg-popover text-popover-foreground border rounded-md shadow-md px-3 py-2 pointer-events-none"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <p className="font-medium text-sm">{hoveredNode.name}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{TYPE_LABELS[hoveredNode.entity_type] ?? hoveredNode.entity_type}</span>
                    <span>·</span>
                    <span>{hoveredNode.degree} kopplingar</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
