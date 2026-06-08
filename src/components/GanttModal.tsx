/**
 * 甘特图弹窗 — 全局独立弹窗，支持拖拽编辑、筛选、缩放、关键路径
 * 基于 ProjectGanttChart 的交互模式，但覆盖全局所有项目/任务
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useMemberLookup, usePermissions, useActiveMembers } from '@/store/hooks';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import type { Task, TaskStatus, TaskPriority } from '@/types';
import { Plus, Trash2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Flag, X, Filter, Save, GitCompare, Sparkles, Zap } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { handleError } from '@/lib/errorHandler';
import { autoScheduleLocal, autoScheduleDeep, type ScheduleSuggestion } from '@/lib/ai/aiAutoScheduler';
import {
  DAY_MS, parseDate, formatDate, addDays, getMonday, computeTimeRange,
  STATUS_COLORS, STATUS_BAR_COLORS, STATUS_LABELS, CRITICAL_BAR_CLASS,
  useGanttDrag, useGanttScale, useCPM,
  renderDependencyLines, renderDependencySVGDefs, renderTodayLine,
  suggestBuffers,
  buildHeaderDates, groupTasks, getProgressColor, computeMemberLoadHeatmap, getLoadColor, type GroupBy, type TaskGroup,
} from '@/components/gantt/GanttCore';

interface BaselineSnapshot {
  id: string;
  name: string;
  createdAt: string;
  tasks: { id: string; title: string; startDate: string | null; dueDate: string | null }[];
}

const BASELINE_KEY = 'tbh-gantt-baselines';
const BASELINE_MAX_COUNT = 20;
const BASELINE_MAX_SIZE = 500 * 1024;

function isValidBaseline(b: unknown): b is BaselineSnapshot {
  return typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>).id === 'string' && typeof (b as Record<string, unknown>).name === 'string' && typeof (b as Record<string, unknown>).createdAt === 'string' && Array.isArray((b as Record<string, unknown>).tasks);
}

function loadBaselines(): BaselineSnapshot[] {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isValidBaseline);
    if (valid.length !== parsed.length) localStorage.setItem(BASELINE_KEY, JSON.stringify(valid));
    return valid;
  } catch (e) { handleError(e, { module: 'GanttModal', operation: 'LOAD_BASELINES', severity: 'debug' }); return []; }
}
function saveBaselines(bs: BaselineSnapshot[]) {
  try {
    if (bs.length > BASELINE_MAX_COUNT) bs = bs.slice(-BASELINE_MAX_COUNT);
    const json = JSON.stringify(bs);
    if (json.length > BASELINE_MAX_SIZE) return;
    localStorage.setItem(BASELINE_KEY, json);
  } catch (e) { handleError(e, { module: 'GanttModal', operation: 'SAVE_BASELINE', severity: 'debug' }); }
}

interface GanttModalProps {
  open: boolean;
  onClose: () => void;
}

export function GanttModal({ open, onClose }: GanttModalProps) {
  const { state, dispatch } = useStore();
  const { getName } = useMemberLookup();
  const { can } = usePermissions();
  const canEditTasks = can('tasks_edit');
  const canDeleteTasks = can('tasks_delete');

  const { zoom, scrollOffset, setScrollOffset, toggleZoom, scrollBy } = useGanttScale('week');
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const allTasks = useMemo(() => {
    let filtered = state.tasks.filter(t => t.status !== 'cancelled' && (t.startDate || t.dueDate));
    if (filterProject) filtered = filtered.filter(t => t.projectId === filterProject);
    if (filterStatus) filtered = filtered.filter(t => t.status === filterStatus);
    return filtered;
  }, [state.tasks, filterProject, filterStatus]);

  // G5: 分组计算
  const taskGroups = useMemo(() => groupTasks(allTasks, groupBy, id => state.projects.find(p => p.id === id)?.title || id, id => getName(id)), [allTasks, groupBy, state.projects]);
  const visibleTasks = useMemo(() => {
    if (groupBy === 'none') return allTasks;
    return taskGroups.filter(g => !collapsedGroups.has(g.key)).flatMap(g => g.tasks);
  }, [taskGroups, collapsedGroups, allTasks, groupBy]);
  const [baselines, setBaselines] = useState<BaselineSnapshot[]>(loadBaselines);
  const [activeBaselineId, setActiveBaselineId] = useState<string>('');
  const [baselineName, setBaselineName] = useState('');
  const [scheduleSuggestions, setScheduleSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedulingDeep, setSchedulingDeep] = useState(false);
  const [scheduleDeepSummary, setScheduleDeepSummary] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const { activeMembers } = useActiveMembers();

  const timeRange = useMemo(() => computeTimeRange(allTasks), [allTasks]);

  const cpmResult = useCPM(allTasks);

  const dayWidth = zoom === 'week' ? 40 : 16;
  const headerHeight = 48;
  const rowHeight = 36;
  const labelWidth = 220;
  const totalDays = Math.min(Math.ceil((timeRange.end - timeRange.start) / DAY_MS), zoom === 'month' ? 90 : 365);

  const headerDates = useMemo(() => buildHeaderDates(timeRange, totalDays), [timeRange, totalDays]);

  const taskIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    allTasks.forEach((t, i) => m.set(t.id, i));
    return m;
  }, [allTasks]);

  const handleDragEnd = useCallback((taskId: string, startDate: string, dueDate: string) => {
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { startDate, dueDate } } });
  }, [dispatch]);

  const { handleBarMouseDown } = useGanttDrag({
    tasks: allTasks,
    timeRange,
    dayWidth,
    canEdit: canEditTasks,
    onDragEnd: handleDragEnd,
  });

  const handleAddTask = useCallback(() => {
    if (!canEditTasks) return;
    dispatch({ type: 'ADD_TASK', payload: { title: '新任务', description: '', projectId: filterProject || null, goalId: null, status: 'todo', priority: 'medium', leaderId: state.currentUser?.id || '', supporterIds: [], tags: [], category: '', startDate: formatDate(Date.now()), dueDate: formatDate(addDays(Date.now(), 7)), reminderDate: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', blockedBy: [] } });
  }, [dispatch, filterProject, state.currentUser?.id, canEditTasks]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (!canDeleteTasks) return;
    if (!confirm('确定删除此任务？')) return;
    dispatch({ type: 'DELETE_TASK', payload: taskId });
  }, [dispatch, canDeleteTasks]);

  const handleTitleChange = useCallback((taskId: string, newTitle: string) => {
    if (!canEditTasks || !newTitle.trim()) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { title: newTitle.trim() } } });
  }, [dispatch, canEditTasks]);

  const handleUpdateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    if (!canEditTasks) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates } });
  }, [dispatch, canEditTasks]);

  const handleToggleMilestone = useCallback((task: Task) => {
    if (!canEditTasks) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { tags: task.tags?.includes('__milestone') ? task.tags.filter((t: string) => t !== '__milestone') : [...(task.tags ?? []), '__milestone'] } } });
  }, [dispatch, canEditTasks]);

  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editingTaskId) return;
    const handler = (e: MouseEvent) => { if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setEditingTaskId(null); };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [editingTaskId]);

  const handleSaveBaseline = useCallback(() => {
    const name = baselineName.trim() || `基线 ${baselines.length + 1}`;
    const snapshot: BaselineSnapshot = {
      id: 'bl_' + Date.now(),
      name,
      createdAt: new Date().toISOString(),
      tasks: allTasks.map(t => ({ id: t.id, title: t.title, startDate: t.startDate, dueDate: t.dueDate })),
    };
    const next = [...baselines, snapshot];
    if (next.length > BASELINE_MAX_COUNT) return;
    const preview = JSON.stringify(next);
    if (preview.length > BASELINE_MAX_SIZE) return;
    setBaselines(next);
    saveBaselines(next);
    setActiveBaselineId(snapshot.id);
    setBaselineName('');
  }, [allTasks, baselines, baselineName]);

  const handleDeleteBaseline = useCallback((id: string) => {
    const next = baselines.filter(b => b.id !== id);
    setBaselines(next);
    saveBaselines(next);
    if (activeBaselineId === id) setActiveBaselineId('');
  }, [baselines, activeBaselineId]);

  const activeBaseline = useMemo(() => baselines.find(b => b.id === activeBaselineId), [baselines, activeBaselineId]);

  const handleAutoSchedule = useCallback(() => {
    const result = autoScheduleLocal(state);
    setScheduleSuggestions(result.suggestions);
    setScheduleDeepSummary(result.fromLLM ? result.summary : '');
    setShowSchedule(true);
  }, [state]);

  const handleAutoScheduleDeep = useCallback(async () => {
    setSchedulingDeep(true);
    try {
      const result = await autoScheduleDeep(state);
      setScheduleSuggestions(result.suggestions);
      setScheduleDeepSummary(result.summary);
      setShowSchedule(true);
    } finally {
      setSchedulingDeep(false);
    }
  }, [state]);

  const STATUS_CYCLE: TaskStatus[] = ['todo', 'in_progress', 'done'];

  const handleStatusCycle = useCallback((task: Task) => {
    if (!canEditTasks) return;
    const idx = STATUS_CYCLE.indexOf(task.status);
    const next: TaskStatus = idx >= 0 && idx < STATUS_CYCLE.length - 1 ? STATUS_CYCLE[idx + 1] : STATUS_CYCLE[0];
    dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { status: next } } });
  }, [dispatch, canEditTasks]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEditTasks) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentScrollLeft = timelineScrollRef.current?.scrollLeft ?? scrollOffset;
    const x = e.clientX - rect.left + currentScrollLeft;
    const dayIdx = Math.floor(x / dayWidth);
    const clickDate = formatDate(addDays(timeRange.start, dayIdx));
    dispatch({ type: 'ADD_TASK', payload: { title: '新任务', description: '', projectId: filterProject || null, goalId: null, status: 'todo', priority: 'medium', leaderId: state.currentUser?.id || '', supporterIds: [], tags: [], category: '', startDate: clickDate, dueDate: formatDate(addDays(timeRange.start, dayIdx + 7)), reminderDate: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', blockedBy: [] } });
  }, [canEditTasks, scrollOffset, dayWidth, timeRange, filterProject, state.currentUser?.id, dispatch]);

  // Sync native scroll position to scrollOffset state
  const handleTimelineScroll = useCallback(() => {
    if (timelineScrollRef.current) {
      setScrollOffset(timelineScrollRef.current.scrollLeft);
    }
  }, [setScrollOffset]);

  const handleApplySchedule = useCallback((s: ScheduleSuggestion) => {
    if (!canEditTasks) return;
    dispatch({ type: 'UPDATE_TASK', payload: { id: s.taskId, updates: { startDate: s.suggestedStartDate, dueDate: s.suggestedDueDate } } });
    setScheduleSuggestions(prev => {
      const next = prev.filter(x => x.taskId !== s.taskId);
      if (next.length === 0) setShowSchedule(false);
      return next;
    });
  }, [dispatch, canEditTasks]);

  const handleApplyAllSchedule = useCallback(() => {
    if (!canEditTasks || scheduleSuggestions.length === 0) return;
    for (const s of scheduleSuggestions) {
      dispatch({ type: 'UPDATE_TASK', payload: { id: s.taskId, updates: { startDate: s.suggestedStartDate, dueDate: s.suggestedDueDate } } });
    }
    setScheduleSuggestions([]);
    setShowSchedule(false);
  }, [dispatch, canEditTasks, scheduleSuggestions]);

  const timelineWidth = totalDays * dayWidth;
  const todayTs = new Date().setHours(0, 0, 0, 0);
  const todayOffset = Math.floor((todayTs - timeRange.start) / DAY_MS) * dayWidth;

  const memberLoadData = useMemo(() => {
    const memberIds = activeMembers.map(m => m.id);
    return computeMemberLoadHeatmap(allTasks, memberIds, totalDays, timeRange);
  }, [allTasks, activeMembers, totalDays, timeRange]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-lg font-bold">甘特图</DialogTitle>
            <DialogDescription className="sr-only">甘特图弹窗，查看和编辑任务时间线</DialogDescription>
            <span className="text-xs text-muted-foreground">{allTasks.length} 个任务</span>
            {cpmResult.criticalTaskIds.size > 0 && <span className="text-[10px] text-red-500 font-medium">关键路径 {cpmResult.criticalPath.length} 项 | 工期 {cpmResult.projectDuration} 天</span>}
            {(() => { const bufs = suggestBuffers(cpmResult.taskMetrics, cpmResult.criticalTaskIds); return bufs.length > 0 ? <span className="text-[10px] text-blue-500 font-medium ml-2">缓冲建议: {bufs.length}项, 总计{bufs.reduce((s,b)=>s+b.suggestBuffer,0)}天</span> : null; })()}
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-border bg-muted/30 relative flex-wrap">
          {canEditTasks && <button onClick={handleAddTask} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Plus size={14} />添加任务</button>}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-muted-foreground" />
            <SimpleSelect value={filterProject || '__EMPTY__'} onValueChange={(v) => setFilterProject(v === '__EMPTY__' ? '' : v)} options={[{ value: '__EMPTY__', label: '全部项目' }, ...state.projects.map(p => ({ value: p.id, label: p.title }))]} className="border border-input rounded-lg px-2 py-1 text-xs bg-card" />
            <SimpleSelect value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)} options={[{ value: 'none', label: '不分组' }, { value: 'project', label: '按项目' }, { value: 'leader', label: '按负责人' }, { value: 'priority', label: '按优先级' }, { value: 'status', label: '按状态' }]} className="border border-input rounded-lg px-2 py-1 text-xs bg-card" />
            <SimpleSelect value={filterStatus || '__EMPTY__'} onValueChange={(v) => setFilterStatus(v === '__EMPTY__' ? '' : v)} options={[{ value: '__EMPTY__', label: '全部状态' }, ...(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => ({ value: k, label: v }))]} className="border border-input rounded-lg px-2 py-1 text-xs bg-card" />
          </div>
          <div className="flex-1" />
          <button onClick={() => { if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft -= 200; }} className="p-1 rounded hover:bg-muted" aria-label="向左滚动"><ChevronLeft size={16} /></button>
          <button onClick={() => { if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft += 200; }} className="p-1 rounded hover:bg-muted" aria-label="向右滚动"><ChevronRight size={16} /></button>
          <div className="h-4 w-px bg-border mx-1" />
          <button onClick={() => setShowBaseline(!showBaseline)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border hover:bg-muted transition-colors ${showBaseline ? 'border-primary bg-primary/5 text-primary' : 'border-border'}`}><GitCompare size={13} />基线</button>
          <button onClick={handleAutoSchedule} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"><Sparkles size={13} />AI排程</button>
          <button onClick={handleAutoScheduleDeep} disabled={schedulingDeep} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"><Zap size={13} />{schedulingDeep ? '排程中...' : '深度排程'}</button>
          <button onClick={toggleZoom} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-border hover:bg-muted transition-colors">
            {zoom === 'week' ? <><ZoomOut size={13} />月视图</> : <><ZoomIn size={13} />周视图</>}
          </button>
        </div>

        {/* Baseline panel */}
        {showBaseline && (
          <div className="px-5 py-2 border-b border-border bg-amber-50/50 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">基线对比</span>
            <SimpleSelect value={activeBaselineId || '__EMPTY__'} onValueChange={(v) => setActiveBaselineId(v === '__EMPTY__' ? '' : v)} options={[{ value: '__EMPTY__', label: '不显示基线' }, ...baselines.map(b => ({ value: b.id, label: `${b.name} (${new Date(b.createdAt).toLocaleDateString('zh-CN')})` }))]} className="border border-input rounded-lg px-2 py-1 text-xs bg-card" />
            <input type="text" className="border border-input rounded-lg px-2 py-1 text-xs w-28" placeholder="基线名称" value={baselineName} onChange={e => setBaselineName(e.target.value)} />
            <button onClick={handleSaveBaseline} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90"><Save size={12} />保存当前快照</button>
            {activeBaselineId && <button onClick={() => handleDeleteBaseline(activeBaselineId)} className="text-xs text-destructive hover:underline">删除当前基线</button>}
            {activeBaseline && <span className="text-[10px] text-muted-foreground">灰色条 = 基线计划 | 颜色条 = 当前实际</span>}
          </div>
        )}

        {/* AI Schedule suggestions panel */}
        {showSchedule && scheduleSuggestions.length > 0 && (
          <div className="px-5 py-2 border-b border-border bg-indigo-50/50 max-h-[200px] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-indigo-700">AI 排程建议 ({scheduleSuggestions.length}项)</span>
              {scheduleDeepSummary && <span className="text-[10px] text-purple-600 ml-2">{scheduleDeepSummary}</span>}
              <div className="flex items-center gap-2">
                {canEditTasks && <button className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] hover:bg-indigo-700" onClick={handleApplyAllSchedule}>全部应用</button>}
                <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShowSchedule(false)}>关闭</button>
              </div>
            </div>
            {scheduleSuggestions.map(s => (
              <div key={s.taskId} className="flex items-center gap-2 py-1 text-xs border-b border-indigo-100 last:border-0">
                <span className="font-medium truncate max-w-[120px]">{s.taskTitle}</span>
                <span className="text-muted-foreground">{s.currentStartDate || '?'}~{s.currentDueDate || '?'}</span>
                <span className="text-indigo-600">→</span>
                <span className="text-indigo-700 font-medium">{s.suggestedStartDate}~{s.suggestedDueDate}</span>
                <span className="text-muted-foreground truncate flex-1">{s.reason}</span>
                {canEditTasks && <button className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] hover:bg-indigo-700 flex-shrink-0" onClick={() => handleApplySchedule(s)}>应用</button>}
              </div>
            ))}
          </div>
        )}

        {/* Gantt Body */}
        <div className="flex-1 overflow-hidden flex" ref={containerRef}>
          {allTasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">暂无带日期的任务，请先为任务设置开始或截止日期</div>
          ) : (
            <>
              {/* Left: labels */}
              <div className="flex-shrink-0 border-r border-border bg-card overflow-y-auto" style={{ width: labelWidth }}>
                <div className="flex items-center px-3 border-b border-border text-xs text-muted-foreground font-medium" style={{ height: headerHeight }}>
                  <span className="flex-1">任务名称</span>
                  <span className="w-14 text-center">负责人</span>
                </div>
                {taskGroups.map(group => {
                  const isCollapsed = collapsedGroups.has(group.key);
                  const isGrouped = groupBy !== 'none';
                  return (
                    <React.Fragment key={group.key}>
                      {isGrouped && (
                        <div className="flex items-center px-3 py-1.5 bg-muted/40 border-b border-border/50 cursor-pointer select-none" onClick={() => setCollapsedGroups(prev => { const next = new Set(prev); next.has(group.key) ? next.delete(group.key) : next.add(group.key); return next; })}>
                          <span className="text-[10px] mr-1.5 text-muted-foreground">{isCollapsed ? '▶' : '▼'}</span>
                          <span className="text-xs font-semibold flex-1">{group.label}</span>
                          <span className="text-[10px] text-muted-foreground mr-2">{group.tasks.length}项</span>
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden mr-1">
                            <div className={`h-full rounded-full ${getProgressColor(group.progress)}`} style={{ width: `${group.progress}%` }} />
                          </div>
                          <span className="text-[9px] text-muted-foreground">{group.progress}%</span>
                        </div>
                      )}
                      {!isCollapsed && group.tasks.map(task => {
                  const isMilestone = task.tags?.includes('__milestone');
                  const isCritical = cpmResult.criticalTaskIds.has(task.id);
                  const slack = cpmResult.taskMetrics.get(task.id)?.slack;
                  const slackDisplay = Number.isNaN(slack) ? '循环' : `${slack}天`;
                  return (
                    <div key={task.id} className={`flex items-center px-3 border-b border-border/50 hover:bg-muted/30 group cursor-pointer ${isCritical ? 'bg-red-50/40' : ''}`} style={{ height: rowHeight }} onDoubleClick={() => setEditingTaskId(editingTaskId === task.id ? null : task.id)}>
                      <Tooltip><TooltipTrigger asChild><button onClick={() => handleToggleMilestone(task)} className={`mr-1 flex-shrink-0 ${isMilestone ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`} aria-label="切换里程碑"><Flag size={13} /></button></TooltipTrigger><TooltipContent>里程碑</TooltipContent></Tooltip>
                      <input value={task.title} onChange={e => handleTitleChange(task.id, e.target.value)} className={`flex-1 text-xs bg-transparent border-none outline-none truncate min-w-0 hover:bg-muted/50 px-1 py-0.5 rounded ${isCritical ? 'font-medium text-red-700' : ''}`} readOnly={!canEditTasks} />
                      {canEditTasks ? <Tooltip><TooltipTrigger asChild><button className="w-14 text-[10px] text-muted-foreground truncate text-center flex-shrink-0 hover:text-primary hover:underline" onClick={e => { e.stopPropagation(); setEditingTaskId(task.id); }}>{getName(task.leaderId) || '未指定'}</button></TooltipTrigger><TooltipContent>点击编辑负责人</TooltipContent></Tooltip> : <span className="w-14 text-[10px] text-muted-foreground truncate text-center flex-shrink-0">{getName(task.leaderId)}</span>}
                      {canDeleteTasks && <button onClick={() => handleDeleteTask(task.id)} className="ml-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" aria-label="删除任务"><Trash2 size={12} /></button>}
                      {isCritical && <Tooltip><TooltipTrigger asChild><span className="ml-1 text-[8px] text-red-400 flex-shrink-0">CP</span></TooltipTrigger><TooltipContent>{`浮动: ${slackDisplay}`}</TooltipContent></Tooltip>}
                    </div>
                  );
                })}
                    </React.Fragment>
                  );
                })}
                {/* Resource load labels */}
                <div className="px-3 py-2 border-t-2 border-border text-xs font-semibold text-muted-foreground bg-muted/20">人员负载</div>
                {activeMembers.map(m => (
                  <div key={m.id} className="flex items-center px-3 border-b border-border/30" style={{ height: 24 }}>
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary flex-shrink-0">{m.avatar || m.name.charAt(0)}</div>
                    <span className="ml-2 text-[10px] text-muted-foreground truncate">{m.name}</span>
                  </div>
                ))}
              </div>
              {/* Right: timeline */}
              <div className="flex-1 overflow-hidden relative">
                <div ref={timelineScrollRef} className="overflow-x-auto overflow-y-auto h-full" onScroll={handleTimelineScroll}>
                  <div style={{ width: timelineWidth, minWidth: timelineWidth }}>
                    <svg width="0" height="0" className="absolute">{renderDependencySVGDefs()}</svg>
                    {/* Month header */}
                    <div className="flex border-b border-border text-[10px] text-muted-foreground" style={{ height: headerHeight / 2 }}>
                      {headerDates.filter(d => d.isMonth).map((d, i, arr) => {
                        const nextMonthTs = i < arr.length - 1 ? arr[i + 1].ts : timeRange.end;
                        const days = Math.ceil((nextMonthTs - d.ts) / DAY_MS);
                        return <div key={d.ts} className="flex items-center px-2 font-medium border-r border-border/30" style={{ width: days * dayWidth }}>{d.monthLabel}</div>;
                      })}
                    </div>
                    {/* Day header */}
                    <div className="flex border-b border-border text-[10px]" style={{ height: headerHeight / 2 }}>
                      {headerDates.map(d => (
                        <div key={d.ts} className={`flex items-center justify-center border-r border-border/10 ${d.isWeekend ? 'bg-gray-50 text-muted-foreground' : 'text-muted-foreground'}`} style={{ width: dayWidth }}>{zoom === 'week' ? d.label.split('/')[1] : (parseInt(d.label.split('/')[1]) % 5 === 1 ? d.label.split('/')[1] : '')}</div>
                      ))}
                    </div>
                    {/* Task rows */}
                    {visibleTasks.map(task => {
                      const startTs = parseDate(task.startDate) || parseDate(task.dueDate) || timeRange.start;
                      const dueTs = parseDate(task.dueDate) || addDays(startTs, 7);
                      const isMilestone = task.tags?.includes('__milestone');
                      const leftPx = ((startTs - timeRange.start) / DAY_MS) * dayWidth;
                      const widthPx = Math.max(((dueTs - startTs) / DAY_MS) * dayWidth, isMilestone ? 12 : dayWidth);
                      const barColor = STATUS_BAR_COLORS[task.status] || STATUS_BAR_COLORS.todo;
                      const dotColor = STATUS_COLORS[task.status] || STATUS_COLORS.todo;
                      const isOverdue = task.status !== 'done' && task.status !== 'cancelled' && dueTs < todayTs && dueTs > 0;
                      const overdueDays = isOverdue ? Math.ceil((todayTs - dueTs) / DAY_MS) : 0;
                      const isCritical = cpmResult.criticalTaskIds.has(task.id);
                      const slack = cpmResult.taskMetrics.get(task.id)?.slack;
                      const slackDisplay = Number.isNaN(slack) ? '循环' : `${slack}天`;
                      const baselineTask = activeBaseline ? activeBaseline.tasks.find(t => t.id === task.id) : null;
                      const blStartTs = baselineTask ? parseDate(baselineTask.startDate) : 0;
                      const blDueTs = baselineTask ? parseDate(baselineTask.dueDate) : 0;
                      const blLeftPx = baselineTask && blStartTs ? ((blStartTs - timeRange.start) / DAY_MS) * dayWidth : 0;
                      const blWidthPx = baselineTask && blStartTs && blDueTs ? Math.max(((blDueTs - blStartTs) / DAY_MS) * dayWidth, dayWidth) : 0;
                      const depLines = renderDependencyLines({ task, allTasks, taskIndexMap, timeRange, dayWidth, rowHeight, cpmResult });
                      return (
                        <div key={task.id} className="relative border-b border-border/20" style={{ height: rowHeight }} onClick={canEditTasks ? handleTimelineClick : undefined}>
                          {/* Baseline ghost bar */}
                          {baselineTask && blWidthPx > 0 && (
                            <Tooltip><TooltipTrigger asChild><div className="absolute top-1/2 -translate-y-1/2 rounded border border-dashed border-gray-300 bg-gray-100/50" style={{ left: blLeftPx, width: blWidthPx, height: 14 }} /></TooltipTrigger><TooltipContent>{`基线: ${baselineTask.startDate || '?'} ~ ${baselineTask.dueDate || '?'}`}</TooltipContent></Tooltip>
                          )}
                          {/* Dependency lines (bezier) */}
                          {depLines.length > 0 && (
                            <svg className="absolute inset-0 pointer-events-none" style={{ height: rowHeight, overflow: 'visible' }}>
                              {depLines}
                            </svg>
                          )}
                          {/* Overdue warning bg */}
                          {isOverdue && <div className="absolute inset-x-0 top-0 bottom-0 bg-red-50/40 pointer-events-none" />}
                          {isMilestone ? (
                            <Tooltip><TooltipTrigger asChild><div className="absolute top-1/2 -translate-y-1/2" style={{ left: leftPx }}>
                              <div data-gantt-bar={task.id} className={`w-3 h-3 rotate-45 ${dotColor} ${isCritical ? CRITICAL_BAR_CLASS : ''} ${isOverdue ? 'ring-2 ring-red-400' : ''} border border-white shadow-sm cursor-pointer`} onMouseDown={canEditTasks ? e => handleBarMouseDown(e, task, 'move') : undefined} />
                            </div></TooltipTrigger><TooltipContent>{`${task.title} — ${STATUS_LABELS[task.status]}${isCritical ? ' [关键路径]' : ''}`}</TooltipContent></Tooltip>
                          ) : (
                            <Tooltip><TooltipTrigger asChild><div data-gantt-bar={task.id} className={`absolute top-1/2 -translate-y-1/2 rounded border ${barColor} ${isCritical ? CRITICAL_BAR_CLASS : ''} ${isOverdue ? 'ring-2 ring-red-400 shadow-red-200 shadow-sm' : 'shadow-sm'} flex items-center overflow-hidden ${canEditTasks ? 'cursor-move' : 'cursor-default'}`} style={{ left: leftPx, width: widthPx, height: 20 }} onDoubleClick={() => setEditingTaskId(task.id)} onClick={e => e.stopPropagation()}>
                              {canEditTasks && <div className="w-1.5 h-full bg-black/5 hover:bg-black/15 cursor-ew-resize flex-shrink-0" onMouseDown={e => handleBarMouseDown(e, task, 'resize-start')} />}
                              <div className="flex-1 flex items-center px-1 min-w-0">
                                <Tooltip><TooltipTrigger asChild><div className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0 cursor-pointer hover:scale-125 transition-transform`} onClick={canEditTasks ? e => { e.stopPropagation(); handleStatusCycle(task); } : undefined} /></TooltipTrigger><TooltipContent>点击切换状态</TooltipContent></Tooltip>
                                {widthPx > 60 && <span className="ml-1 text-[10px] text-muted-foreground truncate">{task.title}</span>}
                              </div>
                              {canEditTasks && <div className="w-1.5 h-full bg-black/5 hover:bg-black/15 cursor-ew-resize flex-shrink-0" onMouseDown={e => handleBarMouseDown(e, task, 'resize-end')} />}
                            </div></TooltipTrigger><TooltipContent>{`${task.title} (${STATUS_LABELS[task.status]})${isCritical ? ` [关键路径 浮动${slackDisplay}]` : ''}${isOverdue ? ' - 已逾期' + overdueDays + '天' : ''}`}</TooltipContent></Tooltip>
                          )}
                          {isOverdue && <Tooltip><TooltipTrigger asChild><div className="absolute text-[8px] text-red-500 font-bold" style={{ left: leftPx + widthPx + 4, top: 8 }}>+{overdueDays}d</div></TooltipTrigger><TooltipContent>{`已逾期 ${overdueDays} 天`}</TooltipContent></Tooltip>}
                        </div>
                      );
                    })}
                    {/* Resource load heatmap */}
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
                    {/* Today line */}
                    {renderTodayLine(todayOffset, timelineWidth)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer legend */}
        <div className="flex items-center gap-4 px-5 py-2 border-t border-border text-xs text-muted-foreground flex-wrap">
          {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: { todo: '#94a3b8', in_progress: '#3b82f6', done: '#22c55e', blocked: '#f59e0b', cancelled: '#ef4444' }[k] }} />{v}</span>
          ))}
          <span className="flex items-center gap-1"><span className="w-3 h-3 rotate-45 bg-gray-300" />里程碑</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded border-2 border-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]" />关键路径</span>
          <span className="h-3 w-px bg-border mx-1" />
          <span className="text-[10px] font-medium">负载:</span>
          <span className="flex items-center gap-0.5"><span className="w-3 h-2 rounded bg-green-200" />1</span>
          <span className="flex items-center gap-0.5"><span className="w-3 h-2 rounded bg-green-400" />2</span>
          <span className="flex items-center gap-0.5"><span className="w-3 h-2 rounded bg-yellow-300" />3</span>
          <span className="flex items-center gap-0.5"><span className="w-3 h-2 rounded bg-orange-400" />4</span>
          <span className="flex items-center gap-0.5"><span className="w-3 h-2 rounded bg-red-500" />5+</span>
          <span className="ml-auto text-[10px]">点击空白区创建任务 | 点击状态点切换状态 | 双击编辑 | 拖拽移动/调整 | Ctrl+G 打开</span>
        </div>

        {/* Editing modal (centered overlay) */}
        {editingTaskId && (() => { const et = allTasks.find(t => t.id === editingTaskId); if (!et) return null; return (
          <Dialog open={!!editingTaskId} onOpenChange={(v) => { if (!v) setEditingTaskId(null); }}>
            <DialogContent className="sm:max-w-[420px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{et.title}</DialogTitle>
                <DialogDescription className="sr-only">编辑任务详情</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
              <div><label className="text-xs text-muted-foreground block mb-1">状态</label><SimpleSelect value={et.status} onValueChange={(v) => handleUpdateTask(et.id, { status: v as TaskStatus })} options={(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => ({ value: k, label: v }))} className="w-full h-10 text-sm" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">负责人</label><SimpleSelect value={et.leaderId || '__EMPTY__'} onValueChange={(v) => handleUpdateTask(et.id, { leaderId: v === '__EMPTY__' ? '' : v })} options={[{ value: '__EMPTY__', label: '未指定' }, ...activeMembers.map(m => ({ value: m.id, label: m.name }))]} className="w-full h-10 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground block mb-1">开始日期</label><input type="date" className="w-full text-sm border border-input rounded-lg px-3 py-2" value={et.startDate || ''} onChange={e => handleUpdateTask(et.id, { startDate: e.target.value || null })} /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">截止日期</label><input type="date" className="w-full text-sm border border-input rounded-lg px-3 py-2" value={et.dueDate || ''} onChange={e => handleUpdateTask(et.id, { dueDate: e.target.value || null })} /></div>
              </div>
              <div><label className="text-xs text-muted-foreground block mb-1">紧急程度</label><SimpleSelect value={et.priority} onValueChange={(v) => handleUpdateTask(et.id, { priority: v as TaskPriority })} options={[{ value: 'urgent', label: '紧急 (S)' }, { value: 'high', label: '高 (A)' }, { value: 'medium', label: '中 (B)' }, { value: 'low', label: '低 (C)' }]} className="w-full h-10 text-sm" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">前置依赖</label><SimpleSelect value="__EMPTY__" onValueChange={(v) => { if (v === '__EMPTY__') return; const current = (et.blockedBy ?? []) as string[]; if (!current.includes(v)) handleUpdateTask(et.id, { blockedBy: [...current, v] }); }} options={[{ value: '__EMPTY__', label: '添加依赖...' }, ...allTasks.filter(t => t.id !== et.id).map(t => ({ value: t.id, label: t.title }))]} className="w-full h-10 text-sm" />
                <div className="flex flex-wrap gap-1 mt-2">{((et.blockedBy ?? []) as string[]).map(bid => { const dep = allTasks.find(t => t.id === bid); if (!dep) return null; return <span key={bid} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">{dep.title}<button className="hover:text-red-500" onClick={() => handleUpdateTask(et.id, { blockedBy: ((et.blockedBy ?? []) as string[]).filter((id: string) => id !== bid) })} aria-label="移除依赖"><X size={12} /></button></span>; })}</div>
              </div>
              </div>
            </DialogContent>
          </Dialog>
        ); })()}
      </DialogContent>
    </Dialog>
  );
}
