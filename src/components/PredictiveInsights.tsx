// P3: 预测洞察面板 — 任务逾期风险 + 成员倦怠 + 目标完成概率
import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Brain, AlertTriangle, UserX, Target, Clock, TrendingDown, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface TaskRisk {
  taskId: string; title: string; leaderId: string; daysLeft: number;
  priority: string; riskScore: number; riskLevel: string; factors: any[];
}
interface BurnoutMember {
  userId: string; userName: string; role: string;
  burnoutScore: number; riskLevel: string; signals: any[];
}
interface GoalRisk {
  goalId: string; title: string; currentProgress: number;
  expectedProgress: number; progressGap: number; remainingDays: number;
  completionProb: number; estimatedDelay: number; riskLevel: string;
}
interface PredictionData {
  taskRisks: { totalAtRisk: number; critical: number; high: number; medium: number; tasks: TaskRisk[] };
  burnout: { totalAtRisk: number; members: BurnoutMember[] };
  goalRisks: { totalAtRisk: number; goals: GoalRisk[] };
}

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', label: '极高风险' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', label: '高风险' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', label: '中风险' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: '低风险' },
};

function RiskBadge({ level }: { level: string }) {
  const s = RISK_COLORS[level] || RISK_COLORS.low;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
}

export default function PredictiveInsights() {
  const { state } = useStore();
  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<'tasks' | 'burnout' | 'goals'>('tasks');

  const fetchData = useCallback(async () => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb || !state.currentUser?.teamId) return;
    setLoading(true);
    try {
      const [tr, bo, gr] = await Promise.all([
        sb.rpc('predict_task_risks', { p_team_id: state.currentUser.teamId }),
        sb.rpc('predict_burnout', { p_team_id: state.currentUser.teamId }),
        sb.rpc('predict_goal_completion', { p_team_id: state.currentUser.teamId }),
      ]);
      setData({
        taskRisks: tr.data || { totalAtRisk: 0, critical: 0, high: 0, medium: 0, tasks: [] },
        burnout: bo.data || { totalAtRisk: 0, members: [] },
        goalRisks: gr.data || { totalAtRisk: 0, goals: [] },
      });
    } catch {}
    setLoading(false);
  }, [state.currentUser?.teamId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalRisks = (data?.taskRisks?.totalAtRisk || 0) + (data?.burnout?.totalAtRisk || 0) + (data?.goalRisks?.totalAtRisk || 0);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-500" />
          <span className="text-sm font-semibold">预测洞察</span>
          {totalRisks > 0 && <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">{totalRisks} 项风险</span>}
        </div>
        <div className="flex items-center gap-1">
          {loading && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
          <button onClick={e => { e.stopPropagation(); fetchData(); }} className="p-1 rounded hover:bg-muted/50"><RefreshCw size={12} className="text-muted-foreground" /></button>
          <svg width="12" height="12" viewBox="0 0 12 12" className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}>
            <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      {expanded && data && (
        <div className="p-4 space-y-4">
          {/* Tab切换 */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
            {[
              { key: 'tasks' as const, icon: <AlertTriangle size={12} />, label: '任务风险', count: data.taskRisks.totalAtRisk },
              { key: 'burnout' as const, icon: <UserX size={12} />, label: '倦怠预警', count: data.burnout.totalAtRisk },
              { key: 'goals' as const, icon: <Target size={12} />, label: '目标风险', count: data.goalRisks.totalAtRisk },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md transition-all ${tab === t.key ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t.icon}{t.label}
                {t.count > 0 && <span className="bg-red-100 text-red-700 text-[9px] px-1 rounded-full">{t.count}</span>}
              </button>
            ))}
          </div>

          {/* 任务风险 */}
          {tab === 'tasks' && (
            <div className="space-y-2">
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span className="text-red-600">极危 {data.taskRisks.critical}</span>
                <span className="text-orange-600">高危 {data.taskRisks.high}</span>
                <span className="text-amber-600">中危 {data.taskRisks.medium}</span>
              </div>
              {data.taskRisks.tasks.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">当前无高风险任务</div>
              ) : data.taskRisks.tasks.slice(0, 5).map(t => (
                <div key={t.taskId} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{t.title}</span>
                      <RiskBadge level={t.riskLevel} />
                    </div>
                    <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Clock size={9} />{t.daysLeft < 0 ? `逾期${-t.daysLeft}天` : `${t.daysLeft}天截止`}</span>
                      <span>评分 {t.riskScore}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 倦怠预警 */}
          {tab === 'burnout' && (
            <div className="space-y-2">
              {data.burnout.members.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">团队成员状态良好</div>
              ) : data.burnout.members.slice(0, 5).map(m => (
                <div key={m.userId} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-purple-100 text-purple-700 flex-shrink-0">
                    {m.userName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{m.userName}</span>
                      <RiskBadge level={m.riskLevel} />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {m.signals.map((s: any, i: number) => (
                        <span key={i} className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded">
                          {s.type === 'activity_drop' ? '活跃度下降' : s.type === 'low_presence' ? '出勤不足' : '负载过高'}：{s.detail}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-600">{m.burnoutScore}</span>
                </div>
              ))}
            </div>
          )}

          {/* 目标风险 */}
          {tab === 'goals' && (
            <div className="space-y-2">
              {data.goalRisks.goals.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">所有目标进展正常</div>
              ) : data.goalRisks.goals.slice(0, 5).map(g => (
                <div key={g.goalId} className="p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate flex-1">{g.title}</span>
                    <RiskBadge level={g.riskLevel} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden relative">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${g.currentProgress}%` }} />
                      <div className="absolute top-0 h-full w-0.5 bg-red-400" style={{ left: `${g.expectedProgress}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-16 text-right">{g.currentProgress}%/需{g.expectedProgress}%</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>完成概率 <span className={g.completionProb < 30 ? 'text-red-600 font-medium' : ''}>{g.completionProb}%</span></span>
                    {g.estimatedDelay > 0 && <span className="text-red-600">约延迟 {g.estimatedDelay} 天</span>}
                    <span>{g.remainingDays < 0 ? `已超期${-g.remainingDays}天` : `剩余${g.remainingDays}天`}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
