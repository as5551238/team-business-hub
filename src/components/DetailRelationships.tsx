import React, { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal, Project, Task, ItemType } from '@/types';
import { Target, FolderKanban, CheckSquare } from 'lucide-react';
import { Section } from './detail-shared';
import { collectDescendantIds } from './detail-shared';

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
          <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-card" value={(goal as Goal)?.parentId || ''} onChange={e => handleParentChange('parentId', e.target.value || null)}>
            <option value="">无</option>
            {availableParentGoals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
      )}
      {itemType === 'project' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">父项目</label>
            <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-card mt-1" value={(project as Project)?.parentId || ''} onChange={e => handleParentChange('parentId', e.target.value || null)}>
              <option value="">无</option>
              {availableParentProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">关联目标</label>
            <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-card mt-1" value={(project as Project)?.goalId || ''} onChange={e => handleParentChange('goalId', e.target.value || null)}>
              <option value="">无</option>
              {state.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
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
            <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-card mt-1" value={(task as Task)?.parentId || ''} onChange={e => handleParentChange('parentId', e.target.value || null)}>
              <option value="">无</option>
              {availableParentTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">所属项目</label>
            <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-card mt-1" value={(task as Task)?.projectId || ''} onChange={e => handleParentChange('projectId', e.target.value || null)}>
              <option value="">无</option>
              {state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">关联目标</label>
            <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-card mt-1" value={(task as Task)?.goalId || ''} onChange={e => { handleParentChange('goalId', e.target.value || null); if (!e.target.value) updateItem({ krId: undefined }); }}>
              <option value="">无</option>
              {state.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          {(task as Task)?.goalId && (() => {
            const linkedGoal = state.goals.find(g => g.id === (task as Task)?.goalId);
            const krs = (linkedGoal?.keyResults ?? []).filter(kr => kr.selected !== false);
            return krs.length > 0 ? (
              <div>
                <label className="text-xs text-muted-foreground">关联关键结果</label>
                <p className="text-[10px] text-muted-foreground mb-1">任务完成时自动+1该KR的当前值</p>
                <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-card mt-0.5" value={(task as Task)?.krId || ''} onChange={e => updateItem({ krId: e.target.value || undefined })}>
                  <option value="">不关联</option>
                  {krs.map(kr => <option key={kr.id} value={kr.id}>{kr.title} ({kr.currentValue}/{kr.targetValue})</option>)}
                </select>
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
