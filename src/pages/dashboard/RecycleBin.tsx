import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { activeGoals, activeProjects, activeTasks, deletedGoals, deletedProjects, deletedTasks } from '@/store/shared';
import { Trash2, RotateCcw, Target, FolderKanban, CheckSquare, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

export function RecycleBin() {
  const { state, dispatch } = useStore();
  const [expanded, setExpanded] = useState(false);

  const delGoals = deletedGoals(state.goals);
  const delProjects = deletedProjects(state.projects);
  const delTasks = deletedTasks(state.tasks);
  const totalCount = delGoals.length + delProjects.length + delTasks.length;

  if (totalCount === 0) return null;

  // Auto-purge items older than 30 days
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const isExpired = (d?: string) => d ? (Date.now() - new Date(d).getTime()) > THIRTY_DAYS : false;

  const handleRestore = (type: 'goal' | 'project' | 'task', id: string) => {
    const actionType = type === 'goal' ? 'RESTORE_GOAL' : type === 'project' ? 'RESTORE_PROJECT' : 'RESTORE_TASK';
    dispatch({ type: actionType, payload: id } as any);
  };

  return (
    <div className="bg-card dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors"
      >
        <Trash2 size={18} className="text-amber-600" />
        <span className="font-medium text-gray-900 dark:text-gray-100 flex-1 text-left">
          回收站
          <span className="ml-2 text-sm font-normal text-amber-600">({totalCount})</span>
        </span>
        {expanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-amber-200 dark:border-amber-800 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-3">
            <AlertTriangle size={14} />
            <span>删除后30天内可恢复，超期将自动清除</span>
          </div>

          {delGoals.map(g => (
            <div key={g.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-750 rounded-lg">
              <Target size={14} className="text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{g.title}</p>
                <p className="text-xs text-gray-400">目标 · 删除于 {g.deletedAt ? new Date(g.deletedAt).toLocaleDateString() : ''}</p>
              </div>
              {!isExpired(g.deletedAt) && (
                <button
                  onClick={() => handleRestore('goal', g.id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                >
                  <RotateCcw size={12} /> 恢复
                </button>
              )}
            </div>
          ))}

          {delProjects.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-750 rounded-lg">
              <FolderKanban size={14} className="text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{p.title}</p>
                <p className="text-xs text-gray-400">项目 · 删除于 {p.deletedAt ? new Date(p.deletedAt).toLocaleDateString() : ''}</p>
              </div>
              {!isExpired(p.deletedAt) && (
                <button
                  onClick={() => handleRestore('project', p.id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                >
                  <RotateCcw size={12} /> 恢复
                </button>
              )}
            </div>
          ))}

          {delTasks.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-750 rounded-lg">
              <CheckSquare size={14} className="text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{t.title}</p>
                <p className="text-xs text-gray-400">任务 · 删除于 {t.deletedAt ? new Date(t.deletedAt).toLocaleDateString() : ''}</p>
              </div>
              {!isExpired(t.deletedAt) && (
                <button
                  onClick={() => handleRestore('task', t.id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                >
                  <RotateCcw size={12} /> 恢复
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
