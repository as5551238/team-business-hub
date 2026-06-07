import React, { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Task } from '@/types';
import { Button } from '@/components/ui/button';
import { RotateCcw, Plus, CheckCircle2, Circle, ArrowRight, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { handleError } from '@/lib/errorHandler';
import type { ReviewPeriod, ReviewEntry } from '@/types';
import { periodLabels } from './constants';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface ActionItem {
  text: string;
  done: boolean;
  taskId?: string;
}

interface RetroForm {
  period: ReviewPeriod;
  periodStart: string;
  periodEnd: string;
  wentWell: string;
  toImprove: string;
  actions: ActionItem[];
}

const emptyForm: RetroForm = {
  period: 'week',
  periodStart: new Date().toISOString().split('T')[0],
  periodEnd: new Date().toISOString().split('T')[0],
  wentWell: '',
  toImprove: '',
  actions: [],
};

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
}

export function RetroTrackingTab() {
  const { state, dispatch } = useStore();
  const [form, setForm] = useState<RetroForm>({ ...emptyForm, ...getWeekRange() });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewPeriod | 'all'>('all');

  const reviews = useMemo(() => {
    const list = state.reviews || [];
    return list
      .filter(r => filter === 'all' || r.period === filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.reviews, filter]);

  function parseRetroContent(content: string): { wentWell: string; toImprove: string; actions: ActionItem[] } {
    try {
      const parsed = JSON.parse(content);
      return {
        wentWell: parsed.wentWell || '',
        toImprove: parsed.toImprove || '',
        actions: parsed.actions || [],
      };
    } catch (e) {
      handleError(e, { module: 'RetroTrackingTab', operation: 'PARSE_REVIEW', severity: 'warn' });
      return { wentWell: content, toImprove: '', actions: [] };
    }
  }

  function handleStartCreate() {
    setForm({ ...emptyForm, ...getWeekRange() });
    setEditingId(null);
    setShowForm(true);
  }

  function handleStartEdit(r: ReviewEntry) {
    const parsed = parseRetroContent(r.content);
    setForm({
      period: r.period,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      wentWell: parsed.wentWell,
      toImprove: parsed.toImprove,
      actions: parsed.actions,
    });
    setEditingId(r.id);
    setShowForm(true);
  }

  function handleAddAction() {
    setForm(f => ({ ...f, actions: [...f.actions, { text: '', done: false }] }));
  }

  function handleUpdateAction(idx: number, updates: Partial<ActionItem>) {
    setForm(f => ({
      ...f,
      actions: f.actions.map((a, i) => (i === idx ? { ...a, ...updates } : a)),
    }));
  }

  function handleRemoveAction(idx: number) {
    setForm(f => ({ ...f, actions: f.actions.filter((_, i) => i !== idx) }));
  }

  function handleConvertActionToTask(idx: number) {
    const action = form.actions[idx];
    if (!action.text.trim()) return;
    const taskPayload: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
      title: action.text,
      description: `由复盘行动项创建（周期: ${periodLabels[form.period] || form.period}）`,
      projectId: null,
      goalId: null,
      parentId: null,
      status: 'todo',
      priority: 'medium',
      leaderId: state.currentUser?.id || '',
      supporterIds: [],
      tags: ['复盘行动项'],
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
      discussionThreadId: null,
      summary: '',
      teamId: state.currentTeamId || '',
    };
    dispatch({ type: 'ADD_TASK', payload: taskPayload });
    handleUpdateAction(idx, { done: true, taskId: 'created' });
  }

  function handleSave() {
    if (!form.wentWell.trim() && !form.toImprove.trim() && form.actions.length === 0) return;
    const content = JSON.stringify({
      wentWell: form.wentWell,
      toImprove: form.toImprove,
      actions: form.actions,
    });
    if (editingId) {
      dispatch({ type: 'UPDATE_REVIEW', payload: { id: editingId, updates: { content, period: form.period, periodStart: form.periodStart, periodEnd: form.periodEnd } } });
    } else {
      dispatch({ type: 'ADD_REVIEW', payload: { period: form.period, periodStart: form.periodStart, periodEnd: form.periodEnd, memberId: state.currentUser?.id || null, content, improvements: form.actions.filter(a => !a.done).map(a => a.text), metrics: { goalsCompleted: 0, goalsInProgress: 0, projectsCompleted: 0, projectsInProgress: 0, tasksCompleted: 0, tasksOverdue: 0, tasksTotal: 0, completionRate: 0 } } });
    }
    setShowForm(false);
    setEditingId(null);
  }

  function handleDelete(id: string) {
    const s = { ...state, reviews: state.reviews.filter(r => r.id !== id) };
    dispatch({ type: 'DELETE_REVIEW', payload: id });
  }

  const actionCompletionRate = (actions: ActionItem[]) => {
    if (actions.length === 0) return 100;
    return Math.round((actions.filter(a => a.done).length / actions.length) * 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">复盘跟踪</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border border-border rounded px-2 py-1 text-xs"
            value={filter}
            onChange={e => setFilter(e.target.value as ReviewPeriod | 'all')}
          >
            <option value="all">全部周期</option>
            <option value="day">日复盘</option>
            <option value="week">周复盘</option>
            <option value="month">月复盘</option>
            <option value="quarter">季复盘</option>
            <option value="year">年复盘</option>
          </select>
          <Button size="sm" className="h-7 text-xs" onClick={handleStartCreate}><Plus className="w-3 h-3 mr-1" />新建复盘</Button>
        </div>
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-center gap-3">
            <select className="border border-border rounded px-2 py-1 text-sm" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value as ReviewPeriod }))}>
              <option value="day">日复盘</option>
              <option value="week">周复盘</option>
              <option value="month">月复盘</option>
              <option value="quarter">季复盘</option>
              <option value="year">年复盘</option>
            </select>
            <input type="date" className="border border-border rounded px-2 py-1 text-sm" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} />
            <span className="text-muted-foreground">~</span>
            <input type="date" className="border border-border rounded px-2 py-1 text-sm" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-green-700 flex items-center gap-1 mb-1">做得好的</label>
            <textarea className="w-full border border-border rounded px-3 py-2 text-sm min-h-[60px] resize-none" placeholder="本周有哪些做得好的事情？" value={form.wentWell} onChange={e => setForm(f => ({ ...f, wentWell: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-orange-700 flex items-center gap-1 mb-1">待改进的</label>
            <textarea className="w-full border border-border rounded px-3 py-2 text-sm min-h-[60px] resize-none" placeholder="哪些地方可以做得更好？" value={form.toImprove} onChange={e => setForm(f => ({ ...f, toImprove: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-blue-700 mb-1 block">行动项</label>
            <div className="space-y-1.5">
              {form.actions.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button className="shrink-0 cursor-pointer" onClick={() => handleUpdateAction(i, { done: !a.done })}>
                    {a.done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <input className="flex-1 border border-border rounded px-2 py-1 text-sm" value={a.text} onChange={e => handleUpdateAction(i, { text: e.target.value })} placeholder="输入行动项..." />
                  <Tooltip><TooltipTrigger asChild><button className="p-1 hover:bg-accent rounded cursor-pointer" onClick={() => handleConvertActionToTask(i)} aria-label="转为任务"><ArrowRight className="w-3.5 h-3.5 text-blue-600" /></button></TooltipTrigger><TooltipContent>转为任务</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><button className="p-1 hover:bg-destructive/10 rounded cursor-pointer" onClick={() => handleRemoveAction(i)} aria-label="删除行动项"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button></TooltipTrigger><TooltipContent>删除</TooltipContent></Tooltip>
                </div>
              ))}
              <button className="text-xs text-primary hover:underline cursor-pointer" onClick={handleAddAction}>+ 添加行动项</button>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>保存复盘</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowForm(false); setEditingId(null); }}>取消</Button>
          </div>
        </div>
      )}

      {reviews.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground">
          <RotateCcw className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无复盘记录</p>
          <p className="text-xs mt-1">定期复盘，持续改进</p>
        </div>
      )}

      <div className="space-y-3">
        {reviews.map(r => {
          const parsed = parseRetroContent(r.content);
          const rate = actionCompletionRate(parsed.actions);
          return (
            <div key={r.id} className="border border-border rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">{periodLabels[r.period] || r.period}</span>
                  <span className="text-xs text-muted-foreground">{r.periodStart} ~ {r.periodEnd}</span>
                  {parsed.actions.length > 0 && (
                    <span className={cn('px-2 py-0.5 rounded text-xs', rate === 100 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>
                      行动项 {rate}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => handleStartEdit(r)}>编辑</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>删除</Button>
                </div>
              </div>
              {parsed.wentWell && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-green-700">做得好：</span>
                  <span className="text-sm ml-1">{parsed.wentWell}</span>
                </div>
              )}
              {parsed.toImprove && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-orange-700">待改进：</span>
                  <span className="text-sm ml-1">{parsed.toImprove}</span>
                </div>
              )}
              {parsed.actions.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-blue-700">行动项：</span>
                  <div className="mt-1 space-y-1">
                    {parsed.actions.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {a.done ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className={cn(a.done && 'line-through text-muted-foreground')}>{a.text}</span>
                        {a.taskId && <span className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded">已转任务</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!parsed.wentWell && !parsed.toImprove && parsed.actions.length === 0 && (
                <p className="text-sm text-muted-foreground">{r.content}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
