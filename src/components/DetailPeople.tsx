import React, { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useActiveMembers } from '@/store/hooks';
import type { Goal, Project, Task, ItemType } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { Section } from './detail-shared';

interface DetailPeopleProps {
  itemType: ItemType;
  itemId: string;
  goal: Goal | null;
  project: Project | null;
  task: Task | null;
  canEdit: boolean;
  updateItem: (updates: Record<string, unknown>) => void;
}

export function DetailPeople({ itemType, itemId, goal, project, task, canEdit, updateItem }: DetailPeopleProps) {
  const { state } = useStore();
  const { activeMembers } = useActiveMembers();

  const leaderId = goal?.leaderId || project?.leaderId || task?.leaderId || '';
  const supporterIds = (goal?.supporterIds || project?.supporterIds || task?.supporterIds) ?? [];
  const blockedBy = task?.blockedBy || [];

  const blockedByCandidates = useMemo(() => {
    if (itemType !== 'task' || !task) return [];
    return state.tasks.filter(t => t.id !== task.id && (t.projectId === task.projectId || t.goalId === task.goalId) && t.status !== 'done');
  }, [state.tasks, task, itemType]);

  function handleLeaderChange(val: string) {
    updateItem({ leaderId: val });
  }

  function toggleSupporter(memberId: string) {
    const next = supporterIds.includes(memberId) ? supporterIds.filter(id => id !== memberId) : [...supporterIds, memberId];
    updateItem({ supporterIds: next });
  }

  function toggleBlockedBy(taskId: string) {
    const next = blockedBy.includes(taskId) ? blockedBy.filter(id => id !== taskId) : [...blockedBy, taskId];
    updateItem({ blockedBy: next });
  }

  return (
    <>
      <Section title="人员配置" icon={<Users className="w-3.5 h-3.5" />}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">主导人</label>
            <select className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1 bg-card" value={leaderId} onChange={e => handleLeaderChange(e.target.value)}>
              <option value="">未指定</option>
              {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">协作人</label>
            <div className="mt-1 space-y-1 max-h-[160px] overflow-y-auto">
              {activeMembers.map(m => (
                <label key={m.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                  <Checkbox checked={supporterIds.includes(m.id)} onCheckedChange={() => toggleSupporter(m.id)} />
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">{m.name.charAt(0)}</div>
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {itemType === 'task' && (
        <Section title="前置任务" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            <EmptyState title="设置前置任务后，这些任务完成前无法开始或完成当前任务" compact />
            {blockedBy.length > 0 && (
              <div className="space-y-1">
                {blockedBy.map(bid => {
                  const bt = state.tasks.find(t => t.id === bid);
                  if (!bt) return null;
                  return (
                    <div key={bid} className="flex items-center gap-2 px-2 py-1 rounded bg-amber-50 text-sm">
                      <span className="flex-1 truncate" style={{ textDecoration: bt.status === 'done' ? 'line-through' : 'none' }}>{bt.title}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded', bt.status === 'done' ? 'bg-green-100 text-green-700' : bt.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>{bt.status === 'in_progress' ? '进行中' : bt.status === 'done' ? '已完成' : '待办'}</span>
                      <button className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => toggleBlockedBy(bid)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            {blockedByCandidates.length > 0 ? (
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {blockedByCandidates.filter(t => !blockedBy.includes(t.id)).map(t => (
                  <label key={t.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox checked={blockedBy.includes(t.id)} onCheckedChange={() => toggleBlockedBy(t.id)} />
                    <span className="flex-1 truncate">{t.title}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded', t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>{t.status === 'in_progress' ? '进行中' : '待办'}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">暂无可选的前置任务（同项目/目标下的未完成任务）</p>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
