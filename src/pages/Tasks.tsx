import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useStore, useTags, useViewingMember, useMemberLookup, useItemLookupMaps, usePermissions } from '@/store/useStore';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import type { Task, TaskStatus, TaskPriority, Comment } from '@/types';
import { cn } from '@/lib/utils';
import { Plus, Search, ChevronDown, ChevronRight, Calendar, X, Clock, AlertCircle, CheckCircle2, Circle, Ban, GripVertical, FileText, Copy, MessageSquare, Trash2, Check, Filter } from 'lucide-react';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';

function getTodayStr() { return new Date().toISOString().split('T')[0]; }

type ViewMode = 'board' | 'list' | 'table' | 'matrix' | 'canvas' | 'timeline';
type BusinessPriority = 'S' | 'A' | 'B' | 'C';

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: any }> = {
  todo: { label: '待处理', color: 'bg-gray-100 text-gray-600', icon: Circle },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-700', icon: Clock },
  done: { label: '已完成', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  blocked: { label: '已阻塞', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: '已删除', color: 'bg-slate-100 text-slate-500', icon: Ban },
};

const URGENCY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: '紧急', color: 'bg-red-100 text-red-700' },
  high: { label: '高', color: 'bg-orange-100 text-orange-700' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700' },
  low: { label: '低', color: 'bg-slate-100 text-slate-600' },
};

const IMPORTANCE_CONFIG: Record<BusinessPriority, { label: string; color: string; priority: TaskPriority }> = {
  S: { label: 'S级', color: 'bg-red-500 text-white', priority: 'urgent' },
  A: { label: 'A级', color: 'bg-orange-500 text-white', priority: 'high' },
  B: { label: 'B级', color: 'bg-blue-500 text-white', priority: 'medium' },
  C: { label: 'C级', color: 'bg-gray-400 text-white', priority: 'low' },
};

const TIME_OPTIONS = [
  { key: 'all', label: '全部时间' }, { key: 'today', label: '今天' }, { key: 'week', label: '本周' },
  { key: 'month', label: '本月' }, { key: 'quarter', label: '本季度' }, { key: 'custom', label: '自定义' },
];

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'board', label: '看板' }, { key: 'list', label: '清单' }, { key: 'table', label: '全量' },
  { key: 'matrix', label: '四象限' }, { key: 'canvas', label: '画布' }, { key: 'timeline', label: '时间线' },
];

const BOARD_COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'todo', label: '待处理', color: 'border-t-gray-400' },
  { key: 'in_progress', label: '进行中', color: 'border-t-blue-500' },
  { key: 'done', label: '已完成', color: 'border-t-green-500' },
];

function priorityToBP(p: TaskPriority): BusinessPriority { if (p === 'urgent') return 'S'; if (p === 'high') return 'A'; if (p === 'medium') return 'B'; return 'C'; }

function getQuadrantForPriority(p: TaskPriority): string { if (p === 'urgent') return '紧急重要'; if (p === 'high') return '重要不紧急'; if (p === 'medium') return '紧急不重要'; return '不紧急不重要'; }

function isOverdue(task: Task): boolean { return task.status !== 'done' && task.status !== 'cancelled' && !!task.dueDate && task.dueDate < getTodayStr(); }

const StatusBadge = React.memo(function StatusBadge({ status }: { status: TaskStatus }) { const c = STATUS_CONFIG[status]; return <span className={cn('text-xs px-1.5 py-0.5 rounded whitespace-nowrap', c.color)}>{c.label}</span>; });

const PriorityBadge = React.memo(function PriorityBadge({ priority }: { priority: TaskPriority }) { const c = URGENCY_CONFIG[priority]; return <span className={cn('text-xs px-1.5 py-0.5 rounded whitespace-nowrap', c.color)}>{c.label}</span>; });

const BoardColHeader = React.memo(function BoardColHeader({ icon: Icon, label, color, count }: { icon: any; label: string; color: string; count: number }) {
  return <div className={cn('flex items-center gap-2 px-4 pb-2 border-b-2 mx-3 mb-3', color)}><Icon className="w-4 h-4" /><span className="font-semibold text-sm">{label}</span><span className="text-xs text-muted-foreground ml-auto">{count}</span></div>;
});

interface TaskCardProps { task: Task; compact?: boolean; tags: any[]; commentCounts: Record<string, number>; batchProps: BatchProps; onOpenDetail: (task: Task) => void; getName: (id: string) => string; getAvatar: (id: string) => string; enableDrag?: boolean; }

