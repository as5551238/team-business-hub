import React, { useState, useRef, useEffect } from 'react';
import type { Task, TaskStatus, TaskPriority, Tag } from '@/types';
import { cn } from '@/lib/utils';
import { Calendar, ChevronDown, ChevronRight, CheckCircle2, MessageSquare, GripVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  STATUS_CONFIG, URGENCY_CONFIG, IMPORTANCE_CONFIG,
  priorityToBP, isOverdue, type BatchProps
} from './constants';

export const STATUS_CYCLE: TaskStatus[] = ['todo', 'in_progress', 'done'];
export const PRIORITY_CYCLE: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const StatusBadge = React.memo(function StatusBadge({ status, onClick }: { status: TaskStatus; onClick?: (e: React.MouseEvent) => void }) { const c = STATUS_CONFIG[status] || STATUS_CONFIG.todo; return <span className={cn('text-xs px-1.5 py-0.5 rounded whitespace-nowrap', onClick && 'cursor-pointer hover:opacity-80 transition-opacity', c.color)} onClick={onClick}>{c.label}</span>; });

const PriorityBadge = React.memo(function PriorityBadge({ priority, onClick }: { priority: TaskPriority; onClick?: (e: React.MouseEvent) => void }) { const c = URGENCY_CONFIG[priority] || URGENCY_CONFIG.medium; return <span className={cn('text-xs px-1.5 py-0.5 rounded whitespace-nowrap', onClick && 'cursor-pointer hover:opacity-80 transition-opacity', c.color)} onClick={onClick}>{c.label}</span>; });

export { StatusBadge, PriorityBadge };

export const BoardColHeader = React.memo(function BoardColHeader({ icon: Icon, label, color, count }: { icon: LucideIcon; label: string; color: string; count: number }) {
  return <div className={cn('flex items-center gap-2 px-4 pb-2 border-b-2 mx-3 mb-3', color)}><Icon className="w-4 h-4" /><span className="font-semibold text-sm">{label}</span><span className="text-xs text-muted-foreground ml-auto">{count}</span></div>;
});

interface TaskCardProps { task: Task; compact?: boolean; tags: Tag[]; commentCounts: Record<string, number>; batchProps: BatchProps; onOpenDetail: (task: Task) => void; getName: (id: string) => string; getAvatar: (id: string) => string; enableDrag?: boolean; }

