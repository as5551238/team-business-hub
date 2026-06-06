import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useTags, useViewingMember, useMemberLookup, usePermissions, useActiveMembers } from '@/store/hooks';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import type { GoalStatus, GoalType, TaskPriority, RepeatCycle } from '@/types';
import { Trash2, Plus, Target, Filter, ChevronDown, X, FileText, Search, Sparkles, Check, Users, EyeOff, Eye } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { handleError } from '@/lib/errorHandler';
import { useCollabPresence, useCollabBroadcast } from '@/lib/collab';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { FilterChipSelect } from '@/components/FilterChipSelect';
import { cn } from '@/lib/utils';
import ViewModeSwitch from '@/components/ViewModeSwitch';
import { filterViewModes, computeUserLevel } from '@/lib/progressiveDisclosure';
import {
  GoalCard, GoalTreeNode, GoalListView, GoalMatrixView
} from './goals/views';
import { viewTabs, statusLabels, statusColors, bizLabels, bizColors, type ViewMode, VALID_VIEW_MODES } from './goals/constants';
import { useDraftSave } from '@/hooks/useDraftSave';
import { OKRAlignmentView } from './admin/OKRAlignmentTab';
import { StrategyHierarchyView } from '@/components/StrategyHierarchyView';
import { CascadeDrilldownView } from '@/components/CascadeDrilldownView';
import { AIItemFlow } from '@/components/AIItemFlow';
import { useDetailFromUrl, useFiltersFromUrl } from '@/hooks/useDetailFromUrl';
import { useBatchSelection } from '@/hooks/useBatchSelection';
import { BatchActionBar } from '@/components/BatchActionBar';
import { useBatchOperations } from '@/hooks/useBatchOperations';
import { useCommentCounts } from '@/hooks/useCommentCounts';
import { isDateRangeInTimeRange } from '@/lib/timeRangeUtils';

