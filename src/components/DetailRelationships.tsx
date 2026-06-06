import React, { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal, Project, Task, ItemType } from '@/types';
import { Target, FolderKanban, CheckSquare } from 'lucide-react';
import { Section } from './detail-shared';
import { collectDescendantIds } from './detail-shared';
import { SimpleSelect } from '@/components/ui/simple-select';

interface DetailRelationshipsProps {
  itemType: ItemType;
  itemId: string;
  goal: Goal | null;
  project: Project | null;
  task: Task | null;
  canEdit: boolean;
  updateItem: (updates: Record<string, unknown>) => void;
}

export function DetailRelationships({ itemType, itemId, goal, project, task, canEdit, updateItem }: DetailRelationshipsProps) {
  const { state } = useStore();

  const { availableParentGoals, availableParentProjects, availableParentTasks } = useMemo(() => {
    const goalD = goal ? collectDescendantIds(state.goals, itemId) : new Set<string>();
    const projectD = project ? collectDescendantIds(state.projects, itemId) : new Set<string>();
    const taskD = task ? collectDescendantIds(state.tasks, itemId) : new Set<string>();
    return {
      availableParentGoals: state.goals.filter(g => g.id !== itemId && !goalD.has(g.id)),
      availableParentProjects: state.projects.filter(p => p.id !== itemId && !projectD.has(p.id)),
      availableParentTasks: state.tasks.filter(t => t.id !== itemId && !taskD.has(t.id)),
    };
  }, [state.goals, state.projects, state.tasks, itemId, goal, project, task]);

  function handleParentChange(field: string, value: string | null) {
    if (field === 'parentId') updateItem({ parentId: value });
    else if (field === 'goalId') updateItem({ goalId: value });
    else if (field === 'projectId') updateItem({ projectId: value });
  }

  function getItemTitle(id: string, type: ItemType) {
    if (type === 'goal') return state.goals.find(g => g.id === id)?.title || id;
    if (type === 'project') return state.projects.find(p => p.id === id)?.title || id;
    return state.tasks.find(t => t.id === id)?.title || id;
  }

  return (
    <Section title="归属关系">
      {itemType === 'goal' && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">父目标</label>
          <SimpleSelect value={(goal as Goal)?.parentId || '__EMPTY__'} onValueChange={(v) => handleParentChange('parentId', v === '__EMPTY__' ? null : v)} options={[{ value: '__EMPTY__', label: '无' }, ...availableParentGoals.map(g => ({ value: g.id, label: g.title }))]} className="w-full h-9 text-sm" />
        </div>
      )}
      {itemType === 'project' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">父项目</label>
            <SimpleSelect value={(project as Project)?.parentId || '__EMPTY__'} onValueChange={(v) => handleParentChange('parentId', v === '__EMPTY__' ? null : v)} options={[{ value: '__EMPTY__', label: '无' }, ...availableParentProjects.map(p => ({ value: p.id, label: p.title }))]} className="w-full h-9 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">关联目标</label>
            <SimpleSelect value={(project as Project)?.goalId || '__EMPTY__'} onValueChange={(v) => handleParentChange('goalId', v === '__EMPTY__' ? null : v)} options={[{ value: '__EMPTY__', label: '无' }, ...state.goals.map(g => ({ value: g.id, label: g.title }))]} className="w-full h-9 text-sm mt-1" />
          </div>
          {(project as Project)?.goalId && (
            <div className="flex items-center gap-1.5 mt-1">
              <Target className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">{getItemTitle((project as Project).goalId!, 'goal')}</span>
            </div>
          )}
        </div>
      )}
      {itemType === 'task' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">父任务</label>
            <SimpleSelect value={(task as Task)?.parentId || '__EMPTY__'} onValueChange={(v) => handleParentChange('parentId', v === '__EMPTY__' ? null : v)} options={[{ value: '__EMPTY__', label: '无' }, ...availableParentTasks.map(t => ({ value: t.id, label: t.title }))]} className="w-full h-9 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">所属项目</label>
            <SimpleSelect value={(task as Task)?.projectId || '__EMPTY__'} onValueChange={(v) => handleParentChange('projectId', v === '__EMPTY__' ? null : v)} options={[{ value: '__EMPTY__', label: '无' }, ...state.projects.map(p => ({ value: p.id, label: p.title }))]} className="w-full h-9 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">关联目标</label>
            <SimpleSelect value={(task as Task)?.goalId || '__EMPTY__'} onValueChange={(v) => { const val = v === '__EMPTY__' ? null : v; handleParentChange('goalId', val); if (val === null) updateItem({ krId: undefined }); }} options={[{ value: '__EMPTY__', label: '无' }, ...state.goals.map(g => ({ value: g.id, label: g.title }))]} className="w-full h-9 text-sm mt-1" />
          </div>
          {(task as Task)?.goalId && (() => {
            const linkedGoal = state.goals.find(g => g.id === (task as Task)?.goalId);
            const krs = (linkedGoal?.keyResults ?? []).filter(kr => kr.selected !== false);
            return krs.length > 0 ? (
              <div>
                <label className="text-xs text-muted-foreground">关联关键结果</label>
                <p className="text-[10px] text-muted-foreground mb-1">任务完成时自动+1该KR的当前值</p>
                <SimpleSelect value={(task as Task)?.krId || '__EMPTY__'} onValueChange={(v) => updateItem({ krId: v === '__EMPTY__' ? undefined : v })} options={[{ value: '__EMPTY__', label: '不关联' }, ...krs.map(kr => ({ value: kr.id, label: `${kr.title} (${kr.currentValue}/${kr.targetValue})` }))]} className="w-full h-9 text-sm mt-0.5" />
              </div>
            ) : null;
          })()}
          <div className="flex items-center gap-2 flex-wrap">
            {(task as Task)?.projectId && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded"><FolderKanban className="w-3 h-3" />{getItemTitle((task as Task).projectId!, 'project')}</span>
            )}
            {(task as Task)?.goalId && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded"><Target className="w-3 h-3" />{getItemTitle((task as Task).goalId!, 'goal')}</span>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