export const TaskCard = React.memo(function TaskCard({ task, compact, tags, commentCounts, batchProps, onOpenDetail, getName, getAvatar, enableDrag }: TaskCardProps) {
  const bp = priorityToBP(task.priority);
  const bpC = IMPORTANCE_CONFIG[bp];
  const overdue = isOverdue(task);
  const stDone = (task.subtasks || []).filter(s => s.completed).length;
  const cc = commentCounts[task.id] || 0;
  const uniqueTags = (task.tags || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
  return (
    <div data-item-id={task.id} data-item-type="task" className={cn('bg-card rounded-lg border border-border shadow-sm p-3 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group', overdue && 'border-l-4 border-l-red-400', compact && 'p-2')} draggable={!!enableDrag} onDragStart={(e: React.DragEvent) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => onOpenDetail(task)}>
      {batchProps.batchMode && <div className="mb-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={e => { e.stopPropagation(); const fn = (e.nativeEvent?.shiftKey && batchProps.shiftSelect) ? batchProps.shiftSelect : batchProps.onToggleSelect; fn(task.id); }} /></div>}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold', bpC.color)}>{bpC.label}</span>
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
        {task.parentId && <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded">子任务</span>}
        {cc > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto"><MessageSquare size={11} />{cc}</span>}
      </div>
      <h4 className={cn('font-medium text-sm mb-1.5 truncate', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</h4>
      {task.description && !compact && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><span className="flex items-center gap-1"><div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold">{getAvatar(task.leaderId)}</div>{getName(task.leaderId)}</span></div>
        <div className="flex items-center gap-2">
          {task.dueDate && <span className={cn('flex items-center gap-0.5', overdue && 'text-red-500 font-medium')}><Calendar className="w-3 h-3" />{task.dueDate}</span>}
          {(task.subtasks || []).length > 0 && <span className="flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />{stDone}/{(task.subtasks || []).length}</span>}
        </div>
      </div>
      {(uniqueTags.length > 0 || task.category) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.category && <span className="text-[10px] px-1.5 py-0.5 bg-accent rounded">{task.category}</span>}
          {uniqueTags.slice(0, 3).map(tag => { const tg = tags.find((t: Tag) => t.name === tag); return <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (tg?.color || '#888') + '20', color: tg?.color || '#888' }}>{tag}</span>; })}
          {uniqueTags.length > 3 && <span className="text-[10px] text-muted-foreground">+{uniqueTags.length - 3}</span>}
        </div>
      )}
    </div>
  );
});

interface TaskRowProps { task: Task; depth: number; childMap: Record<string, Task[]>; expandedTask: string | null; commentCounts: Record<string, number>; batchProps: BatchProps; onOpenDetail: (task: Task) => void; onToggleExpand: (id: string) => void; onToggleSubtask: (taskId: string, subtaskId: string) => void; onUpdateStatus: (taskId: string, status: TaskStatus) => void; onUpdatePriority: (taskId: string, priority: TaskPriority) => void; onUpdateLeader: (taskId: string, leaderId: string) => void; getName: (id: string) => string; getAvatar: (id: string) => string; getProjectTitle: (id: string | null) => string; members: Array<{ id: string; name: string }>; }

export const TaskRow = React.memo(function TaskRow({ task, depth, childMap, expandedTask, commentCounts, batchProps, onOpenDetail, onToggleExpand, onToggleSubtask, onUpdateStatus, onUpdatePriority, onUpdateLeader, getName, getAvatar, getProjectTitle, members }: TaskRowProps) {
  const isExpanded = expandedTask === task.id;
  const children = childMap[task.id] || [];
  const overdue = isOverdue(task);
  const stDone = (task.subtasks || []).filter(s => s.completed).length;
  const cc = commentCounts[task.id] || 0;
  const [showLeaderPicker, setShowLeaderPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLeaderPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowLeaderPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLeaderPicker]);

  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = STATUS_CYCLE.indexOf(task.status);
    onUpdateStatus(task.id, idx >= 0 ? STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] : 'todo');
  };
  const handlePriorityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = PRIORITY_CYCLE.indexOf(task.priority);
    onUpdatePriority(task.id, PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
  };

  return (
    <div>
      <div data-item-id={task.id} data-item-type="task" className={cn('flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer border-b border-border/50', overdue && 'bg-red-50/30')} style={{ paddingLeft: `${12 + depth * 24}px` }} onClick={() => onOpenDetail(task)}>
        {batchProps.batchMode && <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded flex-shrink-0" onChange={e => { const fn = (e.nativeEvent?.shiftKey && batchProps.shiftSelect) ? batchProps.shiftSelect : batchProps.onToggleSelect; fn(task.id); }} /></span>}
        {children.length > 0 ? <button className="p-0.5 hover:bg-accent rounded flex-shrink-0" onClick={e => { e.stopPropagation(); onToggleExpand(task.id); }}>{isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}</button> : <span className="w-4 flex-shrink-0" />}
        <StatusBadge status={task.status} onClick={handleStatusClick} />
        <h4 className={cn('flex-1 text-sm truncate min-w-0', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</h4>
        {cc > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 flex-shrink-0"><MessageSquare size={10} />{cc}</span>}
        <PriorityBadge priority={task.priority} onClick={handlePriorityClick} />
        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">{getProjectTitle(task.projectId)}</span>
        <div ref={pickerRef} className="relative hidden md:block" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1 whitespace-nowrap cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5 transition-colors" onClick={() => setShowLeaderPicker(!showLeaderPicker)}>
            <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold flex-shrink-0">{getAvatar(task.leaderId)}</div>
            <span className="text-xs text-muted-foreground">{getName(task.leaderId)}</span>
          </div>
          {showLeaderPicker && (
            <div className="absolute top-full right-0 z-50 mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[120px] max-h-40 overflow-y-auto">
              <button type="button" className="w-full text-xs px-2 py-1.5 text-left hover:bg-accent text-muted-foreground" onClick={() => { onUpdateLeader(task.id, ''); setShowLeaderPicker(false); }}>未指定</button>
              {members.map(m => (
                <button key={m.id} type="button" className={cn('w-full text-xs px-2 py-1.5 text-left hover:bg-accent', m.id === task.leaderId && 'bg-primary/10 text-primary font-medium')} onClick={() => { onUpdateLeader(task.id, m.id); setShowLeaderPicker(false); }}>{m.name}</button>
              ))}
            </div>
          )}
        </div>
        {task.dueDate && <span className={cn('text-xs whitespace-nowrap flex items-center gap-0.5 hidden sm:flex', overdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}><Calendar className="w-3 h-3" />{task.dueDate}</span>}
        {(task.subtasks || []).length > 0 && <span className="text-xs text-muted-foreground whitespace-nowrap hidden lg:inline">{stDone}/{(task.subtasks || []).length}</span>}
      </div>
      {isExpanded && (
        <div className="bg-muted/20 border-b border-border/50 py-3 px-4" style={{ paddingLeft: `${36 + depth * 24}px` }}>
          {task.description && <p className="text-xs text-muted-foreground mb-2">{task.description}</p>}
          {children.length > 0 && (
            <div className="space-y-0.5 mb-2">
              <span className="text-xs font-medium text-muted-foreground">子任务：</span>
              {children.map(c => <div key={c.id} className="flex items-center gap-2 py-1 px-2 hover:bg-accent/50 rounded cursor-pointer text-sm" onClick={() => onOpenDetail(c)}><StatusBadge status={c.status} /><span className="truncate flex-1">{c.title}</span><PriorityBadge priority={c.priority} /><span className="text-xs text-muted-foreground">{getName(c.leaderId)}</span></div>)}
            </div>
          )}
          {(task.subtasks || []).length > 0 && (
            <div className="space-y-1 mb-2">
              <span className="text-xs font-medium text-muted-foreground">子事项：</span>
              {(task.subtasks || []).map(st => <label key={st.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 px-2 py-0.5 rounded"><input type="checkbox" checked={st.completed} className="rounded border-input" onChange={e => { e.stopPropagation(); onToggleSubtask(task.id, st.id); }} /><span className={cn(st.completed && 'line-through text-muted-foreground')}>{st.title}</span></label>)}
            </div>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {(['todo', 'in_progress', 'done'] as TaskStatus[]).map(s => <button key={s} className={cn('text-xs px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors', task.status === s && 'bg-primary text-primary-foreground border-primary')} onClick={e => { e.stopPropagation(); onUpdateStatus(task.id, s); }}>{STATUS_CONFIG[s].label}</button>)}
          </div>
        </div>
      )}
      {children.length > 0 && children.map(c => <TaskRow key={c.id} task={c} depth={depth + 1} childMap={childMap} expandedTask={expandedTask} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={onOpenDetail} onToggleExpand={onToggleExpand} onToggleSubtask={onToggleSubtask} onUpdateStatus={onUpdateStatus} onUpdatePriority={onUpdatePriority} onUpdateLeader={onUpdateLeader} getName={getName} getAvatar={getAvatar} getProjectTitle={getProjectTitle} members={members} />)}
    </div>
  );
});
