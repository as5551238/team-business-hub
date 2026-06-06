/**
 * H5Layout — 微信/飞书内嵌 H5 页面的紧凑布局
 * V2: 创建 + 详情 + 下拉刷新 + 快速状态切换
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Sun, CheckSquare, Target, User, Plus, X, ChevronRight, Clock, Flag, ArrowDown } from 'lucide-react';
import type { Task as TaskType, Goal } from '@/types';

interface H5LayoutProps {
  children?: React.ReactNode;
}

type H5Tab = 'today' | 'tasks' | 'goals' | 'me';

// ── 下拉刷新 Hook ──
function usePullToRefresh(onRefresh: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const dist = Math.max(0, e.touches[0].clientY - startY.current);
    setPullDist(Math.min(dist * 0.4, 80));
  }, []);

  const onTouchEnd = useCallback(() => {
    pulling.current = false;
    if (pullDist > 50 && !refreshing) {
      setRefreshing(true);
      onRefresh();
      setTimeout(() => {
        setRefreshing(false);
        setPullDist(0);
      }, 800);
    } else {
      setPullDist(0);
    }
  }, [pullDist, refreshing, onRefresh]);

  return { containerRef, pullDist, refreshing, onTouchStart, onTouchMove, onTouchEnd };
}

export function H5Layout({ children }: H5LayoutProps) {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState<H5Tab>('today');
  const [showCreate, setShowCreate] = useState(false);
  const [detailItem, setDetailItem] = useState<{ type: 'task' | 'goal'; id: string } | null>(null);

  const handleRefresh = useCallback(() => {
    // Dispatch a no-op to trigger re-render (Supabase realtime handles data freshness)
  }, []);

  const { containerRef, pullDist, refreshing, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(handleRefresh);

  const userId = state.currentUser?.id;
  const today = new Date().toISOString().slice(0, 10);
  const myTasks = state.tasks.filter(t =>
    (t.leaderId === userId || (t.supporterIds ?? []).includes(userId || '')) &&
    t.status !== 'cancelled' && !t.deletedAt
  );
  const dueToday = myTasks.filter(t => t.dueDate === today && t.status !== 'done');
  const overdue = myTasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done');

  const tabs: { key: H5Tab; label: string; icon: typeof Sun; badge?: number }[] = [
    { key: 'today', label: '今日', icon: Sun, badge: dueToday.length + overdue.length },
    { key: 'tasks', label: '任务', icon: CheckSquare, badge: myTasks.filter(t => t.status !== 'done').length },
    { key: 'goals', label: '目标', icon: Target },
    { key: 'me', label: '我的', icon: User },
  ];

  if (children) return <>{children}</>;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-border">
        <h1 className="text-base font-semibold">
          {activeTab === 'today' && '我的今日'}
          {activeTab === 'tasks' && '我的任务'}
          {activeTab === 'goals' && '我的目标'}
          {activeTab === 'me' && '个人中心'}
        </h1>
      </div>

      {/* Content with pull-to-refresh */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-3 pb-20"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Pull indicator */}
        {(pullDist > 0 || refreshing) && (
          <div className="flex items-center justify-center py-2 text-muted-foreground transition-all"
               style={{ height: refreshing ? 40 : pullDist * 0.5 }}>
            <ArrowDown size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="text-xs ml-1">{refreshing ? '刷新中...' : pullDist > 50 ? '松开刷新' : '下拉刷新'}</span>
          </div>
        )}

        {activeTab === 'today' && (
          <H5TodayView tasks={myTasks} dueToday={dueToday} overdue={overdue} onOpenDetail={(id) => setDetailItem({ type: 'task', id })} />
        )}
        {activeTab === 'tasks' && (
          <H5TaskList tasks={myTasks} onOpenDetail={(id) => setDetailItem({ type: 'task', id })} />
        )}
        {activeTab === 'goals' && (
          <H5GoalList goals={state.goals.filter(g =>
            g.leaderId === userId || (g.supporterIds ?? []).includes(userId || '')
          )} onOpenDetail={(id) => setDetailItem({ type: 'goal', id })} />
        )}
        {activeTab === 'me' && (
          <H5MeView />
        )}
      </div>

      {/* FAB Create Button */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed right-4 bottom-20 z-30 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>

      {/* Bottom Tab Bar */}
      <div className="flex-shrink-0 bg-card border-t border-border flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex flex-col items-center px-4 py-2 text-xs transition-colors ${
              activeTab === t.key ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <div className="relative">
              <t.icon size={20} />
              {t.badge ? (
                <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full px-0.5">
                  {t.badge > 9 ? '9+' : t.badge}
                </span>
              ) : null}
            </div>
            <span className="mt-0.5">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <H5CreateModal onClose={() => setShowCreate(false)} dispatch={dispatch} userId={userId || ''} />
      )}

      {/* Detail Bottom Sheet */}
      {detailItem && (
        <H5DetailSheet
          item={detailItem}
          state={state}
          dispatch={dispatch}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}

// ── Create Modal ──
function H5CreateModal({ onClose, dispatch, userId }: { onClose: () => void; dispatch: React.Dispatch<any>; userId: string }) {
  const [mode, setMode] = useState<'task' | 'goal'>('task');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium');

  const handleCreate = useCallback(() => {
    if (!title.trim()) return;
    if (mode === 'task') {
      dispatch({
        type: 'ADD_TASK',
        payload: { title: title.trim(), leaderId: userId, priority, status: 'todo', description: '', projectId: null, goalId: null, parentId: null, supporterIds: [], tags: [], category: '', startDate: null, dueDate: null, reminderDate: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', blockedBy: [], sprintId: null, teamId: 'default', summary: '', discussionThreadId: null },
      });
    } else {
      dispatch({
        type: 'ADD_GOAL',
        payload: { title: title.trim(), leaderId: userId, status: 'in_progress', description: '', parentId: null, supporterIds: [], startDate: new Date().toISOString().slice(0, 10), endDate: null, teamId: 'default' },
      });
    }
    onClose();
  }, [mode, title, priority, userId, dispatch, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-card rounded-t-2xl p-5 pb-8 animate-slide-in-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">新建{mode === 'task' ? '任务' : '目标'}</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground"><X size={20} /></button>
        </div>
        {/* Type switcher */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('task')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'task' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >任务</button>
          <button
            onClick={() => setMode('goal')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'goal' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >目标</button>
        </div>
        {/* Title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={`输入${mode === 'task' ? '任务' : '目标'}标题`}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm mb-3"
          autoFocus
        />
        {/* Priority (task only) */}
        {mode === 'task' && (
          <div className="flex gap-2 mb-4">
            {(['urgent', 'high', 'medium', 'low'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  priority === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >{p === 'urgent' ? '紧急' : p === 'high' ? '高' : p === 'medium' ? '中' : '低'}</button>
            ))}
          </div>
        )}
        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={!title.trim()}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
        >创建</button>
      </div>
    </div>
  );
}

// ── Detail Bottom Sheet ──
function H5DetailSheet({ item, state, dispatch, onClose }: {
  item: { type: 'task' | 'goal'; id: string };
  state: any;
  dispatch: React.Dispatch<any>;
  onClose: () => void;
}) {
  const statusFlow: Record<string, string[]> = {
    todo: ['in_progress'],
    in_progress: ['done', 'blocked'],
    blocked: ['in_progress'],
    done: ['todo'],
  };
  const statusLabels: Record<string, string> = { todo: '待处理', in_progress: '进行中', done: '已完成', blocked: '阻塞' };

  if (item.type === 'task') {
    const task = state.tasks.find((t: TaskType) => t.id === item.id);
    if (!task) return null;

    const nextStatuses = statusFlow[task.status] || [];
    const projectTitle = task.projectId ? state.projects.find((p: any) => p.id === task.projectId)?.title : null;

    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
        <div className="w-full bg-card rounded-t-2xl p-5 pb-8 max-h-[75vh] overflow-y-auto animate-slide-in-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{statusLabels[task.status]}</span>
            <button onClick={onClose} className="p-1 text-muted-foreground"><X size={20} /></button>
          </div>
          <h2 className="text-lg font-semibold mb-2">{task.title}</h2>
          {task.description && <p className="text-sm text-muted-foreground mb-3">{task.description}</p>}
          {/* Meta */}
          <div className="flex flex-wrap gap-3 mb-4 text-xs text-muted-foreground">
            {task.priority && <span className="flex items-center gap-1"><Flag size={12} />{task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}</span>}
            {task.dueDate && <span className="flex items-center gap-1"><Clock size={12} />截止 {task.dueDate.slice(5)}</span>}
            {projectTitle && <span>项目: {projectTitle}</span>}
          </div>
          {/* Subtasks count */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div className="text-xs text-muted-foreground mb-4">
              子任务 {task.subtasks.filter((s: any) => s.completed).length}/{task.subtasks.length}
            </div>
          )}
          {/* Quick status buttons */}
          <div className="flex gap-2 mt-2">
            {nextStatuses.map(s => (
              <button
                key={s}
                onClick={() => {
                  dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { status: s, completedAt: s === 'done' ? new Date().toISOString() : undefined } } });
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all"
              >切换为{statusLabels[s]}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Goal detail
  const goal = state.goals.find((g: Goal) => g.id === item.id);
  if (!goal) return null;

  const goalTasks = state.tasks.filter((t: TaskType) => t.goalId === goal.id);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-card rounded-t-2xl p-5 pb-8 max-h-[75vh] overflow-y-auto animate-slide-in-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">目标</span>
          <button onClick={onClose} className="p-1 text-muted-foreground"><X size={20} /></button>
        </div>
        <h2 className="text-lg font-semibold mb-2">{goal.title}</h2>
        {goal.description && <p className="text-sm text-muted-foreground mb-3">{goal.description}</p>}
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">进度</span>
            <span className="text-sm font-bold text-primary">{goal.progress}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${goal.progress}%`, backgroundColor: goal.progress >= 80 ? 'hsl(var(--success))' : 'hsl(var(--primary))' }} />
          </div>
        </div>
        {/* Related tasks */}
        {goalTasks.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">关联任务 ({goalTasks.length})</h3>
            {goalTasks.slice(0, 5).map((t: TaskType) => (
              <div key={t.id} className="flex items-center gap-2 p-2 mb-1 rounded-lg bg-muted/30">
                <CheckSquare size={12} className={t.status === 'done' ? 'text-emerald-500' : 'text-muted-foreground'} />
                <span className={`text-sm flex-1 truncate ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                <span className="text-[10px] text-muted-foreground">{statusLabels[t.status]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function H5TodayView({ tasks, dueToday, overdue, onOpenDetail }: { tasks: TaskType[]; dueToday: TaskType[]; overdue: TaskType[]; onOpenDetail: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-red-600 mb-2">逾期 ({overdue.length})</h3>
          {overdue.slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 active:bg-red-100 transition-colors" onClick={() => onOpenDetail(t.id)}>
              <CheckSquare size={14} className="text-red-500 shrink-0" />
              <span className="text-sm truncate flex-1">{t.title}</span>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </div>
          ))}
        </section>
      )}
      <section>
        <h3 className="text-sm font-semibold mb-2">今日到期 ({dueToday.length})</h3>
        {dueToday.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">今日无到期任务</p>
        ) : (
          dueToday.slice(0, 8).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-card border border-border active:bg-muted/50 transition-colors" onClick={() => onOpenDetail(t.id)}>
              <CheckSquare size={14} className="text-blue-500 shrink-0" />
              <span className="text-sm truncate flex-1">{t.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{t.priority === 'urgent' ? '紧急' : t.priority === 'high' ? '高' : ''}</span>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </div>
          ))
        )}
      </section>
      {tasks.filter(t => t.status === 'in_progress').length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">进行中</h3>
          {tasks.filter(t => t.status === 'in_progress').slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-card border border-border active:bg-muted/50 transition-colors" onClick={() => onOpenDetail(t.id)}>
              <CheckSquare size={14} className="text-green-500 shrink-0" />
              <span className="text-sm truncate flex-1">{t.title}</span>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function H5TaskList({ tasks, onOpenDetail }: { tasks: TaskType[]; onOpenDetail: (id: string) => void }) {
  const groups: Record<string, TaskType[]> = { todo: [], in_progress: [], blocked: [], done: [] };
  tasks.forEach(t => { if (groups[t.status]) groups[t.status].push(t); });
  const labels: Record<string, string> = { todo: '待处理', in_progress: '进行中', blocked: '阻塞', done: '已完成' };

  return (
    <div className="space-y-4">
      {Object.entries(groups).filter(([, v]) => v.length > 0).map(([status, items]) => (
        <section key={status}>
          <h3 className="text-sm font-semibold mb-2">{labels[status]} ({items.length})</h3>
          {items.slice(0, 10).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-card border border-border active:bg-muted/50 transition-colors" onClick={() => onOpenDetail(t.id)}>
              <CheckSquare size={14} className={`shrink-0 ${t.status === 'done' ? 'text-emerald-500' : t.status === 'blocked' ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <span className={`text-sm truncate flex-1 ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
              {t.dueDate && <span className="text-[10px] text-muted-foreground shrink-0">{t.dueDate.slice(5)}</span>}
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </div>
          ))}
        </section>
      ))}
      {tasks.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">暂无任务</p>}
    </div>
  );
}

function H5GoalList({ goals, onOpenDetail }: { goals: Goal[]; onOpenDetail: (id: string) => void }) {
  const active = goals.filter(g => g.status === 'in_progress');
  const done = goals.filter(g => g.status === 'done');

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-semibold mb-2">进行中 ({active.length})</h3>
        {active.slice(0, 8).map(g => (
          <div key={g.id} className="p-3 mb-2 rounded-lg bg-card border border-border active:bg-muted/50 transition-colors" onClick={() => onOpenDetail(g.id)}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate flex-1 mr-2">{g.title}</span>
              <span className="text-xs text-primary font-medium">{g.progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${g.progress}%` }} />
            </div>
          </div>
        ))}
      </section>
      {done.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">已完成 ({done.length})</h3>
          {done.slice(0, 5).map(g => (
            <div key={g.id} className="p-3 mb-2 rounded-lg bg-muted/30 border border-border">
              <span className="text-sm text-muted-foreground truncate">{g.title}</span>
            </div>
          ))}
        </section>
      )}
      {goals.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">暂无目标</p>}
    </div>
  );
}

function H5MeView() {
  const { state } = useStore();
  const user = state.currentUser;
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
        <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
          {user.avatar || user.name.charAt(0)}
        </div>
        <div>
          <p className="text-base font-semibold">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.role === 'admin' ? '管理员' : user.role === 'manager' ? '经理' : '成员'}</p>
        </div>
      </div>
    </div>
  );
}
