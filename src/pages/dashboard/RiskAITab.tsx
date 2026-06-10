/**
 * 风险智能分析 Tab — 智能摘要 + 风险预测 + 方法论推荐 + 协作健康度 + 驱动层AI
 */
import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { AISummaryWidget, AIRiskPredictionWidget, AIMethodologyWidget } from './AIWidgets';
import { AIConstraintSolverWidget, AIResourceReallocWidget, AIVisionStrategyWidget, AICapabilityGapWidget, AIMethodologyEvolutionWidget } from './AIWidgetsAdvanced';
import { computeCollaborationHealth } from '@/lib/ai/aiCollaborationHealth';
import { detectKrLags } from '@/lib/krLagDetection';
import { useFilteredData } from './shared';
import type { DashboardTabProps } from './shared';
import { TabErrorBoundary } from '@/components/TabErrorBoundary';

export default function RiskAITab(_props: DashboardTabProps) {
  const { state, memberGoals, memberTasks, memberProjects } = useFilteredData();

  // AI widgets 需要带筛选数据的 state 快照
  const aiState = useMemo(() => ({
    ...state,
    goals: memberGoals,
    tasks: memberTasks,
    projects: memberProjects,
  }), [state, memberGoals, memberTasks, memberProjects]);

  const health = useMemo(() => computeCollaborationHealth(state), [state]);
  const krLags = useMemo(() => detectKrLags(memberGoals), [memberGoals]);
  const scoreColor = health.overallScore >= 80 ? 'text-green-600' : health.overallScore >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = health.overallScore >= 80 ? 'bg-green-50' : health.overallScore >= 60 ? 'bg-amber-50' : 'bg-red-50';
  const trendIcon = health.trend === 'improving' ? '↑' : health.trend === 'declining' ? '↓' : '→';

  return (
    <TabErrorBoundary>
    <div className="space-y-6">
      <AISummaryWidget state={aiState} />
      <AIRiskPredictionWidget state={aiState} />
      <AIMethodologyWidget state={aiState} />
      <AIVisionStrategyWidget state={aiState} />
      <AIConstraintSolverWidget state={aiState} />
      <AIResourceReallocWidget state={aiState} />
      <AICapabilityGapWidget state={aiState} />
      <AIMethodologyEvolutionWidget state={aiState} />

      {/* KR 滞后预警 */}
      {krLags.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2"><span className="text-amber-500">⚠</span><h2 className="font-semibold text-sm md:text-base">KR 滞后预警</h2></div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">{krLags.length} 项滞后</span>
          </div>
          <div className="p-4 md:px-5 space-y-2">
            {krLags.slice(0, 5).map(alert => (
              <div key={alert.krId} className={`p-2 rounded-lg border ${alert.severity === 'critical' ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{alert.krTitle}<span className="text-muted-foreground ml-1">({alert.goalTitle})</span></p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">预期 {alert.expectedProgress}% / 实际 {alert.actualProgress}% / 落后 {alert.lagPercent}%</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ml-2 ${alert.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{alert.severity === 'critical' ? '严重' : '关注'}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{alert.suggestedAction}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 协作健康度 */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><Users size={18} className="text-indigo-500" /><h2 className="font-semibold text-sm md:text-base">协作健康度</h2></div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${scoreBg} ${scoreColor} font-bold`}>{trendIcon} {health.overallScore}分</span>
        </div>
        <div className="p-4 md:px-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 rounded-lg bg-muted/30"><div className="text-lg font-bold text-green-600">{health.taskOnTimeRate}%</div><div className="text-[10px] text-muted-foreground">任务准时率</div></div>
            <div className="text-center p-2 rounded-lg bg-muted/30"><div className="text-lg font-bold text-blue-600">{health.commentResponseRate}%</div><div className="text-[10px] text-muted-foreground">24h响应率</div></div>
            <div className="text-center p-2 rounded-lg bg-muted/30"><div className="text-lg font-bold text-purple-600">{health.mentionResponseRate}%</div><div className="text-[10px] text-muted-foreground">@回复率</div></div>
            <div className="text-center p-2 rounded-lg bg-muted/30"><div className="text-lg font-bold text-amber-600">{health.avgResponseHours}h</div><div className="text-[10px] text-muted-foreground">平均响应</div></div>
          </div>
          {health.insights.length > 0 && (
            <div><p className="text-xs font-semibold text-muted-foreground mb-1">洞察</p>{health.insights.slice(0, 3).map((ins: string, i: number) => <p key={i} className="text-xs text-muted-foreground pl-2">• {ins}</p>)}</div>
          )}
        </div>
      </div>
    </div>
    </TabErrorBoundary>
  );
}
