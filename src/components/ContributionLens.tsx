// P1: 贡献度透镜 — 成员贡献多维度对比 + 单人详情展开
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Award, ChevronDown, ChevronUp, BarChart3, RefreshCw } from 'lucide-react';
import { handleError } from '@/lib/errorHandler';
import { resolveToken } from '@/lib/resolveToken';

interface ContributionData {
  userId: string;
  totalScore: number;
  level: string;
  dimensions: {
    taskOutput: number;
    collabImpact: number;
    goalContribution: number;
    innovation: number;
    reliability: number;
  };
  stats: {
    completed: number;
    onTime: number;
    created: number;
    comments: number;
    mentionsReceived: number;
    goalLinked: number;
    aiUsed: number;
    activeDays: number;
    selfCreated: number;
  };
}

const DIMS = [
  { key: 'taskOutput', label: '任务产出', color: resolveToken('primary') },
  { key: 'collabImpact', label: '协作影响', color: resolveToken('success') },
  { key: 'goalContribution', label: '目标贡献', color: resolveToken('chart-pink') },
  { key: 'innovation', label: '创新度', color: resolveToken('warning') },
  { key: 'reliability', label: '可靠性', color: resolveToken('chart-purple') },
] as const;

const LEVEL_STYLES: Record<string, string> = {
  S: 'bg-amber-100 text-amber-800 border-amber-200',
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-gray-100 text-gray-700 border-gray-200',
  D: 'bg-red-50 text-red-700 border-red-200',
};

function ContributionBar({ memberId }: { memberId: string }) {
  const { state } = useStore();
  const [data, setData] = useState<ContributionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const member = state.members.find(m => m.id === memberId);

  const fetchData = useCallback(async () => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb) return;
    setLoading(true);
    try {
      const { data: result, error } = await sb.rpc('member_contribution', {
        p_user_id: memberId,
        p_days: 30,
      });
      if (!error && result) setData(result as ContributionData);
    } catch (e) { handleError(e, { module: 'ContributionLens', operation: 'FETCH_DATA', severity: 'warn' }); }
    setLoading(false);
  }, [memberId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!member) return null;

  const score = data?.totalScore ?? 0;
  const level = data?.level ?? '-';
  const barWidth = Math.min(100, score);

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setDetailOpen(!detailOpen)}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary/10 text-primary flex-shrink-0">
          {member.avatar || (member.name || '?')[0]}
        </div>
        <span className="text-sm font-medium flex-1 truncate">{member.name}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${LEVEL_STYLES[level] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
          {level}
        </span>
        <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden flex-shrink-0">
          <div className="h-full rounded-full transition-all duration-500 bg-primary" style={{ width: `${barWidth}%` }} />
        </div>
        <span className="text-xs font-semibold w-6 text-right">{score}</span>
        {detailOpen ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
      </div>

      {detailOpen && data && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
          <div className="space-y-1">
            {DIMS.map(d => (
              <div key={d.key} className="flex items-center gap-2 text-[11px]">
                <span className="w-14 text-muted-foreground">{d.label}</span>
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${data.dimensions[d.key]}%`, backgroundColor: d.color }} />
                </div>
                <span className="w-6 text-right font-medium" style={{ color: d.color }}>{data.dimensions[d.key]}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
            <span>完成 {data.stats.completed}</span>
            <span>按时 {data.stats.onTime}</span>
            <span>评论 {data.stats.comments}</span>
            <span>目标关联 {data.stats.goalLinked}</span>
            <span>AI使用 {data.stats.aiUsed}</span>
            <span>活跃 {data.stats.activeDays}天</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContributionLens() {
  const { state } = useStore();
  const [expanded, setExpanded] = useState(true);

  const activeMembers = useMemo(() =>
    state.members.filter(m => m.status === 'active' && m.role !== 'admin'),
    [state.members]
  );

  if (activeMembers.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Award size={16} className="text-amber-500" />
          <span className="text-sm font-semibold">贡献度透镜</span>
          <span className="text-[10px] text-muted-foreground">{activeMembers.length} 名成员</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>

      {expanded && (
        <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
          {/* 等级图例 */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pb-1">
            <span>等级：</span>
            {Object.entries(LEVEL_STYLES).map(([l, cls]) => (
              <span key={l} className={`px-1 py-0.5 rounded border font-bold ${cls}`}>{l}</span>
            ))}
          </div>
          {activeMembers.map(m => (
            <ContributionBar key={m.id} memberId={m.id} />
          ))}
        </div>
      )}
    </div>
  );
}
