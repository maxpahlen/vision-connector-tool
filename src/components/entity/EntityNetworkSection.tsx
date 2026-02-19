import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Share2, Building2, User, Users, ExternalLink } from 'lucide-react';
import { useEntityNeighbors, type EntityNeighbor } from '@/hooks/useEntityNeighbors';
import { useMemo, useEffect, useRef, useState } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import { getNodeColor, TYPE_LABELS } from '@/components/network/network-constants';

/* ---------- Mini graph types ---------- */

interface MiniNode extends SimulationNodeDatum {
  id: string;
  name: string;
  entity_type: string;
  jaccard: number;
  isCentral: boolean;
  x: number;
  y: number;
}

interface MiniLink {
  source: MiniNode;
  target: MiniNode;
  weight: number;
}

const ICON_MAP: Record<string, typeof Building2> = {
  organization: Building2,
  person: User,
  committee: Users,
  government_body: Building2,
};

const W = 320;
const H = 240;

/* ---------- Mini Network Graph ---------- */

function MiniNetworkGraph({ entityId, entityName, entityType, neighbors }: {
  entityId: string;
  entityName: string;
  entityType: string;
  neighbors: EntityNeighbor[];
}) {
  const [nodes, setNodes] = useState<MiniNode[]>([]);
  const [links, setLinks] = useState<MiniLink[]>([]);
  const simRef = useRef<ReturnType<typeof forceSimulation<MiniNode>> | null>(null);

  useEffect(() => {
    const centerNode: MiniNode = {
      id: entityId,
      name: entityName,
      entity_type: entityType,
      jaccard: 1,
      isCentral: true,
      x: W / 2,
      y: H / 2,
    };

    const top = neighbors.slice(0, 8); // cap mini graph at 8 neighbors
    const neighborNodes: MiniNode[] = top.map((n, i) => {
      const angle = (2 * Math.PI * i) / top.length;
      return {
        id: n.id,
        name: n.name,
        entity_type: n.entity_type,
        jaccard: n.jaccard_score,
        isCentral: false,
        x: W / 2 + Math.cos(angle) * 80,
        y: H / 2 + Math.sin(angle) * 80,
      };
    });

    const allNodes = [centerNode, ...neighborNodes];
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    const allLinks: MiniLink[] = top.map(n => ({
      source: nodeMap.get(entityId)!,
      target: nodeMap.get(n.id)!,
      weight: n.jaccard_score,
    }));

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<MiniNode>(allNodes)
      .force('link', forceLink<MiniNode, MiniLink>(allLinks).id(d => d.id).distance(70).strength(0.5))
      .force('charge', forceManyBody().strength(-60))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide<MiniNode>().radius(d => d.isCentral ? 16 : 10))
      .on('tick', () => {
        setNodes([...allNodes]);
        setLinks([...allLinks]);
      });

    simRef.current = sim;

    // Let it settle then stop
    setTimeout(() => sim.stop(), 2000);

    return () => { sim.stop(); };
  }, [entityId, entityName, entityType, neighbors]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px]">
      {/* Edges */}
      {links.map((link, i) => (
        <line
          key={i}
          x1={link.source.x}
          y1={link.source.y}
          x2={link.target.x}
          y2={link.target.y}
          stroke="hsl(var(--border))"
          strokeWidth={Math.max(0.5, link.weight * 4)}
          strokeOpacity={0.4 + link.weight * 0.4}
        />
      ))}
      {/* Nodes */}
      {nodes.map(node => {
        const r = node.isCentral ? 12 : 6 + node.jaccard * 6;
        return (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              fill={getNodeColor(node.entity_type)}
              fillOpacity={node.isCentral ? 1 : 0.8}
              stroke={node.isCentral ? 'hsl(var(--foreground))' : 'none'}
              strokeWidth={node.isCentral ? 2 : 0}
            />
            {(node.isCentral || r >= 9) && (
              <text
                x={node.x}
                y={node.y + r + 10}
                textAnchor="middle"
                fontSize="7"
                fill="hsl(var(--foreground))"
                opacity={0.7}
                className="select-none"
              >
                {node.name.length > 16 ? node.name.slice(0, 14) + '…' : node.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Main Section ---------- */

interface EntityNetworkSectionProps {
  entityId: string;
  entityName: string;
  entityType: string;
}

export default function EntityNetworkSection({ entityId, entityName, entityType }: EntityNetworkSectionProps) {
  const { data: neighbors, isLoading } = useEntityNeighbors(entityId, 10);

  const hasNeighbors = neighbors && neighbors.length > 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Samförekomster ({neighbors?.length ?? 0})
            </CardTitle>
            <CardDescription>
              Organisationer som ofta förekommer i samma remissprocesser (baserat på Jaccard-likhet)
            </CardDescription>
          </div>
          {hasNeighbors && (
            <Link to={`/insights/network?entity_id=${entityId}`}>
              <Button variant="outline" size="sm" className="gap-1">
                <ExternalLink className="h-3.5 w-3.5" />
                Visa i nätverket
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : hasNeighbors ? (
          <div className="space-y-4">
            {/* Mini network graph */}
            <div className="border rounded-lg bg-muted/30 overflow-hidden">
              <MiniNetworkGraph
                entityId={entityId}
                entityName={entityName}
                entityType={entityType}
                neighbors={neighbors}
              />
            </div>

            {/* Neighbor list */}
            <div className="space-y-2">
              {neighbors.map(n => {
                const Icon = ICON_MAP[n.entity_type] ?? Building2;
                const typeLabel = TYPE_LABELS[n.entity_type] ?? n.entity_type;
                return (
                  <Link
                    key={n.id}
                    to={`/entity/${n.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.name}</p>
                      <p className="text-xs text-muted-foreground">{typeLabel}</p>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <p className="text-xs font-medium">{n.shared_cases_count} ärenden</p>
                      <p className="text-xs text-muted-foreground">
                        J={n.jaccard_score.toFixed(2)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Inga samförekomster registrerade. Data finns främst för organisationer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
