import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStore } from '@/store/useStore';
import { usePermissions, useViewingMember } from '@/store/hooks';
import type { Task } from '@/types';

const STATUS_COLORS: Record<string, string> = { todo: '#94a3b8', in_progress: '#3b82f6', done: '#22c55e', blocked: '#f59e0b', cancelled: '#ef4444' };

export function GlobalGanttView() {
  const { state } = useStore();
  const { isAdmin } = usePermissions();
  const { viewingMemberId } = useViewingMember();
  const [filter, setFilter] = useState<'all' | 'project'>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const tasks = useMemo(() => {
    let filtered = state.tasks.filter(t => t.status !== 'cancelled');
    if (!isAdmin && viewingMemberId) {
      filtered = filtered.filter(t => t.leaderId === viewingMemberId || (t.supporterIds ?? []).includes(viewingMemberId));
    }
    if (filter === 'project' && selectedProjectId) {
      filtered = filtered.filter(t => t.projectId === selectedProjectId);
    }
    return filtered.filter(t => t.startDate || t.dueDate);
  }, [state.tasks, filter, selectedProjectId, isAdmin, viewingMemberId]);

  // Calculate date range
  const dateRange = useMemo(() => {
    const dates: Date[] = [];
    tasks.forEach(t => {
      if (t.startDate) dates.push(new Date(t.startDate));
      if (t.dueDate) dates.push(new Date(t.dueDate));
    });
    if (dates.length === 0) return { start: new Date(), end: new Date(), days: 1 };
    let minTs = dates[0].getTime();
    let maxTs = minTs;
    for (let i = 1; i < dates.length; i++) {
      const ts = dates[i].getTime();
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
    }
    const min = new Date(minTs);
    const max = new Date(maxTs);
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    const days = Math.min(Math.ceil((max.getTime() - min.getTime()) / 86400000) + 1, 365);
    return { start: min, end: max, days: Math.max(days, 1) };
  }, [tasks]);

  // Sort tasks: blocked first, then by start date
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.status === 'blocked' && b.status !== 'blocked') return -1;
      if (a.status !== 'blocked' && b.status === 'blocked') return 1;
      return (a.startDate ?? '').localeCompare(b.startDate ?? '');
    });
  }, [tasks]);

  const ROW_H = 32;
  const LABEL_W = 200;
  const DAY_W = Math.max(24, Math.min(40, 800 / dateRange.days));
  const chartW = dateRange.days * DAY_W;
  const chartH = sortedTasks.length * ROW_H + 40;

  function getDayOffset(dateStr: string) {
    return Math.floor((new Date(dateStr).getTime() - dateRange.start.getTime()) / 86400000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">全局甘特图</h3>
        <div className="flex items-center gap-2">
          <select className="border border-input rounded px-2 py-1 text-xs" value={filter} onChange={e => setFilter(e.target.value as any)}>
            <option value="all">全部任务</option>
            <option value="project">按项目筛选</option>
          </select>
          {filter === 'project' && (
            <select className="border border-input rounded px-2 py-1 text-xs" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
              <option value="">选择项目</option>
              {state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
        </div>
      </div>

      {sortedTasks.length === 0 ? (
        <EmptyState title="暂无带日期的任务" compact />
      ) : (
        <div className="border border-border rounded-lg overflow-auto bg-card" style={{ maxHeight: 500 }}>
          <svg width={LABEL_W + chartW} height={chartH} className="min-w-full">
            {/* Header dates */}
            {Array.from({ length: dateRange.days }).map((_, i) => {
              const d = new Date(dateRange.start.getTime() + i * 86400000);
              const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <g key={i}>
                  {isWeekend && <rect x={LABEL_W + i * DAY_W} y={0} width={DAY_W} height={chartH} fill="#f8fafc" />}
                  <text x={LABEL_W + i * DAY_W + DAY_W / 2} y={14} textAnchor="middle" fontSize={9} fill="#94a3b8">{i % 3 === 0 ? dateStr : ''}</text>
                </g>
              );
            })}
            {/* Today line */}
            {(() => {
              const todayOffset = getDayOffset(new Date().toISOString().split('T')[0]);
              if (todayOffset >= 0 && todayOffset < dateRange.days) {
                return <line x1={LABEL_W + todayOffset * DAY_W + DAY_W / 2} y1={20} x2={LABEL_W + todayOffset * DAY_W + DAY_W / 2} y2={chartH} stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 4" />;
              }
              return null;
            })()}
            {/* Tasks */}
            {sortedTasks.map((task, i) => {
              const startX = task.startDate ? getDayOffset(task.startDate) : (task.dueDate ? Math.max(0, getDayOffset(task.dueDate) - 3) : 0);
              const endX = task.dueDate ? getDayOffset(task.dueDate) : startX + 3;
              const barW = Math.max(DAY_W, (endX - startX + 1) * DAY_W);
              const color = STATUS_COLORS[task.status] ?? '#94a3b8';
              const y = 24 + i * ROW_H;
              return (
                <g key={task.id}>
                  <text x={LABEL_W - 8} y={y + ROW_H / 2 + 4} textAnchor="end" fontSize={10} fill="#475569">{task.title.length > 18 ? task.title.substring(0, 18) + '...' : task.title}</text>
                  <rect x={LABEL_W + startX * DAY_W} y={y + 4} width={barW} height={ROW_H - 8} rx={4} fill={color} opacity={0.8} />
                  {/* blockedBy dependency lines */}
                  {(task.blockedBy || []).map(bid => {
                    const depIdx = sortedTasks.findIndex(t => t.id === bid);
                    if (depIdx === -1) return null;
                    const depY = 24 + depIdx * ROW_H + ROW_H - 4;
                    return <line key={bid} x1={LABEL_W + startX * DAY_W} y1={y + ROW_H / 2} x2={LABEL_W + startX * DAY_W - 8} y2={depY} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" />;
                  })}
                </g>
              );
            })}
            {/* Separator line */}
            <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={chartH} stroke="#e2e8f0" strokeWidth={1} />
          </svg>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: STATUS_COLORS.todo }} />待办</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: STATUS_COLORS.in_progress }} />进行中</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: STATUS_COLORS.done }} />已完成</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: STATUS_COLORS.blocked }} />阻塞</span>
        <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-dashed" style={{ borderColor: '#f59e0b' }} />依赖线</span>
      </div>
    </div>
  );
}
