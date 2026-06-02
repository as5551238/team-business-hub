/**
 * 后续计划 Tab — 今日待办 + 即将到期
 */
import { useMemo } from 'react';
import { Zap, CheckCircle2, Calendar } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { priorityColors, priorityLabels, useFilteredData } from './shared';
import type { DashboardTabProps } from './shared';

export default function PlansTab({ onOpenDetail }: DashboardTabProps) {
  const { state, dispatch, memberTasks, todayStr, weekLaterStr, nowDisplay, getMemberName, getProjectTitle, commentCountMap } = useFilteredData();

  const todayTodos = useMemo(() => memberTasks.filter(t => t.leaderId === state.currentUser?.id && t.status !== 'done' && t.dueDate === todayStr), [memberTasks, state.currentUser, todayStr]);

  const upcomingTasks = useMemo(() => {
    return memberTasks.filter(t => {
      if (t.status === 'done') return false;
      if (!t.dueDate) return false;
      return t.dueDate >= todayStr && t.dueDate <= weekLaterStr;
    }).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 8);
  }, [memberTasks, todayStr, weekLaterStr]);

  return (
    <div className="space-y-6">
      {/* 今日待办 */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            <h2 className="font-semibold text-sm md:text-base">今日待办</h2>
            {todayTodos.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{todayTodos.length}项</span>}
          </div>
          <span className="text-xs md:text-sm text-muted-foreground">{nowDisplay}</span>
        </div>
        <div className="divide-y divide-border">
          {todayTodos.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="今日暂无待办任务，可以放松一下" variant="positive" compact />
          ) : todayTodos.map(task => {
            const doneSubs = (task.subtasks ?? []).filter(s => s.completed).length;
            const totalSubs = (task.subtasks ?? []).length;
            const taskComments = commentCountMap[task.id] || 0;
            return (
              <div key={task.id} className="px-4 md:px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpenDetail(task.id, 'task')}>
                <div className="flex items-start gap-3">
                  <button className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${task.status === 'done' ? 'bg-success border-success text-white' : 'border-muted-foreground/30 hover:border-primary'}`} onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { status: task.status === 'done' ? 'in_progress' : 'done', completedAt: task.status === 'done' ? null : new Date().toISOString() } } }); }}>
                    {task.status === 'done' && <CheckCircle2 size={12} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-2 flex-wrap ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      <span className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${priorityColors[task.priority]}`}>{priorityLabels[task.priority]}</span>
                      {taskComments > 0 && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{taskComments}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <select className="text-[10px] border border-border rounded px-1 py-0.5 bg-card text-muted-foreground cursor-pointer hover:border-primary/30" value={task.status} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { status: e.target.value, completedAt: e.target.value === 'done' ? new Date().toISOString() : null } } }); }}>
                        <option value="todo">待处理</option>
                        <option value="in_progress">进行中</option>
                        <option value="done">已完成</option>
                        <option value="blocked">已阻塞</option>
                      </select>
                    </div>
                    {totalSubs > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]"><div className="h-full bg-primary rounded-full animate-progress" style={{ width: `${(doneSubs / totalSubs) * 100}%` }} /></div>
                        <span className="text-xs text-muted-foreground">{doneSubs}/{totalSubs}</span>
                      </div>
                    )}
                    {task.projectId && <div className="text-xs text-muted-foreground mt-1">{getProjectTitle(task.projectId)}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 即将到期 */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><Calendar size={18} className="text-rose-500" /><h2 className="font-semibold text-sm md:text-base">即将到期</h2><span className="text-xs text-muted-foreground">近7天</span></div>
        </div>
        <div className="divide-y divide-border">
          {upcomingTasks.length === 0 ? (
            <EmptyState icon={Calendar} title="近7天暂无到期任务" variant="positive" compact />
          ) : upcomingTasks.map(task => {
            const daysLeft = Math.ceil((new Date(task.dueDate!).getTime() - new Date(todayStr).getTime()) / 86400000);
            const urgency = daysLeft <= 1 ? 'text-red-600 bg-red-50' : daysLeft <= 3 ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50';
            return (
              <div key={task.id} className="px-4 md:px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpenDetail(task.id, 'task')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgency}`}>{daysLeft === 0 ? '今天' : daysLeft === 1 ? '明天' : `${daysLeft}天后`}</span>
                    <span className="text-sm font-medium truncate">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <select className="text-[10px] border border-border rounded px-1 py-0.5 bg-card text-muted-foreground cursor-pointer hover:border-primary/30" value={task.status} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { status: e.target.value, completedAt: e.target.value === 'done' ? new Date().toISOString() : null } } }); }}>
                      <option value="todo">待处理</option>
                      <option value="in_progress">进行中</option>
                      <option value="done">已完成</option>
                      <option value="blocked">已阻塞</option>
                    </select>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${priorityColors[task.priority]}`}>{priorityLabels[task.priority]}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1 ml-[72px]">{getMemberName(task.leaderId)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
