import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { ReviewModelLibrary } from '@/components/ReviewModelLibrary';
import { ReviewSessionWizard } from '@/components/ReviewSessionWizard';
import { getReviewModel, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/reviewModelRegistry';
import type { ReviewModel, ReviewSession, ReviewActionItem } from '@/types';
import { BookOpen, Clock, CheckCircle, Plus, Trash2, Target, ListChecks, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

const ACTION_STATUS_LABELS: Record<ReviewActionItem['status'], string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  verified: '已验证',
};

const ACTION_STATUS_COLORS: Record<ReviewActionItem['status'], string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  verified: 'bg-purple-100 text-purple-700',
};

export function ReviewCenterTab() {
  const { state, dispatch } = useStore();
  const [showModelLibrary, setShowModelLibrary] = useState(false);
  const [activeModel, setActiveModel] = useState<ReviewModel | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const sessions = state.reviewSessions || [];
  const recentSessions = sessions.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Action item tracking stats
  const allActionItems = useMemo(() =>
    sessions.flatMap(s => (s.actionItems || []).map(a => ({ ...a, sessionId: s.id, modelId: s.modelId }))),
    [sessions]
  );
  const actionStats = useMemo(() => ({
    total: allActionItems.length,
    pending: allActionItems.filter(a => a.status === 'pending').length,
    inProgress: allActionItems.filter(a => a.status === 'in_progress').length,
    completed: allActionItems.filter(a => a.status === 'completed').length,
    verified: allActionItems.filter(a => a.status === 'verified').length,
  }), [allActionItems]);
  const completionRate = actionStats.total > 0
    ? ((actionStats.completed + actionStats.verified) / actionStats.total * 100).toFixed(0)
    : '0';

  // Unfinished items (for alerts)
  const unfinishedItems = useMemo(() =>
    allActionItems.filter(a => a.status === 'pending' || a.status === 'in_progress'),
    [allActionItems]
  );

  function handleSelectModel(model: ReviewModel) {
    setActiveModel(model);
    setShowModelLibrary(false);
  }

  function handleSessionComplete(session: ReviewSession) {
    setActiveModel(null);
    setSelectedSessionId(session.id);
  }

  function handleDeleteSession(id: string) {
    dispatch({ type: 'DELETE_REVIEW_SESSION', payload: id });
    if (selectedSessionId === id) setSelectedSessionId(null);
  }

  function handleUpdateActionItem(sessionId: string, actionItemId: string, updates: Partial<ReviewActionItem>) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const updatedItems = session.actionItems.map(a =>
      a.id === actionItemId ? { ...a, ...updates } : a
    );
    dispatch({
      type: 'UPDATE_REVIEW_SESSION',
      payload: { id: sessionId, updates: { actionItems: updatedItems } },
    });
  }

  function handleLinkToTask(sessionId: string, actionItemId: string, taskId: string) {
    handleUpdateActionItem(sessionId, actionItemId, { linkedTaskId: taskId, status: 'in_progress' });
  }

  function handleMarkCompleted(sessionId: string, actionItemId: string) {
    handleUpdateActionItem(sessionId, actionItemId, { status: 'completed' });
  }

  function handleMarkVerified(sessionId: string, actionItemId: string) {
    handleUpdateActionItem(sessionId, actionItemId, { status: 'verified', verifiedAt: new Date().toISOString() });
  }

  const selectedSession = sessions.find(s => s.id === selectedSessionId);
  const selectedModel = selectedSession ? getReviewModel(selectedSession.modelId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">复盘中心</h3>
        <button
          onClick={() => setShowModelLibrary(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> 发起复盘
        </button>
      </div>

      {/* Action Item Tracking Dashboard (R2-5) */}
      {allActionItems.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <ListChecks size={14} className="text-primary" />
            <span className="text-xs font-semibold">行动项追踪</span>
            <span className="text-[10px] text-muted-foreground">完成率 {completionRate}%</span>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-gray-600">待处理: {actionStats.pending}</span>
            <span className="text-blue-600">进行中: {actionStats.inProgress}</span>
            <span className="text-emerald-600">已完成: {actionStats.completed}</span>
            <span className="text-purple-600">已验证: {actionStats.verified}</span>
          </div>
          {/* Unfinished items alert */}
          {unfinishedItems.length > 0 && (
            <div className="border border-amber-200 rounded p-2 bg-amber-50 flex items-start gap-2">
              <AlertTriangle size={12} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[10px] text-amber-800">
                <span className="font-medium">{unfinishedItems.length} 个行动项未闭环：</span>
                {unfinishedItems.slice(0, 3).map((item, i) => (
                  <span key={item.id}>「{item.content.slice(0, 15)}{item.content.length > 15 ? '...' : ''}」{i < Math.min(unfinishedItems.length, 3) - 1 ? '、' : ''}</span>
                ))}
                {unfinishedItems.length > 3 && <span>等 {unfinishedItems.length} 项</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions.length === 0 && !showModelLibrary && (
        <EmptyState title="暂无复盘记录，点击「发起复盘」选择模型开始" compact />
      )}

      {recentSessions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">历史复盘</h4>
          <div className="space-y-1">
            {recentSessions.map(session => {
              const model = getReviewModel(session.modelId);
              if (!model) return null;
              const isExpanded = expandedSession === session.id;
              const actionItems = session.actionItems || [];
              const completedActions = actionItems.filter(a => a.status === 'completed' || a.status === 'verified').length;

              return (
                <div key={session.id} className="border rounded-lg">
                  <div
                    onClick={() => { setSelectedSessionId(session.id); setExpandedSession(isExpanded ? null : session.id); }}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <BookOpen size={14} className="text-primary shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{model.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[model.category]}`}>
                      {CATEGORY_LABELS[model.category]}
                    </span>
                    {actionItems.length > 0 && (
                      <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                        <Target size={9} /> {completedActions}/{actionItems.length}
                      </span>
                    )}
                    <span className={`text-[10px] flex items-center gap-0.5 ${
                      session.status === 'completed' ? 'text-green-600' : 'text-blue-600'
                    }`}>
                      {session.status === 'completed' ? <CheckCircle size={10} /> : <Clock size={10} />}
                      {session.status === 'completed' ? '已完成' : '进行中'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteSession(session.id); }}
                      className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                      aria-label="删除复盘"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Expanded session detail with action items */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 animate-fade-in border-t">
                      {/* Steps */}
                      {model.steps.map(step => {
                        const key = `step_${step.index}`;
                        const value = session.inputs[key];
                        return (
                          <div key={step.index} className="border-l-2 border-primary/30 pl-3 mt-2">
                            <div className="text-[11px] font-semibold text-muted-foreground">
                              {step.index}. {step.title}
                            </div>
                            <div className="text-xs mt-0.5">
                              {Array.isArray(value) ? (
                                <ul className="list-disc list-inside space-y-0.5">
                                  {value.map((v, i) => <li key={i}>{v}</li>)}
                                </ul>
                              ) : (
                                <span className="whitespace-pre-wrap">{value || '-'}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* AI Insights */}
                      {session.aiInsights && (
                        <div className="border-t pt-2">
                          <h5 className="text-[11px] font-semibold text-primary mb-1">AI 洞察</h5>
                          <p className="text-xs whitespace-pre-wrap">{session.aiInsights}</p>
                        </div>
                      )}

                      {/* Action Items with tracking (R2-5) */}
                      {actionItems.length > 0 && (
                        <div className="border-t pt-2">
                          <h5 className="text-[11px] font-semibold mb-2 flex items-center gap-1">
                            <Target size={11} className="text-primary" />
                            行动项 ({completedActions}/{actionItems.length})
                          </h5>
                          <div className="space-y-1">
                            {actionItems.map(item => (
                              <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-xs">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${ACTION_STATUS_COLORS[item.status]}`}>
                                  {ACTION_STATUS_LABELS[item.status]}
                                </span>
                                <span className="flex-1 truncate">{item.content}</span>
                                {/* Status transition buttons */}
                                {item.status === 'pending' && (
                                  <button
                                    onClick={() => handleMarkCompleted(session.id, item.id)}
                                    className="px-1.5 py-0.5 text-[9px] font-medium bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                                  >
                                    完成
                                  </button>
                                )}
                                {item.status === 'completed' && (
                                  <button
                                    onClick={() => handleMarkVerified(session.id, item.id)}
                                    className="px-1.5 py-0.5 text-[9px] font-medium bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                  >
                                    验证
                                  </button>
                                )}
                                {item.linkedTaskId && (
                                  <span className="text-[9px] text-primary">→ 已关联任务</span>
                                )}
                                {!item.linkedTaskId && (item.status === 'pending' || item.status === 'in_progress') && state.tasks.length > 0 && (
                                  <select
                                    className="border rounded px-1 py-0.5 text-[9px]"
                                    value=""
                                    onChange={e => { if (e.target.value) handleLinkToTask(session.id, item.id, e.target.value); }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <option value="">关联任务</option>
                                    {state.tasks.slice(0, 20).map(t => (
                                      <option key={t.id} value={t.id}>{t.title.slice(0, 20)}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model library */}
      {showModelLibrary && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">选择复盘模型</h4>
            <button onClick={() => setShowModelLibrary(false)} className="text-xs text-muted-foreground hover:text-primary">
              取消
            </button>
          </div>
          <ReviewModelLibrary onSelectModel={handleSelectModel} />
        </div>
      )}

      {/* Session wizard */}
      {activeModel && (
        <ReviewSessionWizard
          model={activeModel}
          onClose={() => setActiveModel(null)}
          onComplete={handleSessionComplete}
        />
      )}
    </div>
  );
}
