import React, { useState, useCallback, useMemo } from 'react';
import { X, Sparkles, Zap, UserPlus, Users, ListChecks, UserCheck, Route } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useStore } from '@/store/useStore';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { matchTasksLocal, matchTasksDeep, type MatchResult, type TaskMatchResult } from '@/lib/ai/aiMatcher';
import { loadAIConfig } from '@/lib/ai/types';
import { routeBatchTasks, STRATEGY_LABELS, type RoutingStrategy, type RoutingResult } from '@/lib/ai/aiRoutingEngine';
import { SimpleSelect } from '@/components/ui/simple-select';

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};
const PRIORITY_LABEL: Record<string, string> = { urgent: '紧急', high: '高', medium: '中', low: '低' };

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员', manager: '经理', leader: '负责人', member: '成员',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-orange-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-orange-400';
  return 'bg-red-400';
}

interface AIMatchPanelProps {
  onClose: () => void;
}

type TabKey = 'task' | 'member';

export function AIMatchPanel({ onClose }: AIMatchPanelProps) {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState<TabKey>('task');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [routingStrategy, setRoutingStrategy] = useState<RoutingStrategy>('auto');
  const [routingResults, setRoutingResults] = useState<RoutingResult[] | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  const aiConfig = useMemo(() => loadAIConfig(), []);
  const aiDisabled = !aiConfig.enabled || !aiConfig.apiKey;

  const unassignedCount = useMemo(
    () => state.tasks.filter(t => !t.leaderId && t.status !== 'done' && t.status !== 'cancelled').length,
    [state.tasks],
  );

  const memberMap = useMemo(() => {
    const m = new Map<string, { name: string; role: string }>();
    for (const member of state.members) {
      m.set(member.id, { name: member.name, role: member.role });
    }
    return m;
  }, [state.members]);

  const handleLocalMatch = useCallback(() => {
    setLoading(true);
    try {
      const r = matchTasksLocal(state);
      setResult(r);
    } finally {
      setLoading(false);
    }
  }, [state]);

  const handleDeepMatch = useCallback(async () => {
    setDeepLoading(true);
    try {
      const r = await matchTasksDeep(state);
      setResult(r);
    } finally {
      setDeepLoading(false);
    }
  }, [state]);

  const handleRouteMatch = useCallback(() => {
    setRoutingLoading(true);
    try {
      const unassigned = state.tasks.filter(t => !t.deletedAt && !t.leaderId && t.status !== 'done' && t.status !== 'cancelled');
      if (unassigned.length === 0) { setRoutingResults([]); setRoutingLoading(false); return; }
      const results = routeBatchTasks(unassigned.map(t => t.id), state, routingStrategy);
      setRoutingResults(results);
    } finally {
      setRoutingLoading(false);
    }
  }, [state, routingStrategy]);

  const handleRouteAssign = useCallback((taskId: string, memberId: string) => {
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { leaderId: memberId } } });
  }, [dispatch]);

  const handleRouteAssignAll = useCallback(() => {
    if (!routingResults) return;
    for (const r of routingResults) {
      if (r.taskId && r.memberId && r.confidence >= 60) {
        const task = state.tasks.find(t => t.id === r.taskId);
        if (task && !task.leaderId) {
          dispatch({ type: 'UPDATE_TASK', payload: { id: r.taskId, updates: { leaderId: r.memberId } } });
        }
      }
    }
  }, [routingResults, state.tasks, dispatch]);

  const handleAssign = useCallback((taskId: string, memberId: string) => {
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { leaderId: memberId } } });
  }, [dispatch]);

  const handleAutoAssign = useCallback(() => {
    if (!result) return;
    for (const tm of result.taskMatches) {
      if (tm.topCandidateIdx === 0 && tm.candidates.length > 0) {
        const task = state.tasks.find(t => t.id === tm.taskId);
        if (task && !task.leaderId) {
          dispatch({ type: 'UPDATE_TASK', payload: { id: tm.taskId, updates: { leaderId: tm.candidates[0].memberId } } });
        }
      }
    }
  }, [result, state.tasks, dispatch]);

  const assignedCount = useMemo(() => {
    if (!result) return 0;
    return result.taskMatches.filter(tm => {
      const task = state.tasks.find(t => t.id === tm.taskId);
      return task?.leaderId != null;
    }).length;
  }, [result, state.tasks]);

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex items-center justify-between px-5 py-4 border-b border-border">
          <DialogTitle className="text-lg font-bold">智能匹配</DialogTitle>
          <DialogDescription className="sr-only">智能匹配任务与成员</DialogDescription>
        </DialogHeader>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
          <button onClick={handleLocalMatch} disabled={loading || deepLoading || routingLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            <Sparkles size={14} />
            {loading ? '匹配中...' : '快速匹配'}
          </button>
          {aiDisabled ? (
            <Tooltip><TooltipTrigger asChild><button onClick={handleDeepMatch} disabled={deepLoading || loading || routingLoading || aiDisabled} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Zap size={14} />
              {deepLoading ? '深度分析中...' : '深度匹配'}
            </button></TooltipTrigger><TooltipContent>请先配置 AI</TooltipContent></Tooltip>
          ) : (
            <button onClick={handleDeepMatch} disabled={deepLoading || loading || routingLoading || aiDisabled} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Zap size={14} />
              {deepLoading ? '深度分析中...' : '深度匹配'}
            </button>
          )}
          <div className="h-4 w-px bg-border mx-0.5" />
          <SimpleSelect value={routingStrategy} onValueChange={(v) => setRoutingStrategy(v as RoutingStrategy)} options={Object.entries(STRATEGY_LABELS).map(([k, v]) => ({ value: k, label: v }))} className="h-7 text-xs w-24" />
          <button onClick={handleRouteMatch} disabled={loading || deepLoading || routingLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
            <Route size={14} />
            {routingLoading ? '路由中...' : '路由分配'}
          </button>
          {aiDisabled && <span className="text-[10px] text-muted-foreground">请先配置 AI</span>}
          {result && <span className="ml-auto text-[10px] text-muted-foreground">{result.fromLLM ? 'LLM增强' : '本地匹配'} · 平均{result.qualityMetrics.avgMatchScore}分</span>}
          {routingResults && routingResults.length > 0 && <span className="ml-auto text-[10px] text-muted-foreground">路由策略：{STRATEGY_LABELS[routingStrategy]} · {routingResults.length}个推荐</span>}
        </div>

        {/* Tab switch */}
        <div className="flex px-5 border-b border-border">
          <button onClick={() => setActiveTab('task')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'task' ? 'border-blue-600 text-blue-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <span className="flex items-center gap-1.5"><ListChecks size={14} />任务匹配</span>
          </button>
          <button onClick={() => setActiveTab('member')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'member' ? 'border-blue-600 text-blue-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <span className="flex items-center gap-1.5"><Users size={14} />成员推荐</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {!result && !routingResults && !loading && !deepLoading && !routingLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Sparkles size={32} className="mb-3 opacity-30" />
              <p className="text-sm">点击「快速匹配」、「深度匹配」或「路由分配」开始智能分配</p>
              <p className="text-xs mt-1">当前 {unassignedCount} 个未分配任务</p>
            </div>
          )}

          {(loading || deepLoading || routingLoading) && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm">{routingLoading ? '路由计算中...' : deepLoading ? 'AI 深度分析中...' : '本地匹配计算中...'}</p>
            </div>
          )}

          {routingResults && !routingLoading && !loading && !deepLoading && activeTab === 'task' && (
            routingResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Route size={32} className="mb-3 opacity-30" />
                <p className="text-sm">没有未分配的任务</p>
              </div>
            ) : (
              <div className="space-y-2">
                {routingResults.map((r, idx) => (
                  <RoutingResultCard key={r.taskId ?? idx} result={r} task={state.tasks.find(t => t.id === r.taskId)} onAssign={handleRouteAssign} assigned={state.tasks.find(t => t.id === r.taskId)?.leaderId != null} />
                ))}
              </div>
            )
          )}

          {result && !loading && !deepLoading && !routingLoading && activeTab === 'task' && (
            result.taskMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ListChecks size={32} className="mb-3 opacity-30" />
                <p className="text-sm">没有未分配的任务，所有任务都已指定负责人</p>
              </div>
            ) : (
              <div className="space-y-3">
                {result.taskMatches.map(tm => (
                  <TaskMatchCard key={tm.taskId} match={tm} memberMap={memberMap} onAssign={handleAssign} taskAssigned={state.tasks.find(t => t.id === tm.taskId)?.leaderId != null} />
                ))}
              </div>
            )
          )}

          {result && !loading && !deepLoading && !routingLoading && activeTab === 'member' && (
            result.memberRecommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Users size={32} className="mb-3 opacity-30" />
                <p className="text-sm">暂无成员推荐数据</p>
              </div>
            ) : (
              <div className="space-y-3">
                {result.memberRecommendations.map(mr => (
                  <MemberRecommendCard key={mr.memberId} rec={mr} memberMap={memberMap} />
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        {(result || routingResults) && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
            <div className="text-xs text-muted-foreground">
              {result && <>已分配 <span className="font-medium text-foreground">{assignedCount}</span> / {result.taskMatches.length} 个未分配任务</>}
              {routingResults && routingResults.length > 0 && <>路由推荐 <span className="font-medium text-foreground">{routingResults.filter(r => r.confidence >= 60).length}</span> / {routingResults.length} 个高置信度</>}
            </div>
            <div className="flex items-center gap-2">
              {routingResults && routingResults.length > 0 && (
                <button onClick={handleRouteAssignAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50" disabled={routingResults.filter(r => r.confidence >= 60).length === 0}>
                  <UserCheck size={14} />
                  路由一键分配
                </button>
              )}
              {result && (
                <button onClick={handleAutoAssign} disabled={assignedCount >= result.taskMatches.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50">
                  <UserCheck size={14} />
                  一键自动分配
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface TaskMatchCardProps {
  match: TaskMatchResult;
  memberMap: Map<string, { name: string; role: string }>;
  onAssign: (taskId: string, memberId: string) => void;
  taskAssigned: boolean;
}

function TaskMatchCard({ match, memberMap, onAssign, taskAssigned }: TaskMatchCardProps) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${taskAssigned ? 'border-green-200 bg-green-50/40' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium flex-1 truncate">{match.taskTitle}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[match.taskPriority] ?? PRIORITY_BADGE.medium}`}>
          {PRIORITY_LABEL[match.taskPriority] ?? match.taskPriority}
        </span>
        {taskAssigned && <span className="text-[10px] text-green-600 font-medium">已分配</span>}
      </div>
      {match.candidates.length === 0 ? (
        <EmptyState title="无候选人" compact />
      ) : (
        <div className="space-y-1.5">
          {match.candidates.map((c, idx) => {
            const isTop = idx === match.topCandidateIdx;
            return (
              <div key={c.memberId} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${isTop && !taskAssigned ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-muted/50'}`}>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {isTop && !taskAssigned && <span className="text-[9px] text-blue-500 font-bold flex-shrink-0">TOP</span>}
                  <span className="text-xs font-medium truncate">{c.memberName}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`inline-block w-5 h-5 rounded-full ${scoreBg(c.totalScore)} flex items-center justify-center text-[9px] text-white font-bold`}>
                      {c.totalScore}
                    </span>
                    <span className={`text-xs font-medium ${scoreColor(c.totalScore)}`}>{c.totalScore}分</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-x-2">
                    {c.explanations.map(e => (
                      <span key={e.dimension} className="text-[10px] text-muted-foreground truncate">
                        {e.dimension}:<span className={scoreColor(e.contribution)}>{e.contribution}</span>
                      </span>
                    ))}
                  </div>
                </div>
                {!taskAssigned && (
                  <button onClick={() => onAssign(match.taskId, c.memberId)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0">
                    <UserPlus size={10} />分配
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface MemberRecommendCardProps {
  rec: {
    memberId: string;
    memberName: string;
    recommendedTasks: Array<{
      taskId: string;
      taskTitle: string;
      taskPriority: string;
      matchScore: number;
      reason: string;
    }>;
    growthSuggestions: string[];
  };
  memberMap: Map<string, { name: string; role: string }>;
}

function MemberRecommendCard({ rec, memberMap }: MemberRecommendCardProps) {
  const info = memberMap.get(rec.memberId);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium">{rec.memberName}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {info ? ROLE_LABEL[info.role] ?? info.role : ''}
        </span>
      </div>
      {rec.recommendedTasks.length > 0 && (
        <div className="space-y-1 mb-2">
          {rec.recommendedTasks.slice(0, 5).map(task => (
            <div key={task.taskId} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
              <span className="text-xs font-medium truncate flex-1">{task.taskTitle}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_BADGE[task.taskPriority] ?? PRIORITY_BADGE.medium}`}>
                {PRIORITY_LABEL[task.taskPriority] ?? task.taskPriority}
              </span>
              <span className={`text-xs font-medium flex-shrink-0 ${scoreColor(task.matchScore)}`}>{task.matchScore}分</span>
              <Tooltip><TooltipTrigger asChild><span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{task.reason}</span></TooltipTrigger><TooltipContent>{task.reason}</TooltipContent></Tooltip>
            </div>
          ))}
        </div>
      )}
      {rec.growthSuggestions.length > 0 && (
        <div className="border-t border-border/50 pt-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">成长建议：</span>
          {rec.growthSuggestions.map((s, i) => (
            <p key={i} className="text-[10px] text-muted-foreground mt-0.5">{s}</p>
          ))}
        </div>
      )}
    </div>
  );
}

interface RoutingResultCardProps {
  result: RoutingResult;
  task: { id: string; title: string; priority: string; leaderId: string | null } | undefined;
  onAssign: (taskId: string, memberId: string) => void;
  assigned: boolean;
}

function RoutingResultCard({ result, task, onAssign, assigned }: RoutingResultCardProps) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${assigned ? 'border-green-200 bg-green-50/40' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium flex-1 truncate">{task?.title ?? '未知任务'}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">
          {STRATEGY_LABELS[result.strategy] ?? result.strategy}
        </span>
        {assigned && <span className="text-[10px] text-green-600 font-medium">已分配</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-medium truncate">{result.memberName || '无推荐'}</span>
          {result.confidence > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`inline-block w-5 h-5 rounded-full ${result.confidence >= 70 ? 'bg-green-500' : result.confidence >= 40 ? 'bg-orange-400' : 'bg-red-400'} flex items-center justify-center text-[9px] text-white font-bold`}>
                {result.confidence}
              </span>
              <span className={`text-xs font-medium ${result.confidence >= 70 ? 'text-green-600' : result.confidence >= 40 ? 'text-orange-500' : 'text-red-500'}`}>
                {result.confidence}%
              </span>
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{result.reason ?? ''}</span>
        {!assigned && result.memberId && (
          <button onClick={() => onAssign(result.taskId ?? '', result.memberId)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0">
            <UserPlus size={10} />分配
          </button>
        )}
      </div>
      {result.scoreBreakdown && (
        <div className="flex gap-x-3 mt-1.5">
          <span className="text-[10px] text-muted-foreground">能力:<span className={scoreColor(result.scoreBreakdown.ability)}>{result.scoreBreakdown.ability}</span></span>
          <span className="text-[10px] text-muted-foreground">负荷:<span className={scoreColor(result.scoreBreakdown.load)}>{result.scoreBreakdown.load}</span></span>
          <span className="text-[10px] text-muted-foreground">经验:<span className={scoreColor(result.scoreBreakdown.experience)}>{result.scoreBreakdown.experience}</span></span>
          <span className="text-[10px] text-muted-foreground">成长:<span className={scoreColor(result.scoreBreakdown.growth)}>{result.scoreBreakdown.growth}</span></span>
        </div>
      )}
    </div>
  );
}
