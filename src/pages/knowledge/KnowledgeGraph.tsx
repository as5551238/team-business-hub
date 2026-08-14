/**
 * Phase3-P1: 知识网络图谱
 * 纯 SVG + 轻量力导向布局，零外部依赖
 * 支持：节点点击→详情、类型过滤、孤立节点红色、枢纽节点放大
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Target, FolderKanban, CheckSquare, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { Knowledge, Goal, Project, Task, ItemLink, ItemType } from '@/types';

interface GraphNode {
  id: string;
  type: ItemType;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

const TYPE_COLORS: Record<ItemType, string> = {
  knowledge: '#6366f1',  // indigo
  goal: '#f59e0b',       // amber
  project: '#10b981',    // emerald
  task: '#3b82f6',        // blue
};

const TYPE_LABELS: Record<ItemType, string> = {
  knowledge: '知识',
  goal: '目标',
  project: '项目',
  task: '任务',
};

const TYPE_ICONS: Record<ItemType, typeof BookOpen> = {
  knowledge: BookOpen,
  goal: Target,
  project: FolderKanban,
  task: CheckSquare,
};

interface Props {
  knowledge: Knowledge[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  itemLinks: ItemLink[];
  onSelectNode: (id: string, type: ItemType) => void;
}

const WIDTH = 800;
const HEIGHT = 500;
const REPULSION = 3000;
const SPRING_LENGTH = 100;
const SPRING_STRENGTH = 0.05;
const CENTER_FORCE = 0.01;
const DAMPING = 0.85;
const MAX_VELOCITY = 10;

export default function KnowledgeGraph({
  knowledge, goals, projects, tasks, itemLinks, onSelectNode,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [tick, setTick] = useState(0);
  const [enabledTypes, setEnabledTypes] = useState<Set<ItemType>>(
    new Set(['knowledge', 'goal', 'project', 'task'])
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);

  // Build graph data from props
  const { allItems, linkMap } = useMemo(() => {
    const items: Record<string, { type: ItemType; label: string }> = {};
    knowledge.forEach(k => {
      items[k.id] = { type: 'knowledge', label: k.title };
      // Also add related items references
      k.relatedItems?.forEach(ri => {
        if (!items[ri.itemId]) {
          const label = findItemLabel(ri.itemId, goals, projects, tasks, knowledge);
          items[ri.itemId] = { type: ri.itemType, label };
        }
      });
    });
    goals.forEach(g => { if (!items[g.id]) items[g.id] = { type: 'goal', label: g.title }; });
    projects.forEach(p => { if (!items[p.id]) items[p.id] = { type: 'project', label: p.title }; });
    tasks.forEach(t => { if (!items[t.id]) items[t.id] = { type: 'task', label: t.title }; });

    // Build edges from itemLinks
    const links: GraphEdge[] = [];
    itemLinks.forEach(il => {
      if (items[il.sourceId] && items[il.targetId]) {
        links.push({ source: il.sourceId, target: il.targetId, label: il.label });
      }
    });
    // Also build edges from knowledge.relatedItems
    knowledge.forEach(k => {
      k.relatedItems?.forEach(ri => {
        if (items[ri.itemId]) {
          links.push({ source: k.id, target: ri.itemId });
        }
      });
    });

    return { allItems: items, linkMap: links };
  }, [knowledge, goals, projects, tasks, itemLinks]);

  // Initialize/update nodes when data or filters change
  useEffect(() => {
    const degreeMap: Record<string, number> = {};
    linkMap.forEach(e => {
      degreeMap[e.source] = (degreeMap[e.source] || 0) + 1;
      degreeMap[e.target] = (degreeMap[e.target] || 0) + 1;
    });

    const newNodes: GraphNode[] = Object.entries(allItems)
      .filter(([, info]) => enabledTypes.has(info.type))
      .map(([id, info], i) => {
        const angle = (i / Object.keys(allItems).length) * Math.PI * 2;
        const radius = 150;
        const existing = nodesRef.current.find(n => n.id === id);
        return {
          id,
          type: info.type,
          label: info.label,
          x: existing?.x ?? (WIDTH / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50),
          y: existing?.y ?? (HEIGHT / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50),
          vx: 0,
          vy: 0,
          degree: degreeMap[id] || 0,
          fx: null,
          fy: null,
        };
      });

    // Filter edges to only include nodes that are visible
    const visibleIds = new Set(newNodes.map(n => n.id));
    const newEdges = linkMap.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

    nodesRef.current = newNodes;
    setNodes(newNodes);
    setEdges(newEdges);
    setTick(t => t + 1);
  }, [allItems, linkMap, enabledTypes]);

  // Force simulation loop
  useEffect(() => {
    if (nodes.length === 0) return;

    let frame = 0;
    const simulate = () => {
      const ns = nodesRef.current;
      if (ns.length === 0) { animationRef.current = requestAnimationFrame(simulate); return; }

      // Apply repulsion between all nodes
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const distSq = Math.max(dx * dx + dy * dy, 1);
          const force = REPULSION / distSq;
          const dist = Math.sqrt(distSq);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (ns[i].fx === null || ns[i].fx === undefined) {
            ns[i].vx -= fx;
            ns[i].vy -= fy;
          }
          if (ns[j].fx === null || ns[j].fx === undefined) {
            ns[j].vx += fx;
            ns[j].vy += fy;
          }
        }
      }

      // Apply spring force along edges
      const nodeMap: Record<string, GraphNode> = {};
      ns.forEach(n => { nodeMap[n.id] = n; });
      edges.forEach(e => {
        const s = nodeMap[e.source];
        const t = nodeMap[e.target];
        if (!s || !t) return;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = SPRING_STRENGTH * (dist - SPRING_LENGTH);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (s.fx === null || s.fx === undefined) { s.vx += fx; s.vy += fy; }
        if (t.fx === null || t.fx === undefined) { t.vx -= fx; t.vy -= fy; }
      });

      // Apply center force and update positions
      ns.forEach(n => {
        if (n.fx !== null && n.fx !== undefined) {
          n.x = n.fx; n.vx = 0;
        } else {
          n.vx += (WIDTH / 2 - n.x) * CENTER_FORCE;
          n.vx *= DAMPING;
          n.vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, n.vx));
          n.x += n.vx;
        }
        if (n.fy !== null && n.fy !== undefined) {
          n.y = n.fy; n.vy = 0;
        } else {
          n.vy += (HEIGHT / 2 - n.y) * CENTER_FORCE;
          n.vy *= DAMPING;
          n.vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, n.vy));
          n.y += n.vy;
        }
      });

      frame++;
      if (frame % 2 === 0) setTick(t => t + 1);  // Update every 2 frames for performance
      animationRef.current = requestAnimationFrame(simulate);
    };

    animationRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [nodes.length, edges]);

  // Stop simulation after stabilization (run once on mount)
  useEffect(() => {
    const timeout = setTimeout(() => {
      cancelAnimationFrame(animationRef.current);
    }, 5000);  // Stop after 5 seconds
    return () => clearTimeout(timeout);
  }, []);

  // Drag handlers
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggingNode(nodeId);
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      const svg = svgRef.current;
      if (svg) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const transformed = pt.matrixTransform(ctm.inverse());
          node.fx = transformed.x;
          node.fy = transformed.y;
        }
      }
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingNode) {
      const node = nodesRef.current.find(n => n.id === draggingNode);
      if (node && svgRef.current) {
        const pt = svgRef.current.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svgRef.current.getScreenCTM();
        if (ctm) {
          const transformed = pt.matrixTransform(ctm.inverse());
          node.fx = transformed.x;
          node.fy = transformed.y;
        }
      }
    } else if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    }
  }, [draggingNode, isPanning]);

  const handleMouseUp = useCallback(() => {
    if (draggingNode) {
      const node = nodesRef.current.find(n => n.id === draggingNode);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      setDraggingNode(null);
    }
    setIsPanning(false);
  }, [draggingNode]);

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start panning if clicking on background (not a node)
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  const toggleType = (type: ItemType) => {
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // tick is used to trigger re-render; reference it to avoid unused warning
  void tick;

  const nodeRadius = (n: GraphNode) => {
    if (n.degree === 0) return 8;
    return Math.min(8 + n.degree * 3, 24);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-3 px-1">
        {(Object.keys(TYPE_LABELS) as ItemType[]).map(type => {
          const Icon = TYPE_ICONS[type];
          const active = enabledTypes.has(type);
          const count = Object.values(allItems).filter(i => i.type === type).length;
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? 'border-transparent text-white'
                  : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
              }`}
              style={active ? { backgroundColor: TYPE_COLORS[type] } : {}}
            >
              <Icon size={12} />
              {TYPE_LABELS[type]}
              <span className="opacity-70">({count})</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-1.5 rounded-lg border border-border hover:bg-muted/50" title="放大">
          <ZoomIn size={14} />
        </button>
        <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))} className="p-1.5 rounded-lg border border-border hover:bg-muted/50" title="缩小">
          <ZoomOut size={14} />
        </button>
        <button onClick={resetView} className="p-1.5 rounded-lg border border-border hover:bg-muted/50" title="重置视图">
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            暂无数据，请先创建知识条目并建立关联
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            onMouseDown={handleBackgroundMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ cursor: isPanning ? 'grabbing' : 'default' }}
          >
            <rect width={WIDTH} height={HEIGHT} fill="transparent" />
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {edges.map((e) => {
                const s = nodes.find(n => n.id === e.source);
                const t = nodes.find(n => n.id === e.target);
                if (!s || !t) return null;
                return (
                  <line
                    key={`${e.source}-${e.target}`}
                    x1={s.x} y1={s.y}
                    x2={t.x} y2={t.y}
                    stroke="rgba(148, 163, 184, 0.4)"
                    strokeWidth={1}
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map(n => {
                const r = nodeRadius(n);
                const isIsolated = n.degree === 0;
                const color = isIsolated ? '#ef4444' : TYPE_COLORS[n.type];
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    style={{ cursor: 'pointer' }}
                    onMouseDown={(e) => handleNodeMouseDown(e, n.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!draggingNode) onSelectNode(n.id, n.type);
                    }}
                  >
                    <circle
                      r={r}
                      fill={color}
                      fillOpacity={0.15}
                      stroke={color}
                      strokeWidth={2}
                    />
                    <circle r={3} fill={color} />
                    <text
                      y={r + 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill="currentColor"
                      className="fill-slate-700 dark:fill-slate-200"
                    >
                      {n.label.length > 12 ? n.label.substring(0, 12) + '…' : n.label}
                    </text>
                    {n.degree > 2 && (
                      <text
                        y={-r - 6}
                        textAnchor="middle"
                        fontSize={8}
                        className="fill-slate-400"
                      >
                        {n.degree}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 px-1 text-xs text-muted-foreground">
        {(Object.keys(TYPE_LABELS) as ItemType[]).map(type => (
          <span key={type} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] }} />
            {TYPE_LABELS[type]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          孤立节点
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-full border-2 border-slate-400" />
          大小=关联数
        </span>
      </div>
    </div>
  );
}

function findItemLabel(
  id: string,
  goals: Goal[],
  projects: Project[],
  tasks: Task[],
  knowledge: Knowledge[],
): string {
  const g = goals.find(g => g.id === id);
  if (g) return g.title;
  const p = projects.find(p => p.id === id);
  if (p) return p.title;
  const t = tasks.find(t => t.id === id);
  if (t) return t.title;
  const k = knowledge.find(k => k.id === id);
  if (k) return k.title;
  return id.substring(0, 8);
}
