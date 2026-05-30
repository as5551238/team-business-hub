/**
 * AI 目标拆解组件 —— 目标描述 → 智能拆解为 KR + 项目 + 任务 → 预览 → 一键写入
 * Phase 3: AI-native item flow
 */
import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { generateLocalDecomposition, generateDeepDecomposition } from '@/lib/ai/aiDecomposition';
import type { DecompositionResult, KRDraft, TaskDraft } from '@/lib/ai/aiDecomposition';
import { loadAIConfig } from '@/lib/ai/types';
import { genId } from '@/store/utils';
import { Sparkles, Target, FolderKanban, ListTodo, ChevronDown, ChevronRight, Loader2, CheckCircle2, X, Wand2 } from 'lucide-react';

interface AIItemFlowProps {
  onClose: () => void;
  /** 创建目标后跳转到目标页 */
  onNavigateToGoal?: (goalId: string) => void;
}

export function AIItemFlow({ onClose, onNavigateToGoal }: AIItemFlowProps) {
  const { state, dispatch } = useStore();
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalType, setGoalType] = useState<'okr' | 'kpi' | 'milestone'>('okr');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecompositionResult | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState(false);

  const handleDecompose = useCallback(async () => {
    if (!goalTitle.trim()) return;
    setLoading(true);
    try {
      const config = loadAIConfig();
      if (config.enabled && config.apiKey) {
        const r = await generateDeepDecomposition(state, goalTitle.trim(), goalDesc.trim(), goalType);
        setResult(r);
      } else {
        const r = generateLocalDecomposition(goalTitle.trim(), goalDesc.trim(), goalType);
        setResult(r);
      }
      // Auto expand first project
      setExpandedProjects(new Set([0]));
    } catch {
      const r = generateLocalDecomposition(goalTitle.trim(), goalDesc.trim(), goalType);
      setResult(r);
    }
    setLoading(false);
  }, [goalTitle, goalDesc, goalType, state]);

  const toggleProject = (idx: number) => {
    setExpandedProjects(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  /** One-click write: Goal + KRs + Projects + Tasks → store (deterministic IDs, no stale closure) */
  const handleApply = useCallback(() => {
    if (!result) return;
    const now = new Date().toISOString().split('T')[0];
    const plusDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().split('T')[0];
    const currentUserId = state.currentUser?.id || '';

    // Pre-generate all IDs to avoid stale-closure state lookups
    const goalId = genId('goal');
    const projIds = result.projects.map(() => genId('proj'));

    // 1. Create Goal with KRs
    const goalPayload = {
      id: goalId,
      title: result.goalTitle,
      description: goalDesc.trim(),
      type: goalType as 'okr' | 'kpi' | 'milestone',
      status: 'in_progress' as const,
      priority: 'high' as const,
      parentId: null as string | null,
      level: 0,
      category: '',
      startDate: now,
      endDate: plusDays(Math.max(result.estimatedTotalDays, 30)),
      leaderId: currentUserId,
      supporterIds: [] as string[],
      tags: [goalType.toUpperCase()],
      keyResults: result.keyResults.map(kr => ({
        id: `kr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: kr.title,
        targetValue: kr.targetValue,
        currentValue: 0,
        unit: kr.unit,
        selected: true,
        confidence: kr.confidence,
      })),
      selectedKRIds: [] as string[],
      attachments: [] as any[],
      trackingRecords: [] as any[],
      repeatCycle: 'none' as const,
      discussionThreadId: null as string | null,
      summary: result.methodologySuggestion,
    };
    dispatch({ type: 'ADD_GOAL', payload: goalPayload });

    // 2. Create Projects with pre-generated IDs
    result.projects.forEach((proj, idx) => {
      const projPayload = {
        id: projIds[idx],
        title: proj.title,
        description: proj.description,
        goalId,
        parentId: null as string | null,
        status: 'in_progress' as const,
        priority: 'medium' as const,
        startDate: now,
        endDate: plusDays(proj.tasks.reduce((s, t) => s + t.estimatedDays, 0) + 3),
        leaderId: currentUserId,
        supporterIds: [] as string[],
        tags: [] as string[],
        category: '',
        taskCount: 0,
        attachments: [] as any[],
        trackingRecords: [] as any[],
        repeatCycle: 'none' as const,
        discussionThreadId: null as string | null,
        summary: '',
      };
      dispatch({ type: 'ADD_PROJECT', payload: projPayload });
    });

    // 3. Create Tasks with pre-generated project IDs
    result.projects.forEach((proj, idx) => {
      const projectId = projIds[idx];
      for (const task of proj.tasks) {
        dispatch({
          type: 'ADD_TASK',
          payload: {
            title: task.title,
            description: `优先级: ${task.priority}，预估: ${task.estimatedDays}天`,
            projectId,
            goalId,
            parentId: null as string | null,
            sprintId: null as string | null,
            status: 'todo' as const,
            priority: task.priority,
            leaderId: currentUserId,
            supporterIds: [] as string[],
            tags: task.tags,
            category: '',
            startDate: now,
            dueDate: plusDays(task.estimatedDays + idx * 5),
            reminderDate: null as string | null,
            completedAt: null as string | null,
            subtasks: [] as any[],
            attachments: [] as any[],
            trackingRecords: [] as any[],
            repeatCycle: 'none' as const,
            blockedBy: [] as string[],
            summary: '',
          },
        });
      }
    });

    // Standalone tasks
    for (const task of result.standaloneTasks) {
      dispatch({
        type: 'ADD_TASK',
        payload: {
          title: task.title,
          description: `预估: ${task.estimatedDays}天`,
          projectId: null as string | null,
          goalId,
          parentId: null as string | null,
          sprintId: null as string | null,
          status: 'todo' as const,
          priority: task.priority,
          leaderId: currentUserId,
          supporterIds: [] as string[],
          tags: task.tags,
            category: '',
            startDate: now,
            dueDate: plusDays(task.estimatedDays),
            reminderDate: null as string | null,
            completedAt: null as string | null,
            subtasks: [] as any[],
            attachments: [] as any[],
            trackingRecords: [] as any[],
            repeatCycle: 'none' as const,
            blockedBy: [] as string[],
            summary: '',
          },
        });
      }

    setApplied(true);
    if (onNavigateToGoal) onNavigateToGoal(goalId);
  }, [result, goalDesc, goalType, state, dispatch, onNavigateToGoal]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-border w-full max-w-2xl animate-slide-up max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 md:px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-primary" />
            <h3 className="font-semibold">AI 智能拆解</h3>
          </div>
          <button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="px-5 md:px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {!result ? (
            /* Step 1: Input */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">输入目标描述，AI 将自动拆解为关键结果、项目和任务骨架</p>
              <div>
                <label className="text-sm font-medium mb-1.5 block">目标名称 *</label>
                <input
                  type="text"
                  className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="如：Q2 用户增长 50%"
                  value={goalTitle}
                  onChange={e => setGoalTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && goalTitle.trim()) handleDecompose(); }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">目标描述</label>
                <textarea
                  className="w-full text-sm border border-input rounded-lg px-3 py-2 min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="描述目标背景、范围和期望，越详细拆解越精准"
                  value={goalDesc}
                  onChange={e => setGoalDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">目标类型</label>
                <div className="flex gap-2">
                  {[
                    { val: 'okr', label: 'OKR', desc: '目标+关键结果' },
                    { val: 'kpi', label: 'KPI', desc: '量化指标考核' },
                    { val: 'milestone', label: '里程碑', desc: '阶段验收驱动' },
                  ].map(t => (
                    <button
                      key={t.val}
                      onClick={() => setGoalType(t.val as any)}
                      className={`flex-1 p-2.5 rounded-lg border text-center transition-colors ${goalType === t.val ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30'}`}
                    >
                      <span className="text-sm font-medium block">{t.label}</span>
                      <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={handleDecompose}
                disabled={!goalTitle.trim() || loading}
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> AI 拆解中...</> : <><Sparkles size={16} /> 开始智能拆解</>}
              </button>
            </div>
          ) : applied ? (
            /* Success state */
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 size={48} className="mx-auto text-green-500" />
              <h4 className="text-lg font-semibold">拆解完成，已写入</h4>
              <p className="text-sm text-muted-foreground">1个目标 + {result.keyResults.length}个KR + {result.projects.length}个项目 + {result.projects.reduce((s, p) => s + p.tasks.length, 0) + result.standaloneTasks.length}个任务</p>
              <button className="mt-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90" onClick={onClose}>完成</button>
            </div>
          ) : (
            /* Step 2: Preview & Confirm */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">拆解预览</h4>
                <span className="text-[11px] text-muted-foreground">{result.fromLLM ? 'AI 深度拆解' : '模板化拆解'} · 约{result.estimatedTotalDays}天</span>
              </div>

              {/* KRs */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 mb-2"><Target size={14} /> 关键结果（{result.keyResults.length}）</div>
                <div className="space-y-1.5">
                  {result.keyResults.map((kr, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-2.5 py-1.5 border border-blue-50">
                      <span>{kr.title}</span>
                      <span className="text-muted-foreground">{kr.targetValue}{kr.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Projects & Tasks */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><FolderKanban size={14} /> 项目（{result.projects.length}）</div>
                {result.projects.map((proj, pIdx) => (
                  <div key={pIdx} className="border border-border rounded-lg overflow-hidden">
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleProject(pIdx)}>
                      {expandedProjects.has(pIdx) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="text-sm font-medium flex-1">{proj.title}</span>
                      <span className="text-[11px] text-muted-foreground">{proj.tasks.length}个任务</span>
                    </button>
                    {expandedProjects.has(pIdx) && (
                      <div className="px-3 pb-2 space-y-1 bg-muted/10">
                        <p className="text-xs text-muted-foreground mb-1.5">{proj.description}</p>
                        {proj.tasks.map((task, tIdx) => (
                          <div key={tIdx} className="flex items-center gap-2 text-xs bg-white rounded px-2.5 py-1.5 border">
                            <ListTodo size={12} className="text-muted-foreground" />
                            <span className="flex-1">{task.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.priority === 'urgent' ? 'bg-red-50 text-red-600' : task.priority === 'high' ? 'bg-orange-50 text-orange-600' : task.priority === 'low' ? 'bg-gray-50 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>{task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '中'}</span>
                            <span className="text-[10px] text-muted-foreground">{task.estimatedDays}天</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Standalone Tasks */}
              {result.standaloneTasks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700"><ListTodo size={14} /> 独立任务（{result.standaloneTasks.length}）</div>
                  {result.standaloneTasks.map((task, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-white rounded border px-2.5 py-1.5">
                      <span className="flex-1">{task.title}</span>
                      <span className="text-[10px] text-muted-foreground">{task.estimatedDays}天</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Methodology */}
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                <div className="text-xs font-semibold text-primary mb-1">方法建议</div>
                <p className="text-xs text-muted-foreground">{result.methodologySuggestion}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2" onClick={handleApply}>
                  <CheckCircle2 size={16} /> 一键写入
                </button>
                <button className="px-4 py-2.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors" onClick={() => setResult(null)}>
                  重新拆解
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
