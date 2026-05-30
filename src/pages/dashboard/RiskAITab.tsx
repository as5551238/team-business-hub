/**
 * 风险智能分析 Tab — 智能摘要 + 风险预测 + 方法论推荐 + 协作健康度 + 驱动层AI
 */
import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { AISummaryWidget, AIRiskPredictionWidget, AIMethodologyWidget } from './AIWidgets';
import { AIConstraintSolverWidget, AIResourceReallocWidget, AIVisionStrategyWidget, AICapabilityGapWidget, AIMethodologyEvolutionWidget } from './AIWidgetsAdvanced';
import { computeCollaborationHealth } from '@/lib/ai/aiCollaborationHealth';
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

      {/* 协作健康度 */}
      <div className="bg-white rounded-xl border border-border shadow-sm">
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
