/**
 * GanttCore — 甘特图共享模块
 * 抽取自 GanttModal / ProjectGanttChart 的公共逻辑
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Task, TaskStatus } from '@/types';
import { calculateCriticalPath, suggestBuffers, DAY_MS, parseDate, type CPMResult, type CPMTaskMetrics } from '@/lib/gantt/cpm';
import { resolveToken } from '@/lib/resolveToken';

export type ZoomLevel = 'week' | 'month';

export { DAY_MS, parseDate, suggestBuffers };
export type { CPMResult, CPMTaskMetrics };

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-gray-300',
  in_progress: 'bg-blue-400',
  done: 'bg-green-500',
  blocked: 'bg-amber-400',
  cancelled: 'bg-red-300',
};

export const STATUS_BAR_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-gray-200 border-gray-300',
  in_progress: 'bg-blue-100 border-blue-400',
  done: 'bg-green-100 border-green-400',
  blocked: 'bg-amber-100 border-amber-400',
  cancelled: 'bg-red-100 border-red-300',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  blocked: '已阻塞',
  cancelled: '已取消',
};

export const CRITICAL_BAR_CLASS = 'ring-2 ring-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]';

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(ts: number, days: number): number {
  return ts + days * DAY_MS;
}

export function getMonday(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayToPixel(dayOffset: number, dayWidth: number): number {
  return dayOffset * dayWidth;
}

export function pixelToDay(px: number, dayWidth: number): number {
  return Math.round(px / dayWidth);
}

export function computeTimeRange(tasks: Array<{ startDate: string | null; dueDate: string | null }>): { start: number; end: number } {
  if (tasks.length === 0) return { start: getMonday(Date.now()), end: addDays(Date.now(), 30) };
  let minTs = Infinity, maxTs = -Infinity;
  for (const t of tasks) {
    const ts = parseDate(t.startDate) || parseDate(t.dueDate);
    const te = parseDate(t.dueDate) || parseDate(t.startDate);
    if (ts && ts < minTs) minTs = ts;
    if (te && te > maxTs) maxTs = te;
  }
  if (!isFinite(minTs)) minTs = Date.now();
  if (!isFinite(maxTs)) maxTs = addDays(Date.now(), 30);
  return { start: addDays(getMonday(minTs), -3), end: addDays(maxTs, 14) };
}

// ===== G5: 分组折叠 + 进度百分比 =====

export type GroupBy = 'none' | 'project' | 'leader' | 'priority' | 'status';

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  progress: number; // 0-100 done完成率
  collapsed: boolean;
}

/** 按指定维度对任务分组 */
export function groupTasks(tasks: Task[], groupBy: GroupBy, getProjectName?: (id: string) => string, getMemberName?: (id: string) => string): TaskGroup[] {
  if (groupBy === 'none') {
    const doneCount = tasks.filter(t => t.status === 'done').length;
    return [{ key: '__all', label: '全部任务', tasks, progress: tasks.length > 0 ? Math.round(doneCount / tasks.length * 100) : 0, collapsed: false }];
  }
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    let key: string;
    switch (groupBy) {
      case 'project': key = t.projectId || '__no_project'; break;
      case 'leader': key = t.leaderId || '__unassigned'; break;
      case 'priority': key = t.priority || 'medium'; break;
      case 'status': key = t.status || 'todo'; break;
      default: key = '__all';
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  const groups: TaskGroup[] = [];
  for (const [key, groupTasks] of map) {
    let label = key;
    if (groupBy === 'project') label = key === '__no_project' ? '未关联项目' : (getProjectName?.(key) || key);
    else if (groupBy === 'leader') label = key === '__unassigned' ? '未指定' : (getMemberName?.(key) || key);
    else if (groupBy === 'priority') label = { urgent: '紧急(S)', high: '高(A)', medium: '中(B)', low: '低(C)' }[key as string] || key;
    else if (groupBy === 'status') label = STATUS_LABELS[key as TaskStatus] || key;
    const doneCount = groupTasks.filter(t => t.status === 'done').length;
    groups.push({ key, label, tasks: groupTasks, progress: groupTasks.length > 0 ? Math.round(doneCount / groupTasks.length * 100) : 0, collapsed: false });
  }
  return groups;
}

/** 进度百分比填充颜色 */
export function getProgressColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-blue-500';
  if (pct >= 20) return 'bg-amber-500';
  return 'bg-red-500';
}

// ===== P2: 资源负载热力图 =====

/** 计算每位成员每日的活跃任务数 */
export function computeMemberLoadHeatmap(
  tasks: Array<{ startDate: string | null; dueDate: string | null; status: string; leaderId: string; supporterIds?: string[] }>,
  memberIds: string[],
  totalDays: number,
  timeRange: { start: number },
): Map<string, Uint8Array> {
  const loadMap = new Map<string, Uint8Array>();
  for (const mid of memberIds) {
    loadMap.set(mid, new Uint8Array(totalDays));
  }
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'cancelled') continue;
    const startTs = parseDate(t.startDate) || parseDate(t.dueDate) || timeRange.start;
    const dueTs = parseDate(t.dueDate) || addDays(startTs, 1);
    const involved = [t.leaderId, ...(t.supporterIds ?? [])];
    for (const mid of involved) {
      const arr = loadMap.get(mid);
      if (!arr) continue;
      const startDay = Math.max(0, Math.floor((startTs - timeRange.start) / DAY_MS));
      const endDay = Math.min(totalDays - 1, Math.ceil((dueTs - timeRange.start) / DAY_MS));
      for (let d = startDay; d <= endDay; d++) arr[d]++;
    }
  }
  return loadMap;
}

