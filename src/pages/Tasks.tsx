import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useTags, useViewingMember, useMemberLookup, useItemLookupMaps, usePermissions } from '@/store/hooks';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import { useVirtualScroll } from '@/hooks/useVirtualScroll';
import type { Task, TaskStatus, TaskPriority, Comment } from '@/types';
import { cn } from '@/lib/utils';
import { handleError } from '@/lib/errorHandler';
import { Plus, Search, ChevronDown, ChevronRight, Calendar, X, Clock, AlertCircle, CheckCircle2, Circle, FileText, Copy, MessageSquare, Trash2, Check, Filter, Sparkles, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCollabPresence, useCollabBroadcast } from '@/lib/collab';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { AIMatchPanel } from '@/components/AIMatchPanel';
import { TaskCard, TaskRow, StatusBadge, PriorityBadge } from './tasks/TasksComponents';
import { TaskMatrixView } from './tasks/TasksMatrix';
import { TaskTimelineView } from './tasks/TasksTimeline';
import {
  STATUS_CONFIG, BOARD_COLUMNS, VIEW_TABS, TIME_OPTIONS,
  getTodayStr, priorityToBP, getQuadrantForPriority, isOverdue, isInTimeRange,
  type ViewMode, type BusinessPriority, type BatchProps, type KanbanGroupBy
} from './tasks/constants';
import { useDetailFromUrl, useFiltersFromUrl } from '@/hooks/useDetailFromUrl';
import { useBatchSelection } from '@/hooks/useBatchSelection';

