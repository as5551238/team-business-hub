import React, { useState, lazy, Suspense } from 'react';
import { useStore } from '@/store/useStore';
import type { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Plus, FolderKanban, CheckSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
const ProjectGanttChart = lazy(() => import('@/components/ProjectGanttChart').then(m => ({ default: m.ProjectGanttChart })));
import { Section, STATUS_MAP } from './detail-shared';

interface DetailProjectSectionsProps {
  project: Project;
  startDate: string;
  endDate: string;
}

export function DetailProjectSections({ project, startDate, endDate }: DetailProjectSectionsProps) {
  const { state, dispatch } = useStore();
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    dispatch({ type: 'ADD_TASK', payload: { title: newTaskTitle.trim(), projectId: project.id, goalId: project.goalId, parentId: null, status: 'todo' as const, priority: 'medium' as const, leaderId: state.currentUser?.id || '', supporterIds: [], tags: [], description: '', startDate: null, dueDate: null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none' as const, category: '', summary: '', blockedBy: [], sprintId: null } });
    setNewTaskTitle('');
    setShowAddTask(false);
  }

  const pTasks = state.tasks.filter(t => t.projectId === project.id);
  const pTotal = pTasks.length;
  const pDone = pTasks.filter(t => t.status === 'done').length;
  const pInProgress = pTasks.filter(t => t.status === 'in_progress').length;
  const pBlocked = pTasks.filter(t => t.status === 'blocked').length;
  const pTodo = pTasks.filter(t => t.status === 'todo').length;

  return (
    <>
      <Section title="项目计划" icon={<FolderKanban className="w-3.5 h-3.5" />}>
        <Suspense fallback={<div className="animate-pulse bg-muted h-48 rounded-lg" />}><ProjectGanttChart projectId={project.id} projectStartDate={startDate} projectEndDate={endDate} /></Suspense>
      </Section>

      {pTotal > 0 && (
        <Section title="任务概览">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pTotal > 0 ? Math.round(pDone / pTotal * 100) : 0}%` }} /></div>
            <span className="text-xs font-medium text-muted-foreground flex-shrink-0">{pDone}/{pTotal} 完成</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-blue-50 px-2 py-1.5"><div className="text-sm font-bold text-blue-600">{pTodo}</div><div className="text-[10px] text-muted-foreground">待办</div></div>
            <div className="rounded-lg bg-indigo-50 px-2 py-1.5"><div className="text-sm font-bold text-indigo-600">{pInProgress}</div><div className="text-[10px] text-muted-foreground">进行中</div></div>
            <div className="rounded-lg bg-green-50 px-2 py-1.5"><div className="text-sm font-bold text-green-600">{pDone}</div><div className="text-[10px] text-muted-foreground">已完成</div></div>
            <div className="rounded-lg bg-amber-50 px-2 py-1.5"><div className="text-sm font-bold text-amber-600">{pBlocked}</div><div className="text-[10px] text-muted-foreground">阻塞</div></div>
          </div>
        </Section>
      )}

      <Section title="关联任务" icon={<CheckSquare className="w-3.5 h-3.5" />} action={<button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={() => setShowAddTask(v => !v)} aria-label="添加关联任务"><Plus className="w-3.5 h-3.5" /></button>}>
        <div className="space-y-1">
          {pTasks.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
              <CheckSquare className="w-3.5 h-3.5 text-green-500" />
              <span className="flex-1 truncate">{t.title}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[t.status]?.color)}>{STATUS_MAP[t.status]?.label}</span>
            </div>
          ))}
          {pTasks.length === 0 && <EmptyState title="暂无关联任务" compact />}
          {showAddTask && (
            <div className="flex gap-2 mt-2">
              <input className="flex-1 px-2 py-1 text-sm border rounded" placeholder="任务名称" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }} />
              <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded" onClick={handleAddTask}>创建</button>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