export default function Goals() {
  const { state, dispatch } = useStore();
  const { getName: getMemberName } = useMemberLookup();
  const { can } = usePermissions();
  const { tags } = useTags();
  const { isTeamView, viewingMember, viewingMemberId, setViewingMember } = useViewingMember();
  const { onlineUsers } = useCollabPresence(state.currentUser?.id || '', state.currentUser?.name || '');
  const { broadcastOp } = useCollabBroadcast(state.currentUser?.id || '');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAIFlow, setShowAIFlow] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('detail');
  // L6: 渐进披露 — 如果当前 viewMode 被过滤掉，回退到 detail
  const allowedGoalModes = filterViewModes('goals', VALID_VIEW_MODES);
  const effectiveViewMode = allowedGoalModes.includes(viewMode) ? viewMode : 'detail';

  // URL-driven detail panel (replaces tbh-open-detail event)
  const { detailItem, openDetail: openGoalDetail, closeDetail: closeGoalDetail } = useDetailFromUrl({ itemType: 'goal', basePath: '/goals' });

  // URL-driven filters (replaces tbh-nav-filter event)
  const urlFilters = useFiltersFromUrl();
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => urlFilters.statuses || new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  // Apply URL filter params on mount and when URL changes
  useEffect(() => {
    if (urlFilters.statuses && urlFilters.statuses.size > 0) {
      setSelectedStatuses(urlFilters.statuses);
    }
  }, [urlFilters]);

  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [customRepeatDays, setCustomRepeatDays] = useState(0);
  const [customRepeatWeeks, setCustomRepeatWeeks] = useState(0);

  const batchSel = useBatchSelection();
  const { batchMode, selectedIds, toggleSelect, selectAll, selectRange, clearSelection, exitBatchMode } = batchSel;
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { activeMembers } = useActiveMembers();
  const goalTemplates = useMemo(() => state.templates.filter(t => t.type === 'goal'), [state.templates]);

  const filteredGoals = useMemo(() => {
    let result = state.goals.filter(g => !g.deletedAt);
    if (!showCompleted) result = result.filter(g => g.status !== 'done' && g.status !== 'cancelled');
    if (selectedStatuses.size > 0) result = result.filter(g => selectedStatuses.has(g.status));
    if (selectedPriorities.size > 0) result = result.filter(g => selectedPriorities.has(g.priority));
    if (selectedLevels.size > 0) { const bpOf = (p: TaskPriority) => p === 'urgent' ? 'S' : p === 'high' ? 'A' : p === 'medium' ? 'B' : 'C'; result = result.filter(g => selectedLevels.has(bpOf(g.priority))); }
    if (selectedCategories.size > 0) result = result.filter(g => selectedCategories.has(g.category));
    if (selectedTags.size > 0) result = result.filter(g => (g.tags ?? []).some(t => selectedTags.has(t)));
    if (selectedMembers.size > 0) result = result.filter(g => selectedMembers.has(g.leaderId) || (g.supporterIds ?? []).some(s => selectedMembers.has(s)));
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(g => g.title.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q));
    }
    if (timeRange !== 'all') {
      result = result.filter(g => isDateRangeInTimeRange(g.startDate, g.endDate, timeRange));
    }
    if (!isTeamView && viewingMember) {
      result = result.filter(g => g.leaderId === viewingMember.id || (g.supporterIds ?? []).includes(viewingMember.id));
    }
    return result;
  }, [state.goals, selectedStatuses, selectedPriorities, selectedLevels, selectedCategories, selectedTags, selectedMembers, searchText, timeRange, isTeamView, viewingMember, showCompleted]);

  // P3#11 fix: reset focusedId when it's no longer in the filtered list
  useEffect(() => {
    if (focusedId && !filteredGoals.some(g => g.id === focusedId)) {
      setFocusedId(null);
    }
  }, [filteredGoals, focusedId]);

  // Keyboard event handlers for j/k/e/d/x navigation + batch toggle
  useEffect(() => {
    const getFilteredIds = () => filteredGoals.map(g => g.id);
    const onNavDown = () => { const ids = getFilteredIds(); if (ids.length === 0) return; const idx = focusedId ? ids.indexOf(focusedId) : -1; setFocusedId(ids[Math.min(idx + 1, ids.length - 1)]); };
    const onNavUp = () => { const ids = getFilteredIds(); if (ids.length === 0) return; const idx = focusedId ? ids.indexOf(focusedId) : 0; setFocusedId(ids[Math.max(idx - 1, 0)]); };
    const onEdit = () => { if (focusedId) openGoalDetail(focusedId); };
    const onOpen = () => { if (focusedId) openGoalDetail(focusedId); };
    const onDelete = () => { if (focusedId && can('goals_delete')) dispatch({ type: 'DELETE_GOAL', payload: focusedId }); };
    const onComplete = () => { const id = focusedId; if (id) { const goal = state.goals.find(g => g.id === id); if (goal) { const oldStatus = goal.status; const newStatus = goal.status === 'done' ? 'in_progress' : 'done'; dispatch({ type: 'UPDATE_GOAL', payload: { id, updates: { status: newStatus } } }); broadcastOp({ type: 'update', entity: 'goal', entityId: id, field: 'status', oldValue: oldStatus, newValue: newStatus }); } } };
    const onFilter = () => { const input = document.querySelector<HTMLInputElement>('input[data-search-input]'); if (input) { input.focus(); } };
    const onViewSwitch = (e: Event) => { const mode = (e as CustomEvent).detail; if (VALID_VIEW_MODES.includes(mode as ViewMode)) setViewMode(mode as ViewMode); };
    const onToggleBatch = () => { batchSel.toggleBatchMode(); };
    const onSelectAll = () => { selectAll(filteredGoals.map(g => g.id)); };
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
  }, [focusedId, filteredGoals, can, dispatch, batchSel, selectAll]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const commentCounts = useCommentCounts('goal', state.comments);

  const topGoals = useMemo(() => filteredGoals.filter(g => !g.parentId), [filteredGoals]);
  const goalsByStatus = useMemo(() => { const m: Record<string, Goal[]> = {}; filteredGoals.forEach(g => { (m[g.status] ||= []).push(g); }); return m; }, [filteredGoals]);
  const emptyMessage = filteredGoals.length < state.goals.length ? '没有匹配的目标，试试调整筛选条件' : '暂无目标';
  const emptyAction = filteredGoals.length < state.goals.length ? undefined : '新建目标';
  const emptyDesc = filteredGoals.length < state.goals.length ? undefined : '设定团队目标，驱动关键结果达成';

  const activeFilterCount = (selectedStatuses.size > 0 ? 1 : 0) + (selectedPriorities.size > 0 ? 1 : 0) + (selectedLevels.size > 0 ? 1 : 0) + (selectedCategories.size > 0 ? 1 : 0) + (selectedTags.size > 0 ? 1 : 0) + (selectedMembers.size > 0 ? 1 : 0) + (timeRange !== 'all' ? 1 : 0) + (searchText.trim().length > 0 ? 1 : 0);

  const clearFilters = () => {
    setSelectedStatuses(new Set()); setSelectedPriorities(new Set()); setSelectedLevels(new Set());
    setSelectedCategories(new Set()); setSelectedTags(new Set()); setSelectedMembers(new Set());
    setTimeRange('all'); setSearchText('');
  };

  const { batchDelete: _batchDelete, batchUpdateStatus, batchAssign, batchUpdatePriority, batchAddTags, batchRemoveTags, batchSetDate } = useBatchOperations({
    entityType: 'goal',
    updateActionType: 'UPDATE_GOAL',
    deleteActionType: 'DELETE_GOAL',
    editPermission: 'goals_edit',
    deletePermission: 'goals_delete',
    entityLabel: '目标',
    items: state.goals,
    getItemId: (g: any) => g.id,
    dispatch,
    can,
    clearSelection,
    exitBatchMode,
    selectedIds,
  });

  const handleBatchDelete = _batchDelete;
  const handleBatchStatus = useCallback((status: string) => batchUpdateStatus(status), [batchUpdateStatus]);
  const handleBatchAssign = useCallback((assigneeId: string) => batchAssign(assigneeId), [batchAssign]);
  const handleBatchPriority = useCallback((priority: string) => batchUpdatePriority(priority), [batchUpdatePriority]);
  const handleBatchAddTags = useCallback((newTags: string[]) => batchAddTags(newTags), [batchAddTags]);
  const handleBatchRemoveTags = useCallback((removeTags: string[]) => batchRemoveTags(removeTags), [batchRemoveTags]);
  const handleBatchSetDate = useCallback((field: string, value: string) => batchSetDate(field, value), [batchSetDate]);

  const [formData, setFormData] = useState({
    title: '', description: '', type: 'okr' as GoalType, priority: 'medium' as TaskPriority,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    parentId: '', krTitle: '', krTarget: '', krUnit: '', category: '', repeatCycle: 'none' as RepeatCycle,
  });

  // 创建对话框草稿自动保存
  const goalDraft = useDraftSave('goal-create', formData);
  useEffect(() => { if (showCreateDialog) { const draft = goalDraft.loadDraft(); if (draft) setFormData(f => ({ ...f, ...draft })); } }, [showCreateDialog]);
  useEffect(() => { if (showCreateDialog && formData.title) goalDraft.saveDraft(formData); }, [showCreateDialog, formData]);

  function handleCreateGoal() {
    if (!formData.title.trim()) return;
    dispatch({
      type: 'ADD_GOAL',
      payload: {
        title: formData.title, description: formData.description,
        type: formData.type, status: 'in_progress' as GoalStatus, parentId: formData.parentId || null,
        level: formData.parentId ? (state.goals.find(g => g.id === formData.parentId)?.level ?? 0) + 1 : 0,
        startDate: formData.startDate, endDate: formData.endDate, priority: formData.priority,
        leaderId: state.currentUser?.id || '', supporterIds: [], category: formData.category,
        keyResults: formData.krTitle ? [{
          id: 'kr_new_' + Date.now(), title: formData.krTitle,
          targetValue: Number(formData.krTarget) || 100, currentValue: 0, unit: formData.krUnit || '%', selected: true,
        }] : [],
      }
    });
    setShowCreateDialog(false);
    setShowTemplateDropdown(false);
    goalDraft.clearDraft();
    setFormData({ title: '', description: '', type: 'okr', priority: 'medium', startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0], parentId: '', krTitle: '', krTarget: '', krUnit: '', category: '', repeatCycle: 'none' });
  }

  function applyTemplate(tpl: typeof goalTemplates[0]) {
    try {
      const content = JSON.parse(tpl.content);
      setFormData(f => ({
        ...f,
        title: content.title || tpl.title,
        description: content.description || tpl.description,
      }));
    } catch (e) {
      handleError(e, { module: 'Goals', operation: 'PARSE_TEMPLATE', severity: 'warn' });
      setFormData(f => ({ ...f, title: tpl.title, description: tpl.description }));
    }
    setShowTemplateDropdown(false);
  }

  const TIME_LABELS: Record<string, string> = { all: '时间', today: '今天', this_week: '本周', this_month: '本月', this_quarter: '本季度' };

  return (
    <div className={cn('h-full animate-fade-in transition-all duration-300', detailItem ? 'flex' : 'flex flex-col p-4 md:p-6 space-y-6')}>
      <div className={cn(detailItem ? 'flex-1 min-w-0 overflow-y-auto p-4 md:p-6 space-y-6' : '')}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">目标管理</h1>
          {onlineUsers.length > 1 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground ml-2">
              <Users size={12} /> {onlineUsers.length}人在线
            </span>
          )}
          <EmptyState title="管理团队目标，确保业务方向一致性" compact />
        </div>
        <div className="flex items-center gap-2">
          {batchMode && selectedIds.size > 0 && (
            <BatchActionBar
              selection={batchSel}
              filteredCount={filteredGoals.length}
              filteredIds={filteredGoals.map(g => g.id)}
              itemLabel="目标"
              statuses={[{ value: 'todo', label: '待办' }, { value: 'in_progress', label: '进行中' }, { value: 'done', label: '已完成' }, { value: 'blocked', label: '已阻塞' }, { value: 'cancelled', label: '已取消' }]}
              members={activeMembers.map(m => ({ id: m.id, name: m.name }))}
              priorities={[{ value: 'urgent', label: '紧急' }, { value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]}
              tags={Array.from(new Set(state.goals.flatMap(g => g.tags || [])))}
              showDateFields
              dateFields={[{ key: 'endDate', label: '截止日' }]}
              onBatchDelete={() => handleBatchDelete()}
              onBatchStatus={(_ids, status) => handleBatchStatus(status)}
              onBatchAssign={(_ids, assigneeId) => handleBatchAssign(assigneeId)}
              onBatchPriority={(_ids, priority) => handleBatchPriority(priority)}
              onBatchAddTags={(_ids, tags) => handleBatchAddTags(tags)}
              onBatchRemoveTags={(_ids, tags) => handleBatchRemoveTags(tags)}
              onBatchSetDate={(_ids, field, value) => handleBatchSetDate(field, value)}
              canDelete={can('goals_delete')}
              canEdit={can('goals_edit')}
            />
          )}
          <button onClick={() => batchSel.toggleBatchMode()} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${batchMode ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:bg-muted'}`}>
            <Check size={14} />
            <span className="hidden sm:inline">{batchMode ? '退出批量' : '批量操作'}</span>
          </button>
          <button onClick={() => setShowCreateDialog(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> 新建目标
          </button>
          <button onClick={() => setShowAIFlow(true)} className="inline-flex items-center gap-2 border border-primary/30 bg-primary/5 text-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/10 transition-colors">
            <Sparkles size={16} /> AI 拆解
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ViewModeSwitch items={viewTabs.filter(t => filterViewModes('goals', VALID_VIEW_MODES).includes(t.value)).map(t => ({ value: t.value, label: t.label, icon: t.icon }))} value={viewMode} onChange={v => setViewMode(v as ViewMode)} />
      </div>

      <div className="flex items-center gap-2 flex-wrap py-2">
        <Filter size={14} className="text-muted-foreground flex-shrink-0" />
        <div className="relative flex-1 min-w-[140px] max-w-[220px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-search-input type="text" placeholder="搜索..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full pl-8 pr-3 py-1 text-xs border border-input rounded-full bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary/20" /></div>
        <MultiSelectFilter label="状态" options={[{value:'todo',label:'待办'},{value:'in_progress',label:'进行中'},{value:'done',label:'已完成'},{value:'blocked',label:'已阻塞'}]} selected={selectedStatuses} onToggle={v => setSelectedStatuses(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedStatuses(new Set())} className="!text-xs !px-2 !py-1 !min-w-0" />
        <MultiSelectFilter label="紧急程度" options={[{value:'urgent',label:'紧急'},{value:'high',label:'高'},{value:'medium',label:'中'},{value:'low',label:'低'}]} selected={selectedPriorities} onToggle={v => setSelectedPriorities(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedPriorities(new Set())} />
        <MultiSelectFilter label="重要程度" options={[{value:'S',label:'S级'},{value:'A',label:'A级'},{value:'B',label:'B级'},{value:'C',label:'C级'}]} selected={selectedLevels} onToggle={v => setSelectedLevels(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedLevels(new Set())} />
        <MultiSelectFilter label="分类" options={state.categories.map(c => ({value: c.name, label: c.name}))} selected={selectedCategories} onToggle={v => setSelectedCategories(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedCategories(new Set())} />
        <MultiSelectFilter label="标签" options={tags.map(t => ({value: t.id, label: t.name}))} selected={selectedTags} onToggle={v => setSelectedTags(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedTags(new Set())} />
        <FilterChipSelect label="人员" options={activeMembers.map(m => ({value: m.id, label: m.name}))} selected={selectedMembers} onSelect={v => setSelectedMembers(new Set(v as string[]))} onClear={() => setSelectedMembers(new Set())} multiple />
        <FilterChipSelect label={timeRange === 'all' ? '时间' : TIME_LABELS[timeRange] || '时间'} options={[{value:'all',label:'全部时间'},{value:'today',label:'今天'},{value:'this_week',label:'本周'},{value:'this_month',label:'本月'},{value:'this_quarter',label:'本季度'}]} selected={timeRange} onSelect={v => setTimeRange(v as string)} onClear={() => setTimeRange('all')} />
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1"><X size={12} /> 清除 ({activeFilterCount})</button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filteredGoals.length} 条</span>
        <Tooltip><TooltipTrigger asChild><button onClick={() => setShowCompleted(v => !v)} className={`p-1.5 rounded-md hover:bg-muted transition-colors ${showCompleted ? 'text-primary' : 'text-muted-foreground'}`}>{showCompleted ? <Eye size={14} /> : <EyeOff size={14} />}</button></TooltipTrigger><TooltipContent>{showCompleted ? '隐藏已完成' : '显示已完成'}</TooltipContent></Tooltip>
      </div>

      {effectiveViewMode === 'detail' && (
        <div className="space-y-4">
          {topGoals.map(goal => (
            <GoalTreeNode key={goal.id} goal={goal} filteredGoals={filteredGoals} members={state.members} projects={state.projects} expandedGoals={expandedGoals} toggleExpand={toggleExpand} tags={tags} depth={0} onOpenDetail={() => openGoalDetail(goal.id)} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          ))}
          {topGoals.length === 0 && (
            <div className="bg-card rounded-xl border">
              <EmptyState icon={Target} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} />
            </div>
          )}
        </div>
      )}

      {effectiveViewMode === 'list' && (
        <div>
          {filteredGoals.length > 0 ? (
            <GoalListView goals={filteredGoals} members={state.members} onOpenDetail={id => openGoalDetail(id)} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          ) : (
            <div className="bg-card rounded-xl border"><EmptyState icon={Target} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>
          )}
        </div>
      )}

      {effectiveViewMode === 'matrix' && (
        <div>
          {filteredGoals.length > 0 ? (
            <GoalMatrixView goals={filteredGoals} members={state.members} onOpenDetail={id => openGoalDetail(id)} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          ) : (
            <div className="bg-card rounded-xl border"><EmptyState icon={Target} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>
          )}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={(v) => { if (!v) { setShowCreateDialog(false); setShowTemplateDropdown(false); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 md:px-6 py-4 border-b flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="font-semibold">新建目标</DialogTitle>
            <DialogDescription className="sr-only">创建新目标的表单</DialogDescription>
          </DialogHeader>
            <div className="px-5 md:px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowTemplateDropdown(!showTemplateDropdown)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1">
                  <FileText size={14} /> 从模板创建 <ChevronDown size={12} />
                </button>
                {showTemplateDropdown && goalTemplates.length > 0 && (
                  <div className="absolute z-30 bg-card border rounded-lg shadow-lg min-w-[200px] max-h-48 overflow-y-auto" style={{ marginTop: '-2px' }}>
                    {goalTemplates.map(tpl => (
                      <button key={tpl.id} className="w-full text-left px-3 py-2 text-xs hover:bg-muted" onClick={() => applyTemplate(tpl)}>
                        <div className="font-medium">{tpl.title}</div>
                        <div className="text-muted-foreground truncate">{tpl.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">目标名称 *</label>
                <input className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="例：2026年Q2业务增长" value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" rows={2} placeholder="目标的详细描述..." value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">类型</label>
                  <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.type} onChange={e => setFormData(f => ({ ...f, type: e.target.value as GoalType }))}>
                    <option value="okr">OKR</option>
                    <option value="kpi">KPI</option>
                    <option value="milestone">里程碑</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">重要程度</label>
                  <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.priority} onChange={e => setFormData(f => ({ ...f, priority: e.target.value as TaskPriority }))}>
                    <option value="low">C级-低</option>
                    <option value="medium">B级-中</option>
                    <option value="high">A级-高</option>
                    <option value="urgent">S级-紧急</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">开始日期</label>
                  <input type="date" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.startDate} onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">截止日期</label>
                  <input type="date" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.endDate} onChange={e => setFormData(f => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">循环方式</label>
                <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.repeatCycle} onChange={e => setFormData(f => ({ ...f, repeatCycle: e.target.value as RepeatCycle }))}>
                  <option value="none">无</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="biweekly">每两周</option>
                  <option value="monthly">每月</option>
                  <option value="quarterly">每季度</option>
                  <option value="yearly">每年</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
              {formData.repeatCycle === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">间隔天数</label>
                    <input type="number" className="w-full border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="例: 3" value={customRepeatDays} onChange={e => setCustomRepeatDays(parseInt(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">间隔周数</label>
                    <input type="number" className="w-full border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="例: 2" value={customRepeatWeeks} onChange={e => setCustomRepeatWeeks(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">分类</label>
                <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.category} onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}>
                  <option value="">无分类</option>
                  {state.categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">父级目标</label>
                <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.parentId} onChange={e => setFormData(f => ({ ...f, parentId: e.target.value }))}>
                  <option value="">无（顶级目标）</option>
                  {state.goals.map(g => <option key={g.id} value={g.id}>{'\u3000'.repeat(g.level) + (g.level > 0 ? '\u2514 ' : '')}{g.title}</option>)}
                </select>
              </div>
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-2">关键结果（可选）</div>
                <div className="grid grid-cols-3 gap-3">
                  <input className="col-span-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="KR名称" value={formData.krTitle} onChange={e => setFormData(f => ({ ...f, krTitle: e.target.value }))} />
                  <input type="number" className="col-span-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="目标值" value={formData.krTarget} onChange={e => setFormData(f => ({ ...f, krTarget: e.target.value }))} />
                  <input className="col-span-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="单位" value={formData.krUnit} onChange={e => setFormData(f => ({ ...f, krUnit: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="px-5 md:px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0">
              <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors" onClick={() => { setShowCreateDialog(false); setShowTemplateDropdown(false); }}>取消</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" onClick={handleCreateGoal}>创建目标</button>
            </div>
          </DialogContent>
        </Dialog>

      {effectiveViewMode === 'okr' && <OKRAlignmentView />}
      {effectiveViewMode === 'strategy' && <StrategyHierarchyView />}
      {effectiveViewMode === 'cascade' && <CascadeDrilldownView />}
      </div>
      {detailItem && <div className="flex-shrink-0 border-l border-border bg-card" style={{ width: 480 }}><ItemDetailPanel key={detailItem.id} inline isOpen={true} onClose={closeGoalDetail} itemType={detailItem.type} itemId={detailItem.id} /></div>}

      {showAIFlow && <AIItemFlow onClose={() => setShowAIFlow(false)} />}
    </div>
  );
}