export default function Tasks() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const { tags } = useTags();
  const { isTeamView, viewingMember, setViewingMember, viewingMemberId } = useViewingMember();
  const { onlineUsers } = useCollabPresence(state.currentUser?.id || '', state.currentUser?.name || '');
  const { broadcastOp } = useCollabBroadcast(state.currentUser?.id || '');
  const currentUser = state.currentUser;

  // URL-driven detail panel (replaces tbh-open-detail event)
  const { detailItem, openDetail: openTaskDetail, closeDetail: closeTaskDetail } = useDetailFromUrl({ itemType: 'task', basePath: '/tasks' });

  // URL-driven filters (replaces tbh-nav-filter event)
  const urlFilters = useFiltersFromUrl();

  const VIEW_MODE_LS_KEY = 'tbh-tasks-view-mode';
  const [viewMode, setViewMode] = useState<ViewMode>(() => { try { return (localStorage.getItem(VIEW_MODE_LS_KEY) || 'board') as ViewMode; } catch (e) { handleError(e, { module: 'Tasks', operation: 'READ_VIEW_MODE', severity: 'debug' }); return 'board'; } });
  useEffect(() => { try { localStorage.setItem(VIEW_MODE_LS_KEY, viewMode); } catch (e) { handleError(e, { module: 'Tasks', operation: 'SAVE_VIEW_MODE', severity: 'debug' }); } }, [viewMode]);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => urlFilters.statuses || new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedPersons, setSelectedPersons] = useState<Set<string>>(() => urlFilters.persons ? new Set(urlFilters.persons) : new Set());
  const [timeFilter, setTimeFilter] = useState(() => urlFilters.timeFilter || 'all');
  const [searchQuery, setSearchQuery] = useState('');

  // Apply URL filter params on mount (one-time, for statuses/persons that may not have been in initial state)
  useEffect(() => {
    if (urlFilters.statuses && urlFilters.statuses.size > 0) setSelectedStatuses(urlFilters.statuses);
    if (urlFilters.timeFilter) setTimeFilter(urlFilters.timeFilter);
    if (urlFilters.persons && urlFilters.persons.length > 0) setSelectedPersons(new Set(urlFilters.persons));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [groupByDate, setGroupByDate] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  // Adapter: sub-views pass { type, id } objects; we route to URL
  const setDetailItem = useCallback((item: { type: 'task'; id: string } | null) => {
    if (item) openTaskDetail(item.id);
    else closeTaskDetail();
  }, [openTaskDetail, closeTaskDetail]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [newTags, setNewTags] = useState<Set<string>>(new Set());
  const [newSupporters, setNewSupporters] = useState<Set<string>>(new Set());
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showMatchPanel, setShowMatchPanel] = useState(false);
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const personPickerRef = useRef<HTMLDivElement>(null);
  const batchSel = useBatchSelection();
  const { batchMode, selectedIds, toggleSelect, selectAll, selectRange, clearSelection, exitBatchMode, lastSelectedId } = batchSel;
  const KANBAN_LS_KEY = 'tbh-tasks-kanban';
  const [kanbanCustomMode, setKanbanCustomMode] = useState(() => { try { return (JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || '{}')).customMode || false; } catch (e) { handleError(e, { module: 'Tasks', operation: 'READ_KANBAN', severity: 'debug' }); return false; } });
  const [customColumns, setCustomColumns] = useState<string[]>(() => { try { return (JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || '{}')).columns || ['待处理', '进行中', '已完成']; } catch (e) { handleError(e, { module: 'Tasks', operation: 'READ_KANBAN', severity: 'debug' }); return ['待处理', '进行中', '已完成']; } });
  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>(() => { try { return (JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || '{}')).groupBy || 'status'; } catch (e) { handleError(e, { module: 'Tasks', operation: 'READ_KANBAN', severity: 'debug' }); return 'status'; } });
  const [newColName, setNewColName] = useState('');
  const [fromTemplate, setFromTemplate] = useState(false);  useEffect(() => { try { localStorage.setItem(KANBAN_LS_KEY, JSON.stringify({ customMode: kanbanCustomMode, columns: customColumns, groupBy: kanbanGroupBy })); } catch (e) { handleError(e, { module: 'Tasks', operation: 'SAVE_KANBAN', severity: 'debug' }); } }, [kanbanCustomMode, customColumns, kanbanGroupBy]);

  const { getName, getAvatar } = useMemberLookup();
  const { getProjectTitle: getProjectTitleFn, getTaskTitle } = useItemLookupMaps();
  const activeMembers = useMemo(() => state.members.filter(m => m.status === 'active'), [state.members]);
  const allCategories = useMemo(() => { const cats = new Set<string>(); state.tasks.forEach(t => { if (t.category) cats.add(t.category); }); return Array.from(cats).sort(); }, [state.tasks]);
  const allTags = useMemo(() => { const t = new Set<string>(); state.tasks.forEach(task => (task.tags || []).forEach(tag => t.add(tag))); return Array.from(t).sort(); }, [state.tasks]);
  const taskTemplates = useMemo(() => state.templates.filter(t => t.type === 'task'), [state.templates]);

  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (state.comments || []).forEach((c: Comment) => { if (c.itemType === 'task') counts[c.itemId] = (counts[c.itemId] || 0) + 1; });
    return counts;
  }, [state.comments]);

  // filteredTasks MUST be declared before useEffect that references it (TDZ fix)
  const filteredTasks = useMemo(() => {
    let list = state.tasks;
    if (!isTeamView && viewingMember) list = list.filter(t => t.leaderId === viewingMember.id || (t.supporterIds || []).includes(viewingMember.id));
    if (selectedStatuses.size > 0) list = list.filter(t => selectedStatuses.has(t.status));
    if (selectedPriorities.size > 0) list = list.filter(t => selectedPriorities.has(t.priority));
    if (selectedLevels.size > 0) list = list.filter(t => selectedLevels.has(priorityToBP(t.priority)));
    if (selectedCategories.size > 0) list = list.filter(t => selectedCategories.has(t.category));
    if (selectedTags.size > 0) list = list.filter(t => (t.tags || []).some(tag => selectedTags.has(tag)));
    if (selectedPersons.size > 0) list = list.filter(t => selectedPersons.has(t.leaderId) || (t.supporterIds || []).some(s => selectedPersons.has(s)));
    if (timeFilter !== 'all') {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      if (timeFilter === 'overdue') list = list.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < todayStr);
      else if (timeFilter === 'custom' && customDateFrom && customDateTo) list = list.filter(t => t.dueDate && t.dueDate >= customDateFrom && t.dueDate <= customDateTo);
      else list = list.filter(t => isInTimeRange(t.dueDate, timeFilter, now));
    }
    if (searchQuery.trim()) { const q = searchQuery.trim().toLowerCase(); list = list.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)); }
    return list;
  }, [state.tasks, isTeamView, viewingMember, selectedStatuses, selectedPriorities, selectedLevels, selectedCategories, selectedTags, selectedPersons, timeFilter, customDateFrom, customDateTo, searchQuery]);

  // P3#11 fix: reset focusedId when it's no longer in the filtered list
  useEffect(() => {
    if (focusedId && !filteredTasks.some(t => t.id === focusedId)) {
      setFocusedId(null);
    }
  }, [filteredTasks, focusedId]);

  // Keyboard event handlers for j/k/e/d/x navigation
  useEffect(() => {
    const getFilteredIds = () => filteredTasks.map(t => t.id);
    const onNavDown = () => { const ids = getFilteredIds(); if (ids.length === 0) return; const idx = focusedId ? ids.indexOf(focusedId) : -1; setFocusedId(ids[Math.min(idx + 1, ids.length - 1)]); };
    const onNavUp = () => { const ids = getFilteredIds(); if (ids.length === 0) return; const idx = focusedId ? ids.indexOf(focusedId) : 0; setFocusedId(ids[Math.max(idx - 1, 0)]); };
    const onEdit = () => { if (focusedId) openTaskDetail(focusedId); };
    const onOpen = () => { if (focusedId) openTaskDetail(focusedId); };
    const onDelete = () => { if (focusedId && can('task_delete')) dispatch({ type: 'DELETE_TASK', payload: focusedId }); };
    const onComplete = () => { if (focusedId) { const task = state.tasks.find(t => t.id === focusedId); if (task) { const oldStatus = task.status; const newStatus = task.status === 'done' ? 'todo' : 'done'; dispatch({ type: 'UPDATE_TASK', payload: { id: focusedId, updates: { status: newStatus } } }); broadcastOp({ type: 'update', entity: 'task', entityId: focusedId, field: 'status', oldValue: oldStatus, newValue: newStatus }); } } };
    const onFilter = () => { const input = document.querySelector<HTMLInputElement>('input[data-search-input]'); if (input) { input.focus(); } };
    const onViewSwitch = (e: Event) => { const mode = (e as CustomEvent).detail; if (mode === 'table' || mode === 'board' || mode === 'list' || mode === 'timeline' || mode === 'matrix') setViewMode(mode as ViewMode); };
    const onToggleBatch = () => { batchSel.toggleBatchMode(); };
    const onSelectAll = () => { selectAll(filteredTasks.map(t => t.id)); };
    window.addEventListener('tbh-nav-down', onNavDown);
    window.addEventListener('tbh-nav-up', onNavUp);
    window.addEventListener('tbh-edit-selected', onEdit);
    window.addEventListener('tbh-open-selected', onOpen);
    window.addEventListener('tbh-delete-selected', onDelete);
    window.addEventListener('tbh-complete-selected', onComplete);
    window.addEventListener('tbh-focus-filter', onFilter);
    window.addEventListener('tbh-switch-view', onViewSwitch);
    window.addEventListener('tbh-toggle-batch', onToggleBatch);
    window.addEventListener('tbh-select-all', onSelectAll);
    return () => {
      window.removeEventListener('tbh-nav-down', onNavDown);
      window.removeEventListener('tbh-nav-up', onNavUp);
      window.removeEventListener('tbh-edit-selected', onEdit);
      window.removeEventListener('tbh-open-selected', onOpen);
      window.removeEventListener('tbh-delete-selected', onDelete);
      window.removeEventListener('tbh-complete-selected', onComplete);
      window.removeEventListener('tbh-focus-filter', onFilter);
      window.removeEventListener('tbh-switch-view', onViewSwitch);
      window.removeEventListener('tbh-toggle-batch', onToggleBatch);
      window.removeEventListener('tbh-select-all', onSelectAll);
    };
  }, [focusedId, filteredTasks, can, dispatch, batchSel]);

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    arr.sort((a, b) => {
      let va: string | number | boolean | string[] | null | undefined = a[sortField as keyof Task] as string | number | boolean | string[] | null | undefined; let vb: string | number | boolean | string[] | null | undefined = b[sortField as keyof Task] as string | number | boolean | string[] | null | undefined;
      if (sortField === 'leaderId') { va = getName(a.leaderId); vb = getName(b.leaderId); }
      if (va == null) va = ''; if (vb == null) vb = '';
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredTasks, sortField, sortDir, getName]);

  const usedTagNames = useMemo(() => { const set = new Set<string>(); filteredTasks.forEach(t => (t.tags || []).forEach(tag => set.add(tag))); return [...set].sort(); }, [filteredTasks]);

  const topTasks = useMemo(() => filteredTasks.filter(t => !t.parentId), [filteredTasks]);
  const childMap = useMemo(() => {
    const m: Record<string, Task[]> = {};
    filteredTasks.filter(t => t.parentId).forEach(t => { if (!m[t.parentId!]) m[t.parentId!] = []; m[t.parentId!].push(t); });
    return m;
  }, [filteredTasks]);

  const timelineBuckets = useMemo(() => {
    const buckets: Record<string, Task[]> = {};
    filteredTasks.forEach(t => { const key = t.dueDate || '无截止日期'; if (!buckets[key]) buckets[key] = []; buckets[key].push(t); });
    return Object.entries(buckets).sort(([a], [b]) => { if (a === '无截止日期') return 1; if (b === '无截止日期') return -1; return a.localeCompare(b); });
  }, [filteredTasks]);

  const listGroups = useMemo(() => {
    if (!groupByDate) return [{ key: '__all__', label: '', tasks: sortedTasks }];
    const buckets: Record<string, Task[]> = {};
    sortedTasks.forEach(t => { const key = t.dueDate || '无截止日期'; if (!buckets[key]) buckets[key] = []; buckets[key].push(t); });
    const entries = Object.entries(buckets).sort(([a], [b]) => { if (a === '无截止日期') return 1; if (b === '无截止日期') return -1; return a.localeCompare(b); });
    return entries.map(([k, v]) => ({ key: k, label: k === '无截止日期' ? '无截止日期' : k, tasks: v }));
  }, [sortedTasks, groupByDate]);

  const batchProps = useMemo((): BatchProps => ({
    batchMode,
    selectedIds,
    onToggleSelect: (id: string) => {
      // Shift+Click range selection
      if (batchMode && lastSelectedId && lastSelectedId !== id) {
        // Check if shift key is not held — just toggle
      }
      toggleSelect(id);
    },
    // Expose range selection for Shift+Click support
    shiftSelect: (id: string) => {
      if (batchMode && lastSelectedId && lastSelectedId !== id) {
        selectRange(lastSelectedId, id, filteredTasks.map(t => t.id));
      } else {
        toggleSelect(id);
      }
    },
  }), [batchMode, selectedIds, lastSelectedId, toggleSelect, selectRange, filteredTasks]);

  function togglePerson(id: string) { setSelectedPersons(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleSetItem(setter: React.Dispatch<React.SetStateAction<Set<string>>>) { return (value: string) => { setter(prev => { const next = new Set(prev); if (next.has(value)) next.delete(value); else next.add(value); return next; }); }; }
  const toggleStatus = toggleSetItem(setSelectedStatuses);
  const togglePriority = toggleSetItem(setSelectedPriorities);
  const toggleLevel = toggleSetItem(setSelectedLevels);
  const toggleCategory = toggleSetItem(setSelectedCategories);
  const toggleTag = toggleSetItem(setSelectedTags);
  function clearFilters() { setSelectedStatuses(new Set()); setSelectedPriorities(new Set()); setSelectedLevels(new Set()); setSelectedCategories(new Set()); setSelectedTags(new Set()); setSelectedPersons(new Set()); setTimeFilter('all'); setSearchQuery(''); setCustomDateFrom(''); setCustomDateTo(''); setShowCustomDate(false); }
  function handleSort(field: string) { if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('asc'); } }
  function addCustomColumn() { const n = newColName.trim(); if (n && !customColumns.includes(n)) { setCustomColumns(prev => [...prev, n]); setNewColName(''); } }
  function removeCustomColumn(idx: number) { setCustomColumns(prev => prev.filter((_, i) => i !== idx)); }

  function handleCreateFromTemplate() {
    const tpl = taskTemplates.find(t => t.id === selectedTemplate);
    if (!tpl) return;
    try {
      const data = JSON.parse(tpl.content);
      dispatch({ type: 'ADD_TASK', payload: { title: data.title || tpl.title, description: data.description || '', projectId: data.projectId || null, goalId: data.goalId || null, parentId: null, status: 'todo' as TaskStatus, priority: (data.priority || 'medium') as TaskPriority, leaderId: data.leaderId || state.currentUser?.id || '', supporterIds: data.supporterIds || [], tags: data.tags || [], category: data.category || '', startDate: data.startDate || null, dueDate: data.dueDate || null, reminderDate: data.reminderDate || null, completedAt: null, subtasks: data.subtasks || [], attachments: [], trackingRecords: [], repeatCycle: data.repeatCycle || 'none', summary: '' } });
    } catch (e) {
      handleError(e, { module: 'Tasks', operation: 'PARSE_TEMPLATE', severity: 'warn' });
      dispatch({ type: 'ADD_TASK', payload: { title: tpl.title, description: tpl.description, projectId: null, goalId: null, parentId: null, status: 'todo' as TaskStatus, priority: 'medium' as TaskPriority, leaderId: state.currentUser?.id || '', supporterIds: [], tags: [], category: '', startDate: null, dueDate: null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', summary: '' } });
    }
    setShowCreateDialog(false); setFromTemplate(false); setSelectedTemplate('');
  }

  const handleDropToQuadrant = useCallback((taskId: string, quadrant: string) => {
    if (!can('edit_tasks')) return;
    let np: TaskPriority = 'low';
    if (quadrant === '紧急重要') np = 'urgent'; else if (quadrant === '重要不紧急') np = 'high'; else if (quadrant === '紧急不重要') np = 'medium';
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { priority: np } } });
  }, [dispatch]);

  function getAllDescendants(parentId: string, visited = new Set<string>()): Task[] {
    if (visited.has(parentId)) return [];
    visited.add(parentId);
    const ch = childMap[parentId] || [];
    let res: Task[] = [];
    ch.forEach(c => { res.push(c); res = res.concat(getAllDescendants(c.id, visited)); });
    return res;
  }

  // Pre-compute kanban group data at component level (not inside conditional renders)
  const kanbanUsedCategories = useMemo(() => {
    const set = new Set<string>();
    filteredTasks.forEach(t => { if (t.category) set.add(t.category); });
    return [...set].sort();
  }, [filteredTasks]);

  const kanbanUsedPersons = useMemo(() => {
    const map = new Map<string, string>();
    filteredTasks.forEach(t => {
      if (t.leaderId && !map.has(t.leaderId)) {
        const name = getName(t.leaderId);
        if (name && name !== '未知') map.set(t.leaderId, name);
      }
    });
    return [...map.entries()];
  }, [filteredTasks, getName]);

  // Virtual scroll for table view (must be at component top level, not inside renderTable)
  const TASK_TABLE_ROW_H = 42;
  const taskTableVirtual = useVirtualScroll({ itemCount: sortedTasks.length, rowHeight: TASK_TABLE_ROW_H });

  function renderBoard() {
    const onOpenDetail = (task: Task) => setDetailItem({ type: 'task', id: task.id });
    const GROUP_OPTIONS: Array<{ key: KanbanGroupBy; label: string }> = [
      { key: 'status', label: '状态' }, { key: 'tag', label: '标签' },
      { key: 'priority', label: '紧急程度' }, { key: 'category', label: '分类' },
      { key: 'level', label: '等级' }, { key: 'person', label: '人员' },
      { key: 'time', label: '时间' },
    ];
    const groupByBtns = (
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {GROUP_OPTIONS.map(opt => (
          <button key={opt.key} className={`text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${kanbanGroupBy === opt.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setKanbanGroupBy(opt.key)}>{opt.label}</button>
        ))}
      </div>
    );

    function renderKanbanColumns(cols: Array<{ key: string; label: string; color?: string }>, getItems: (col: string) => Task[], showStatus?: boolean, enableDrag?: boolean, onDropCustom?: (taskId: string, colKey: string) => void) {
      return (
        <div className="overflow-x-auto -mx-4 px-4 pb-2"><div className="flex gap-4 min-w-max">
          {cols.map(col => {
            const items = getItems(col.key);
            return (
              <div key={col.key} className={`w-[260px] sm:w-[300px] flex-shrink-0 bg-muted/30 rounded-xl border border-border pt-3`} onDragOver={(e: React.DragEvent) => e.preventDefault()}               onDrop={(e: React.DragEvent) => { e.preventDefault(); const taskId = e.dataTransfer.getData('text/plain'); if (!taskId || !can('edit_tasks')) return; if (onDropCustom) { onDropCustom(taskId, col.key); return; } if (enableDrag) { const validStatuses: Record<string, TaskStatus> = { todo: 'todo', in_progress: 'in_progress', done: 'done', blocked: 'blocked', cancelled: 'cancelled' }; const newStatus = validStatuses[col.key]; if (newStatus) { const t = state.tasks.find(x => x.id === taskId); dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { status: newStatus } } }); broadcastOp({ type: 'update', entity: 'task', entityId: taskId, field: 'status', oldValue: t?.status || '', newValue: newStatus }); } } }}>
                <div className={`flex items-center gap-2 px-4 pb-2 border-b-2 mx-3 mb-3 ${col.color || 'border-t-gray-400'}`}><span className="font-semibold text-sm">{col.label}</span><span className="text-xs text-muted-foreground ml-auto">{items.length}</span></div>
                <div className="px-3 pb-3 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">{items.length === 0 && <EmptyState title="暂无任务" compact />}{items.map(task => <TaskCard key={task.id} task={task} compact tags={tags} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={onOpenDetail} getName={getName} getAvatar={getAvatar} enableDrag={!!enableDrag || !!onDropCustom} />)}</div>
              </div>
            );
          })}
        </div></div>
      );
    }

    if (kanbanGroupBy === 'tag') {
      const tagColumns = usedTagNames.length > 0 ? [...usedTagNames, '未分类'] : ['未分类'];
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
          {renderKanbanColumns(tagColumns.map(t => ({ key: t, label: t, color: 'border-t-gray-400' })), col => filteredTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && (col === '未分类' ? (t.tags || []).length === 0 : (t.tags || []).includes(col))))}
        </div>
      );
    }

    if (kanbanGroupBy === 'priority') {
      const priorityCols = [
        { key: 'urgent', label: '紧急', color: 'border-t-red-500' },
        { key: 'high', label: '高', color: 'border-t-orange-500' },
        { key: 'medium', label: '中', color: 'border-t-yellow-500' },
        { key: 'low', label: '低', color: 'border-t-blue-500' },
      ];
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
          {renderKanbanColumns(priorityCols, col => filteredTasks.filter(t => t.priority === col), true, undefined, (taskId, colKey) => { const pMap: Record<string, TaskPriority> = { urgent: 'urgent', high: 'high', medium: 'medium', low: 'low' }; if (pMap[colKey]) dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { priority: pMap[colKey] } } }); })}
        </div>
      );
    }

    if (kanbanGroupBy === 'category') {
      const catCols = kanbanUsedCategories.length > 0 ? [...kanbanUsedCategories, '未分类'] : ['未分类'];
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
          {renderKanbanColumns(catCols.map(c => ({ key: c, label: c, color: 'border-t-gray-400' })), col => filteredTasks.filter(t => col === '未分类' ? !t.category : t.category === col), true)}
        </div>
      );
    }

    if (kanbanGroupBy === 'level') {
      const levelCols = [
        { key: 'S', label: 'S 紧急', color: 'border-t-red-600' },
        { key: 'A', label: 'A 高', color: 'border-t-orange-500' },
        { key: 'B', label: 'B 中', color: 'border-t-yellow-500' },
        { key: 'C', label: 'C 低', color: 'border-t-green-500' },
      ];
      const bpMap2: Record<string, string> = { urgent: 'S', high: 'A', medium: 'B', low: 'C' };
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
          {renderKanbanColumns(levelCols, col => filteredTasks.filter(t => bpMap2[t.priority] === col), true, undefined, (taskId, colKey) => { const bpToP: Record<string, TaskPriority> = { S: 'urgent', A: 'high', B: 'medium', C: 'low' }; if (bpToP[colKey]) dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { priority: bpToP[colKey] } } }); })}
        </div>
      );
    }

    if (kanbanGroupBy === 'person') {
      const personCols = kanbanUsedPersons.map(([id, name]) => ({ key: id, label: name, color: 'border-t-gray-400' }));
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
          {personCols.length > 0 ? renderKanbanColumns(personCols, col => filteredTasks.filter(t => t.leaderId === col), true) : <EmptyState title="暂无数据" compact />}
        </div>
      );
    }

    if (kanbanGroupBy === 'time') {
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      const timeCols = [
        { key: 'overdue', label: '已逾期', color: 'border-t-red-500' },
        { key: 'today', label: '今天', color: 'border-t-orange-500' },
        { key: 'week', label: '本周', color: 'border-t-blue-500' },
        { key: 'later', label: '更晚', color: 'border-t-gray-400' },
        { key: 'none', label: '无截止', color: 'border-t-gray-300' },
      ];
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
          {renderKanbanColumns(timeCols, col => filteredTasks.filter(t => {
            if (col === 'overdue') return t.dueDate && t.dueDate < getTodayStr() && t.status !== 'done' && t.status !== 'cancelled';
            if (col === 'today') return t.dueDate === getTodayStr();
            if (col === 'week') return t.dueDate > getTodayStr() && t.dueDate <= weekEndStr;
            if (col === 'later') return t.dueDate > weekEndStr;
            if (col === 'none') return !t.dueDate;
            return false;
          }), true)}
        </div>
      );
    }

    if (kanbanCustomMode) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {groupByBtns}
            <button className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors" onClick={() => setKanbanCustomMode(false)}>默认看板</button>
            {customColumns.map((col, idx) => <span key={col} className="text-xs px-2 py-1 bg-muted rounded-lg flex items-center gap-1">{col}<button className="hover:text-red-500" onClick={() => removeCustomColumn(idx)}>✕</button></span>)}
            <input type="text" placeholder="列名" value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustomColumn(); }} className="text-xs border border-border rounded-lg px-2 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-primary/20" />
            <button className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90" onClick={addCustomColumn}>+</button>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 pb-2"><div className="flex gap-4 min-w-max">
            {customColumns.map(col => (
              <div key={col} className="w-[260px] sm:w-[300px] flex-shrink-0 bg-muted/30 rounded-xl border border-border pt-3">
                <div className="flex items-center gap-2 px-4 pb-2 border-b-2 mx-3 mb-3 border-t-blue-400"><span className="font-semibold text-sm">{col}</span></div>
                <div className="px-3 pb-3 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">{(customColumns.length <= 3 ? filteredTasks.filter(t => { const statusMap: Record<string, string> = { '待处理': 'todo', '进行中': 'in_progress', '已完成': 'done' }; return statusMap[col] ? t.status === statusMap[col] : false; }) : filteredTasks).map(task => <TaskCard key={task.id} task={task} compact tags={tags} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={onOpenDetail} getName={getName} getAvatar={getAvatar} />)}{filteredTasks.length === 0 && <EmptyState title="暂无任务" compact />}</div>
              </div>
            ))}
          </div></div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {groupByBtns}
          <button className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors" onClick={() => setKanbanCustomMode(true)}>自定义看板</button>
        </div>
        {renderKanbanColumns(BOARD_COLUMNS.map(c => ({ key: c.key, label: c.label, color: c.color })), col => filteredTasks.filter(t => t.status === col), true, true)}
      </div>
    );
  }

  function renderList() {
    const shownIds = groupByDate ? new Set(listGroups.flatMap(g => g.tasks.map(t => t.id))) : null;
    const onOpenDetail = (task: Task) => setDetailItem({ type: 'task', id: task.id });
    const onToggleExpand = (id: string) => setExpandedTask(prev => prev === id ? null : id);
    const onToggleSubtask = (taskId: string, subtaskId: string) => dispatch({ type: 'TOGGLE_SUBTASK', payload: { taskId, subtaskId } });
    const onUpdateStatus = (taskId: string, status: TaskStatus) => { if (!can('edit_tasks')) return; dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { status } } }); };
    const allShownTaskIds = topTasks.filter(t => !shownIds || shownIds.has(t.id)).map(t => t.id);
    const allSelected = allShownTaskIds.length > 0 && allShownTaskIds.every(id => selectedIds.has(id));
    const someSelected = allShownTaskIds.some(id => selectedIds.has(id));
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {filteredTasks.length > 0 && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-muted/30">
            <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={e => { e.stopPropagation(); if (allSelected) clearSelection(); else selectAll(allShownTaskIds); }} className="cursor-pointer" /></span>
            <span className="text-xs text-muted-foreground">{allSelected ? '取消全选' : '全选'} ({filteredTasks.length})</span>
          </div>
        )}
        {listGroups.length === 0 && <div className="px-2"><EmptyState icon={FileText} title="暂无匹配任务" compact /></div>}
        {listGroups.map(group => (
          <div key={group.key}>
            {group.label && <div className="px-4 py-2 bg-muted/50 border-b border-border/50 flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs font-semibold text-muted-foreground">{group.label === getTodayStr() ? '今天' : group.label}</span><span className="text-xs text-muted-foreground">({group.tasks.length})</span></div>}
            {topTasks.map(task => {
              if (shownIds && !shownIds.has(task.id)) return null;
              if (shownIds) { const desc = [task, ...getAllDescendants(task.id)]; if (!desc.every(d => shownIds.has(d.id))) return null; }
              return <TaskRow key={task.id} task={task} depth={0} childMap={childMap} expandedTask={expandedTask} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={onOpenDetail} onToggleExpand={onToggleExpand} onToggleSubtask={onToggleSubtask} onUpdateStatus={onUpdateStatus} getName={getName} getAvatar={getAvatar} getProjectTitle={getProjectTitleFn} />;
            })}
          </div>
        ))}
      </div>
    );
  }

  function renderTable() {
    const needsVirtual = sortedTasks.length > 50;
    const virtual = taskTableVirtual;
    const TABLE_ROW_H = TASK_TABLE_ROW_H;
    const visibleTasks = needsVirtual ? sortedTasks.slice(virtual.startIdx, virtual.endIdx) : sortedTasks;
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className={`overflow-x-auto${needsVirtual ? ' overflow-y-auto' : ''}`} style={needsVirtual ? { maxHeight: 'calc(100vh - 220px)' } : undefined} ref={needsVirtual ? virtual.scrollRef : undefined} onScroll={needsVirtual ? virtual.onScroll : undefined}>
          <table className="w-full text-sm">
            <thead className={`bg-muted/50 border-b border-border${needsVirtual ? ' sticky top-0 z-10' : ''}`}>
              <tr>
                {batchProps.batchMode && <th className="w-10 px-2"><input type="checkbox" checked={sortedTasks.length > 0 && batchProps.selectedIds.size === sortedTasks.length} className="rounded" onChange={e => { e.stopPropagation(); if (sortedTasks.length > 0 && batchProps.selectedIds.size === sortedTasks.length) { clearSelection(); } else { selectAll(sortedTasks.map(t => t.id)); } }} /></th>}
                {[
                  { field: 'title', label: '任务名称' }, { field: 'status', label: '状态' }, { field: 'priority', label: '紧急程度' },
                  { field: 'category', label: '分类' }, { field: 'leaderId', label: '主导人' }, { field: 'dueDate', label: '截止日期' },
                  { field: 'projectId', label: '所属项目' }, { field: 'createdAt', label: '创建时间' },
                ].map(col => <th key={col.field} className="text-left px-4 py-3 font-medium text-xs text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none" onClick={() => handleSort(col.field)}><span className="flex items-center gap-1">{col.label}{sortField === col.field && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}</span></th>)}
                <th className="text-left px-3 py-3 font-medium text-xs text-muted-foreground whitespace-nowrap">@</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.length === 0 && <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">暂无匹配任务</td></tr>}
              {needsVirtual && virtual.startIdx > 0 && <tr style={{ height: virtual.startIdx * TABLE_ROW_H }} />}
              {visibleTasks.map(task => {
                const od = isOverdue(task);
                return (
                  <tr key={task.id} className={cn('border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors', od && 'bg-red-50/30')} onClick={() => setDetailItem({ type: 'task', id: task.id })}>
                    {batchProps.batchMode && <td className="px-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={() => batchProps.onToggleSelect(task.id)} /></td>}
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2 min-w-[200px]">{task.parentId && <ChevronRight className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />}<span className={cn('truncate', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>{getTaskTitle(task.parentId) && <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded whitespace-nowrap flex-shrink-0">{getTaskTitle(task.parentId)}</span>}</div></td>
                    <td className="px-4 py-2.5"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-2.5"><PriorityBadge priority={task.priority} /></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{task.category || '-'}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold flex-shrink-0">{getAvatar(task.leaderId)}</div><span className="text-xs">{getName(task.leaderId)}</span></div></td>
                    <td className="px-4 py-2.5"><span className={cn('text-xs whitespace-nowrap', od ? 'text-red-500 font-medium' : 'text-muted-foreground')}>{task.dueDate || '-'}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{getProjectTitleFn(task.projectId) || '-'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{task.createdAt?.split('T')[0] || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{commentCounts[task.id] || 0}</td>
                  </tr>
                );
              })}
              {needsVirtual && virtual.endIdx < sortedTasks.length && <tr style={{ height: (sortedTasks.length - virtual.endIdx) * TABLE_ROW_H }} />}
            </tbody>
          </table>
         </div>
        {sortedTasks.length > 50 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between bg-muted/30">
            <span>共 {sortedTasks.length} 条记录（虚拟滚动已启用）</span>
            <span>已显示 {visibleTasks.length} 条</span>
          </div>
        )}
      </div>
    );
  }

  const activeFilterCount = (selectedStatuses.size > 0 ? 1 : 0) + (selectedPriorities.size > 0 ? 1 : 0) + (selectedLevels.size > 0 ? 1 : 0) + (selectedCategories.size > 0 ? 1 : 0) + (selectedTags.size > 0 ? 1 : 0) + (selectedPersons.size > 0 ? 1 : 0) + (timeFilter !== 'all' ? 1 : 0);

  const batchDelete = useCallback(() => {
    if (!can('delete_tasks')) return;
    if (!confirm(`确认删除选中的 ${selectedIds.size} 个任务？`)) return;
    const c = selectedIds.size;
    selectedIds.forEach(id => dispatch({ type: 'DELETE_TASK', payload: id }));
    exitBatchMode();
    try { window.dispatchEvent(new CustomEvent('tbh-toast', { detail: { message: `已删除 ${c} 个任务`, type: 'success' } })); } catch (e) { handleError(e, { module: 'Tasks', operation: 'BATCH_DELETE', severity: 'debug' }); }
  }, [selectedIds, dispatch, can, exitBatchMode]);
  const batchUpdateStatus = useCallback((status: string) => {
    if (!can('edit_tasks')) return;
    if (!status) return;
    const c = selectedIds.size;
    selectedIds.forEach(id => dispatch({ type: 'UPDATE_TASK', payload: { id, updates: { status: status as TaskStatus } } }));
    clearSelection();
    try { window.dispatchEvent(new CustomEvent('tbh-toast', { detail: { message: `已更新 ${c} 个任务状态`, type: 'success' } })); } catch (e) { handleError(e, { module: 'Tasks', operation: 'BATCH_UPDATE', severity: 'debug' }); }
  }, [selectedIds, dispatch, can, clearSelection]);
  const batchAssign = useCallback((leaderId: string) => {
    if (!can('edit_tasks')) return;
    if (!leaderId) return;
    selectedIds.forEach(id => dispatch({ type: 'UPDATE_TASK', payload: { id, updates: { leaderId } } }));
    clearSelection();
  }, [selectedIds, dispatch, can, clearSelection]);

  function closeCreateDialog() { setShowCreateDialog(false); setFromTemplate(false); setSelectedTemplate(''); setNewTags(new Set()); setNewSupporters(new Set()); }

  function doCreateTask() {
    const title = (document.getElementById('new-task-title') as HTMLInputElement)?.value?.trim();
    if (!title) return;
    dispatch({ type: 'ADD_TASK', payload: { title, description: (document.getElementById('new-task-desc') as HTMLTextAreaElement)?.value || '', projectId: (document.getElementById('new-task-project') as HTMLSelectElement)?.value || null, goalId: (document.getElementById('new-task-goal') as HTMLSelectElement)?.value || null, parentId: (document.getElementById('new-task-parent') as HTMLSelectElement)?.value || null, status: 'todo' as TaskStatus, priority: ((document.getElementById('new-task-priority') as HTMLSelectElement)?.value || 'medium') as TaskPriority, leaderId: (document.getElementById('new-task-leader') as HTMLSelectElement)?.value || state.currentUser?.id || '', supporterIds: Array.from(newSupporters), tags: Array.from(newTags), category: (document.getElementById('new-task-category') as HTMLInputElement)?.value || '', startDate: (document.getElementById('new-task-start') as HTMLInputElement)?.value || null, dueDate: (document.getElementById('new-task-due') as HTMLInputElement)?.value || null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', summary: '' } });
    closeCreateDialog();
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
         <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold whitespace-nowrap">任务中心</h1>
              {onlineUsers.length > 1 && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Users size={12} /> {onlineUsers.length}人在线</span>}
              <span className="text-xs sm:text-sm text-muted-foreground bg-muted px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">{filteredTasks.length}/{state.tasks.length}</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {batchMode && selectedIds.size > 0 && (
                <BatchActionBar
                  selection={batchSel}
                  filteredCount={filteredTasks.length}
                  filteredIds={filteredTasks.map(t => t.id)}
                  itemLabel="任务"
                  statuses={[{ value: 'todo', label: '待处理' }, { value: 'in_progress', label: '进行中' }, { value: 'done', label: '已完成' }, { value: 'blocked', label: '已阻塞' }, { value: 'cancelled', label: '已取消' }]}
                  members={activeMembers.map(m => ({ id: m.id, name: m.name }))}
                  onBatchDelete={(ids) => batchDelete()}
                  onBatchStatus={(_ids, status) => batchUpdateStatus(status)}
                  onBatchAssign={(_ids, leaderId) => batchAssign(leaderId)}
                  canDelete={can('delete_tasks')}
                  canEdit={can('edit_tasks')}
                />
              )}
              <button onClick={() => batchSel.toggleBatchMode()} className={cn('inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors', batchMode ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:bg-muted')}><Check size={14} /><span className="hidden sm:inline">{batchMode ? '退出批量' : '批量操作'}</span></button>
              <button onClick={() => setShowMatchPanel(true)} className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors"><Sparkles size={14} /><span className="hidden sm:inline">智能匹配</span></button>
              <button className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors" onClick={() => setShowCreateDialog(true)}><Plus className="w-4 h-4" /> <span className="hidden xs:inline">新建任务</span></button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {VIEW_TABS.map(tab => <button key={tab.key} className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0', viewMode === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground')} onClick={() => setViewMode(tab.key)}>{tab.label}</button>)}
          </div>

          <div className="bg-card rounded-xl border border-border p-2.5 md:p-3 flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-muted-foreground flex-shrink-0" />
             <div className="relative flex-1 min-w-[160px] max-w-[260px]"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input data-search-input type="text" className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-lg bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring" placeholder="搜索任务..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
            <MultiSelectFilter label="状态" options={[{value:'todo',label:'待处理'},{value:'in_progress',label:'进行中'},{value:'done',label:'已完成'},{value:'blocked',label:'已阻塞'},{value:'cancelled',label:'已取消'}]} selected={selectedStatuses} onToggle={toggleStatus} onClear={() => setSelectedStatuses(new Set())} />
            <MultiSelectFilter label="紧急程度" options={[{value:'urgent',label:'紧急'},{value:'high',label:'高'},{value:'medium',label:'中'},{value:'low',label:'低'}]} selected={selectedPriorities} onToggle={togglePriority} onClear={() => setSelectedPriorities(new Set())} />
            <MultiSelectFilter label="重要程度" options={[{value:'S',label:'S级'},{value:'A',label:'A级'},{value:'B',label:'B级'},{value:'C',label:'C级'}]} selected={selectedLevels} onToggle={toggleLevel} onClear={() => setSelectedLevels(new Set())} />
            <MultiSelectFilter label="分类" options={allCategories.map(c => ({value: c, label: c}))} selected={selectedCategories} onToggle={toggleCategory} onClear={() => setSelectedCategories(new Set())} />
            <MultiSelectFilter label="标签" options={allTags.map(t => ({value: t, label: t}))} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags(new Set())} />
            <div className="relative" ref={personPickerRef}>
              <button className="text-xs px-2 py-1 rounded-md bg-muted/50 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1" onClick={() => setShowPersonPicker(!showPersonPicker)}>人员筛选 ({selectedPersons.size || '全部'}) <ChevronDown size={12} /></button>
              {showPersonPicker && (
                <div className="absolute z-20 bg-card border rounded-lg shadow-lg p-2 max-h-48 overflow-y-auto min-w-[160px]">
                  <label className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={selectedPersons.size === 0} onChange={() => setSelectedPersons(new Set())} />全部人员</label>
                  {activeMembers.map(m => <label key={m.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={selectedPersons.has(m.id)} onChange={() => togglePerson(m.id)} />{m.name}</label>)}
                </div>
              )}
            </div>
            <select className="border border-border rounded-lg px-2 py-1 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-primary/20" value={timeFilter} onChange={e => { setTimeFilter(e.target.value); if (e.target.value === 'custom') setShowCustomDate(true); else setShowCustomDate(false); }}>{TIME_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
            {showCustomDate && <input type="date" className="border border-border rounded-lg px-2 py-1 text-xs bg-card" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />}
            {showCustomDate && <input type="date" className="border border-border rounded-lg px-2 py-1 text-xs bg-card" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />}
            {viewMode === 'list' && <button className={cn('text-xs px-2 py-1 rounded-md bg-muted/50 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1', groupByDate && 'bg-primary/10 text-primary border-primary')} onClick={() => setGroupByDate(!groupByDate)}><Calendar className="w-3 h-3" />按日期</button>}
            {activeFilterCount > 0 && <button className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1" onClick={clearFilters}><X size={12} />清除 ({activeFilterCount})</button>}
            <span className="text-xs text-muted-foreground ml-auto">{filteredTasks.length} 条</span>
          </div>

          {viewMode === 'board' && renderBoard()}
          {viewMode === 'list' && renderList()}
          {viewMode === 'table' && renderTable()}
          {viewMode === 'matrix' && <TaskMatrixView filteredTasks={filteredTasks} setDetailItem={setDetailItem} getMemberName={getName} getQuadrantForPriority={getQuadrantForPriority} handleDropToQuadrant={handleDropToQuadrant} commentCounts={commentCounts} batchProps={batchProps} />}
          {viewMode === 'timeline' && <TaskTimelineView timelineBuckets={timelineBuckets} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={(task: Task) => setDetailItem({ type: 'task', id: task.id })} getName={getName} getAvatar={getAvatar} getProjectTitle={getProjectTitleFn} />}
        </div>
      </div>


      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeCreateDialog} />
          <div className="relative bg-card rounded-xl shadow-xl border border-border w-full max-w-lg animate-slide-up max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 md:px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0"><h3 className="font-semibold">新建任务</h3><button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={closeCreateDialog}><X size={16} /></button></div>
            <div className="px-5 md:px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {!fromTemplate ? (
                <div className="space-y-4">
                  <div><label className="text-sm font-medium mb-1.5 block">任务名称 *</label><input type="text" id="new-task-title" className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring" placeholder="输入任务名称" /></div>
                  <div><label className="text-sm font-medium mb-1.5 block">描述</label><textarea id="new-task-desc" className="w-full text-sm border border-input rounded-lg px-3 py-2 min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring" placeholder="输入任务描述" /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-sm font-medium mb-1.5 block">紧急程度</label><select id="new-task-priority" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card"><option value="urgent">紧急 (S)</option><option value="high">高 (A)</option><option value="medium" selected>中 (B)</option><option value="low">低 (C)</option></select></div>
                    <div><label className="text-sm font-medium mb-1.5 block">开始日期</label><input type="date" id="new-task-start" className="w-full text-sm border border-input rounded-lg px-3 py-2" /></div>
                    <div><label className="text-sm font-medium mb-1.5 block">截止日期</label><input type="date" id="new-task-due" className="w-full text-sm border border-input rounded-lg px-3 py-2" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-sm font-medium mb-1.5 block">关联目标</label><select id="new-task-goal" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card"><option value="">无</option>{state.goals.filter(g => g.status === 'in_progress').map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
                    <div><label className="text-sm font-medium mb-1.5 block">所属项目</label><select id="new-task-project" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card"><option value="">无</option>{state.projects.filter(p => p.status === 'in_progress').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-sm font-medium mb-1.5 block">主导人</label><select id="new-task-leader" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card"><option value="">未指定</option>{activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                    <div><label className="text-sm font-medium mb-1.5 block">父任务</label><select id="new-task-parent" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card"><option value="">无</option>{state.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
                  </div>
                  <div><label className="text-sm font-medium mb-1.5 block">分类</label><select id="new-task-category" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-card"><option value="">未分类</option>{allCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className="text-sm font-medium mb-1.5 block">标签</label><div className="flex flex-wrap gap-1.5">{tags.map(t => <button key={t.id || t.name} data-new-task-tag={t.name} type="button" className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer', newTags.has(t.name) ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border hover:border-primary/50')} onClick={() => setNewTags(prev => { const n = new Set(prev); n.has(t.name) ? n.delete(t.name) : n.add(t.name); return n; })}>{t.name}</button>)}</div></div>
                  {activeMembers.length > 0 && <div><label className="text-sm font-medium mb-1.5 block">协作者</label><div className="flex flex-wrap gap-1.5">{activeMembers.map(m => { const sel = newSupporters.has(m.id); return <button key={m.id} type="button" className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer flex items-center gap-1', sel ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border hover:border-primary/50')} onClick={() => setNewSupporters(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}><span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px]">{m.name[0]}</span>{m.name}</button>; })}</div></div>}
                  <button className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors" onClick={doCreateTask}>创建任务</button>
                  {taskTemplates.length > 0 && <button className="w-full border border-border text-muted-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-1.5" onClick={() => setFromTemplate(true)}><Copy className="w-4 h-4" />从模板创建</button>}
                </div>
              ) : (
                <div className="space-y-4">
                  <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => { setFromTemplate(false); setSelectedTemplate(''); }}><ChevronRight className="w-4 h-4 rotate-180" />返回手动创建</button>
                  {taskTemplates.length === 0 ? <EmptyState title="暂无任务模板" compact /> : (
                    <div className="space-y-2">
                      {taskTemplates.map(tpl => <div key={tpl.id} className={cn('border rounded-lg p-4 cursor-pointer transition-colors hover:bg-accent/50', selectedTemplate === tpl.id && 'ring-2 ring-primary bg-primary/5')} onClick={() => setSelectedTemplate(tpl.id)}><h4 className="font-medium text-sm mb-1">{tpl.title}</h4><p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>{tpl.category && <span className="text-[10px] px-1.5 py-0.5 bg-accent rounded mt-2 inline-block">{tpl.category}</span>}</div>)}
                      <button className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors mt-4" disabled={!selectedTemplate} onClick={handleCreateFromTemplate}>使用模板创建</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {detailItem && <ItemDetailPanel key={detailItem.id} isOpen={true} onClose={closeTaskDetail} itemType={detailItem.type} itemId={detailItem.id} />}
      {showMatchPanel && <AIMatchPanel onClose={() => setShowMatchPanel(false)} />}
    </div>
  );
}
