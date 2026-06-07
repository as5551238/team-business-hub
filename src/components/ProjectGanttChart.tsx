import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useMemberLookup, usePermissions, useActiveMembers } from '@/store/hooks';
import type { Task, TaskStatus, TaskPriority } from '@/types';
import { Plus, Trash2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Flag, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SimpleSelect } from '@/components/ui/simple-select';
import {
  DAY_MS, parseDate, formatDate, addDays, computeTimeRange,
  STATUS_COLORS, STATUS_BAR_COLORS, STATUS_LABELS, CRITICAL_BAR_CLASS,
  useGanttDrag, useGanttScale, useCPM,
  renderDependencyLines, renderDependencySVGDefs, renderTodayLine,
  buildHeaderDates, computeMemberLoadHeatmap, getLoadColor,
} from '@/components/gantt/GanttCore';

interface Props {
  projectId: string;
  projectStartDate: string;
  projectEndDate: string;
}

export function ProjectGanttChart({ projectId, projectStartDate, projectEndDate }: Props) {
  const { state, dispatch } = useStore();
  const { getName } = useMemberLookup();
  const { can } = usePermissions();
  const canEditTasks = can('tasks_edit');
  const canDeleteTasks = can('tasks_delete');

  const { zoom, toggleZoom } = useGanttScale('week');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const projectTasks = useMemo(() => state.tasks.filter(t => t.projectId === projectId), [state.tasks, projectId]);
  const { activeMembers } = useActiveMembers();

  const timeRange = useMemo(() => computeTimeRange(projectTasks), [projectTasks]);

  const cpmResult = useCPM(projectTasks);

  const taskIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    projectTasks.forEach((t, i) => m.set(t.id, i));
    return m;
  }, [projectTasks]);

  const handleDragEnd = useCallback((taskId: string, startDate: string, dueDate: string) => {
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { startDate, dueDate } } });
  }, [dispatch]);

  const dayWidth = zoom === 'week' ? 40 : 16;
  const headerHeight = 48;
  const rowHeight = 36;
  const labelWidth = 220;
  const totalDays = Math.min(Math.ceil((timeRange.end - timeRange.start) / DAY_MS), zoom === 'month' ? 90 : 365);

  const { handleBarMouseDown } = useGanttDrag({
    tasks: projectTasks,
    timeRange,
    dayWidth,
    canEdit: canEditTasks,
    onDragEnd: handleDragEnd,
  });

  const headerDates = useMemo(() => buildHeaderDates(timeRange, totalDays), [timeRange, totalDays]);

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
        blockedBy: [],
      },
    });
  }, [dispatch, projectId, state.currentUser?.id, canEditTasks]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (!canDeleteTasks) return;
    if (!confirm('确定删除此任务？')) return;
    dispatch({ type: 'DELETE_TASK', payload: taskId });
  }, [dispatch, canDeleteTasks]);

  const handleToggleMilestone = useCallback((task: Task) => {
    if (!canEditTasks) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { tags: task.tags?.includes('__milestone') ? task.tags.filter((t: string) => t !== '__milestone') : [...(task.tags ?? []), '__milestone'] } } });
  }, [dispatch, canEditTasks]);

  const handleTitleChange = useCallback((taskId: string, newTitle: string) => {
    if (!canEditTasks || !newTitle.trim()) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { title: newTitle.trim() } } });
  }, [dispatch, canEditTasks]);

  const handleUpdateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    if (!canEditTasks) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates } });
  }, [dispatch, canEditTasks]);

  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editingTaskId) return;
    const handler = (e: MouseEvent) => { if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setEditingTaskId(null); };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [editingTaskId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineWidth = totalDays * dayWidth;
  const todayTs = new Date().setHours(0, 0, 0, 0);
  const todayOffset = Math.floor((todayTs - timeRange.start) / DAY_MS) * dayWidth;

  // P2: 资源负载热力图
  const memberLoadData = useMemo(() => {
    const memberIds = activeMembers.map(m => m.id);
    return computeMemberLoadHeatmap(projectTasks, memberIds, totalDays, timeRange);
  }, [projectTasks, activeMembers, totalDays, timeRange]);
  const [showHeatmap, setShowHeatmap] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden" style={{ background: '#fafafa' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card relative">
        <button onClick={handleAddTask} className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Plus size={14} />添加任务</button>
        {cpmResult.criticalTaskIds.size > 0 && <span className="text-[10px] text-red-500 font-medium">关键路径 {cpmResult.criticalPath.length} 项 | 工期 {cpmResult.projectDuration} 天</span>}
        <div className="flex-1" />
        <button onClick={() => { if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft -= 200; }} className="p-1 rounded hover:bg-muted" aria-label="向左滚动"><ChevronLeft size={16} /></button>
        <button onClick={() => { if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft += 200; }} className="p-1 rounded hover:bg-muted" aria-label="向右滚动"><ChevronRight size={16} /></button>
        <div className="h-4 w-px bg-border mx-1" />
        <button onClick={toggleZoom} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors">
          {zoom === 'week' ? <><ZoomOut size={13} />月视图</> : <><ZoomIn size={13} />周视图</>}
        </button>
        <div className="h-4 w-px bg-border mx-1" />
        <button onClick={() => setShowHeatmap(v => !v)} className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${showHeatmap ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
          资源热力图
        </button>
      </div>

      {/* Gantt body */}
      <div ref={containerRef} className="flex overflow-hidden" style={{ maxHeight: 400 }}>
        {/* Left: task labels */}
        <div className="flex-shrink-0 border-r border-border bg-card" style={{ width: labelWidth }}>
          <div className="flex items-center px-2 border-b border-border text-[10px] text-muted-foreground font-medium" style={{ height: headerHeight }}>
            <span className="flex-1">任务名称</span>
            <span className="w-14 text-center">负责人</span>
          </div>
          {projectTasks.map(task => {
            const isMilestone = task.tags?.includes('__milestone');
            const isCritical = cpmResult.criticalTaskIds.has(task.id);
            const slack = cpmResult.taskMetrics.get(task.id)?.slack;
            const slackDisplay = Number.isNaN(slack) ? '循环' : `${slack}天`;
            return (
              <div key={task.id} className={`flex items-center px-2 border-b border-border/50 hover:bg-muted/30 group cursor-pointer ${isCritical ? 'bg-red-50/40' : ''}`} style={{ height: rowHeight }} onDoubleClick={() => setEditingTaskId(editingTaskId === task.id ? null : task.id)}>
                <Tooltip><TooltipTrigger asChild><button onClick={() => handleToggleMilestone(task)} className={`mr-1 flex-shrink-0 ${isMilestone ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`} aria-label="切换里程碑"><Flag size={13} /></button></TooltipTrigger><TooltipContent>里程碑</TooltipContent></Tooltip>
                <input value={task.title} onChange={e => handleTitleChange(task.id, e.target.value)} className={`flex-1 text-xs bg-transparent border-none outline-none truncate min-w-0 hover:bg-muted/50 px-1 py-0.5 rounded ${isCritical ? 'font-medium text-red-700' : ''}`} />
                <span className="w-14 text-[10px] text-muted-foreground truncate text-center flex-shrink-0">{getName(task.leaderId)}</span>
                <button onClick={() => handleDeleteTask(task.id)} className="ml-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" aria-label="删除任务"><Trash2 size={12} /></button>
                {isCritical && <Tooltip><TooltipTrigger asChild><span className="ml-1 text-[8px] text-red-400 flex-shrink-0">CP</span></TooltipTrigger><TooltipContent>{`浮动: ${slackDisplay}`}</TooltipContent></Tooltip>}
              </div>
            );
          })}
          {projectTasks.length === 0 && (
            <div className="flex items-center justify-center text-xs text-muted-foreground py-8">暂无任务，点击"添加任务"开始规划</div>
          )}
        </div>

        {/* Right: timeline */}
        <div className="flex-1 overflow-hidden relative">
          <div ref={timelineScrollRef} className="overflow-x-auto">
            <div style={{ width: timelineWidth, minWidth: timelineWidth }}>
              <svg width="0" height="0" className="absolute">{renderDependencySVGDefs()}</svg>
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
                const isCritical = cpmResult.criticalTaskIds.has(task.id);
                const slack = cpmResult.taskMetrics.get(task.id)?.slack;
                const slackDisplay = Number.isNaN(slack) ? '循环' : `${slack}天`;
                const depLines = renderDependencyLines({ task, allTasks: projectTasks, taskIndexMap, timeRange, dayWidth, rowHeight, cpmResult });
                return (
                  <div key={task.id} className="relative border-b border-border/20" style={{ height: rowHeight }}>
                    {/* Dependency lines (bezier) */}
                    {depLines.length > 0 && (
                      <svg className="absolute inset-0 pointer-events-none" style={{ height: rowHeight, overflow: 'visible' }}>
                        {depLines}
                      </svg>
                    )}
                    {isMilestone ? (
                      <Tooltip><TooltipTrigger asChild><div className="absolute top-1/2 -translate-y-1/2" style={{ left: leftPx }}>
                        <div className={`w-3 h-3 rotate-45 ${dotColor} ${isCritical ? CRITICAL_BAR_CLASS : ''} border border-white shadow-sm cursor-pointer`} onMouseDown={e => handleBarMouseDown(e, task, 'move')} />
                      </div></TooltipTrigger><TooltipContent>{`${task.title} — ${STATUS_LABELS[task.status]}${isCritical ? ' [关键路径]' : ''}`}</TooltipContent></Tooltip>
                    ) : (
                      <Tooltip><TooltipTrigger asChild><div className={`absolute top-1/2 -translate-y-1/2 rounded border ${barColor} ${isCritical ? CRITICAL_BAR_CLASS : ''} shadow-sm cursor-move flex items-center overflow-hidden`} style={{ left: leftPx, width: widthPx, height: 20 }}>
                        <div className="w-1.5 h-full bg-black/5 hover:bg-black/15 cursor-ew-resize flex-shrink-0" onMouseDown={e => handleBarMouseDown(e, task, 'resize-start')} />
                        <div className="flex-1 flex items-center px-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0`} />
                          {widthPx > 60 && <span className="ml-1 text-[10px] text-muted-foreground truncate">{task.title}</span>}
                        </div>
                        <div className="w-1.5 h-full bg-black/5 hover:bg-black/15 cursor-ew-resize flex-shrink-0" onMouseDown={e => handleBarMouseDown(e, task, 'resize-end')} />
                      </div></TooltipTrigger><TooltipContent>{`${task.title} (${STATUS_LABELS[task.status]})${isCritical ? ` [关键路径 浮动${slackDisplay}]` : ''}`}</TooltipContent></Tooltip>
                    )}
                  </div>
                );
              })}
              {/* Resource load heatmap */}
              {showHeatmap && (
                <div className="border-t-2 border-border bg-muted/5">
                  <div style={{ height: 24 }} />
                  {activeMembers.map(m => {
                    const loads = memberLoadData.get(m.id);
                    return (
                      <div key={m.id} className="flex border-b border-border/10" style={{ height: 24 }}>
                        {loads && Array.from(loads).map((count, di) => (
                          count > 0 ? <Tooltip key={di}><TooltipTrigger asChild><div className={`border-r border-border/5 ${getLoadColor(count)}`} style={{ width: dayWidth, height: 24 }} /></TooltipTrigger><TooltipContent>{`${m.name}: ${count}个活跃任务`}</TooltipContent></Tooltip> : <div key={di} className={`border-r border-border/5 ${getLoadColor(count)}`} style={{ width: dayWidth, height: 24 }} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Today line */}
              {renderTodayLine(todayOffset, timelineWidth)}
            </div>
          </div>
        </div>
      </div>

      {/* Editing modal (centered overlay) */}
      {editingTaskId && (() => { const et = projectTasks.find(t => t.id === editingTaskId); if (!et) return null; return (
        <Dialog open={!!editingTaskId} onOpenChange={(v) => { if (!v) setEditingTaskId(null); }}>
          <DialogContent className="sm:max-w-[420px] max-h-[80vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{et.title}</DialogTitle>
              <DialogDescription className="sr-only">编辑任务属性</DialogDescription>
            </DialogHeader>
            <div><label className="text-xs text-muted-foreground block mb-1">状态</label><SimpleSelect value={et.status} onValueChange={v => handleUpdateTask(et.id, { status: v as TaskStatus })} options={(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => ({ value: k, label: v }))} className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card" /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">负责人</label><SimpleSelect value={et.leaderId || ''} onValueChange={v => handleUpdateTask(et.id, { leaderId: v })} options={[{ value: '', label: '未指定' }, ...activeMembers.map(m => ({ value: m.id, label: m.name }))]} className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground block mb-1">开始日期</label><input type="date" className="w-full text-sm border border-input rounded-lg px-3 py-2" value={et.startDate || ''} onChange={e => handleUpdateTask(et.id, { startDate: e.target.value || null })} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">截止日期</label><input type="date" className="w-full text-sm border border-input rounded-lg px-3 py-2" value={et.dueDate || ''} onChange={e => handleUpdateTask(et.id, { dueDate: e.target.value || null })} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground block mb-1">紧急程度</label><SimpleSelect value={et.priority} onValueChange={v => handleUpdateTask(et.id, { priority: v as TaskPriority })} options={[{ value: 'urgent', label: '紧急 (S)' }, { value: 'high', label: '高 (A)' }, { value: 'medium', label: '中 (B)' }, { value: 'low', label: '低 (C)' }]} className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card" /></div>
          </DialogContent>
        </Dialog>
      ); })()}
    </div>
  );
}
