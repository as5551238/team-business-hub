/**
 * KPI Dashboard — 团队绩效看板
 *
 * K1: 管理中心 Tab，展示：
 * - 团队 KPI 总览（加权总分、状态分布）
 * - 个人 KPI 积分卡
 * - 红黄绿状态分布图
 * - 需关注 KR 列表（红/黄状态）
 */
import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { calcDualTrack, calcKpiGoalScore, getKpiStatusColor, getKpiStatusLabel } from '@/lib/kpiScoring';
import { Target, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Users, BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Goal, KeyResult } from '@/types';

// ===== KPI 汇总计算 =====

interface KpiSummary {
  totalGoals: number;
  kpiGoals: number;
  weightedScore: number;
  overallStatus: 'red' | 'yellow' | 'green';
  redCount: number;
  yellowCount: number;
  greenCount: number;
  attentionKRs: Array<{ goalId: string; goalTitle: string; kr: KeyResult; status: 'red' | 'yellow' }>;
}

interface MemberKpi {
  memberId: string;
  memberName: string;
  kpiGoals: number;
  avgScore: number;
  status: 'red' | 'yellow' | 'green';
  redCount: number;
  yellowCount: number;
  greenCount: number;
}

function computeKpiSummary(goals: Goal[]): KpiSummary {
  const kpiGoals = goals.filter(g => g.type === 'kpi' || (g.keyResults ?? []).some(kr => kr.track === 'kpi' || kr.track === 'both'));
  let totalRed = 0, totalYellow = 0, totalGreen = 0;
  let totalWeightedScore = 0;
  let scoredCount = 0;
  const attentionKRs: KpiSummary['attentionKRs'] = [];

  for (const goal of kpiGoals) {
    const krs = (goal.keyResults ?? []).filter(kr => kr.track === 'kpi' || kr.track === 'both');
    if (krs.length === 0) continue;
    const result = calcKpiGoalScore(goal.keyResults ?? []);
    totalRed += result.redCount;
    totalYellow += result.yellowCount;
    totalGreen += result.greenCount;
    totalWeightedScore += result.weightedTotal;
    scoredCount++;

    // 收集需要关注的 KR
    for (const kr of krs) {
      const dualTrack = calcDualTrack([kr]);
      if (dualTrack?.kpi) {
        const st = dualTrack.kpi.overallStatus;
        if (st === 'red' || st === 'yellow') {
          attentionKRs.push({ goalId: goal.id, goalTitle: goal.title, kr, status: st });
        }
      }
    }
  }

  const avgScore = scoredCount > 0 ? Math.round(totalWeightedScore / scoredCount) : 0;
  const overallStatus = avgScore >= 80 ? 'green' : avgScore >= 60 ? 'yellow' : 'red';

  return {
    totalGoals: goals.length,
    kpiGoals: kpiGoals.length,
    weightedScore: avgScore,
    overallStatus,
    redCount: totalRed,
    yellowCount: totalYellow,
    greenCount: totalGreen,
    attentionKRs: attentionKRs.sort((a, b) => (a.status === 'red' ? -1 : 1)),
  };
}

function computeMemberKpis(goals: Goal[], members: Array<{ id: string; name: string }>): MemberKpi[] {
  const memberMap = new Map<string, { scores: number[]; redCount: number; yellowCount: number; greenCount: number; kpiGoals: number }>();

  for (const goal of goals) {
    const krs = (goal.keyResults ?? []).filter(kr => kr.track === 'kpi' || kr.track === 'both');
    if (krs.length === 0) continue;
    const leaderId = goal.leaderId || goal.leader_id;
    if (!leaderId) continue;

    const result = calcKpiGoalScore(goal.keyResults ?? []);
    if (!memberMap.has(leaderId)) {
      memberMap.set(leaderId, { scores: [], redCount: 0, yellowCount: 0, greenCount: 0, kpiGoals: 0 });
    }
    const entry = memberMap.get(leaderId)!;
    entry.scores.push(result.weightedTotal);
    entry.redCount += result.redCount;
    entry.yellowCount += result.yellowCount;
    entry.greenCount += result.greenCount;
    entry.kpiGoals++;
  }

  const results: MemberKpi[] = [];
  for (const member of members) {
    const data = memberMap.get(member.id);
    if (!data || data.kpiGoals === 0) continue;
    const avgScore = Math.round(data.scores.reduce((s, v) => s + v, 0) / data.scores.length);
    results.push({
      memberId: member.id,
      memberName: member.name,
      kpiGoals: data.kpiGoals,
      avgScore,
      status: avgScore >= 80 ? 'green' : avgScore >= 60 ? 'yellow' : 'red',
      redCount: data.redCount,
      yellowCount: data.yellowCount,
      greenCount: data.greenCount,
    });
  }

  return results.sort((a, b) => b.avgScore - a.avgScore);
}