const TaskCard = React.memo(function TaskCard({ task, compact, tags, commentCounts, batchProps, onOpenDetail, getName, getAvatar, enableDrag }: TaskCardProps) {
  const bp = priorityToBP(task.priority);
  const bpC = IMPORTANCE_CONFIG[bp];
  const overdue = isOverdue(task);
  const stDone = (task.subtasks || []).filter(s => s.completed).length;
  const cc = commentCounts[task.id] || 0;
  const uniqueTags = (task.tags || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
  return (
    <div className={cn('bg-white rounded-lg border border-border shadow-sm p-3 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group', overdue && 'border-l-4 border-l-red-400', compact && 'p-2')} draggable={!!enableDrag} onDragStart={(e: React.DragEvent) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => onOpenDetail(task)}>
      {batchProps.batchMode && <div className="mb-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={e => { e.stopPropagation(); batchProps.onToggleSelect(task.id); }} /></div>}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold', bpC.color)}>{bpC.label}</span>
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
        {task.parentId && <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded">子任务</span>}
        {cc > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto"><MessageSquare size={11} />{cc}</span>}
      </div>
      <h4 className={cn('font-medium text-sm mb-1.5 truncate', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</h4>
      {task.description && !compact && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><span className="flex items-center gap-1"><div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold">{getAvatar(task.leaderId)}</div>{getName(task.leaderId)}</span></div>
        <div className="flex items-center gap-2">
          {task.dueDate && <span className={cn('flex items-center gap-0.5', overdue && 'text-red-500 font-medium')}><Calendar className="w-3 h-3" />{task.dueDate}</span>}
          {(task.subtasks || []).length > 0 && <span className="flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />{stDone}/{(task.subtasks || []).length}</span>}
        </div>
      </div>
      {(uniqueTags.length > 0 || task.category) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.category && <span className="text-[10px] px-1.5 py-0.5 bg-accent rounded">{task.category}</span>}
          {uniqueTags.slice(0, 3).map(tag => { const tg = tags.find((t: any) => t.name === tag); return <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (tg?.color || '#888') + '20', color: tg?.color || '#888' }}>{tag}</span>; })}
          {uniqueTags.length > 3 && <span className="text-[10px] text-muted-foreground">+{uniqueTags.length - 3}</span>}
        </div>
      )}
    </div>
  );
});

interface TaskRowProps { task: Task; depth: number; childMap: Record<string, Task[]>; expandedTask: string | null; commentCounts: Record<string, number>; batchProps: BatchProps; onOpenDetail: (task: Task) => void; onToggleExpand: (id: string) => void; onToggleSubtask: (taskId: string, subtaskId: string) => void; onUpdateStatus: (taskId: string, status: TaskStatus) => void; getName: (id: string) => string; getAvatar: (id: string) => string; getProjectTitle: (id: string | null) => string; }

const TaskRow = React.memo(function TaskRow({ task, depth, childMap, expandedTask, commentCounts, batchProps, onOpenDetail, onToggleExpand, onToggleSubtask, onUpdateStatus, getName, getAvatar, getProjectTitle }: TaskRowProps) {
  const isExpanded = expandedTask === task.id;
  const children = childMap[task.id] || [];
  const overdue = isOverdue(task);
  const stDone = (task.subtasks || []).filter(s => s.completed).length;
  const cc = commentCounts[task.id] || 0;
  return (
    <div>
      <div className={cn('flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer border-b border-border/50', overdue && 'bg-red-50/30')} style={{ paddingLeft: `${12 + depth * 24}px` }} onClick={() => onOpenDetail(task)}>
        {batchProps.batchMode && <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded flex-shrink-0" onChange={() => batchProps.onToggleSelect(task.id)} /></span>}
        {children.length > 0 ? <button className="p-0.5 hover:bg-accent rounded flex-shrink-0" onClick={e => { e.stopPropagation(); onToggleExpand(task.id); }}>{isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}</button> : <span className="w-4 flex-shrink-0" />}
        <StatusBadge status={task.status} />
        <h4 className={cn('flex-1 text-sm truncate min-w-0', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</h4>
        {cc > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 flex-shrink-0"><MessageSquare size={10} />{cc}</span>}
        <PriorityBadge priority={task.priority} />
        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">{getProjectTitle(task.projectId)}</span>
        <div className="flex items-center gap-1 whitespace-nowrap hidden md:flex"><div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold flex-shrink-0">{getAvatar(task.leaderId)}</div><span className="text-xs text-muted-foreground">{getName(task.leaderId)}</span></div>
        {task.dueDate && <span className={cn('text-xs whitespace-nowrap flex items-center gap-0.5 hidden sm:flex', overdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}><Calendar className="w-3 h-3" />{task.dueDate}</span>}
        {(task.subtasks || []).length > 0 && <span className="text-xs text-muted-foreground whitespace-nowrap hidden lg:inline">{stDone}/{(task.subtasks || []).length}</span>}
      </div>
      {isExpanded && (
        <div className="bg-muted/20 border-b border-border/50 py-3 px-4" style={{ paddingLeft: `${36 + depth * 24}px` }}>
          {task.description && <p className="text-xs text-muted-foreground mb-2">{task.description}</p>}
          {children.length > 0 && (
            <div className="space-y-0.5 mb-2">
              <span className="text-xs font-medium text-muted-foreground">子任务：</span>
              {children.map(c => <div key={c.id} className="flex items-center gap-2 py-1 px-2 hover:bg-accent/50 rounded cursor-pointer text-sm" onClick={() => onOpenDetail(c)}><StatusBadge status={c.status} /><span className="truncate flex-1">{c.title}</span><PriorityBadge priority={c.priority} /><span className="text-xs text-muted-foreground">{getName(c.leaderId)}</span></div>)}
            </div>
          )}
          {(task.subtasks || []).length > 0 && (
            <div className="space-y-1 mb-2">
              <span className="text-xs font-medium text-muted-foreground">子事项：</span>
              {(task.subtasks || []).map(st => <label key={st.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 px-2 py-0.5 rounded"><input type="checkbox" checked={st.completed} className="rounded border-input" onChange={e => { e.stopPropagation(); onToggleSubtask(task.id, st.id); }} /><span className={cn(st.completed && 'line-through text-muted-foreground')}>{st.title}</span></label>)}
            </div>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {(['todo', 'in_progress', 'done'] as TaskStatus[]).map(s => <button key={s} className={cn('text-xs px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors', task.status === s && 'bg-primary text-primary-foreground border-primary')} onClick={e => { e.stopPropagation(); onUpdateStatus(task.id, s); }}>{STATUS_CONFIG[s].label}</button>)}
          </div>
        </div>
      )}
      {children.length > 0 && children.map(c => <TaskRow key={c.id} task={c} depth={depth + 1} childMap={childMap} expandedTask={expandedTask} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={onOpenDetail} onToggleExpand={onToggleExpand} onToggleSubtask={onToggleSubtask} onUpdateStatus={onUpdateStatus} getName={getName} getAvatar={getAvatar} getProjectTitle={getProjectTitle} />)}
    </div>
  );
});

function isInTimeRange(dateStr: string | null, range: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (range === 'today') return d.toDateString() === new Date().toDateString();
  if (range === 'week') { const today = new Date(); const ws = new Date(today); ws.setDate(today.getDate() - today.getDay()); ws.setHours(0, 0, 0, 0); return d >= ws; }
  if (range === 'month') { const today = new Date(); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }
  if (range === 'quarter') { const today = new Date(); const q = Math.floor(today.getMonth() / 3); return d.getMonth() >= q * 3 && d.getMonth() < (q + 1) * 3 && d.getFullYear() === today.getFullYear(); }
  return true;
}

function getTouchPos(e: TouchEvent | MouseEvent) {
  if ('touches' in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if ('changedTouches' in e && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
}

interface BatchProps { batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }

function TaskMatrixView({ filteredTasks, setDetailItem, getMemberName, getQuadrantForPriority: _gfq, handleDropToQuadrant, commentCounts, batchProps }: {
  filteredTasks: Task[];
  setDetailItem: (item: { type: 'task'; id: string } | null) => void;
  getMemberName: (id: string) => string;
  getQuadrantForPriority: (p: TaskPriority) => string;
  handleDropToQuadrant: (taskId: string, quadrant: string) => void;
  commentCounts: Record<string, number>;
  batchProps: BatchProps;
}) {
  const gfq = _gfq;
  const dragRef = useRef<{ id: string; el: HTMLElement } | null>(null);
  const hoverQRef = useRef<string | null>(null);
  const quadrantBoxRefs = useRef<Record<string, HTMLElement | null>>({});
  const quadrantMap: Record<string, { accent: string; hoverAccent: string }> = {
    '紧急重要': { accent: 'border-red-200 bg-red-50', hoverAccent: 'border-red-300 bg-red-50 ring-2 ring-red-200' },
    '重要不紧急': { accent: 'border-blue-200 bg-blue-50', hoverAccent: 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' },
    '紧急不重要': { accent: 'border-yellow-200 bg-yellow-50', hoverAccent: 'border-yellow-300 bg-yellow-50 ring-2 ring-yellow-200' },
    '不紧急不重要': { accent: 'border-gray-200 bg-gray-50', hoverAccent: 'border-gray-300 bg-gray-50 ring-2 ring-gray-200' },
  };
  const quadrantKeys = ['紧急重要', '重要不紧急', '紧急不重要', '不紧急不重要'];

  function resetHover() {
    const prev = hoverQRef.current;
    hoverQRef.current = null;
    if (prev && quadrantBoxRefs.current[prev]) {
      const box = quadrantBoxRefs.current[prev];
      if (box) box.className = box.className.replace(quadrantMap[prev].hoverAccent, quadrantMap[prev].accent);
    }
  }

  function handlePointerMove(cx: number, cy: number) {
    if (!dragRef.current) return;
    let found = false;
    for (const key of quadrantKeys) {
      const el = quadrantBoxRefs.current[key];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        if (hoverQRef.current !== key) {
          if (hoverQRef.current) {
            const prevBox = quadrantBoxRefs.current[hoverQRef.current];
            if (prevBox) prevBox.className = prevBox.className.replace(quadrantMap[hoverQRef.current].hoverAccent, quadrantMap[hoverQRef.current].accent);
          }
          hoverQRef.current = key;
          const box = quadrantBoxRefs.current[key];
          if (box) box.className = box.className.replace(quadrantMap[key].accent, quadrantMap[key].hoverAccent);
        }
        found = true;
        break;
      }
    }
    if (!found && hoverQRef.current) resetHover();
  }

  function handlePointerUp() {
    if (dragRef.current) {
      if (dragRef.current.el) dragRef.current.el.classList.remove('opacity-30', 'scale-95');
      if (hoverQRef.current) handleDropToQuadrant(dragRef.current.id, hoverQRef.current);
      resetHover();
      dragRef.current = null;
    }
  }

  const mmHandler = useCallback((e: MouseEvent) => handlePointerMove(e.clientX, e.clientY), []);
  const muHandler = useCallback(() => handlePointerUp(), [handleDropToQuadrant]);
  const tmHandler = useCallback((e: TouchEvent) => { const pos = getTouchPos(e); handlePointerMove(pos.x, pos.y); }, []);
  const teHandler = useCallback(() => handlePointerUp(), [handleDropToQuadrant]);

  useEffect(() => {
    document.addEventListener('mousemove', mmHandler);
    document.addEventListener('mouseup', muHandler);
    document.addEventListener('touchmove', tmHandler, { passive: true });
    document.addEventListener('touchend', teHandler);
    return () => { document.removeEventListener('mousemove', mmHandler); document.removeEventListener('mouseup', muHandler); document.removeEventListener('touchmove', tmHandler); document.removeEventListener('touchend', teHandler); };
  }, [mmHandler, muHandler, tmHandler, teHandler]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[500px] select-none">
      {quadrantKeys.map(key => {
        const q = quadrantMap[key];
        const qTasks = filteredTasks.filter(t => gfq(t.priority) === key);
        return (
          <div key={key} data-qk={key} ref={el => { quadrantBoxRefs.current[key] = el; }} className={`rounded-xl border-2 p-4 min-h-[240px] transition-all duration-150 ${q.accent}`}>
            <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold">{key}</span><span className="text-xs text-muted-foreground ml-auto">{qTasks.length} 项</span></div>
            <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto">
              {qTasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-8 opacity-60">拖入任务</p>}
              {qTasks.map(task => (
                <div key={task.id} className="bg-white/80 rounded-lg border border-border/50 shadow-sm p-2.5 hover:shadow-md transition-all cursor-pointer" onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); dragRef.current = { id: task.id, el: e.currentTarget }; e.currentTarget.classList.add('opacity-30', 'scale-95'); }} onTouchStart={e => { const t = e.touches[0]; if (!t) return; dragRef.current = { id: task.id, el: e.currentTarget as HTMLElement }; (e.currentTarget as HTMLElement).classList.add('opacity-30', 'scale-95'); }} onClick={() => { if (!dragRef.current) setDetailItem({ type: 'task', id: task.id }); }}>
                  {batchProps.batchMode && <div className="mb-1" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={() => batchProps.onToggleSelect(task.id)} /></div>}
                  <div className="flex items-center gap-2 mb-1">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                    <StatusBadge status={task.status} />
                    <span className="text-xs text-muted-foreground ml-auto">{getMemberName(task.leaderId)}</span>
                  </div>
                  <p className="text-sm font-medium truncate pl-5">{task.title}</p>
                  {(commentCounts[task.id] || 0) > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 pl-5 mt-0.5"><MessageSquare size={10} />{commentCounts[task.id]}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Tasks() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const { tags } = useTags();
  const { isTeamView, viewingMember, setViewingMember, viewingMemberId } = useViewingMember();
  const currentUser = state.currentUser;
  const VIEW_MODE_LS_KEY = 'tbh-tasks-view-mode';
  const [viewMode, setViewMode] = useState<ViewMode>(() => { try { return (localStorage.getItem(VIEW_MODE_LS_KEY) || 'board') as ViewMode; } catch { return 'board'; } });
  useEffect(() => { try { localStorage.setItem(VIEW_MODE_LS_KEY, viewMode); } catch {} }, [viewMode]);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedPersons, setSelectedPersons] = useState<Set<string>>(new Set());
  const [timeFilter, setTimeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByDate, setGroupByDate] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<{ type: 'task'; id: string } | null>(null);
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [fromTemplate, setFromTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [canvasPositions, setCanvasPositions] = useState<Record<string, { x: number; y: number }>>({});
  const canvasDragRef = useRef<{ id: string; startX: number; startY: number; el: HTMLElement } | null>(null);
  const personPickerRef = useRef<HTMLDivElement>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState('');
  const [batchLeader, setBatchLeader] = useState('');
  const KANBAN_LS_KEY = 'tbh-tasks-kanban';
  const [kanbanCustomMode, setKanbanCustomMode] = useState(() => { try { return (JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || '{}')).customMode || false; } catch { return false; } });
  const [customColumns, setCustomColumns] = useState<string[]>(() => { try { return (JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || '{}')).columns || ['待处理', '进行中', '已完成']; } catch { return ['待处理', '进行中', '已完成']; } });
  type KanbanGroupBy = 'status' | 'tag' | 'priority' | 'category' | 'level' | 'person' | 'time';
  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>(() => { try { return (JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || '{}')).groupBy || 'status'; } catch { return 'status'; } });
  const [newColName, setNewColName] = useState('');
  useEffect(() => { try { localStorage.setItem(KANBAN_LS_KEY, JSON.stringify({ customMode: kanbanCustomMode, columns: customColumns, groupBy: kanbanGroupBy })); } catch {} }, [kanbanCustomMode, customColumns, kanbanGroupBy]);

  // All users default to team view — no auto-switch to personal view

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
      if (timeFilter === 'custom' && customDateFrom && customDateTo) list = list.filter(t => t.dueDate && t.dueDate >= customDateFrom && t.dueDate <= customDateTo);
      else list = list.filter(t => isInTimeRange(t.dueDate, timeFilter));
    }
    if (searchQuery.trim()) { const q = searchQuery.trim().toLowerCase(); list = list.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)); }
    return list;
  }, [state.tasks, isTeamView, viewingMember, selectedStatuses, selectedPriorities, selectedLevels, selectedCategories, selectedTags, selectedPersons, timeFilter, customDateFrom, customDateTo, searchQuery]);

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    arr.sort((a, b) => {
      let va: any = a[sortField as keyof Task]; let vb: any = b[sortField as keyof Task];
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

  const batchProps = useMemo((): BatchProps => ({ batchMode, selectedIds, onToggleSelect: (id: string) => { setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); } }), [batchMode, selectedIds]);

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
      dispatch({ type: 'ADD_TASK', payload: { title: data.title || tpl.title, description: data.description || '', projectId: data.projectId || null, goalId: data.goalId || null, parentId: null, status: 'todo' as TaskStatus, priority: (data.priority || 'medium') as TaskPriority, leaderId: data.leaderId || state.currentUser?.id || '', supporterIds: data.supporterIds || [], tags: data.tags || [], category: data.category || '', dueDate: data.dueDate || null, reminderDate: data.reminderDate || null, completedAt: null, subtasks: data.subtasks || [], attachments: [], trackingRecords: [], repeatCycle: data.repeatCycle || 'none', summary: '' } });
    } catch {
      dispatch({ type: 'ADD_TASK', payload: { title: tpl.title, description: tpl.description, projectId: null, goalId: null, parentId: null, status: 'todo' as TaskStatus, priority: 'medium' as TaskPriority, leaderId: state.currentUser?.id || '', supporterIds: [], tags: [], category: '', dueDate: null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', summary: '' } });
    }
    setShowCreateDialog(false); setFromTemplate(false); setSelectedTemplate('');
  }

  const handleDropToQuadrant = useCallback((taskId: string, quadrant: string) => {
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
        const m = state.members.find(m => m.id === t.leaderId);
        if (m) map.set(t.leaderId, m.name);
      }
    });
    return [...map.entries()];
  }, [filteredTasks, state.members]);

  const canvasItemMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent, id: string) => {
    let cx = 0; let cy = 0;
    if ('touches' in e && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else if ('clientX' in e) { cx = (e as React.MouseEvent).clientX; cy = (e as React.MouseEvent).clientY; }
    if (cx === 0 && cy === 0 && 'button' in e && (e as React.MouseEvent).button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const existingPos = canvasPositions[id];
    const origLeft = existingPos?.x ?? parseFloat(el.style.left) ?? 0;
    const origTop = existingPos?.y ?? parseFloat(el.style.top) ?? 0;
    el.dataset.origLeft = String(origLeft);
    el.dataset.origTop = String(origTop);
    canvasDragRef.current = { id, startX: cx, startY: cy, el };
  }, [canvasPositions]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasDragRef.current) return;
      const pos = getTouchPos(e);
      const d = canvasDragRef.current;
      const ol = parseFloat(d.el.dataset.origLeft || '0');
      const ot = parseFloat(d.el.dataset.origTop || '0');
      d.el.style.left = (ol + pos.x - d.startX) + 'px';
      d.el.style.top = (ot + pos.y - d.startY) + 'px';
      d.el.style.zIndex = '10';
    };
    const onUp = () => {
      if (!canvasDragRef.current) return;
      const d = canvasDragRef.current;
      const nl = parseFloat(d.el.style.left);
      const nt = parseFloat(d.el.style.top);
      dispatch({ type: 'UPDATE_TASK', payload: { id: d.id, updates: { canvasX: Math.round(nl), canvasY: Math.round(nt) } } });
      setCanvasPositions(prev => ({ ...prev, [d.id]: { x: Math.round(nl), y: Math.round(nt) } }));
      d.el.style.zIndex = '';
      canvasDragRef.current = null;
    };
    const mmH = (e: MouseEvent) => onMove(e);
    const muH = () => onUp();
    const tmH = (e: TouchEvent) => onMove(e);
    const teH = () => onUp();
    document.addEventListener('mousemove', mmH);
    document.addEventListener('mouseup', muH);
    document.addEventListener('touchmove', tmH, { passive: true });
    document.addEventListener('touchend', teH);
    return () => { document.removeEventListener('mousemove', mmH); document.removeEventListener('mouseup', muH); document.removeEventListener('touchmove', tmH); document.removeEventListener('touchend', teH); };
  }, [dispatch]);

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
          <button key={opt.key} className={`text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${kanbanGroupBy === opt.key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setKanbanGroupBy(opt.key)}>{opt.label}</button>
        ))}
      </div>
    );

    function renderKanbanColumns(cols: Array<{ key: string; label: string; color?: string }>, getItems: (col: string) => Task[], showStatus?: boolean, enableDrag?: boolean, onDropCustom?: (taskId: string, colKey: string) => void) {
      return (
        <div className="overflow-x-auto -mx-4 px-4 pb-2"><div className="flex gap-4 min-w-max">
          {cols.map(col => {
            const items = getItems(col.key);
            return (
              <div key={col.key} className={`w-[260px] sm:w-[300px] flex-shrink-0 bg-muted/30 rounded-xl border border-border pt-3`} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={(e: React.DragEvent) => { e.preventDefault(); const taskId = e.dataTransfer.getData('text/plain'); if (!taskId || !can('edit_tasks')) return; if (onDropCustom) { onDropCustom(taskId, col.key); return; } if (enableDrag) { const validStatuses: Record<string, TaskStatus> = { todo: 'todo', in_progress: 'in_progress', done: 'done', blocked: 'blocked', cancelled: 'cancelled' }; const newStatus = validStatuses[col.key]; if (newStatus) dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { status: newStatus } } }); } }}>
                <div className={`flex items-center gap-2 px-4 pb-2 border-b-2 mx-3 mb-3 ${col.color || 'border-t-gray-400'}`}><span className="font-semibold text-sm">{col.label}</span><span className="text-xs text-muted-foreground ml-auto">{items.length}</span></div>
                <div className="px-3 pb-3 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">{items.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">暂无任务</p>}{items.map(task => <TaskCard key={task.id} task={task} compact tags={tags} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={onOpenDetail} getName={getName} getAvatar={getAvatar} enableDrag={!!enableDrag || !!onDropCustom} />)}</div>
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
          {personCols.length > 0 ? renderKanbanColumns(personCols, col => filteredTasks.filter(t => t.leaderId === col), true) : <p className="text-xs text-muted-foreground text-center py-12">暂无数据</p>}
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
                <div className="px-3 pb-3 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">{filteredTasks.map(task => <TaskCard key={task.id} task={task} compact tags={tags} commentCounts={commentCounts} batchProps={batchProps} onOpenDetail={onOpenDetail} getName={getName} getAvatar={getAvatar} />)}{filteredTasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">暂无任务</p>}</div>
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
    const onUpdateStatus = (taskId: string, status: TaskStatus) => dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { status } } });
    const allShownTaskIds = topTasks.filter(t => !shownIds || shownIds.has(t.id)).map(t => t.id);
    const allSelected = allShownTaskIds.length > 0 && allShownTaskIds.every(id => selectedIds.has(id));
    const someSelected = allShownTaskIds.some(id => selectedIds.has(id));
    return (
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {filteredTasks.length > 0 && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-muted/30">
            <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={e => { e.stopPropagation(); if (allSelected) setSelectedIds(prev => { const next = new Set(prev); allShownTaskIds.forEach(id => next.delete(id)); return next; }); else setSelectedIds(prev => { const next = new Set(prev); allShownTaskIds.forEach(id => next.add(id)); return next; }); }} className="cursor-pointer" /></span>
            <span className="text-xs text-muted-foreground">{allSelected ? '取消全选' : '全选'} ({filteredTasks.length})</span>
          </div>
        )}
        {listGroups.length === 0 && <div className="px-5 py-12 text-center"><FileText className="w-9 h-9 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">暂无匹配任务</p></div>}
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
    return (
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {batchProps.batchMode && <th className="w-10 px-2"><input type="checkbox" checked={sortedTasks.length > 0 && batchProps.selectedIds.size === sortedTasks.length} className="rounded" onChange={e => { e.stopPropagation(); if (sortedTasks.length > 0 && batchProps.selectedIds.size === sortedTasks.length) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(sortedTasks.map(t => t.id))); } }} /></th>}
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
              {sortedTasks.map(task => {
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
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderCanvas() {
    const posTasks = filteredTasks;
    const defaultW = 220;
    const defaultH = 120;
    const cols = Math.max(1, Math.floor((typeof window !== 'undefined' ? window.innerWidth - 80 : 1000) / (defaultW + 20)));
    return (
      <div className="relative bg-muted/20 rounded-xl border border-border overflow-auto" style={{ minHeight: Math.ceil(posTasks.length / cols) * (defaultH + 20) + 40 }}>
        <div className="relative" style={{ width: '100%', minHeight: '100%' }}>
          <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            {posTasks.filter(t => (t.parentId || '')).map(task => {
              const parent = posTasks.find(p => p.id === task.parentId);
              if (!parent) return null;
              const pPos = canvasPositions[parent.id];
              const tPos = canvasPositions[task.id];
              const px = pPos?.x ?? 0; const py = pPos?.y ?? 0;
              const cx = tPos?.x ?? 0; const cy = tPos?.y ?? 0;
              return <line key={task.id + '-line'} x1={px} y1={py} x2={cx} y2={cy} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,4" />;
            })}
          </svg>
          {posTasks.map((task, i) => {
            const pos = canvasPositions[task.id];
            const x = pos?.x ?? (i % cols) * (defaultW + 20) + 20;
            const y = pos?.y ?? Math.floor(i / cols) * (defaultH + 20) + 20;
            const cc = commentCounts[task.id] || 0;
            return (
              <div key={task.id} className="absolute bg-white rounded-lg border border-border shadow-sm p-3 hover:shadow-md transition-shadow cursor-pointer select-none" style={{ left: x, top: y, width: defaultW, minHeight: 80 }} onClick={() => setDetailItem({ type: 'task', id: task.id })} onMouseDown={e => canvasItemMouseDown(e, task.id)} onTouchStart={e => canvasItemMouseDown(e, task.id)}>
                {batchProps.batchMode && <div className="mb-1" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={e => { e.stopPropagation(); batchProps.onToggleSelect(task.id); }} /></div>}
                <div className="flex items-center gap-1.5 mb-1.5"><GripVertical className="w-3 h-3 text-muted-foreground/40" /><StatusBadge status={task.status} />{cc > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto"><MessageSquare size={10} />{cc}</span>}</div>
                <p className="text-sm font-medium truncate mb-1">{task.title}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="truncate">{getName(task.leaderId)}</span><PriorityBadge priority={task.priority} /></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTimeline() {
    return (
      <div className="space-y-4">
        {timelineBuckets.length === 0 && <div className="bg-white rounded-xl border border-border px-5 py-12 text-center"><Calendar className="w-9 h-9 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">暂无匹配任务</p></div>}
        {timelineBuckets.map(([dateKey, tasks]) => {
          const isOverdue = dateKey !== '无截止日期' && dateKey < getTodayStr();
          const isToday = dateKey === getTodayStr();
          return (
            <div key={dateKey}>
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg mb-2', isToday && 'bg-primary/10', isOverdue && 'bg-red-50')}>
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className={cn('text-xs font-semibold', isToday && 'text-primary', isOverdue && 'text-red-600')}>{isToday ? '今天' : isOverdue ? `已逾期 - ${dateKey}` : dateKey}</span>
                <span className="text-xs text-muted-foreground">({tasks.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {tasks.map(task => (
                  <div key={task.id} className="bg-white rounded-lg border border-border shadow-sm p-3 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer" onClick={() => setDetailItem({ type: 'task', id: task.id })}>
      {batchProps.batchMode && <div className="mb-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={() => batchProps.onToggleSelect(task.id)} /></div>}
                    <div className="flex items-center gap-2 mb-1.5">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                      {(commentCounts[task.id] || 0) > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto"><MessageSquare size={10} />{commentCounts[task.id]}</span>}
                    </div>
                    <h4 className={cn('text-sm font-medium truncate mb-1', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</h4>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold">{getAvatar(task.leaderId)}</div>{getName(task.leaderId)}</span>
                      {getProjectTitleFn(task.projectId) && <span className="truncate max-w-[80px]">{getProjectTitleFn(task.projectId)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const activeFilterCount = [selectedStatuses.size > 0, selectedPriorities.size > 0, selectedLevels.size > 0, selectedCategories.size > 0, selectedTags.size > 0, selectedPersons.size > 0, timeFilter !== 'all'].filter(Boolean).length;

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredTasks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredTasks.map(t => t.id)));
  }, [selectedIds.size, filteredTasks]);

  const batchDelete = useCallback(() => { if (!confirm(`确认删除选中的 ${selectedIds.size} 个任务？`)) return; selectedIds.forEach(id => dispatch({ type: 'DELETE_TASK', payload: id })); setSelectedIds(new Set()); setBatchMode(false); }, [selectedIds, dispatch]);
  const batchUpdateStatus = useCallback((status: string) => { if (!can('edit_tasks')) return; if (!status) return; selectedIds.forEach(id => dispatch({ type: 'UPDATE_TASK', payload: { id, updates: { status: status as TaskStatus } } })); setSelectedIds(new Set()); setBatchStatus(''); }, [selectedIds, dispatch]);
  const batchAssign = useCallback((leaderId: string) => { if (!can('edit_tasks')) return; if (!leaderId) return; selectedIds.forEach(id => dispatch({ type: 'UPDATE_TASK', payload: { id, updates: { leaderId } } })); setSelectedIds(new Set()); setBatchLeader(''); }, [selectedIds, dispatch]);

  function closeCreateDialog() { setShowCreateDialog(false); setFromTemplate(false); setSelectedTemplate(''); }

  function doCreateTask() {
    const title = (document.getElementById('new-task-title') as HTMLInputElement)?.value?.trim();
    if (!title) return;
    dispatch({ type: 'ADD_TASK', payload: { title, description: (document.getElementById('new-task-desc') as HTMLTextAreaElement)?.value || '', projectId: (document.getElementById('new-task-project') as HTMLSelectElement)?.value || null, goalId: null, parentId: (document.getElementById('new-task-parent') as HTMLSelectElement)?.value || null, status: 'todo' as TaskStatus, priority: ((document.getElementById('new-task-priority') as HTMLSelectElement)?.value || 'medium') as TaskPriority, leaderId: (document.getElementById('new-task-leader') as HTMLSelectElement)?.value || state.currentUser?.id || '', supporterIds: [], tags: [], category: (document.getElementById('new-task-category') as HTMLInputElement)?.value || '', dueDate: (document.getElementById('new-task-due') as HTMLInputElement)?.value || null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', summary: '' } });
    closeCreateDialog();
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
         <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold whitespace-nowrap">任务中心</h1>
              <span className="text-xs sm:text-sm text-muted-foreground bg-muted px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">{filteredTasks.length}/{state.tasks.length}</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {batchMode && selectedIds.size > 0 && (
                <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 mr-1">
                  <span className="text-xs font-medium">已选 {selectedIds.size} 项</span>
                    <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (!can('delete_tasks')) return; batchDelete(); }}><Trash2 size={12} /> 删除</button>
                  <select value={batchStatus} onChange={e => setBatchStatus(e.target.value)} className="border border-border rounded px-1.5 py-1 text-xs bg-white focus:outline-none"><option value="">改状态</option><option value="todo">待处理</option><option value="in_progress">进行中</option><option value="done">已完成</option><option value="blocked">已阻塞</option><option value="cancelled">已取消</option></select>
                  {batchStatus && <button className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground" onClick={() => { batchUpdateStatus(batchStatus); }}>确认</button>}
                  <select value={batchLeader} onChange={e => setBatchLeader(e.target.value)} className="border border-border rounded px-1.5 py-1 text-xs bg-white focus:outline-none"><option value="">分配给</option>{activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  {batchLeader && <button className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground" onClick={() => { batchAssign(batchLeader); }}>确认</button>}
                  <button className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>清空</button>
                </div>
              )}
              <button onClick={() => setBatchMode(!batchMode)} className={cn('inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors', batchMode ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:bg-muted')}><Check size={14} /><span className="hidden sm:inline">{batchMode ? '退出批量' : '批量操作'}</span></button>
              <button className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors" onClick={() => setShowCreateDialog(true)}><Plus className="w-4 h-4" /> <span className="hidden xs:inline">新建任务</span></button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {VIEW_TABS.map(tab => <button key={tab.key} className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0', viewMode === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground')} onClick={() => setViewMode(tab.key)}>{tab.label}</button>)}
          </div>

          <div className="bg-white rounded-xl border border-border p-2.5 md:p-3 flex items-center gap-2 flex-wrap">
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
                <div className="absolute z-20 bg-white border rounded-lg shadow-lg p-2 max-h-48 overflow-y-auto min-w-[160px]">
                  <label className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={selectedPersons.size === 0} onChange={() => setSelectedPersons(new Set())} />全部人员</label>
                  {activeMembers.map(m => <label key={m.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={selectedPersons.has(m.id)} onChange={() => togglePerson(m.id)} />{m.name}</label>)}
                </div>
              )}
            </div>
            <select className="border border-border rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/20" value={timeFilter} onChange={e => { setTimeFilter(e.target.value); if (e.target.value === 'custom') setShowCustomDate(true); else setShowCustomDate(false); }}>{TIME_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
            {showCustomDate && <input type="date" className="border border-border rounded-lg px-2 py-1 text-xs bg-white" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />}
            {showCustomDate && <input type="date" className="border border-border rounded-lg px-2 py-1 text-xs bg-white" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />}
            {viewMode === 'list' && <button className={cn('text-xs px-2 py-1 rounded-md bg-muted/50 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1', groupByDate && 'bg-primary/10 text-primary border-primary')} onClick={() => setGroupByDate(!groupByDate)}><Calendar className="w-3 h-3" />按日期</button>}
            {activeFilterCount > 0 && <button className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1" onClick={clearFilters}><X size={12} />清除 ({activeFilterCount})</button>}
            <span className="text-xs text-muted-foreground ml-auto">{filteredTasks.length} 条</span>
          </div>

          {viewMode === 'board' && renderBoard()}
          {viewMode === 'list' && renderList()}
          {viewMode === 'table' && renderTable()}
          {viewMode === 'matrix' && <TaskMatrixView filteredTasks={filteredTasks} setDetailItem={setDetailItem} getMemberName={getName} getQuadrantForPriority={getQuadrantForPriority} handleDropToQuadrant={handleDropToQuadrant} commentCounts={commentCounts} batchProps={batchProps} />}
          {viewMode === 'canvas' && renderCanvas()}
          {viewMode === 'timeline' && renderTimeline()}
        </div>
      </div>


      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeCreateDialog}>
          <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0"><h2 className="text-lg font-semibold">新建任务</h2><button className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors" onClick={closeCreateDialog}>关闭</button></div>
            <div className="p-6 space-y-4 overflow-y-auto overflow-x-visible">
              {!fromTemplate ? (
                <div className="space-y-4">
                  <div><label className="text-sm font-medium mb-1.5 block">标题</label><input type="text" id="new-task-title" className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring" placeholder="输入任务标题" /></div>
                  <div><label className="text-sm font-medium mb-1.5 block">描述</label><textarea id="new-task-desc" className="w-full text-sm border border-input rounded-lg px-3 py-2 min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring" placeholder="输入任务描述" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium mb-1.5 block">紧急程度</label><select id="new-task-priority" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-white"><option value="medium">中</option><option value="low">低</option><option value="high">高</option><option value="urgent">紧急</option></select></div>
                    <div><label className="text-sm font-medium mb-1.5 block">主导人</label><select id="new-task-leader" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-white"><option value="">未指定</option>{activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium mb-1.5 block">截止日期</label><input type="date" id="new-task-due" className="w-full text-sm border border-input rounded-lg px-3 py-2" /></div>
                    <div><label className="text-sm font-medium mb-1.5 block">所属项目</label><select id="new-task-project" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-white"><option value="">无</option>{state.projects.filter(p => p.status === 'in_progress').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium mb-1.5 block">分类</label><input type="text" id="new-task-category" className="w-full text-sm border border-input rounded-lg px-3 py-2" placeholder="输入分类" /></div>
                    <div><label className="text-sm font-medium mb-1.5 block">父任务</label><select id="new-task-parent" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-white"><option value="">无</option>{state.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
                  </div>
                  <button className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors" onClick={doCreateTask}>创建任务</button>
                  {taskTemplates.length > 0 && <button className="w-full border border-input text-muted-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-1.5" onClick={() => setFromTemplate(true)}><Copy className="w-4 h-4" />从模板创建</button>}
                </div>
              ) : (
                <div className="space-y-4">
                  <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => { setFromTemplate(false); setSelectedTemplate(''); }}><ChevronRight className="w-4 h-4 rotate-180" />返回手动创建</button>
                  {taskTemplates.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">暂无任务模板</p> : (
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

      {detailItem && <ItemDetailPanel isOpen={true} onClose={() => setDetailItem(null)} itemType={detailItem.type} itemId={detailItem.id} />}
    </div>
  );
}
