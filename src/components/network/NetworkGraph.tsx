import { useState, useEffect, useRef, useCallback, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { getNodeColor, getNodeRadius, TYPE_LABELS } from './network-constants';
import type { NetworkNode, NetworkEdge, NetworkData } from '@/hooks/useEntityNetwork';

/* ---------- Types ---------- */

export interface SimNode extends SimulationNodeDatum, NetworkNode {
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
  weight: number;
  invite_count: number;
  response_count: number;
  shared_cases_count: number;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

const DRAG_THRESHOLD = 4; // px – distinguishes click from drag
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const SVG_W = 800;
const SVG_H = 600;

/* ---------- Component ---------- */

interface NetworkGraphProps {
  data: NetworkData | undefined;
  isLoading: boolean;
  error: unknown;
  frozen: boolean;
  searchTerm: string;
  onFrozenChange: (frozen: boolean) => void;
  /** Called externally to reset the view transform */
  resetViewRef: React.MutableRefObject<(() => void) | null>;
}

export default function NetworkGraph({
  data,
  isLoading,
  error,
  frozen,
  searchTerm,
  onFrozenChange,
  resetViewRef,
}: NetworkGraphProps) {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const tickCountRef = useRef(0);

  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Pan / zoom transform
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });

  // Expose reset-view to parent
  useEffect(() => {
    resetViewRef.current = () => setTransform({ x: 0, y: 0, k: 1 });
  }, [resetViewRef]);

  // Drag / pan state (refs to avoid stale closures)
  const dragTarget = useRef<SimNode | null>(null);
  const isPanning = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const startTransform = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const dragDistance = useRef(0);

  const maxDegree = useMemo(
    () => (data?.nodes ?? []).reduce((m, n) => Math.max(m, n.degree), 0),
    [data]
  );

  /* ---------- Simulation lifecycle ---------- */

  useEffect(() => {
    if (!data || data.nodes.length === 0) {
      setSimNodes([]);
      setSimLinks([]);
      return;
    }

    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: SVG_W / 2 + (Math.random() - 0.5) * 200,
      y: SVG_H / 2 + (Math.random() - 0.5) * 200,
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

    if (simRef.current) simRef.current.stop();
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
      .force('center', forceCenter(SVG_W / 2, SVG_H / 2))
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) => getNodeRadius(d.degree, maxDegree) + 2)
      )
      .on('tick', () => {
        tickCountRef.current++;
        if (tickCountRef.current % 3 === 0) {
          setSimNodes([...nodes]);
          setSimLinks([...links]);
        }
      });

    simRef.current = sim;
    onFrozenChange(false);

    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, maxDegree]);

  /* ---------- Freeze / unfreeze ---------- */

  useEffect(() => {
    if (!simRef.current) return;
    if (frozen) {
      simRef.current.stop();
    } else {
      simRef.current.alpha(0.3).restart();
    }
  }, [frozen]);

  /* ---------- Search highlight ---------- */

  const highlightedId = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const lower = searchTerm.toLowerCase();
    const match = simNodes.find((n) => n.name.toLowerCase().includes(lower));
    return match?.id ?? null;
  }, [searchTerm, simNodes]);

  /* ---------- SVG coordinate helpers ---------- */

  const clientToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scaleX = SVG_W / rect.width;
      const scaleY = SVG_H / rect.height;
      const svgX = (clientX - rect.left) * scaleX;
      const svgY = (clientY - rect.top) * scaleY;
      // Invert transform
      return {
        x: (svgX - transform.x) / transform.k,
        y: (svgY - transform.y) / transform.k,
      };
    },
    [transform]
  );

  const findNodeAt = useCallback(
    (clientX: number, clientY: number): SimNode | null => {
      const pt = clientToSvg(clientX, clientY);
      for (let i = simNodes.length - 1; i >= 0; i--) {
        const n = simNodes[i];
        const r = getNodeRadius(n.degree, maxDegree);
        const dx = pt.x - n.x;
        const dy = pt.y - n.y;
        if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return n;
      }
      return null;
    },
    [simNodes, maxDegree, clientToSvg]
  );

  /* ---------- Pointer handlers (drag + pan) ---------- */

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointerStart.current = { x: e.clientX, y: e.clientY };
      startTransform.current = { ...transform };
      dragDistance.current = 0;

      const node = findNodeAt(e.clientX, e.clientY);
      if (node) {
        dragTarget.current = node;
        node.fx = node.x;
        node.fy = node.y;
        if (simRef.current && !frozen) {
          simRef.current.alphaTarget(0.3).restart();
        }
      } else {
        isPanning.current = true;
      }
    },
    [transform, findNodeAt, frozen]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      dragDistance.current = Math.max(dragDistance.current, Math.abs(dx) + Math.abs(dy));

      if (dragTarget.current) {
        const pt = clientToSvg(e.clientX, e.clientY);
        dragTarget.current.fx = pt.x;
        dragTarget.current.fy = pt.y;
        // Force re-render
        setSimNodes((prev) => [...prev]);
      } else if (isPanning.current) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = SVG_W / rect.width;
        const scaleY = SVG_H / rect.height;
        setTransform({
          x: startTransform.current.x + dx * scaleX,
          y: startTransform.current.y + dy * scaleY,
          k: startTransform.current.k,
        });
      }
    },
    [clientToSvg]
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const wasDrag = dragDistance.current > DRAG_THRESHOLD;

      if (dragTarget.current) {
        if (!frozen) {
          dragTarget.current.fx = null;
          dragTarget.current.fy = null;
        }
        if (!wasDrag) {
          // Click – navigate
          navigate(`/entity/${dragTarget.current.id}`);
        }
        if (simRef.current) simRef.current.alphaTarget(0);
        dragTarget.current = null;
      }

      isPanning.current = false;
    },
    [frozen, navigate]
  );

  /* ---------- Wheel zoom ---------- */

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const scaleX = SVG_W / rect.width;
      const scaleY = SVG_H / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.k * factor));
      const ratio = newK / transform.k;

      setTransform({
        k: newK,
        x: mouseX - (mouseX - transform.x) * ratio,
        y: mouseY - (mouseY - transform.y) * ratio,
      });
    },
    [transform]
  );

  /* ---------- Tooltip position ---------- */

  const updateTooltip = useCallback(
    (node: SimNode) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const r = getNodeRadius(node.degree, maxDegree);
      // Transform node coords to screen coords
      const screenX = rect.left + ((node.x * transform.k + transform.x) / SVG_W) * rect.width;
      const screenY =
        rect.top + (((node.y - r) * transform.k + transform.y) / SVG_H) * rect.height - 8;
      setTooltipPos({ x: screenX, y: screenY });
    },
    [transform, maxDegree]
  );

  /* ---------- Render ---------- */

  const noData = !isLoading && data?.nodes.length === 0;
  const filterEmpty =
    !isLoading &&
    data &&
    data.nodes.length === 0 &&
    Object.values(data.type_counts ?? {}).some((c) => c > 0);

  return (
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

        {filterEmpty && (
          <div className="p-8 text-center text-muted-foreground">
            Inga samförekomster hittades för de valda entitetstyperna. Prova att ändra filtren.
          </div>
        )}

        {noData && !filterEmpty && (
          <div className="p-8 text-center text-muted-foreground">
            Inga samförekomster hittades. Kör "Compute Co-Occurrence" på admin-sidan först.
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-[600px]"
          style={{ cursor: isPanning.current ? 'grabbing' : 'grab', touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Edges */}
            {simLinks.map((link, i) => {
              const s = link.source;
              const t = link.target;
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
                    stroke={
                      isHighlighted
                        ? 'hsl(var(--primary))'
                        : isHovered
                          ? 'hsl(var(--foreground))'
                          : 'none'
                    }
                    strokeWidth={isHighlighted ? 3 : isHovered ? 2 : 0}
                    className="pointer-events-none"
                    /* Pointer events handled at SVG level for drag/click priority */
                  />
                  {/* Invisible larger hit target for hover tooltip */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r + 6}
                    fill="transparent"
                    className="pointer-events-auto"
                    onMouseEnter={() => {
                      setHoveredNode(node);
                      updateTooltip(node);
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
                      {node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
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
  );
}
