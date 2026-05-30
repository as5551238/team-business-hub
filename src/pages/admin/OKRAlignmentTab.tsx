/**
 * OKR 对齐视图 — 增强版
 *
 * Round 7 — 目标管理深度 +1
 * - 贝塞尔曲线连线（替代直线）
 * - 点击节点可跳转详情
 * - 子目标级联进度穿透
 * - KR 详情展示
 * - 缩放控制
 * - V2-1 对齐健康度可视化（连线着色 + 健康徽章 + 告警推送）
 */
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal } from '@/types';
import { ZoomIn, ZoomOut, Maximize2, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = { todo: '#94a3b8', in_progress: '#3b82f6', done: '#22c55e', blocked: '#f59e0b', cancelled: '#ef4444' };

type HealthColor = 'green' | 'yellow' | 'red';

interface HealthInfo {
  color: HealthColor;
  percent: number;
  stroke: string;
}

function calcAlignmentHealth(parentGoal: Goal, childGoals: Goal[]): HealthInfo | null {
  if (childGoals.length === 0 || parentGoal.progress === 0) return null;
  let weightedSum = 0;
  let weightSum = 0;
  for (const child of childGoals) {
    const w = 1;
    weightedSum += child.progress * w;
    weightSum += w;
  }
  const healthPercent = Math.round((weightedSum / weightSum) / parentGoal.progress * 100);
  if (healthPercent >= 80) return { color: 'green', percent: healthPercent, stroke: '#22c55e' };
  if (healthPercent >= 60) return { color: 'yellow', percent: healthPercent, stroke: '#eab308' };
  return { color: 'red', percent: healthPercent, stroke: '#ef4444' };
}

const HEALTH_STROKE_DEFAULT = '#94a3b8';

interface TreeNode {
  goal: Goal;
  children: TreeNode[];
  x: number;
  y: number;
}

export function OKRAlignmentView() {
  const { state } = useStore();
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tree = useMemo(() => {
    const goals = state.goals;
    const roots = goals.filter(g => !g.parentId);
    function build(g: Goal, visited = new Set<string>()): TreeNode {
      if (visited.has(g.id)) return { goal: g, children: [], x: 0, y: 0 };
      visited.add(g.id);
      const children = goals.filter(c => c.parentId === g.id).map(c => build(c, new Set(visited)));
      return { goal: g, children, x: 0, y: 0 };
    }
    return roots.map(r => build(r));
  }, [state.goals]);

  const healthMap = useMemo(() => {
    const map = new Map<string, HealthInfo>();
    const goals = state.goals;
    for (const g of goals) {
      const children = goals.filter(c => c.parentId === g.id);
      if (children.length > 0) {
        const h = calcAlignmentHealth(g, children);
        if (h) map.set(g.id, h);
      }
    }
    return map;
  }, [state.goals]);

  const layoutNodes = useMemo(() => {
    const nodes: { id: string; title: string; status: string; progress: number; leaderId: string; x: number; y: number; width: number; height: number; krCount: number; type: string; health: HealthInfo | null }[] = [];
    const edges: { fromX: number; fromY: number; toX: number; toY: number; parentId: string }[] = [];

    const NODE_W = 200;
    const NODE_H = 70;
    const H_GAP = 30;
    const V_GAP = 90;

    function calcWidth(node: TreeNode): number {
      if (node.children.length === 0) return NODE_W;
      const childWidths = node.children.map(calcWidth);
      return childWidths.reduce((a, b) => a + b, 0) + (node.children.length - 1) * H_GAP;
    }

    function layout(node: TreeNode, x: number, y: number) {
      const w = calcWidth(node);
      const childGoals = node.children.map(c => c.goal);
      const h = calcAlignmentHealth(node.goal, childGoals);
      nodes.push({
        id: node.goal.id,
        title: node.goal.title,
        status: node.goal.status,
        progress: node.goal.progress,
        leaderId: node.goal.leaderId,
        x: x + w / 2,
        y,
        width: NODE_W,
        height: NODE_H,
        krCount: (node.goal.keyResults || []).length,
        type: node.goal.type || 'okr',
        health: h,
      });
      let childX = x;
      for (const child of node.children) {
        const cw = calcWidth(child);
        layout(child, childX, y + NODE_H + V_GAP);
        edges.push({ fromX: x + w / 2, fromY: y + NODE_H, toX: childX + cw / 2, toY: y + NODE_H + V_GAP, parentId: node.goal.id });
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

  const handleNodeClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
    window.dispatchEvent(new CustomEvent('tbh-nav-item', { detail: { id, type: 'goal' } }));
  }, []);

  const pushedRedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const [goalId, h] of healthMap) {
      if (h.color === 'red' && !pushedRedRef.current.has(goalId)) {
        pushedRedRef.current.add(goalId);
        const goal = state.goals.find(g => g.id === goalId);
        if (goal) {
          import('@/lib/pushEventEngine').then(({ dispatchAiPushEvent }) => {
            dispatchAiPushEvent({
              type: 'alignment_health',
              title: '对齐健康度告警',
              body: `「${goal.title}」的子目标对齐度仅 ${h.percent}%，低于60%警戒线`,
              targetId: goalId,
              targetType: 'goal',
              priority: 'high',
            });
          }).catch(() => {});
        }
      }
    }
  }, [healthMap, state.goals]);

  if (state.goals.length === 0) {
    return <div className="p-8 text-center text-muted-foreground text-sm">暂无目标数据，创建第一个目标后即可查看对齐关系</div>;
  }

  const maxX = Math.max(...layoutNodes.nodes.map(n => n.x + n.width), 400);
  const maxY = Math.max(...layoutNodes.nodes.map(n => n.y + n.height), 300);

  const selectedNode = selectedId ? layoutNodes.nodes.find(n => n.id === selectedId) : null;
  const selectedGoal = selectedId ? state.goals.find(g => g.id === selectedId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">OKR 对齐视图</h3>
          <p className="text-xs text-muted-foreground">展示目标层级对齐关系与级联进度穿透，点击节点跳转详情</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1.5 hover:bg-muted rounded"><ZoomOut size={14} /></button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 hover:bg-muted rounded"><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(1)} className="p-1.5 hover:bg-muted rounded"><Maximize2 size={14} /></button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* SVG 对齐图 */}
        <div className="flex-1 border border-border rounded-lg bg-white overflow-auto" style={{ maxHeight: 550 }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.2s' }}>
            <svg width={maxX + 80} height={maxY + 40} className="min-w-full">
              {/* 贝塞尔曲线连线 */}
              {layoutNodes.edges.map((edge, i) => {
                const midY = (edge.fromY + edge.toY) / 2;
                const h = healthMap.get(edge.parentId);
                const strokeColor = h ? h.stroke : HEALTH_STROKE_DEFAULT;
                return (
                  <path
                    key={i}
                    d={`M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    fill="none"
                  />
                );
              })}
              {/* 节点 */}
              {layoutNodes.nodes.map(node => {
                const memberName = state.members.find(m => m.id === node.leaderId)?.name ?? '';
                const isSelected = selectedId === node.id;
                const progressColor = node.progress >= 80 ? '#22c55e' : node.progress >= 40 ? '#f59e0b' : '#ef4444';
                const h = node.health;
                return (
                  <g key={node.id} className="cursor-pointer" onClick={() => handleNodeClick(node.id)}>
                    {isSelected && <rect x={node.x - node.width / 2 - 3} y={node.y - 3} width={node.width + 6} height={node.height + 6} rx={10} fill="none" stroke={STATUS_COLORS[node.status]} strokeWidth={2} strokeDasharray="4 2" />}
                    <rect x={node.x - node.width / 2} y={node.y} width={node.width} height={node.height} rx={8} fill="white" stroke={STATUS_COLORS[node.status] ?? '#94a3b8'} strokeWidth={isSelected ? 2.5 : 1.5} />
                    <circle cx={node.x - node.width / 2 + 12} cy={node.y + 12} r={4} fill={STATUS_COLORS[node.status]} />
                    <text x={node.x - node.width / 2 + 22} y={node.y + 14} fontSize={8} fill="#64748b">{node.type?.toUpperCase() || 'OKR'}</text>
                    <text x={node.x} y={node.y + 28} textAnchor="middle" fontSize={11} fontWeight={600} fill="#1e293b">{node.title.length > 14 ? node.title.substring(0, 14) + '...' : node.title}</text>
                    <rect x={node.x - node.width / 2 + 12} y={node.y + 36} width={node.width - 24} height={4} rx={2} fill="#e2e8f0" />
                    <rect x={node.x - node.width / 2 + 12} y={node.y + 36} width={(node.width - 24) * Math.min(1, node.progress / 100)} height={4} rx={2} fill={progressColor} />
                    <text x={node.x} y={node.y + 54} textAnchor="middle" fontSize={9} fill="#64748b">{memberName} · {node.progress}%{node.krCount > 0 ? ` · ${node.krCount}KR` : ''}</text>
                    {h && (
                      <>
                        <rect x={node.x + node.width / 2 - 52} y={node.y - 10} width={48} height={14} rx={4} fill={h.stroke} opacity={0.15} />
                        <text x={node.x + node.width / 2 - 28} y={node.y + 1} textAnchor="middle" fontSize={8} fontWeight={600} fill={h.stroke}>{h.percent}%</text>
                        {h.color === 'red' && (
                          <g>
                            <rect x={node.x - node.width / 2 - 2} y={node.y - 10} width={36} height={14} rx={4} fill="#fef2f2" stroke="#ef4444" strokeWidth={0.5} />
                            <text x={node.x - node.width / 2 + 16} y={node.y + 1} textAnchor="middle" fontSize={7} fontWeight={600} fill="#ef4444">⚠ 告警</text>
                          </g>
                        )}
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* 选中目标详情面板 */}
        {selectedGoal && selectedNode && (
          <div className="w-64 shrink-0 border border-border rounded-lg bg-white p-3 space-y-2 self-start sticky top-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[selectedGoal.status] }} />
              <span className="text-sm font-semibold truncate">{selectedGoal.title}</span>
              {healthMap.has(selectedGoal.id) && (() => {
                const h = healthMap.get(selectedGoal.id)!;
                return (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: h.stroke + '20', color: h.stroke }}>
                    对齐 {h.percent}%
                    {h.color === 'red' && <span className="ml-1">⚠ 告警</span>}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{state.members.find(m => m.id === selectedGoal.leaderId)?.name || '未分配'}</span>
              <span>·</span>
              <span>{selectedGoal.progress}%</span>
              <span>·</span>
              <span>{(selectedGoal.keyResults || []).length} KR</span>
            </div>
            {/* 进度条 */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${selectedGoal.progress}%`, backgroundColor: selectedGoal.progress >= 80 ? '#22c55e' : selectedGoal.progress >= 40 ? '#f59e0b' : '#ef4444' }} />
            </div>
            {/* KR 列表 */}
            {(selectedGoal.keyResults || []).length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground">关键结果</div>
                {(selectedGoal.keyResults || []).map((kr: any, i: number) => {
                  const krProgress = kr.targetValue > 0 ? Math.min(100, Math.round(((kr.currentValue || 0) / kr.targetValue) * 100)) : 0;
                  return (
                    <div key={kr.id || i} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="truncate flex-1">{kr.title || `KR-${i + 1}`}</span>
                        <span className="text-muted-foreground ml-1">{krProgress}%</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${krProgress}%`, backgroundColor: krProgress >= 80 ? '#22c55e' : krProgress >= 50 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* 子目标 */}
            {state.goals.filter(g => g.parentId === selectedGoal.id).length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground">子目标</div>
                {state.goals.filter(g => g.parentId === selectedGoal.id).map(g => (
                  <button key={g.id} className="w-full flex items-center gap-1.5 text-[11px] px-2 py-1 rounded hover:bg-muted text-left" onClick={() => handleNodeClick(g.id)}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[g.status] }} />
                    <span className="truncate flex-1">{g.title}</span>
                    <span className="text-muted-foreground">{g.progress}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
