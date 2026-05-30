import React from 'react';
import type { Task } from '@/types';
import { cn } from '@/lib/utils';
import { Calendar, MessageSquare } from 'lucide-react';
import { StatusBadge, PriorityBadge } from './TasksComponents';
import { getTodayStr, isOverdue, type BatchProps } from './constants';

interface TaskTimelineViewProps {
  timelineBuckets: [string, Task[]][];
  commentCounts: Record<string, number>;
  batchProps: BatchProps;
  onOpenDetail: (task: Task) => void;
  getName: (id: string) => string;
  getAvatar: (id: string) => string;
  getProjectTitle: (id: string | null) => string;
}

export function TaskTimelineView({ timelineBuckets, commentCounts, batchProps, onOpenDetail, getName, getAvatar, getProjectTitle }: TaskTimelineViewProps) {
  const todayStr = getTodayStr();
  return (
    <div className="space-y-4">
      {timelineBuckets.length === 0 && <div className="bg-white rounded-xl border border-border px-5 py-12 text-center"><Calendar className="w-9 h-9 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">暂无匹配任务</p></div>}
      {timelineBuckets.map(([dateKey, tasks]) => {
        const od = dateKey !== '无截止日期' && dateKey < todayStr;
        const isToday = dateKey === todayStr;
        return (
          <div key={dateKey}>
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg mb-2', isToday && 'bg-primary/10', od && 'bg-red-50')}>
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className={cn('text-xs font-semibold', isToday && 'text-primary', od && 'text-red-600')}>{isToday ? '今天' : od ? `已逾期 - ${dateKey}` : dateKey}</span>
              <span className="text-xs text-muted-foreground">({tasks.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {tasks.map(task => (
                <div key={task.id} className="bg-white rounded-lg border border-border shadow-sm p-3 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer" onClick={() => onOpenDetail(task)}>
      {batchProps.batchMode && <div className="mb-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={() => batchProps.onToggleSelect(task.id)} /></div>}
                  <div className="flex items-center gap-2 mb-1.5">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                    {(commentCounts[task.id] || 0) > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto"><MessageSquare size={10} />{commentCounts[task.id]}</span>}
                  </div>
                  <h4 className={cn('text-sm font-medium truncate mb-1', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</h4>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold">{getAvatar(task.leaderId)}</div>{getName(task.leaderId)}</span>
                    {getProjectTitle(task.projectId) && <span className="truncate max-w-[80px]">{getProjectTitle(task.projectId)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
