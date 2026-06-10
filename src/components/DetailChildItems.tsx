import React, { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal, Project, Task, ItemType } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Target, FolderKanban, CheckSquare, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section, STATUS_MAP, PRIORITY_MAP } from './detail-shared';

interface DetailChildItemsProps {
  itemId: string;
  itemType: ItemType;
  task: Task | null;
}

export function DetailChildItems({ itemId, itemType, task }: DetailChildItemsProps) {
  const { state, dispatch } = useStore();

  const childGoals = useMemo(() => itemType === 'goal' ? state.goals.filter(g => g.parentId === itemId) : [], [state.goals, itemId, itemType]);
  const childProjects = useMemo(() => itemType === 'project' ? state.projects.filter(p => p.parentId === itemId) : [], [state.projects, itemId, itemType]);
  const childTasks = useMemo(() => itemType === 'task' ? state.tasks.filter(t => t.parentId === itemId) : [], [state.tasks, itemId, itemType]);
  const subtasks = task?.subtasks || [];

  if (childGoals.length === 0 && childProjects.length === 0 && childTasks.length === 0 && subtasks.length === 0) return null;

  return (
    <Section title="子项进度">
      <div className="space-y-2">
        {childGoals.map(cg => {
          const leader = state.members.find(m => m.id === cg.leaderId);
          return (
            <div key={cg.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
              <Target className="w-3.5 h-3.5 text-blue-500" />
              <span className="flex-1 truncate">{cg.title}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[cg.status]?.color)}>{STATUS_MAP[cg.status]?.label}</span>
              <Progress value={cg.progress} className="w-12 h-1.5" />
              <span className="text-xs text-muted-foreground w-7 text-right">{cg.progress}%</span>
              {leader && <span className="text-[10px] text-muted-foreground">{leader.name}</span>}
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          );
        })}
        {childProjects.map(cp => {
          const leader = state.members.find(m => m.id === cp.leaderId);
          return (
            <div key={cp.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
              <FolderKanban className="w-3.5 h-3.5 text-orange-500" />
              <span className="flex-1 truncate">{cp.title}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[cp.status]?.color)}>{STATUS_MAP[cp.status]?.label}</span>
              <Progress value={cp.progress} className="w-12 h-1.5" />
              <span className="text-xs text-muted-foreground w-7 text-right">{cp.progress}%</span>
              {leader && <span className="text-[10px] text-muted-foreground">{leader.name}</span>}
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          );
        })}
        {childTasks.map(ct => (
          <div key={ct.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
            <CheckSquare className="w-3.5 h-3.5 text-green-500" />
            <span className="flex-1 truncate">{ct.title}</span>
            <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[ct.status]?.color)}>{STATUS_MAP[ct.status]?.label}</span>
            <span className={cn('px-1.5 py-0.5 rounded text-[10px]', PRIORITY_MAP[ct.priority]?.color)}>{PRIORITY_MAP[ct.priority]?.label}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        ))}
        {subtasks.map(st => (
          <div key={st.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent">
            <Checkbox checked={st.completed} onCheckedChange={() => dispatch({ type: 'TOGGLE_SUBTASK', payload: { taskId: itemId, subtaskId: st.id } })} />
            <span className={cn('flex-1 truncate', st.completed && 'line-through text-muted-foreground')}>{st.title}</span>
            <span className={cn('px-1.5 py-0.5 rounded text-[10px]', PRIORITY_MAP[st.priority]?.color)}>{PRIORITY_MAP[st.priority]?.label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