/** 负载热力图颜色 */
export function getLoadColor(count: number): string {
  if (count === 0) return 'bg-gray-50';
  if (count === 1) return 'bg-green-200';
  if (count === 2) return 'bg-green-400';
  if (count === 3) return 'bg-yellow-300';
  if (count === 4) return 'bg-orange-400';
  return 'bg-red-500';
}

export function useGanttDrag(opts: {
  tasks: Array<{ id: string; startDate: string | null; dueDate: string | null; tags?: string[] }>;
  timeRange: { start: number };
  dayWidth: number;
  canEdit: boolean;
  onDragEnd: (taskId: string, startDate: string, dueDate: string) => void;
}) {
  const { tasks, timeRange, dayWidth, canEdit, onDragEnd } = opts;
  const [dragInfo, setDragInfo] = useState<{
    taskId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    origStart: number;
    origDue: number;
  } | null>(null);
  const pendingRef = useRef<{ taskId: string; startDate: string; dueDate: string } | null>(null);
  const wasDraggingRef = useRef(false);

  const handleBarMouseDown = useCallback((e: React.MouseEvent, task: { id: string; startDate: string | null; dueDate: string | null }, type: 'move' | 'resize-start' | 'resize-end') => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const startTs = parseDate(task.startDate) || parseDate(task.dueDate) || Date.now();
    const dueTs = parseDate(task.dueDate) || parseDate(task.startDate) || addDays(Date.now(), 7);
    setDragInfo({ taskId: task.id, type, startX: e.clientX, origStart: startTs, origDue: dueTs });
  }, [canEdit]);

  useEffect(() => {
    if (!dragInfo) {
      if (wasDraggingRef.current) {
        const pending = pendingRef.current;
        if (pending) { onDragEnd(pending.taskId, pending.startDate, pending.dueDate); pendingRef.current = null; }
        wasDraggingRef.current = false;
      }
      return;
    }
    wasDraggingRef.current = true;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragInfo.startX;
      const dayDelta = Math.round(dx / dayWidth);
      if (dayDelta === 0) return;
      const task = tasks.find(t => t.id === dragInfo.taskId);
      if (!task) return;
      let newStart = dragInfo.origStart, newDue = dragInfo.origDue;
      if (dragInfo.type === 'move') { newStart = addDays(newStart, dayDelta); newDue = addDays(newDue, dayDelta); }
      else if (dragInfo.type === 'resize-start') { newStart = addDays(newStart, dayDelta); if (newStart >= newDue) newStart = addDays(newDue, -1); }
      else { newDue = addDays(newDue, dayDelta); if (newDue <= newStart) newDue = addDays(newStart, 1); }
      pendingRef.current = { taskId: task.id, startDate: formatDate(newStart), dueDate: formatDate(newDue) };
      const barEl = document.querySelector(`[data-gantt-bar="${task.id}"]`) as HTMLElement;
      if (barEl) {
        const newLeftPx = ((newStart - timeRange.start) / DAY_MS) * dayWidth;
        const isMilestone = task.tags?.includes('__milestone');
        const newWidthPx = Math.max(((newDue - newStart) / DAY_MS) * dayWidth, isMilestone ? 12 : dayWidth);
        barEl.style.left = newLeftPx + 'px';
        barEl.style.width = newWidthPx + 'px';
        barEl.style.opacity = '0.7';
        barEl.style.zIndex = '10';
      }
    };
    const handleMouseUp = () => setDragInfo(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragInfo, dayWidth, tasks, timeRange, onDragEnd]);

  return { dragInfo, handleBarMouseDown };
}

export function useGanttScale(initialZoom: ZoomLevel = 'week') {
  const [zoom, setZoom] = useState<ZoomLevel>(initialZoom);
  const [scrollOffset, setScrollOffset] = useState(0);
  const toggleZoom = useCallback(() => {
    setZoom(z => z === 'week' ? 'month' : 'week');
    setScrollOffset(0);
  }, []);
  const scrollBy = useCallback((delta: number) => {
    setScrollOffset(prev => Math.max(0, prev + delta));
  }, []);
  return { zoom, scrollOffset, setScrollOffset, toggleZoom, scrollBy };
}

export function useCPM(tasks: Array<{ id: string; startDate: string | null; dueDate: string | null; blockedBy: string[] }>) {
  return useMemo(() => calculateCriticalPath(tasks), [tasks]);
}