// ===== UI 组件 =====

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, score) / 100;
  const offset = circumference * (1 - progress);
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={4} className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={4} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute text-lg font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: 'red' | 'yellow' | 'green' }) {
  const cls = status === 'green' ? 'bg-green-100 text-green-700' : status === 'yellow' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{getKpiStatusLabel(status)}</span>;
}

// ===== 主组件 =====

export function KpiTab() {
  const { state } = useStore();
  const goals = state.goals ?? [];
  const members = state.members ?? [];

  const summary = useMemo(() => computeKpiSummary(goals), [goals]);
  const memberKpis = useMemo(() => computeMemberKpis(goals, members), [goals, members]);

  if (summary.kpiGoals === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Target size={48} className="mb-4 opacity-30" />
        <p className="text-sm">暂无 KPI 目标</p>
        <p className="text-xs mt-1">创建 KPI 类型目标或为目标添加 KPI 轨道的关键结果</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 总览卡片区 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 加权总分 */}
        <div className="border rounded-lg p-4 flex flex-col items-center justify-center">
          <span className="text-[10px] text-muted-foreground mb-2">团队 KPI 加权分</span>
          <ScoreRing score={summary.weightedScore} size={80} />
          <div className="mt-2"><StatusBadge status={summary.overallStatus} /></div>
        </div>

        {/* 状态分布 */}
        <div className="border rounded-lg p-4">
          <span className="text-[10px] text-muted-foreground">KR 状态分布</span>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-xs">达标</span>
              <span className="text-sm font-semibold ml-auto">{summary.greenCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-500" />
              <span className="text-xs">风险</span>
              <span className="text-sm font-semibold ml-auto">{summary.yellowCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle size={14} className="text-red-500" />
              <span className="text-xs">落后</span>
              <span className="text-sm font-semibold ml-auto">{summary.redCount}</span>
            </div>
          </div>
          {/* 进度条 */}
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden flex">
            {summary.greenCount > 0 && <div className="bg-green-500 h-full" style={{ width: `${(summary.greenCount / (summary.redCount + summary.yellowCount + summary.greenCount)) * 100}%` }} />}
            {summary.yellowCount > 0 && <div className="bg-yellow-400 h-full" style={{ width: `${(summary.yellowCount / (summary.redCount + summary.yellowCount + summary.greenCount)) * 100}%` }} />}
            {summary.redCount > 0 && <div className="bg-red-500 h-full" style={{ width: `${(summary.redCount / (summary.redCount + summary.yellowCount + summary.greenCount)) * 100}%` }} />}
          </div>
        </div>

        {/* KPI 目标统计 */}
        <div className="border rounded-lg p-4">
          <span className="text-[10px] text-muted-foreground">KPI 覆盖</span>
          <div className="mt-3 flex items-end gap-1">
            <span className="text-2xl font-bold">{summary.kpiGoals}</span>
            <span className="text-xs text-muted-foreground mb-1">/ {summary.totalGoals} 目标</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: `${summary.totalGoals > 0 ? (summary.kpiGoals / summary.totalGoals) * 100 : 0}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground mt-1 block">含 KPI 轨道的目标占比</span>
        </div>

        {/* 需关注数 */}
        <div className="border rounded-lg p-4">
          <span className="text-[10px] text-muted-foreground">需关注</span>
          <div className="mt-3 flex items-center gap-2">
            <XCircle size={20} className={summary.redCount > 0 ? 'text-red-500' : 'text-muted/30'} />
            <span className="text-2xl font-bold">{summary.attentionKRs.length}</span>
          </div>
          <span className="text-[10px] text-muted-foreground mt-1 block">红/黄状态 KR 需要干预</span>
        </div>
      </div>

      {/* 个人 KPI 积分卡 */}
      {memberKpis.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Users size={16} className="text-primary" />
            个人 KPI 积分卡
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {memberKpis.map(mk => (
              <div key={mk.memberId} className="border rounded-lg p-3 flex items-center gap-3">
                <ScoreRing score={mk.avgScore} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{mk.memberName}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {mk.kpiGoals} 个 KPI 目标 · <StatusBadge status={mk.status} />
                  </div>
                  <div className="flex gap-2 mt-1 text-[10px]">
                    <span className="text-green-600">+{mk.greenCount}</span>
                    <span className="text-yellow-600">{mk.yellowCount}</span>
                    <span className="text-red-600">{mk.redCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 需关注 KR 列表 */}
      {summary.attentionKRs.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <BarChart3 size={16} className="text-amber-500" />
            需关注的关键结果
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {summary.attentionKRs.slice(0, 20).map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30">
                <StatusBadge status={item.status} />
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">{item.goalTitle}</span>
                <span className="text-xs truncate flex-1">{item.kr.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {item.kr.currentValue ?? 0}/{item.kr.kpiTarget ?? item.kr.targetValue ?? 100}
                </span>
              </div>
            ))}
            {summary.attentionKRs.length > 20 && (
              <span className="text-[10px] text-muted-foreground block text-center">还有 {summary.attentionKRs.length - 20} 项...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
