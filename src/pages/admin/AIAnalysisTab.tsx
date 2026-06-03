/**
 * AIAnalysisTab - AI 智能分析仪表盘
 * 展示健康度、风险预警、效率指标、AI 洞察
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Brain, Heart, AlertTriangle, TrendingUp, Lightbulb, Loader2,
  RefreshCw, ChevronDown, ChevronRight, Bot, User, ArrowUpRight, ArrowDownRight, Minus,
  BarChart3, Target, FolderKanban, CheckCircle2, XCircle, Clock, Ban, UserX,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStore } from '@/store/useStore';
import { collectSnapshot, analyzeTeam, generateLocalInsights, getAIInsights, loadAIConfig, PERIOD_LABELS, HEALTH_LEVEL_LABELS, HEALTH_LEVEL_COLORS, HEALTH_LEVEL_BG, RISK_SEVERITY_LABELS, RISK_SEVERITY_COLORS, RISK_TYPE_LABELS } from '@/lib/ai';
import type { AnalysisPeriod, TeamAnalysis, AIInsight, HealthScore, RiskItem, MemberAnalysis } from '@/lib/ai';
import type { Goal, Project, Task } from '@/types';

const CARD = 'bg-card rounded-xl border border-border p-4 space-y-3';
const STAT_CARD = 'bg-card rounded-xl border border-border p-4';

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: typeof Heart; color?: string }) {
  return (
    <div className={STAT_CARD}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon size={16} className={color || 'text-muted-foreground'} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function HealthRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const r = (size - 8) / 2;
  const c = Math.PI * r * 2;
  const offset = c - (score / 100) * c;
  const color = score >= 85 ? '#22c55e' : score >= 70 ? '#3b82f6' : score >= 50 ? '#eab308' : score >= 30 ? '#f97316' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1 relative">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-bold" style={{ marginTop: -8 }}>{score}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TrendIcon({ trend }: { trend: 'up' | 'stable' | 'down' }) {
  if (trend === 'up') return <ArrowUpRight size={14} className="text-green-500" />;
  if (trend === 'down') return <ArrowDownRight size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

function RiskBadge({ severity }: { severity: RiskItem['severity'] }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${RISK_SEVERITY_COLORS[severity]}`}>
      {RISK_SEVERITY_LABELS[severity]}
    </span>
  );
}

function RiskIcon({ type }: { type: RiskItem['type'] }) {
  const map: Record<string, typeof Clock> = { overdue: Clock, stalled: XCircle, blocked: Ban, overloaded: UserX, no_leader: User, kr_off_track: AlertTriangle };
  const Icon = map[type] || AlertTriangle;
  return <Icon size={14} className="text-muted-foreground flex-shrink-0" />;
}

function InsightCard({ insight, onExecute, handled }: { insight: AIInsight; onExecute?: (insight: AIInsight) => void; handled?: boolean }) {
  const [open, setOpen] = useState(false);
  const typeConfig: Record<string, { icon: typeof Heart; color: string; bg: string }> = {
    health: { icon: Heart, color: 'text-red-500', bg: 'bg-red-50' },
    risk: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
    efficiency: { icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-50' },
    improvement: { icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-50' },
  };
  const cfg = typeConfig[insight.type] || typeConfig.improvement;
  const Icon = cfg.icon;
  return (
    <div className={`border rounded-lg overflow-hidden ${handled ? 'opacity-40' : ''} ${insight.fromLLM ? 'border-purple-200 bg-purple-50/30' : 'border-border bg-card'}`}>
      <div onClick={() => setOpen(!open)} className="w-full flex items-start gap-2.5 p-3 text-left hover:bg-muted/30 transition-colors cursor-pointer">
        <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon size={14} className={cfg.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{insight.title}</span>
            {insight.fromLLM && <span className="flex items-center gap-0.5 text-xs text-purple-500"><Bot size={10} />AI</span>}
            {insight.suggestedAction && !handled && (
              <button className="ml-auto px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90" onClick={e => { e.stopPropagation(); onExecute?.(insight); }}>{insight.suggestedAction.label}</button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{insight.content}</p>
        </div>
        {open ? <ChevronDown size={14} className="text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronRight size={14} className="text-muted-foreground flex-shrink-0 mt-1" />}
      </div>
      {open && insight.actions.length > 0 && (
        <div className="px-3 pb-3 pl-12 space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-1">建议操作：</div>
          {insight.actions.map((a, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="text-primary mt-0.5">&#8226;</span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberCard({ m }: { m: MemberAnalysis }) {
  const h = m.health;
  const e = m.efficiency;
  return (
    <div className={`border rounded-lg p-3 ${HEALTH_LEVEL_BG[h.level]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{m.memberName}</span>
          <span className="text-xs text-muted-foreground">{m.role}</span>
        </div>
        <span className={`text-sm font-bold ${HEALTH_LEVEL_COLORS[h.level]}`}>{h.overall}分</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div>目标 <span className="font-medium text-foreground">{e.activeGoals}</span></div>
        <div>项目 <span className="font-medium text-foreground">{e.activeProjects}</span></div>
        <div>任务 <span className="font-medium text-foreground">{e.activeTasks}</span></div>
        <div>完成 <span className="font-medium text-green-600">{e.completedTasks}</span></div>
        <div>逾期 <span className={`font-medium ${e.overdueTasks > 0 ? 'text-red-600' : ''}`}>{e.overdueTasks}</span></div>
        <div>阻塞 <span className={`font-medium ${e.blockedTasks > 0 ? 'text-amber-600' : ''}`}>{e.blockedTasks}</span></div>
      </div>
      {m.risks.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50">
          {m.risks.slice(0, 2).map(r => (
            <div key={r.id} className="flex items-center gap-1 text-xs text-muted-foreground">
              <RiskIcon type={r.type} />
              <span className="truncate">{r.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RISK_ITEM_ICONS: Record<string, typeof Target> = {
  goal: Target, project: FolderKanban, task: CheckCircle2,
};

export default function AIAnalysisTab({ viewingMemberId, isTeamView }: { viewingMemberId?: string | null; isTeamView?: boolean }) {
  const { state, dispatch } = useStore();
  const [period, setPeriod] = useState<AnalysisPeriod>('weekly');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [result, setResult] = useState<TeamAnalysis | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [showMembers, setShowMembers] = useState(true);
  const [showRisks, setShowRisks] = useState(true);
  const [activeInsightType, setActiveInsightType] = useState<string>('all');
  const [handledInsightIds, setHandledInsightIds] = useState<Set<string>>(new Set());

  const aiConfig = loadAIConfig();

  // Filter state by viewing member when in personal view
  const filteredState = useMemo(() => {
    if (isTeamView || !viewingMemberId) return state;
    const mid = viewingMemberId;
    const memberFilter = (items: (Goal | Project | Task)[], field: string) =>
      items.filter((it) => String((it as Record<string, unknown>)[field]) === mid || (it.supporterIds ?? []).includes(mid));
    return {
      ...state,
      goals: memberFilter(state.goals, 'leaderId'),
      projects: memberFilter(state.projects, 'leaderId'),
      tasks: memberFilter(state.tasks, 'leaderId'),
    };
  }, [state, isTeamView, viewingMemberId]);

  const runAnalysis = useCallback(() => {
    setAnalyzing(true);
    setAiError('');
    setTimeout(() => {
      try {
        const snap = collectSnapshot(filteredState, period);
        const team = analyzeTeam(snap);
        setResult(team);
        const localInsights = generateLocalInsights(team);
        setInsights(localInsights);
        if (aiConfig.enabled && aiConfig.apiKey) {
          setAiLoading(true);
          getAIInsights(snap, team).then((aiInsights) => {
            if (aiInsights.length > 0) setInsights(prev => [...prev, ...aiInsights]);
            setAiLoading(false);
          }).catch((err: unknown) => {
            setAiError(err instanceof Error ? err.message : 'AI 分析失败');
            setAiLoading(false);
          });
        }
      } finally {
        setAnalyzing(false);
      }
    }, 50);
  }, [filteredState, period, aiConfig.enabled, aiConfig.apiKey]);

  const handleExecuteInsight = useCallback((insight: AIInsight) => {
    if (!insight.suggestedAction) return;
    const { payload } = insight.suggestedAction;
    if (insight.suggestedAction.type === 'update_status') {
      const actionType = payload.itemType === 'goal' ? 'UPDATE_GOAL' : payload.itemType === 'project' ? 'UPDATE_PROJECT' : 'UPDATE_TASK';
      dispatch({ type: actionType as 'UPDATE_GOAL' | 'UPDATE_PROJECT' | 'UPDATE_TASK', payload: { id: payload.itemId, updates: { status: payload.newStatus } } });
    }
    setHandledInsightIds(prev => new Set(prev).add(insight.id));
  }, [dispatch]);

  // 首次自动分析
  const hasData = filteredState.goals.length > 0 || filteredState.projects.length > 0 || filteredState.tasks.length > 0;
  useEffect(() => {
    if (hasData && !result) runAnalysis();
  }, [hasData, result, runAnalysis]);

  const filteredInsights = activeInsightType === 'all'
    ? insights
    : insights.filter(i => i.type === activeInsightType);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Brain size={48} className="opacity-30" />
        <div className="text-sm">暂无业务数据</div>
        <div className="text-xs">请先创建目标、项目或任务后查看 AI 分析</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Brain size={24} className="text-primary" />
          <div>
            <h2 className="text-lg font-semibold">AI 智能分析</h2>
            <p className="text-xs text-muted-foreground">基于目标-项目-任务体系的深度业务分析</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 周期选择 */}
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(Object.keys(PERIOD_LABELS) as AnalysisPeriod[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-2.5 py-1 text-xs rounded-md transition-colors ${period === p ? 'bg-card shadow-sm font-medium' : 'hover:bg-white/50'}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button onClick={runAnalysis} disabled={analyzing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50">
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新分析
          </button>
        </div>
      </div>

      {!result ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* 健康度总览 */}
          <div className={CARD}>
            <div className="flex items-center gap-2 mb-4">
              <Heart size={16} className="text-red-500" />
              <h3 className="text-sm font-semibold">健康度评估</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${HEALTH_LEVEL_COLORS[result.health.level]} font-medium`}>
                {HEALTH_LEVEL_LABELS[result.health.level]}
              </span>
            </div>
            <div className="flex items-center justify-around py-4">
              <HealthRing score={result.health.overall} label="整体" size={100} />
              <HealthRing score={result.health.goals} label="目标" size={72} />
              <HealthRing score={result.health.projects} label="项目" size={72} />
              <HealthRing score={result.health.tasks} label="任务" size={72} />
            </div>
          </div>

          {/* 效率指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={CheckCircle2} color="text-green-500"
              label="完成率" value={`${result.efficiency.completionRate}%`}
              sub={`按期率 ${result.efficiency.onTimeRate}%`}
            />
            <StatCard
              icon={BarChart3} color="text-blue-500"
              label="活跃任务" value={result.efficiency.activeTasks}
              sub={`新增 ${result.efficiency.newTasksInPeriod} / 完成 ${result.efficiency.completedTasksInPeriod}`}
            />
            <StatCard
              icon={AlertTriangle} color="text-orange-500"
              label="逾期任务" value={result.efficiency.overdueTasks}
              sub={`阻塞 ${result.efficiency.blockedTasks}`}
            />
            <StatCard
              icon={TrendingUp} color={result.efficiency.trend === 'up' ? 'text-green-500' : result.efficiency.trend === 'down' ? 'text-red-500' : 'text-gray-400'}
              label="效率趋势" value={result.efficiency.trend === 'up' ? '上升' : result.efficiency.trend === 'down' ? '下降' : '持平'}
              sub={`目标 ${result.efficiency.activeGoals} | 项目 ${result.efficiency.activeProjects}`}
            />
          </div>

          {/* 风险预警 */}
          {result.risks.length > 0 && (
            <div className={CARD}>
              <button onClick={() => setShowRisks(!showRisks)} className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-orange-500" />
                  <h3 className="text-sm font-semibold">风险预警</h3>
                  <span className="text-xs text-muted-foreground">{result.risks.length} 项</span>
                  {result.risks.filter(r => r.severity === 'high').length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">{result.risks.filter(r => r.severity === 'high').length} 高风险</span>
                  )}
                </div>
                {showRisks ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {showRisks && (
                <div className="space-y-2">
                  {result.risks.slice(0, 10).map((risk) => {
                    const ItemIcon = RISK_ITEM_ICONS[risk.itemType] || CheckCircle2;
                    return (
                      <div key={risk.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="mt-0.5 flex-shrink-0"><ItemIcon size={14} className="text-muted-foreground" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <RiskBadge severity={risk.severity} />
                            <span className="text-xs text-muted-foreground">{RISK_TYPE_LABELS[risk.type]}</span>
                            <span className="text-xs text-muted-foreground">|</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{risk.memberName}</span>
                          </div>
                          <p className="text-sm mt-0.5">{risk.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">建议：{risk.suggestion}</p>
                        </div>
                      </div>
                    );
                  })}
                  {result.risks.length > 10 && (
                    <div className="text-xs text-muted-foreground text-center py-2">还有 {result.risks.length - 10} 项风险...</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI 分析错误提示 */}
          {aiError && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-amber-800">AI 深度分析暂不可用</div>
                <div className="text-xs text-amber-600 mt-0.5">本地分析洞察（上方）仍然正常显示。如需 AI 增强分析，请检查：</div>
                <ul className="text-xs text-amber-700 mt-1 list-disc list-inside space-y-0.5">
                  <li>管理中心 &rarr; 设置 中 AI 模型的 API Key 是否已配置且有效</li>
                  <li>所选模型端点（DeepSeek/豆包）当前是否可访问</li>
                  <li>网络连接是否正常，可稍后重试</li>
                </ul>
                <button className="text-xs text-amber-700 underline mt-1.5" onClick={() => { setAiError(''); runAnalysis(); }}>重新尝试</button>
              </div>
            </div>
          )}

          {/* AI 洞察 */}
          <div className={CARD}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-500" />
                <h3 className="text-sm font-semibold">分析洞察</h3>
                {aiLoading && <Loader2 size={14} className="animate-spin text-purple-500" />}
                {insights.some(i => i.fromLLM) && !aiConfig.enabled && (
                  <span className="text-xs text-purple-500 flex items-center gap-0.5"><Bot size={10} />AI 增强</span>
                )}
              </div>
              {/* 洞察类型筛选 */}
              <div className="flex gap-1">
                {[
                  { key: 'all', label: '全部' },
                  { key: 'risk', label: '风险' },
                  { key: 'health', label: '健康' },
                  { key: 'efficiency', label: '效率' },
                  { key: 'improvement', label: '改进' },
                ].map(f => (
                  <button key={f.key} onClick={() => setActiveInsightType(f.key)} className={`px-2 py-0.5 text-xs rounded ${activeInsightType === f.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {filteredInsights.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">暂无洞察</div>
            ) : (
              <div className="space-y-2">
                {filteredInsights.map(ins => <InsightCard key={ins.id} insight={ins} onExecute={handleExecuteInsight} handled={handledInsightIds.has(ins.id)} />)}
              </div>
            )}
          </div>

          {/* 成员分析 */}
          <div className={CARD}>
            <button onClick={() => setShowMembers(!showMembers)} className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <User size={16} className="text-blue-500" />
                <h3 className="text-sm font-semibold">成员分析</h3>
                <span className="text-xs text-muted-foreground">{result.members.length} 人</span>
              </div>
              {showMembers ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {showMembers && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.members
                  .sort((a, b) => a.health.overall - b.health.overall)
                  .map(m => <MemberCard key={m.memberId} m={m} />)}
              </div>
            )}
          </div>

          {/* 分析时间 */}
          <div className="text-center text-xs text-muted-foreground pb-4">
            分析时间：{new Date(result.analyzedAt).toLocaleString('zh-CN')}
            {insights.some(i => i.fromLLM) && ' · 包含 AI 深度分析'}
          </div>
        </>
      )}
    </div>
  );
}
