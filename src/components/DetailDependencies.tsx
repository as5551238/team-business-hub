import React, { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import type { Task, TaskStatus } from '@/types';
import { Section } from './detail-shared';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Link2, AlertTriangle, CheckCircle2, Clock, Ban } from 'lucide-react';

interface DetailDependenciesProps {
  taskId: string;
  task: Task;
  canEdit: boolean;
  updateItem: (updates: Record<string, unknown>) => void;
}

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  done: <CheckCircle2 className="w-3 h-3 text-green-500" />,
  in_progress: <Clock className="w-3 h-3 text-blue-500" />,
  todo: <Clock className="w-3 h-3 text-gray-400" />,
  blocked: <Ban className="w-3 h-3 text-amber-500" />,
  cancelled: <Ban className="w-3 h-3 text-gray-300" />,
};

const STATUS_CHIP: Record<TaskStatus, string> = {
  done: 'bg-green-50 text-green-700 border-green-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  todo: 'bg-gray-50 text-gray-600 border-gray-200',
  blocked: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
};

/** DFS cycle detection: would adding depId → taskId create a cycle? */
function wouldCreateCycle(
  allTasks: Task[],
  taskId: string,
  depId: string,
): boolean {
  // We want to check: from depId, can we reach taskId via existing blockedBy?
  // If so, adding depId as a blocker of taskId creates cycle: taskId → ... → depId → taskId
  const visited = new Set<string>();
  const stack = [depId];
  const taskMap = new Map(allTasks.map(t => [t.id, t]));
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const t = taskMap.get(current);
    if (t) {
      for (const bid of t.blockedBy) {
        stack.push(bid);
      }
    }
  }
  return false;
}

export function DetailDependencies({ taskId, task, canEdit, updateItem }: DetailDependenciesProps) {
  const { state } = useStore();
  const [showDependents, setShowDependents] = useState(false);

  const blockedBy = task.blockedBy ?? [];

  // Reverse lookup: tasks that list this task in their blockedBy
  const dependents = useMemo(
    () => state.tasks.filter(t => !t.deletedAt && (t.blockedBy ?? []).includes(taskId)),
    [state.tasks, taskId],
  );

  // Resolve blocker tasks (filter out deleted)
  const blockerTasks = useMemo(
    () => blockedBy.map(id => state.tasks.find(t => t.id === id)).filter(Boolean) as Task[],
    [blockedBy, state.tasks],
  );

  // Available candidates (not self, not already a blocker, not deleted)
  const availableCandidates = useMemo(
    () => state.tasks.filter(
      t => t.id !== taskId && !blockedBy.includes(t.id) && !t.deletedAt,
    ),
    [state.tasks, taskId, blockedBy],
  );

  const completedBlockers = blockerTasks.filter(t => t.status === 'done').length;
  const totalBlockers = blockerTasks.length;
  const allBlockersDone = totalBlockers > 0 && completedBlockers === totalBlockers;

  function handleAddDep(id: string) {
    if (id === '__EMPTY__') return;
    if (wouldCreateCycle(state.tasks, taskId, id)) return; // silent reject — UI already filters
    const current = [...blockedBy];
    if (!current.includes(id)) {
      current.push(id);
      updateItem({ blockedBy: current });
    }
  }

  function handleRemoveDep(id: string) {
    const current = blockedBy.filter(bid => bid !== id);
    updateItem({ blockedBy: current });
  }

  return (
    <Section title="依赖关系" icon={<Link2 className="w-3.5 h-3.5" />}>
      <div className="space-y-3">
        {/* --- 前置依赖 (blockedBy) --- */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">
              前置依赖 {totalBlockers > 0 && `(${completedBlockers}/${totalBlockers} 已完成)`}
            </label>
            {totalBlockers > 0 && !allBlockersDone && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600">
                <AlertTriangle className="w-3 h-3" /> 仍有未完成依赖
              </span>
            )}
            {allBlockersDone && (
              <span className="flex items-center gap-1 text-[10px] text-green-600">
                <CheckCircle2 className="w-3 h-3" /> 所有依赖已完成
              </span>
            )}
          </div>

          {/* Existing dependencies as chips */}
          {blockerTasks.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {blockerTasks.map(bt => (
                <span
                  key={bt.id}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${STATUS_CHIP[bt.status]}`}
                >
                  {STATUS_ICON[bt.status]}
                  <span className="max-w-[120px] truncate">{bt.title}</span>
                  {canEdit && (
                    <button
                      className="ml-0.5 hover:text-destructive transition-colors cursor-pointer"
                      onClick={() => handleRemoveDep(bt.id)}
                      aria-label={`移除依赖: ${bt.title}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 mb-2">暂无前置依赖</p>
          )}

          {/* Add dependency selector */}
          {canEdit && availableCandidates.length > 0 && (
            <SimpleSelect
              value="__EMPTY__"
              onValueChange={handleAddDep}
              options={[
                { value: '__EMPTY__', label: '添加依赖...' },
                ...availableCandidates.map(t => ({
                  value: t.id,
                  label: t.title,
                })),
              ]}
              className="w-full h-8 text-sm"
            />
          )}
        </div>

        {/* --- 被依赖 (reverse) --- */}
        {dependents.length > 0 && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-1.5"
              onClick={() => setShowDependents(v => !v)}
            >
              <Link2 className="w-3 h-3" />
              被依赖 ({dependents.length})
              <span className={`transition-transform ${showDependents ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {showDependents && (
              <div className="flex flex-wrap gap-1.5">
                {dependents.map(dt => (
                  <span
                    key={dt.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${STATUS_CHIP[dt.status]}`}
                  >
                    {STATUS_ICON[dt.status]}
                    <span className="max-w-[120px] truncate">{dt.title}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
