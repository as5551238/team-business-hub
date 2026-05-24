import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal } from '@/types';

const STATUS_COLORS: Record<string, string> = { todo: '#94a3b8', in_progress: '#3b82f6', done: '#22c55e', blocked: '#f59e0b', cancelled: '#ef4444' };

interface TreeNode {
  goal: Goal;
  children: TreeNode[];
  x: number;
  y: number;
}

export function OKRAlignmentView() {
  const { state } = useStore();

  const tree = useMemo(() => {
    const goals = state.goals;
    const roots = goals.filter(g => !g.parentId);
    const map = new Map<string, TreeNode>();
    function build(g: Goal, visited = new Set<string>()): TreeNode {
      if (visited.has(g.id)) return { goal: g, children: [], x: 0, y: 0 }; // cycle detection
      visited.add(g.id);
      const children = goals.filter(c => c.parentId === g.id).map(c => build(c, new Set(visited)));
      const node: TreeNode = { goal: g, children, x: 0, y: 0 };
      map.set(g.id, node);
      return node;
    }
    return roots.map(r => build(r));
  }, [state.goals]);

  // Layout: assign x,y positions
  const layoutNodes = useMemo(() => {
    const nodes: { id: string; title: string; status: string; progress: number; leaderId: string; x: number; y: number; width: number; height: number }[] = [];
    const edges: { fromX: number; fromY: number; toX: number; toY: number }[] = [];

    const NODE_W = 180;
    const NODE_H = 60;
    const H_GAP = 30;
    const V_GAP = 80;
    const LEADER_MEMBER = (id: string) => state.members.find(m => m.id === id)?.name ?? '';

    function calcWidth(node: TreeNode): number {
      if (node.children.length === 0) return NODE_W;
      const childWidths = node.children.map(calcWidth);
      return childWidths.reduce((a, b) => a + b, 0) + (node.children.length - 1) * H_GAP;
    }

    function layout(node: TreeNode, x: number, y: number) {
      const w = calcWidth(node);
      nodes.push({ id: node.goal.id, title: node.goal.title, status: node.goal.status, progress: node.goal.progress, leaderId: node.goal.leaderId, x: x + w / 2, y, width: NODE_W, height: NODE_H });

      let childX = x;
      for (const child of node.children) {
        const cw = calcWidth(child);
        layout(child, childX, y + NODE_H + V_GAP);
        edges.push({ fromX: x + w / 2, fromY: y + NODE_H, toX: childX + cw / 2, toY: y + NODE_H + V_GAP });
        childX += cw + H_GAP;
      }
    }

    let startX = 40;
    for (const root of tree) {
      layout(root, startX, 40);
      startX += calcWidth(root) + H_GAP * 2;
    }
    return { nodes, edges };
  }, [tree, state.members]);

  if (state.goals.length === 0) {
    return <div className="p-8 text-center text-muted-foreground text-sm">暂无目标数据</div>;
  }

  const maxX = Math.max(...layoutNodes.nodes.map(n => n.x + n.width), 400);
  const maxY = Math.max(...layoutNodes.nodes.map(n => n.y + n.height), 300);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">OKR 对齐视图</h3>
      <p className="text-xs text-muted-foreground">展示目标之间的层级对齐关系，连接线表示父子关系</p>
      <div className="border border-border rounded-lg bg-white overflow-auto" style={{ maxHeight: 500 }}>
        <svg width={maxX + 80} height={maxY + 40} className="min-w-full">
          {layoutNodes.edges.map((edge, i) => (
            <line key={i} x1={edge.fromX} y1={edge.fromY} x2={edge.toX} y2={edge.toY} stroke="#cbd5e1" strokeWidth={1.5} />
          ))}
          {layoutNodes.nodes.map(node => {
            const memberName = state.members.find(m => m.id === node.leaderId)?.name ?? '';
            return (
              <g key={node.id}>
                <rect x={node.x - node.width / 2} y={node.y} width={node.width} height={node.height} rx={8} fill="white" stroke={STATUS_COLORS[node.status] ?? '#94a3b8'} strokeWidth={2} />
                <text x={node.x} y={node.y + 20} textAnchor="middle" fontSize={11} fontWeight={600} fill="#1e293b">{node.title.length > 14 ? node.title.substring(0, 14) + '...' : node.title}</text>
                <text x={node.x} y={node.y + 36} textAnchor="middle" fontSize={10} fill="#64748b">{memberName} · {node.progress}%</text>
                <circle cx={node.x - node.width / 2 + 10} cy={node.y + 10} r={4} fill={STATUS_COLORS[node.status]} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
