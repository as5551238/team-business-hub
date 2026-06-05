import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal } from '@/types';
import { Trophy, Calendar, ChevronRight, ChevronDown, Target, Eye, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

const LEVEL_LABELS: Record<string, string> = { vision: '三年愿景', annual: '年度目标', quarter: '季度OKR' };
const LEVEL_COLORS: Record<string, string> = {
  vision: 'bg-purple-100 text-purple-700 border-purple-200',
  annual: 'bg-blue-100 text-blue-700 border-blue-200',
  quarter: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};
const LEVEL_ICONS: Record<string, typeof Trophy> = { vision: Eye, annual: Calendar, quarter: Trophy };
const STATUS_DOT: Record<string, string> = {
  todo: 'bg-gray-400', in_progress: 'bg-blue-500', done: 'bg-green-500',
  blocked: 'bg-amber-500', cancelled: 'bg-red-400',
};

export function StrategyHierarchyView() {
  const { state, dispatch } = useStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const seasons = state.seasons || [];
  const activeSeasons = seasons.filter(s => s.status !== 'closed');
  const filteredGoals = selectedSeasonId
    ? state.goals.filter(g => g.seasonId === selectedSeasonId)
    : state.goals;

  // Build hierarchy: vision → annual → quarter → unclassified
  const hierarchy = useMemo(() => {
    const visionGoals = filteredGoals.filter(g => g.strategyLevel === 'vision' && !g.deletedAt);
    const annualGoals = filteredGoals.filter(g => g.strategyLevel === 'annual' && !g.deletedAt);
    const quarterGoals = filteredGoals.filter(g => g.strategyLevel === 'quarter' && !g.deletedAt);
    const unclassified = filteredGoals.filter(g => !g.strategyLevel && !g.deletedAt);

    // Build tree: vision goals are parent nodes; annual goals link to their parentId (or vision parent)
    // Quarter goals link to their parentId
    function getChildren(parentId: string, level: string): Goal[] {
      if (level === 'vision') return annualGoals.filter(g => g.parentId === parentId);
      if (level === 'annual') return quarterGoals.filter(g => g.parentId === parentId);
      return [];
    }

    // Top-level vision goals
    const visionNodes = visionGoals.filter(g => !g.parentId || !visionGoals.find(v => v.id === g.parentId)).map(g => ({
      goal: g,
      level: 'vision' as const,
      children: getChildren(g.id, 'vision').map(ag => ({
        goal: ag,
        level: 'annual' as const,
        children: getChildren(ag.id, 'annual').map(qg => ({
          goal: qg,
          level: 'quarter' as const,
          children: [] as { goal: Goal; level: string; children: never[] }[],
        })),
      })),
    }));

    // Orphan annual goals (no vision parent)
    const orphanAnnual = annualGoals.filter(ag => !ag.parentId || !visionGoals.find(v => v.id === ag.parentId)).map(ag => ({
      goal: ag,
      level: 'annual' as const,
      children: getChildren(ag.id, 'annual').map(qg => ({
        goal: qg,
        level: 'quarter' as const,
        children: [] as { goal: Goal; level: string; children: never[] }[],
      })),
    }));

    // Orphan quarter goals
    const orphanQuarter = quarterGoals.filter(qg => !qg.parentId || (!annualGoals.find(a => a.id === qg.parentId) && !visionGoals.find(v => v.id === qg.parentId))).map(qg => ({
      goal: qg,
      level: 'quarter' as const,
      children: [] as { goal: Goal; level: string; children: never[] }[],
    }));

    // Unclassified
    const unclassifiedNodes = unclassified.map(g => ({
      goal: g,
      level: 'none' as const,
      children: [] as { goal: Goal; level: string; children: never[] }[],
    }));

    return { visionNodes, orphanAnnual, orphanQuarter, unclassifiedNodes };
  }, [filteredGoals]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Compute progress for a node (average of self and children)
  function computeProgress(goal: Goal): number {
    return goal.progress || 0;
  }

  type Node = { goal: Goal; level: string; children: Node[] };

  function renderNode(node: Node, depth: number = 0) {
    const isExpanded = expandedIds.has(node.goal.id);
    const hasChildren = node.children.length > 0;
    const Icon = LEVEL_ICONS[node.level] || Target;
    const levelLabel = LEVEL_LABELS[node.level] || '普通目标';
    const levelColor = LEVEL_COLORS[node.level] || 'bg-gray-100 text-gray-600 border-gray-200';

    return (
      <div key={node.goal.id} className="select-none">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/40 ${
            depth > 0 ? 'ml-6' : ''
          }`}
          onClick={() => hasChildren && toggleExpand(node.goal.id)}
          style={{ marginLeft: depth * 24 }}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />
          ) : (
            <div className="w-3.5 shrink-0" />
          )}
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[node.goal.status] || 'bg-gray-300'}`} />
          <Icon size={14} className="shrink-0 text-muted-foreground" />
          <span className={`text-sm truncate flex-1 ${node.goal.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
            {node.goal.title}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${levelColor}`}>
            {levelLabel}
          </span>
          {node.goal.leaderId && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              <Users size={10} className="inline mr-0.5" />
              {state.members.find(m => m.id === node.goal.leaderId)?.name || ''}
            </span>
          )}
          <span className="text-xs font-medium shrink-0 min-w-[32px] text-right">{computeProgress(node.goal)}%</span>
          {/* Mini progress bar */}
          <div className="w-12 h-1.5 bg-gray-100 rounded-full shrink-0 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${computeProgress(node.goal) >= 80 ? 'bg-green-500' : computeProgress(node.goal) >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
              style={{ width: `${computeProgress(node.goal)}%` }}
            />
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const hasAnyContent = hierarchy.visionNodes.length > 0 || hierarchy.orphanAnnual.length > 0 || hierarchy.orphanQuarter.length > 0;

  return (
    <div className="space-y-4">
      {/* Season filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground">按赛季筛选:</label>
        <select
          className="border border-input rounded px-2 py-1 text-sm"
          value={selectedSeasonId || ''}
          onChange={e => setSelectedSeasonId(e.target.value || null)}
        >
          <option value="">全部周期</option>
          {activeSeasons.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          共 {filteredGoals.filter(g => !g.deletedAt).length} 个目标
        </span>
      </div>

      {!hasAnyContent && hierarchy.unclassifiedNodes.length === 0 && (
        <EmptyState title="暂无目标，创建目标并在详情中设置战略层级" compact />
      )}

      {/* Vision level */}
      {hierarchy.visionNodes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1">
            <Eye size={12} /> 三年愿景
          </h4>
          <div className="space-y-0.5">{hierarchy.visionNodes.map(n => renderNode(n))}</div>
        </div>
      )}

      {/* Orphan annual goals */}
      {hierarchy.orphanAnnual.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <Calendar size={12} /> 年度目标
          </h4>
          <div className="space-y-0.5">{hierarchy.orphanAnnual.map(n => renderNode(n))}</div>
        </div>
      )}

      {/* Orphan quarter goals */}
      {hierarchy.orphanQuarter.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
            <Trophy size={12} /> 季度OKR
          </h4>
          <div className="space-y-0.5">{hierarchy.orphanQuarter.map(n => renderNode(n))}</div>
        </div>
      )}

      {/* Unclassified */}
      {hierarchy.unclassifiedNodes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
            <Target size={12} /> 普通目标（未设置层级）
          </h4>
          <div className="space-y-0.5">{hierarchy.unclassifiedNodes.map(n => renderNode(n))}</div>
        </div>
      )}
    </div>
  );
}
