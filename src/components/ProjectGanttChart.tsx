import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore, useMemberLookup, usePermissions } from '@/store/useStore';
import type { Task, TaskStatus, TaskPriority } from '@/types';
import { Plus, Trash2, GripVertical, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Flag, X } from 'lucide-react';

type ZoomLevel = 'week' | 'month';

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-gray-300',
  in_progress: 'bg-blue-400',
  done: 'bg-green-500',
  blocked: 'bg-amber-400',
  cancelled: 'bg-red-300',
};

const STATUS_BAR_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-gray-200 border-gray-300',
  in_progress: 'bg-blue-100 border-blue-400',
  done: 'bg-green-100 border-green-400',
  blocked: 'bg-amber-100 border-amber-400',
  cancelled: 'bg-red-100 border-red-300',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  blocked: '已阻塞',
  cancelled: '已取消',
};

const DAY_MS = 86400000;

function parseDate(s: string | null | undefined): number {
  if (!s) return 0;
  return new Date(s).getTime();
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(ts: number, days: number): number {
  return ts + days * DAY_MS;
}

function getMonday(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface Props {
  projectId: string;
  projectStartDate: string;
  projectEndDate: string;
}

export function ProjectGanttChart({ projectId, projectStartDate, projectEndDate }: Props) {
  const { state, dispatch } = useStore();
  const { getName } = useMemberLookup();
  const { can } = usePermissions();
  const canEditTasks = can('edit_tasks');
  const canDeleteTasks = can('delete_tasks');
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{ taskId: string; type: 'move' | 'resize-start' | 'resize-end'; startX: number; origStart: number; origDue: number } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Tasks belonging to this project
  const projectTasks = useMemo(() => state.tasks.filter(t => t.projectId === projectId), [state.tasks, projectId]);
  const activeMembers = useMemo(() => state.members.filter(m => m.status === 'active'), [state.members]);

  // Time range: project start/end or task range, whichever is wider
  const timeRange = useMemo(() => {
    const pStart = parseDate(projectStartDate) || Date.now();
    const pEnd = parseDate(projectEndDate) || addDays(Date.now(), 30);
    let minTs = pStart;
    let maxTs = pEnd;
    for (const t of projectTasks) {
      const ts = parseDate(t.startDate) || parseDate(t.dueDate);
      const te = parseDate(t.dueDate) || parseDate(t.startDate);
      if (ts && ts < minTs) minTs = ts;
      if (te && te > maxTs) maxTs = te;
    }
    // Add padding
    minTs = addDays(getMonday(minTs), -3);
    maxTs = addDays(maxTs, 14);
    return { start: minTs, end: maxTs };
  }, [projectStartDate, projectEndDate, projectTasks]);

  // Day width based on zoom
  const dayWidth = zoom === 'week' ? 40 : 16;
  const headerHeight = 48;
  const rowHeight = 36;
  const labelWidth = 220;

  // Total days
  const totalDays = Math.ceil((timeRange.end - timeRange.start) / DAY_MS);

  // Generate header dates
  const headerDates = useMemo(() => {
    const dates: { ts: number; label: string; isWeekend: boolean; isMonth: boolean; monthLabel?: string }[] = [];
    let currentMonth = -1;
    for (let i = 0; i < totalDays; i++) {
      const ts = addDays(timeRange.start, i);
      const d = new Date(ts);
      const month = d.getMonth();
      const isMonth = month !== currentMonth;
      currentMonth = month;
      dates.push({
        ts,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        isMonth,
        monthLabel: isMonth ? `${d.getFullYear()}年${d.getMonth() + 1}月` : undefined,
      });
    }
    return dates;
  }, [timeRange, totalDays]);

  // Add new task (gantt bar)
  const handleAddTask = useCallback(() => {
    if (!canEditTasks) return;
    const startStr = formatDate(Date.now());
    const dueStr = formatDate(addDays(Date.now(), 7));
    dispatch({
      type: 'ADD_TASK',
      payload: {
        title: '新任务',
        description: '',
        projectId,
        goalId: null,
        status: 'todo',
        priority: 'medium',
        leaderId: state.currentUser?.id || '',
        supporterIds: [],
        tags: [],
        category: '',
        startDate: startStr,
        dueDate: dueStr,
        reminderDate: null,
        subtasks: [],
        attachments: [],
        trackingRecords: [],
        repeatCycle: 'none',
      },
    });
  }, [dispatch, projectId, state.currentUser?.id, canEditTasks]);

  // Delete task
  const handleDeleteTask = useCallback((taskId: string) => {
    if (!canDeleteTasks) return;
    if (!confirm('确定删除此任务？')) return;
    dispatch({ type: 'DELETE_TASK', payload: taskId });
  }, [dispatch, canDeleteTasks]);

  // Toggle milestone on a task
  const handleToggleMilestone = useCallback((task: Task) => {
    if (!canEditTasks) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { tags: task.tags?.includes('__milestone') ? task.tags.filter((t: string) => t !== '__milestone') : [...(task.tags || []), '__milestone'] } } });
  }, [dispatch, canEditTasks]);

  // Drag to move/resize bars
  const handleBarMouseDown = useCallback((e: React.MouseEvent, task: Task, type: 'move' | 'resize-start' | 'resize-end') => {
    if (!canEditTasks) return;
    e.preventDefault();
    e.stopPropagation();
    const startTs = parseDate(task.startDate) || parseDate(task.dueDate) || Date.now();
    const dueTs = parseDate(task.dueDate) || parseDate(task.startDate) || addDays(Date.now(), 7);
    setDragInfo({ taskId: task.id, type, startX: e.clientX, origStart: startTs, origDue: dueTs });
  }, [canEditTasks]);

  const pendingDragDatesRef = useRef<{ taskId: string; startDate: string; dueDate: string } | null>(null);
  const wasDraggingRef = useRef(false);
  useEffect(() => {
    if (!dragInfo) {
      // Only dispatch on drag end (transition from dragging to idle)
      if (wasDraggingRef.current) {
        const pending = pendingDragDatesRef.current;
        if (pending) {
          dispatch({ type: 'UPDATE_TASK', payload: { id: pending.taskId, updates: { startDate: pending.startDate, dueDate: pending.dueDate } } });
          pendingDragDatesRef.current = null;
        }
        wasDraggingRef.current = false;
      }
      return;
    }
    wasDraggingRef.current = true;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragInfo.startX;
      const dayDelta = Math.round(dx / dayWidth);
      if (dayDelta === 0) return;
      const task = projectTasks.find(t => t.id === dragInfo.taskId);
      if (!task) return;
      let newStart = dragInfo.origStart;
      let newDue = dragInfo.origDue;
      if (dragInfo.type === 'move') {
        newStart = addDays(newStart, dayDelta);
        newDue = addDays(newDue, dayDelta);
      } else if (dragInfo.type === 'resize-start') {
        newStart = addDays(newStart, dayDelta);
        if (newStart >= newDue) newStart = addDays(newDue, -1);
      } else {
        newDue = addDays(newDue, dayDelta);
        if (newDue <= newStart) newDue = addDays(newStart, 1);
      }
      pendingDragDatesRef.current = { taskId: task.id, startDate: formatDate(newStart), dueDate: formatDate(newDue) };
    };
    const handleMouseUp = () => setDragInfo(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragInfo, dayWidth, projectTasks, dispatch]);

  // Scroll left/right
  const scrollBy = useCallback((delta: number) => {
    setScrollOffset(prev => Math.max(0, prev + delta));
  }, []);

  // Task title inline edit
  const handleTitleChange = useCallback((taskId: string, newTitle: string) => {
    if (!canEditTasks || !newTitle.trim()) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { title: newTitle.trim() } } });
  }, [dispatch, canEditTasks]);

  // Update task field
  const handleUpdateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    if (!canEditTasks) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates } });
  }, [dispatch, canEditTasks]);

  // Close popover on click outside
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editingTaskId) return;
    const handler = (e: MouseEvent) => { if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setEditingTaskId(null); };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [editingTaskId]);

  // Render
  const timelineWidth = totalDays * dayWidth;
  const visibleWidth = (containerRef.current?.clientWidth || 800) - labelWidth;
  const todayTs = new Date().setHours(0, 0, 0, 0);
  const todayOffset = Math.floor((todayTs - timeRange.start) / DAY_MS) * dayWidth;

  return (
    <div className="border border-border rounded-lg overflow-hidden" style={{ background: '#fafafa' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-white relative">
        <button onClick={handleAddTask} className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Plus size={14} />添加任务</button>
        <div className="flex-1" />
        <button onClick={() => scrollBy(-200)} className="p-1 rounded hover:bg-muted"><ChevronLeft size={16} /></button>
        <button onClick={() => scrollBy(200)} className="p-1 rounded hover:bg-muted"><ChevronRight size={16} /></button>
        <div className="h-4 w-px bg-border mx-1" />
        <button onClick={() => setZoom(z => z === 'week' ? 'month' : 'week')} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors">
          {zoom === 'week' ? <><ZoomOut size={13} />月视图</> : <><ZoomIn size={13} />周视图</>}
        </button>
        {/* Inline editing popover */}
        {editingTaskId && (() => { const et = projectTasks.find(t => t.id === editingTaskId); if (!et) return null; return (
          <div ref={popoverRef} className="absolute top-full left-2 mt-1 z-30 bg-white border border-border rounded-lg shadow-xl p-3 w-64 space-y-2.5">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold">{et.title}</span><button onClick={() => setEditingTaskId(null)} className="p-0.5 hover:bg-muted rounded"><X size={13} /></button></div>
            <div><label className="text-[10px] text-muted-foreground block mb-0.5">状态</label><select className="w-full text-xs border border-input rounded px-2 py-1 bg-white" value={et.status} onChange={e => handleUpdateTask(et.id, { status: e.target.value as TaskStatus })}>{(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="text-[10px] text-muted-foreground block mb-0.5">负责人</label><select className="w-full text-xs border border-input rounded px-2 py-1 bg-white" value={et.leaderId || ''} onChange={e => handleUpdateTask(et.id, { leaderId: e.target.value })}><option value="">未指定</option>{activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] text-muted-foreground block mb-0.5">开始日期</label><input type="date" className="w-full text-xs border border-input rounded px-2 py-1" value={et.startDate || ''} onChange={e => handleUpdateTask(et.id, { startDate: e.target.value || null })} /></div>
              <div><label className="text-[10px] text-muted-foreground block mb-0.5">截止日期</label><input type="date" className="w-full text-xs border border-input rounded px-2 py-1" value={et.dueDate || ''} onChange={e => handleUpdateTask(et.id, { dueDate: e.target.value || null })} /></div>
            </div>
            <div><label className="text-[10px] text-muted-foreground block mb-0.5">紧急程度</label><select className="w-full text-xs border border-input rounded px-2 py-1 bg-white" value={et.priority} onChange={e => handleUpdateTask(et.id, { priority: e.target.value as TaskPriority })}><option value="urgent">紧急 (S)</option><option value="high">高 (A)</option><option value="medium">中 (B)</option><option value="low">低 (C)</option></select></div>
          </div>
        ); })()}
      </div>

      {/* Gantt body */}
      <div ref={containerRef} className="flex overflow-hidden" style={{ maxHeight: 400 }}>
        {/* Left: task labels */}
        <div className="flex-shrink-0 border-r border-border bg-white" style={{ width: labelWidth }}>
          {/* Header spacer */}
          <div className="flex items-center px-2 border-b border-border text-[10px] text-muted-foreground font-medium" style={{ height: headerHeight }}>
            <span className="flex-1">任务名称</span>
            <span className="w-14 text-center">负责人</span>
          </div>
          {/* Rows */}
          {projectTasks.map(task => {
            const isMilestone = task.tags?.includes('__milestone');
            return (
              <div key={task.id} className="flex items-center px-2 border-b border-border/50 hover:bg-muted/30 group cursor-pointer" style={{ height: rowHeight }} onDoubleClick={() => setEditingTaskId(editingTaskId === task.id ? null : task.id)}>
                <button onClick={() => handleToggleMilestone(task)} className={`mr-1 flex-shrink-0 ${isMilestone ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`} title="里程碑"><Flag size={13} /></button>
                <input value={task.title} onChange={e => handleTitleChange(task.id, e.target.value)} className="flex-1 text-xs bg-transparent border-none outline-none truncate min-w-0 hover:bg-muted/50 px-1 py-0.5 rounded" />
                <span className="w-14 text-[10px] text-muted-foreground truncate text-center flex-shrink-0">{getName(task.leaderId)}</span>
                <button onClick={() => handleDeleteTask(task.id)} className="ml-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><Trash2 size={12} /></button>
              </div>
            );
          })}
          {projectTasks.length === 0 && (
            <div className="flex items-center justify-center text-xs text-muted-foreground py-8">暂无任务，点击"添加任务"开始规划</div>
          )}
        </div>

        {/* Right: timeline */}
        <div className="flex-1 overflow-hidden relative">
          <div className="overflow-x-auto" style={{ transform: `translateX(-${scrollOffset}px)` }}>
            <div style={{ width: timelineWidth, minWidth: timelineWidth }}>
              {/* Header: month row */}
              <div className="flex border-b border-border text-[10px] text-muted-foreground" style={{ height: headerHeight / 2 }}>
                {headerDates.filter(d => d.isMonth).map((d, i, arr) => {
                  const nextMonthTs = i < arr.length - 1 ? arr[i + 1].ts : timeRange.end;
                  const days = Math.ceil((nextMonthTs - d.ts) / DAY_MS);
                  return <div key={d.ts} className="flex items-center px-2 font-medium border-r border-border/30" style={{ width: days * dayWidth }}>{d.monthLabel}</div>;
                })}
              </div>
              {/* Header: day row */}
              <div className="flex border-b border-border text-[10px]" style={{ height: headerHeight / 2 }}>
                {headerDates.map(d => (
                  <div key={d.ts} className={`flex items-center justify-center border-r border-border/10 ${d.isWeekend ? 'bg-gray-50 text-muted-foreground' : 'text-muted-foreground'}`} style={{ width: dayWidth }}>{zoom === 'week' ? d.label.split('/')[1] : (parseInt(d.label.split('/')[1]) % 5 === 1 ? d.label.split('/')[1] : '')}</div>
                ))}
              </div>
              {/* Task rows */}
              {projectTasks.map(task => {
                const startTs = parseDate(task.startDate) || parseDate(task.dueDate) || timeRange.start;
                const dueTs = parseDate(task.dueDate) || addDays(startTs, 7);
                const isMilestone = task.tags?.includes('__milestone');
                const leftPx = ((startTs - timeRange.start) / DAY_MS) * dayWidth;
                const widthPx = Math.max(((dueTs - startTs) / DAY_MS) * dayWidth, isMilestone ? 12 : dayWidth);
                const barColor = STATUS_BAR_COLORS[task.status] || STATUS_BAR_COLORS.todo;
                const dotColor = STATUS_COLORS[task.status] || STATUS_COLORS.todo;
                return (
                  <div key={task.id} className="relative border-b border-border/20" style={{ height: rowHeight }}>
                    {isMilestone ? (
                      <div className="absolute top-1/2 -translate-y-1/2" style={{ left: leftPx }} title={`${task.title} — ${STATUS_LABELS[task.status]}`}>
                        <div className={`w-3 h-3 rotate-45 ${dotColor} border border-white shadow-sm cursor-pointer`} onMouseDown={e => handleBarMouseDown(e, task, 'move')} />
                      </div>
                    ) : (
                      <div className={`absolute top-1/2 -translate-y-1/2 rounded border ${barColor} shadow-sm cursor-move flex items-center overflow-hidden`} style={{ left: leftPx, width: widthPx, height: 20 }} title={`${task.title} (${STATUS_LABELS[task.status]})`}>
                        {/* Resize handle left */}
                        <div className="w-1.5 h-full bg-black/5 hover:bg-black/15 cursor-ew-resize flex-shrink-0" onMouseDown={e => handleBarMouseDown(e, task, 'resize-start')} />
                        {/* Bar content */}
                        <div className="flex-1 flex items-center px-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0`} />
                          {widthPx > 60 && <span className="ml-1 text-[10px] text-muted-foreground truncate">{task.title}</span>}
                        </div>
                        {/* Resize handle right */}
                        <div className="w-1.5 h-full bg-black/5 hover:bg-black/15 cursor-ew-resize flex-shrink-0" onMouseDown={e => handleBarMouseDown(e, task, 'resize-end')} />
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Today line */}
              {todayOffset > 0 && todayOffset < timelineWidth && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none" style={{ left: todayOffset }}><div className="text-[9px] text-red-500 font-bold -ml-3 mt-0.5">今</div></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