export function renderDependencyLines(opts: {
  task: { id: string; startDate: string | null; dueDate: string | null; blockedBy: string[]; status?: string; title?: string };
  allTasks: Array<{ id: string; startDate: string | null; dueDate: string | null; blockedBy: string[]; status?: string; title?: string }>;
  taskIndexMap: Map<string, number>;
  timeRange: { start: number };
  dayWidth: number;
  rowHeight: number;
  cpmResult: CPMResult | null;
}): React.ReactNode[] {
  const { task, allTasks, taskIndexMap, timeRange, dayWidth, rowHeight, cpmResult } = opts;
  const results: React.ReactNode[] = [];
  const startTs = parseDate(task.startDate) || parseDate(task.dueDate) || timeRange.start;
  const lineStartX = ((startTs - timeRange.start) / DAY_MS) * dayWidth;
  const currentIdx = taskIndexMap.get(task.id) ?? 0;

  for (const bid of (task.blockedBy || [])) {
    const depIdx = taskIndexMap.get(bid);
    if (depIdx === undefined) continue;
    const depTask = allTasks[depIdx];
    const depEndTs = parseDate(depTask.dueDate) || parseDate(depTask.startDate) || timeRange.start;
    const lineEndX = ((depEndTs - timeRange.start) / DAY_MS) * dayWidth + dayWidth;
    const fromX = lineEndX;
    const toX = lineStartX;
    const fromY = depIdx < currentIdx ? rowHeight : 0;
    const toY = rowHeight / 2;
    const isBothCritical = cpmResult && cpmResult.criticalTaskIds.has(bid) && cpmResult.criticalTaskIds.has(task.id);
    // Status-aware coloring: blocker done = green, blocker blocked = amber-red, else default
    const blockerDone = depTask.status === 'done';
    const blockerBlocked = depTask.status === 'blocked';
    let strokeColor: string;
    let strokeWidth: number;
    let strokeDasharray: string;
    if (blockerDone) {
      strokeColor = resolveToken('muted-foreground');
      strokeWidth = 1;
      strokeDasharray = '2 3';
    } else if (blockerBlocked) {
      strokeColor = resolveToken('destructive');
      strokeWidth = 2;
      strokeDasharray = '6 3';
    } else if (isBothCritical) {
      strokeColor = resolveToken('destructive');
      strokeWidth = 2;
      strokeDasharray = '6 3';
    } else {
      strokeColor = resolveToken('warning');
      strokeWidth = 1.5;
      strokeDasharray = '4 4';
    }
    const markerRef = (isBothCritical || blockerBlocked) ? 'url(#criticalArrow)' : blockerDone ? 'url(#doneArrow)' : 'url(#depArrow)';
    const midX = (fromX + toX) / 2;
    const pathD = `M${fromX},${fromY} C${fromX + (midX - fromX) * 0.5},${fromY} ${toX - (toX - midX) * 0.5},${toY} ${toX},${toY}`;
    const depTitle = depTask.title || bid;
    const taskTitle = task.title || task.id;
    const statusLabel = blockerDone ? '已完成' : blockerBlocked ? '已阻塞' : isBothCritical ? '关键路径' : '进行中';
    results.push(
      <g key={bid} className="dep-line-group" style={{ cursor: 'pointer' }}>
        <path d={pathD} fill="none" stroke="transparent" strokeWidth={8} />
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          markerEnd={markerRef}
          className="dep-line-path transition-[stroke-width] duration-150"
        >
          <title>{depTitle} → {taskTitle} ({statusLabel})</title>
        </path>
      </g>
    );
  }
  return results;
}

export function renderDependencySVGDefs(): React.ReactNode {
  return (
    <defs>
      <marker id="depArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <path d="M0,0 L8,3 L0,6 Z" fill={resolveToken('warning')} />
      </marker>
      <marker id="criticalArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <path d="M0,0 L8,3 L0,6 Z" fill={resolveToken('destructive')} />
      </marker>
      <marker id="doneArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <path d="M0,0 L8,3 L0,6 Z" fill={resolveToken('muted-foreground')} />
      </marker>
    </defs>
  );
}

export function renderTodayLine(todayOffset: number, timelineWidth: number): React.ReactNode | null {
  if (todayOffset <= 0 || todayOffset >= timelineWidth) return null;
  return (
    <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none" style={{ left: todayOffset }}>
      <div className="text-[9px] text-red-500 font-bold -ml-3 mt-0.5">今</div>
    </div>
  );
}

export function buildHeaderDates(timeRange: { start: number; end: number }, totalDays: number): Array<{ ts: number; label: string; isWeekend: boolean; isMonth: boolean; monthLabel?: string }> {
  const dates: Array<{ ts: number; label: string; isWeekend: boolean; isMonth: boolean; monthLabel?: string }> = [];
  let currentMonth = -1;
  for (let i = 0; i < totalDays; i++) {
    const ts = addDays(timeRange.start, i);
    const d = new Date(ts);
    const month = d.getMonth();
    const isMonth = month !== currentMonth;
    currentMonth = month;
    dates.push({ ts, label: `${d.getMonth() + 1}/${d.getDate()}`, isWeekend: d.getDay() === 0 || d.getDay() === 6, isMonth, monthLabel: isMonth ? `${d.getFullYear()}年${d.getMonth() + 1}月` : undefined });
  }
  return dates;
}
