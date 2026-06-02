import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, X, FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { generateReviewLocal, generateReviewDeep } from '@/lib/ai/aiReviewGenerator';
import type { ReviewResult, ReviewSection, OKRFeedback } from '@/lib/ai/aiReviewGenerator';
import { useStore } from '@/store/useStore';

interface AIReviewPanelProps {
  goalId?: string;
  onClose?: () => void;
}

type PanelState = 'idle' | 'generating' | 'result' | 'error';

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-orange-500';
  return 'text-red-500';
}

function scoreRingStroke(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f97316';
  return '#ef4444';
}

function krBarColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-orange-400';
  if (score >= 0.3) return 'bg-yellow-400';
  return 'bg-red-500';
}

function priorityBadge(priority: 'high' | 'medium' | 'low'): { cls: string; label: string } {
  switch (priority) {
    case 'high': return { cls: 'bg-red-100 text-red-700', label: '高优先' };
    case 'medium': return { cls: 'bg-orange-100 text-orange-700', label: '中优先' };
    case 'low': return { cls: 'bg-gray-100 text-gray-600', label: '低优先' };
  }
}

function TrendIcon({ trend }: { trend?: 'up' | 'down' | 'stable' }) {
  if (!trend) return null;
  if (trend === 'up') return <TrendingUp size={14} className="text-emerald-500" />;
  if (trend === 'down') return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const stroke = scoreRingStroke(score);
  return (
    <div className="relative flex items-center justify-center">
      <svg width={96} height={96} className="-rotate-90">
        <circle cx={48} cy={48} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
        <circle cx={48} cy={48} r={r} fill="none" stroke={stroke} strokeWidth={6} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className={`absolute text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

function ExpandableSection({ section }: { section: ReviewSection }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium text-sm">{section.title}</span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{section.content}</p>
          {section.metrics && section.metrics.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3">
              {section.metrics.map((m, i) => (
                <div key={i} className="bg-gray-50 rounded-md px-3 py-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">{m.label}</span>
                  <span className="text-sm font-semibold">{m.value}</span>
                  <TrendIcon trend={m.trend} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KRFeedbackCard({ feedback, memberName }: { feedback: OKRFeedback; memberName?: string }) {
  const pct = Math.round(feedback.score * 100);
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium truncate mr-2">{feedback.krTitle}</span>
        <span className={`text-sm font-bold ${scoreColor(pct)}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all duration-500 ${krBarColor(feedback.score)}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mb-1">{feedback.scoreExplanation}</p>
      <div className="mt-2 border-l-2 border-indigo-300 pl-3">
        <p className="text-xs text-gray-600"><span className="font-medium">经验：</span>{feedback.lesson}</p>
      </div>
      <div className="mt-1 border-l-2 border-amber-300 pl-3">
        <p className="text-xs text-gray-600"><span className="font-medium">建议：</span>{feedback.nextCycleSuggestion}</p>
      </div>
    </div>
  );
}

export default function AIReviewPanel({ goalId, onClose }: AIReviewPanelProps) {
  const { state, dispatch } = useStore();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(goalId ?? null);
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const eligibleGoals = useMemo(
    () => state.goals.filter(g => g.status === 'in_progress' || g.status === 'done'),
    [state.goals]
  );

  const activeGoalId = selectedGoalId;
  const activeGoal = useMemo(
    () => (activeGoalId ? state.goals.find(g => g.id === activeGoalId) : undefined) ?? null,
    [state.goals, activeGoalId]
  );

  const handleGenerate = useCallback(async (deep: boolean) => {
    if (!activeGoalId) return;
    setPanelState('generating');
    setErrorMsg('');
    try {
      let res: ReviewResult | null;
      if (deep) {
        res = await generateReviewDeep(state, activeGoalId);
      } else {
        res = generateReviewLocal(state, activeGoalId);
      }
      if (!res) {
        setPanelState('error');
        setErrorMsg('该目标暂无足够数据生成复盘');
        return;
      }
      setResult(res);
      setPanelState('result');
    } catch (e: unknown) {
      setPanelState('error');
      setErrorMsg(e instanceof Error ? e.message : '生成失败');
    }
  }, [state, activeGoalId]);

  const handleRetry = useCallback(() => {
    setPanelState('idle');
    setErrorMsg('');
    setResult(null);
  }, []);

  const handleWriteTask = useCallback((action: string, priority: 'high' | 'medium' | 'low', assignee: string | null) => {
    dispatch({
      type: 'ADD_TASK',
      payload: {
        title: action,
        description: '由智能复盘自动生成',
        projectId: null,
        goalId: activeGoalId ?? null,
        parentId: null,
        status: 'todo',
        priority,
        leaderId: assignee ?? '',
        supporterIds: [],
        tags: [],
        category: '',
        startDate: null,
        dueDate: null,
        reminderDate: null,
        completedAt: null,
        subtasks: [],
        attachments: [],
        trackingRecords: [],
        repeatCycle: 'none',
        blockedBy: [],
        sprintId: null,
        summary: '',
      },
    });
  }, [dispatch, activeGoalId]);

  const isEmbedded = !!goalId;

  return (
    <div className={`bg-card ${isEmbedded ? '' : 'min-h-screen p-6'}`}>
      <div className={`${isEmbedded ? '' : 'max-w-3xl mx-auto'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-indigo-500" />
            <h2 className="text-lg font-semibold">智能复盘</h2>
          </div>
          {onClose && (
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Goal selector (when no goalId prop) */}
        {!goalId && (
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">选择目标</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={selectedGoalId ?? ''}
                onChange={e => setSelectedGoalId(e.target.value || null)}
              >
                <option value="">-- 选择 --</option>
                {eligibleGoals.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={!activeGoalId || panelState === 'generating'}
              onClick={() => handleGenerate(false)}
            >
              生成本地复盘
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={!activeGoalId || panelState === 'generating'}
              onClick={() => handleGenerate(true)}
            >
              深度复盘
            </button>
          </div>
        )}

        {/* Embedded mode: show buttons even with goalId */}
        {goalId && panelState === 'idle' && (
          <div className="flex gap-3 mb-6">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              disabled={panelState === 'generating'}
              onClick={() => handleGenerate(false)}
            >
              生成本地复盘
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
              disabled={panelState === 'generating'}
              onClick={() => handleGenerate(true)}
            >
              深度复盘
            </button>
          </div>
        )}

        {/* Generating */}
        {panelState === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="text-indigo-500 animate-spin mb-3" />
            <p className="text-sm text-gray-500">正在生成复盘报告…</p>
          </div>
        )}

        {/* Error */}
        {panelState === 'error' && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-red-500 mb-4">{errorMsg}</p>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              onClick={handleRetry}
            >
              <RefreshCw size={14} />
              重试
            </button>
          </div>
        )}

        {/* Result */}
        {panelState === 'result' && result && (
          <div className="space-y-6">
            {/* Goal title + LLM badge */}
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold">{result.goalTitle}</h3>
              {result.fromLLM && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">LLM增强</span>
              )}
              <span className="text-xs text-gray-400">{new Date(result.generatedAt).toLocaleString()}</span>
            </div>

            {/* Score ring */}
            <div className="flex items-center gap-6">
              <ScoreRing score={result.overallScore} />
              <div>
                <p className="text-sm font-medium">总体评分</p>
                <p className="text-xs text-gray-500">
                  {result.overallScore >= 80 ? '优秀' : result.overallScore >= 60 ? '良好' : '需改进'}
                </p>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-2">
              {result.sections.map((s, i) => (
                <ExpandableSection key={i} section={s} />
              ))}
            </div>

            {/* OKR Feedback */}
            {result.okrFeedback.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">KR 评分</h4>
                <div className="space-y-3">
                  {result.okrFeedback.map((fb, i) => (
                    <KRFeedbackCard key={i} feedback={fb} />
                  ))}
                </div>
              </div>
            )}

            {/* Extracted Lessons */}
            {result.extractedLessons.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">经验沉淀</h4>
                <div className="space-y-2">
                  {result.extractedLessons.map((lesson, i) => (
                    <blockquote
                      key={i}
                      className="border-l-4 border-indigo-400 bg-indigo-50 pl-4 py-2 text-sm text-gray-700 italic"
                    >
                      {lesson}
                    </blockquote>
                  ))}
                </div>
              </div>
            )}

            {/* Action Items */}
            {result.actionItems.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">行动项</h4>
                <div className="space-y-2">
                  {result.actionItems.map((item, i) => {
                    const badge = priorityBadge(item.priority);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 border rounded-lg px-4 py-3"
                      >
                        <span className="text-sm flex-1">{item.action}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                        {item.assignee && (
                          <span className="text-xs text-gray-500">
                            {state.members.find(m => m.id === item.assignee)?.name ?? item.assignee}
                          </span>
                        )}
                        <button
                          type="button"
                          className="text-xs px-3 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                          onClick={() => handleWriteTask(item.action, item.priority, item.assignee)}
                        >
                          写入任务
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
