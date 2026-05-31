/**
 * 我的今日 — 成员首屏（解决F1断裂点：Dashboard=管理视角→改为执行者视角）
 * 4个子区域：到期今日 / 逾期未完 / @提及未读 / 被阻塞任务
 */
import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useFeatureFlag } from '@/lib/featureFlags';
import { activeGoals, activeProjects, activeTasks } from '@/store/shared';
import { Clock, AlertTriangle, AtSign, Lock, ChevronRight, CheckCircle2, Target, FolderKanban, CheckSquare } from 'lucide-react';

interface MyTodayProps {
  onOpenDetail: (id: string, type: 'goal' | 'project' | 'task') => void;
}

export function MyTodayView({ onOpenDetail }: MyTodayProps) {
  const { state } = useStore();
  const isEnabled = useFeatureFlag('my_today_view');
  const [expanded, setExpanded] = useState<string | null>('dueToday');

  const userId = state.currentUser?.id;
  const tasks = activeTasks(state.tasks);
  const goals = activeGoals(state.goals);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Due today
  const dueToday = useMemo(() =>
    tasks.filter(t =>
      t.assigneeId === userId &&
      t.status !== 'done' &&
      t.dueDate === today
    ).slice(0, 5),
    [tasks, userId, today]
  );

  // Overdue (due date < today, not done)
  const overdue = useMemo(() =>
    tasks.filter(t =>
      t.assigneeId === userId &&
      t.status !== 'done' &&
      t.dueDate && t.dueDate < today
    ).slice(0, 5),
    [tasks, userId, today]
  );

  // Unread @mentions
  const unreadMentions = useMemo(() => {
    const comments = state.comments || [];
    return comments.filter(c =>
      c.mentionedMemberIds?.includes(userId || '') &&
      !c.isRead
    ).slice(0, 5);
  }, [state.comments, userId]);

  // Blocked tasks
  const blockedTasks = useMemo(() =>
    tasks.filter(t =>
      t.assigneeId === userId &&
      t.status === 'blocked' &&
      t.blockedBy && t.blockedBy.length > 0
    ).slice(0, 5),
    [tasks, userId]
  );

  if (!isEnabled) return null;

  const hasItems = dueToday.length > 0 || overdue.length > 0 || unreadMentions.length > 0 || blockedTasks.length > 0;

  const sections = [
    {
      id: 'dueToday',
      title: '到期今日',
      icon: <Clock size={16} className="text-blue-600" />,
      count: dueToday.length,
      color: 'blue',
      items: dueToday.map(t => ({
        id: t.id,
        title: t.title,
        type: 'task' as const,
        subtitle: t.dueDate || '',
      })),
    },
    {
      id: 'overdue',
      title: '逾期未完',
      icon: <AlertTriangle size={16} className="text-red-600" />,
      count: overdue.length,
      color: 'red',
      items: overdue.map(t => ({
        id: t.id,
        title: t.title,
        type: 'task' as const,
        subtitle: `逾期 ${t.dueDate || ''}`,
      })),
    },
    {
      id: 'mentions',
      title: '@我的未读',
      icon: <AtSign size={16} className="text-purple-600" />,
      count: unreadMentions.length,
      color: 'purple',
      items: unreadMentions.map(c => ({
        id: c.itemId,
        title: c.content?.slice(0, 50) || '',
        type: (c.itemType as 'task' | 'goal' | 'project') || 'task',
        subtitle: c.memberName || '',
      })),
    },
    {
      id: 'blocked',
      title: '被阻塞',
      icon: <Lock size={16} className="text-amber-600" />,
      count: blockedTasks.length,
      color: 'amber',
      items: blockedTasks.map(t => ({
        id: t.id,
        title: t.title,
        type: 'task' as const,
        subtitle: `被 ${t.blockedBy.length} 个任务阻塞`,
      })),
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };

  const typeIcon = (type: string) => {
    if (type === 'goal') return <Target size={12} className="text-indigo-500" />;
    if (type === 'project') return <FolderKanban size={12} className="text-blue-500" />;
    return <CheckSquare size={12} className="text-green-500" />;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">我的今日</h2>
        {!hasItems && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 size={14} /> 没有待办事项
          </span>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-3">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            className={`p-3 rounded-xl border transition-all text-left ${
              expanded === s.id
                ? 'ring-2 ring-offset-1 ring-indigo-400 border-indigo-200'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
            } ${s.count === 0 ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {s.icon}
              <span className="text-xs text-gray-500 dark:text-gray-400">{s.title}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.count}</div>
          </button>
        ))}
      </div>

      {/* Expanded section */}
      {expanded && sections.find(s => s.id === expanded)?.items.map(item => (
        <div
          key={item.id}
          onClick={() => onOpenDetail(item.id, item.type)}
          className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          {typeIcon(item.type)}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
            {item.subtitle && <p className="text-xs text-gray-400 mt-0.5">{item.subtitle}</p>}
          </div>
          <ChevronRight size={14} className="text-gray-300" />
        </div>
      ))}
    </div>
  );
}
