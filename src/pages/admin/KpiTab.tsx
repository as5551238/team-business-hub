/**
 * KPI Dashboard — 团队绩效看板
 *
 * K1: 管理中心 Tab，展示：
 * - 团队 KPI 总览（加权总分、状态分布）
 * - 个人 KPI 积分卡
 * - 红黄绿状态分布图
 * - 需关注 KR 列表（红/黄状态）
 */
import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { calcDualTrack, calcKpiGoalScore, getKpiStatusColor, getKpiStatusLabel } from '@/lib/kpiScoring';
import { Target, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Users, BarChart3, Activity, ChevronDown, ChevronRight, Sparkles, CheckCircle, Plus, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Goal, KeyResult } from '@/types';
import { resolveToken } from '@/lib/resolveToken';
import { inputCls, primaryBtnCls, btnCls } from './constants';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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
  const color = score >= 80 ? resolveToken('success') : score >= 60 ? resolveToken('warning') : resolveToken('destructive');

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
  const { state, dispatch } = useStore();
  const goals = state.goals ?? [];
  const members = state.members ?? [];
  const [effExpanded, setEffExpanded] = useState(false);
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [mGoalId, setMGoalId] = useState('');
  const [mBusinessValue, setMBusinessValue] = useState('');
  const [mEffortHours, setMEffortHours] = useState('');
  const [mImpactScore, setMImpactScore] = useState('');

  const summary = useMemo(() => computeKpiSummary(goals), [goals]);
  const memberKpis = useMemo(() => computeMemberKpis(goals, members), [goals, members]);

  const metrics = state.effectivenessMetrics;
  const suggestions = state.aiSuggestions;

  const avgBusinessValue = metrics.length > 0 ? metrics.reduce((s, m) => s + m.businessValue, 0) / metrics.length : 0;
  const totalEffortHours = metrics.reduce((s, m) => s + m.effortHours, 0);
  const avgImpact = metrics.length > 0 ? metrics.reduce((s, m) => s + m.impactScore, 0) / metrics.length : 0;
  const adoptRate = suggestions.length > 0
    ? (suggestions.filter(s => s.status === 'adopted' || s.status === 'partially_adopted').length / suggestions.length * 100).toFixed(0)
    : '0';

  function handleAddMetric() {
    if (!mGoalId) return;
    const bv = Number(mBusinessValue) || 0;
    const effort = Number(mEffortHours) || 0;
    const impact = Number(mImpactScore) || 0;
    const roi = effort > 0 ? (bv * impact) / effort : null;
    dispatch({ type: 'ADD_EFFECTIVENESS_METRIC', payload: { goalId: mGoalId, businessValue: bv, effortHours: effort, impactScore: impact, roi, teamId: state.currentTeamId || '__default__' } });
    setMGoalId(''); setMBusinessValue(''); setMEffortHours(''); setMImpactScore('');
    setShowAddMetric(false);
  }

  if (summary.kpiGoals === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Target size={48} className="mb-4 opacity-30" />
        <p className="text-sm">暂无 KPI 目标</p>
        <p className="text-xs mt-1">创建 KPI 类型目标或为目标添加 KPI 轨道的关键结果</p>
      {/* 有效性度量（合并自原 EffectivenessTab） */}
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => setEffExpanded(!effExpanded)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
        >
          <Activity size={16} className="text-primary" />
          <span className="flex-1 text-left">有效性度量</span>
          {effExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {effExpanded && (
          <div className="px-4 pb-4 space-y-3 animate-fade-in">
            <div className="grid grid-cols-4 gap-2">
              <div className="border rounded-lg p-2">
                <div className="text-[9px] text-muted-foreground">平均商业价值</div>
                <div className="text-base font-bold">{avgBusinessValue.toFixed(1)}</div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[9px] text-muted-foreground">总投入工时</div>
                <div className="text-base font-bold">{totalEffortHours}h</div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[9px] text-muted-foreground">平均影响力</div>
                <div className="text-base font-bold">{avgImpact.toFixed(1)}</div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[9px] text-muted-foreground">AI建议采纳率</div>
                <div className="text-base font-bold text-emerald-600">{adoptRate}%</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setShowAddMetric(true)} className={primaryBtnCls}><Plus size={12} /> 度量目标</button>
            </div>

            {metrics.length > 0 && (
              <div className="space-y-1">
                {metrics.map(m => {
                  const goal = state.goals.find(g => g.id === m.goalId);
                  return (
                    <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-[11px]">
                      <Target size={10} className="text-primary" />
                      <span className="font-medium flex-1 truncate">{goal?.title || m.goalId}</span>
                      <span>价值:{m.businessValue}</span>
                      <span>投入:{m.effortHours}h</span>
                      <span>影响力:{m.impactScore}</span>
                      {m.roi != null && <span className="font-medium text-primary">ROI:{m.roi.toFixed(2)}</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-primary" />
                  <span className="text-xs font-semibold">AI建议</span>
                </div>
                <div className="space-y-1">
                  {suggestions.slice(0, 5).map(s => (
                    <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        s.status === 'adopted' ? 'bg-emerald-100 text-emerald-700' :
                        s.status === 'dismissed' ? 'bg-red-100 text-red-700' :
                        s.status === 'partially_adopted' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {s.status === 'adopted' ? '已采纳' : s.status === 'dismissed' ? '已忽略' : s.status === 'partially_adopted' ? '部分采纳' : '待定'}
                      </span>
                      <span className="flex-1 truncate">{s.content}</span>
                      {s.status === 'suggested' && (
                        <>
                          <button onClick={() => dispatch({ type: 'UPDATE_AI_SUGGESTION', payload: { id: s.id, updates: { status: 'adopted', adoptedAt: new Date().toISOString() } } })} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"><CheckCircle size={12} /></button>
                          <button onClick={() => dispatch({ type: 'UPDATE_AI_SUGGESTION', payload: { id: s.id, updates: { status: 'dismissed' } } })} className="p-0.5 text-red-500 hover:bg-red-50 rounded"><XCircle size={12} /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showAddMetric && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddMetric(false)} />
                <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-md animate-slide-up">
                  <div className="px-5 py-3 border-b flex items-center justify-between">
                    <h3 className="font-semibold text-sm">度量目标有效性</h3>
                    <button onClick={() => setShowAddMetric(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <label className="text-[11px] font-medium block mb-1">关联目标 *</label>
                      <select className={inputCls} value={mGoalId} onChange={e => setMGoalId(e.target.value)}>
                        <option value="">选择目标</option>
                        {state.goals.filter(g => !g.deletedAt).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-medium block mb-1">商业价值 (1-10)</label>
                        <input type="number" min="1" max="10" className={inputCls} value={mBusinessValue} onChange={e => setMBusinessValue(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium block mb-1">投入工时</label>
                        <input type="number" className={inputCls} value={mEffortHours} onChange={e => setMEffortHours(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium block mb-1">影响力 (1-10)</label>
                        <input type="number" min="1" max="10" className={inputCls} value={mImpactScore} onChange={e => setMImpactScore(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-3 border-t flex justify-end gap-2">
                    <button onClick={() => setShowAddMetric(false)} className={btnCls}>取消</button>
                    <button onClick={handleAddMetric} disabled={!mGoalId} className={primaryBtnCls}>添加</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
