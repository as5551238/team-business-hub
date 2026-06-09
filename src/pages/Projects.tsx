import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useTags, useViewingMember, usePermissions, useActiveMembers } from '@/store/hooks';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import type { TaskPriority } from '@/types';
import { Plus, FolderKanban, Search, Check, Users, X, Filter, ChevronDown, EyeOff, Eye } from 'lucide-react';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { handleError } from '@/lib/errorHandler';
import { useCollabPresence } from '@/lib/collab';
import { useDraftSave } from '@/hooks/useDraftSave';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import ViewModeSwitch from '@/components/ViewModeSwitch';
import PageShell from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';
import { viewTabs, statusOptions, priorityOptions, bpOptions, timeOptions, priorityFromBp } from './projects/constants';
import type { ViewMode, BatchProps } from './projects/constants';
import { ProjectTreeNode, ProjectListView, ProjectTableView, ProjectKanbanView, ProjectMatrixView, ProjectTimelineView } from './projects/views';
import { useDetailFromUrl, useFiltersFromUrl } from '@/hooks/useDetailFromUrl';
import { useBatchSelection } from '@/hooks/useBatchSelection';
import { BatchActionBar } from '@/components/BatchActionBar';
import { useBatchOperations } from '@/hooks/useBatchOperations';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useCommentCounts } from '@/hooks/useCommentCounts';
import { isDateRangeInTimeRange } from '@/lib/timeRangeUtils';

export default function Projects() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const { tags } = useTags();
  const { isTeamView, viewingMember, setViewingMember, viewingMemberId } = useViewingMember();
  const { onlineUsers } = useCollabPresence(state.currentUser?.id || '', state.currentUser?.name || '');
  const currentUser = state.currentUser;

  // URL-driven detail panel (replaces tbh-open-detail event)
  const { detailItem, openDetail: openProjectDetail, closeDetail: closeProjectDetail } = useDetailFromUrl({ itemType: 'project', basePath: '/projects' });

  // URL-driven filters (replaces tbh-nav-filter event)
  const urlFilters = useFiltersFromUrl();
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => urlFilters.statuses || new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('detail');

  // Apply URL filter params on mount and when URL changes
  useEffect(() => {
    if (urlFilters.statuses && urlFilters.statuses.size > 0) {
      setSelectedStatuses(urlFilters.statuses);
    }
  }, [urlFilters]);

  const batchSel = useBatchSelection();
  const { batchMode, selectedIds, toggleSelect, selectAll, selectRange, clearSelection, exitBatchMode } = batchSel;

  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [personFilter, setPersonFilter] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // All users default to team view — no auto-switch to personal view
  const setDetailItem = useCallback((item: { type: 'project'; id: string } | null) => {
    if (item) openProjectDetail(item.id);
    else closeProjectDetail();
  }, [openProjectDetail, closeProjectDetail]);

  // All users default to team view — no auto-switch to personal view

  const toggleExpand = useCallback((id: string) => { setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }, []);

  const { activeMembers } = useActiveMembers();
  const categories = useMemo(() => { const cats = new Set<string>(); state.projects.forEach(p => { if (p.category) cats.add(p.category); }); return Array.from(cats).sort(); }, [state.projects]);
  const projectTags = useMemo(() => { const tgs = new Set<string>(); state.projects.forEach(p => (p.tags || []).forEach(t => tgs.add(t))); return Array.from(tgs).sort(); }, [state.projects]);

  const commentCounts = useCommentCounts('project', state.comments);

  const filteredProjects = useMemo(() => {
    let result = state.projects.filter(p => !p.deletedAt);
    if (!showCompleted) result = result.filter(p => p.status !== 'done' && p.status !== 'cancelled');
    if (selectedStatuses.size > 0) result = result.filter(p => selectedStatuses.has(p.status));
    if (selectedPriorities.size > 0) result = result.filter(p => selectedPriorities.has(p.priority));
    if (selectedLevels.size > 0) result = result.filter(p => { const bp = bpOptions.find(o => o.value !== 'all' && priorityFromBp(o.value) === p.priority)?.value; return bp && selectedLevels.has(bp); });
    if (selectedCategories.size > 0) result = result.filter(p => selectedCategories.has(p.category));
    if (selectedTags.size > 0) result = result.filter(p => (p.tags || []).some(t => selectedTags.has(t)));
    if (personFilter.length > 0) result = result.filter(p => personFilter.some(pid => p.leaderId === pid || (p.supporterIds || []).includes(pid)));
    if (searchQuery.trim()) { const q = searchQuery.trim().toLowerCase(); result = result.filter(p => p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)); }
    if (timeFilter !== 'all') {
      result = result.filter(p => isDateRangeInTimeRange(p.startDate, p.endDate, timeFilter));
    }
    if (!isTeamView && viewingMember) {
      result = result.filter(p => p.leaderId === viewingMember.id || (p.supporterIds || []).includes(viewingMember.id));
    }
    return result;
  }, [state.projects, selectedStatuses, selectedPriorities, selectedLevels, selectedCategories, selectedTags, personFilter, timeFilter, searchQuery, isTeamView, viewingMember, showCompleted]);

  // Keyboard navigation (j/k, edit, delete, complete, batch, switch-view, focus-filter)
  useKeyboardNavigation({
    updateActionType: 'UPDATE_PROJECT',
    deleteActionType: 'DELETE_PROJECT',
    editPermission: 'edit_projects',
    deletePermission: 'delete_projects',
    filteredItems: filteredProjects,
    focusedId,
    setFocusedId,
    dispatch,
    can,
    batchMode,
    onToggleSelect: toggleSelect,
    onSelectAll: useCallback(() => selectAll(filteredProjects.map(p => p.id)), [selectAll, filteredProjects]),
    clearSelection,
    toggleBatchMode: batchSel.toggleBatchMode,
    setDetailItem,
    itemType: 'project',
    switchView: useCallback((mode?: string) => { if (mode) setViewMode(mode as ViewMode); }, []),
    focusFilter: useCallback(() => { document.querySelector<HTMLInputElement>('input[data-search-input]')?.focus(); }, []),
  });

  const topProjects = useMemo(() => filteredProjects.filter(p => !p.parentId), [filteredProjects]);
  const activeFilterCount = (selectedStatuses.size > 0 ? 1 : 0) + (selectedPriorities.size > 0 ? 1 : 0) + (selectedLevels.size > 0 ? 1 : 0) + (selectedCategories.size > 0 ? 1 : 0) + (selectedTags.size > 0 ? 1 : 0) + (personFilter.length > 0 ? 1 : 0) + (timeFilter !== 'all' ? 1 : 0) + (searchQuery.trim().length > 0 ? 1 : 0);
  const clearFilters = () => { setSelectedStatuses(new Set()); setSelectedPriorities(new Set()); setSelectedLevels(new Set()); setSelectedCategories(new Set()); setSelectedTags(new Set()); setPersonFilter([]); setTimeFilter('all'); setSearchQuery(''); };

  const projectTemplates = useMemo(() => state.templates.filter(t => t.type === 'project'), [state.templates]);
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [formData, setFormData] = useState({
    title: '', description: '', goalId: '', parentId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    leaderId: '', supporterIds: [] as string[], tags: [] as string[], category: '', priority: 'medium' as TaskPriority,
  });

  // 创建对话框草稿自动保存
  const projectDraft = useDraftSave('project-create', formData);
  useEffect(() => { if (showCreateDialog) { const draft = projectDraft.loadDraft(); if (draft) setFormData(f => ({ ...f, ...draft })); } }, [showCreateDialog]);
  useEffect(() => { if (showCreateDialog && formData.title) projectDraft.saveDraft(formData); }, [showCreateDialog, formData]);

  const batchProps = useMemo((): BatchProps => ({
    batchMode,
    selectedIds,
    onToggleSelect: toggleSelect,
    shiftSelect: (id: string) => {
      if (batchMode && batchSel.lastSelectedId && batchSel.lastSelectedId !== id) {
        selectRange(batchSel.lastSelectedId, id, filteredProjects.map(p => p.id));
      } else {
        toggleSelect(id);
      }
    },
  }), [batchMode, selectedIds, toggleSelect, selectRange, batchSel, filteredProjects]);

  const { batchDelete, batchUpdateStatus, batchAssign, batchUpdatePriority, batchAddTags, batchRemoveTags, batchSetDate, batchMoveTo } = useBatchOperations({
    entityType: 'project',
    updateActionType: 'UPDATE_PROJECT',
    deleteActionType: 'DELETE_PROJECT',
    editPermission: 'edit_projects',
    deletePermission: 'delete_projects',
    entityLabel: '项目',
    items: state.projects,
    getItemId: (p: any) => p.id,
    dispatch,
    can,
    clearSelection,
    exitBatchMode,
    selectedIds,
  });
  const batchMoveToGoal = useCallback((goalId: string) => batchMoveTo('goalId', goalId, '批量移动到目标'), [batchMoveTo]);

  function handleCreate() {
    if (!formData.title.trim()) return;
    dispatch({ type: 'ADD_PROJECT', payload: { title: formData.title, description: formData.description, goalId: formData.goalId || null, parentId: formData.parentId || null, status: 'todo', priority: formData.priority, startDate: formData.startDate, endDate: formData.endDate, leaderId: formData.leaderId || state.currentUser?.id || '', supporterIds: formData.supporterIds, tags: formData.tags, category: formData.category, taskCount: 0, attachments: [], trackingRecords: [], repeatCycle: 'none' } });
    setShowCreateDialog(false);
    projectDraft.clearDraft();
    setFormData({ title: '', description: '', goalId: '', parentId: '', startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], leaderId: '', supporterIds: [], tags: [], category: '', priority: 'medium' });
    setUseTemplate(false); setSelectedTemplateId('');
  }

  function applyTemplate(tplId: string) {
    const tpl = projectTemplates.find(t => t.id === tplId);
    if (!tpl) return;
    try { const parsed = JSON.parse(tpl.content); setFormData(f => ({ ...f, title: parsed.title || tpl.title, description: parsed.description || tpl.description || '', tags: parsed.tags || [], category: parsed.category || '', priority: parsed.priority || 'medium' })); }
    catch (e) { handleError(e, { module: 'Projects', operation: 'PARSE_TEMPLATE', severity: 'warn' }); setFormData(f => ({ ...f, title: tpl.title, description: tpl.description })); }
  }

  function togglePersonFilter(pid: string) { setPersonFilter(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]); }
  const emptyMessage = activeFilterCount > 0 ? '没有匹配的项目，试试调整筛选条件' : '暂无项目';
  const emptyAction = activeFilterCount > 0 ? undefined : '新建项目';
  const emptyDesc = activeFilterCount > 0 ? undefined : '创建项目，推进目标落地执行';

  return (
    <div className={cn('h-full animate-fade-in', detailItem && 'flex')}>
      <PageShell
        className={detailItem ? 'flex-1 min-w-0' : ''}
        headerContent={(
          <div>
            <h1 className="text-xl font-bold">项目中心</h1>
            {onlineUsers.length > 1 && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground ml-2"><Users size={12} /> {onlineUsers.length}人在线</span>}
            <EmptyState title="管理团队项目，推进目标落地执行" compact />
          </div>
        )}
        actions={(
          <div className="flex items-center gap-2">
            {batchMode && selectedIds.size > 0 && (
              <BatchActionBar
                selection={batchSel}
                filteredCount={filteredProjects.length}
                filteredIds={filteredProjects.map(p => p.id)}
                itemLabel="项目"
                statuses={[{ value: 'todo', label: '待办' }, { value: 'in_progress', label: '进行中' }, { value: 'done', label: '已完成' }, { value: 'blocked', label: '已阻塞' }, { value: 'cancelled', label: '已取消' }]}
                members={activeMembers.map(m => ({ id: m.id, name: m.name }))}
                priorities={[{ value: 'urgent', label: '紧急' }, { value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]}
                tags={projectTags}
                showDateFields
                dateFields={[{ key: 'endDate', label: '截止日' }]}
                moveTargets={[{ value: '', label: '无目标' }, ...state.goals.filter(g => g.status === 'in_progress').map(g => ({ value: g.id, label: g.title }))]}
                moveLabel="移到目标"
                onBatchDelete={(ids) => batchDelete()}
                onBatchStatus={(_ids, status) => batchUpdateStatus(status)}
                onBatchAssign={(_ids, leaderId) => batchAssign(leaderId)}
                onBatchPriority={(_ids, priority) => batchUpdatePriority(priority)}
                onBatchAddTags={(_ids, tags) => batchAddTags(tags)}
                onBatchRemoveTags={(_ids, tags) => batchRemoveTags(tags)}
                onBatchSetDate={(_ids, field, value) => batchSetDate(field, value)}
                onBatchMove={(_ids, targetId) => batchMoveToGoal(targetId)}
                canDelete={can('delete_projects')}
                canEdit={can('edit_projects')}
              />
            )}
            <button onClick={() => batchSel.toggleBatchMode()} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${batchMode ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:bg-muted'}`}><Check size={14} /><span className="hidden sm:inline">{batchMode ? '退出批量' : '批量操作'}</span></button>
            <button onClick={() => setShowCreateDialog(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"><Plus size={16} /> 新建项目</button>
          </div>
        )}
        tabsComponent={(
          <ViewModeSwitch items={viewTabs.map(t => ({ value: t.value, label: t.label, icon: t.icon }))} value={viewMode} onChange={v => setViewMode(v as ViewMode)} />
        )}
        filters={(
          <div className="bg-card rounded-xl border p-2.5 md:p-3 flex items-center gap-2 flex-wrap w-full">
            <Filter size={14} className="text-muted-foreground flex-shrink-0" />
            <div className="relative flex-1 min-w-[160px] max-w-[260px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-search-input className="w-full pl-8 pr-3 py-1.5 text-xs border border-input rounded-lg bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="搜索项目..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
            <MultiSelectFilter label="状态" options={statusOptions.filter(o => o.value !== 'all')} selected={selectedStatuses} onToggle={v => setSelectedStatuses(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedStatuses(new Set())} />
            <MultiSelectFilter label="紧急程度" options={priorityOptions.filter(o => o.value !== 'all')} selected={selectedPriorities} onToggle={v => setSelectedPriorities(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedPriorities(new Set())} />
            <MultiSelectFilter label="重要程度" options={bpOptions.filter(o => o.value !== 'all')} selected={selectedLevels} onToggle={v => setSelectedLevels(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedLevels(new Set())} />
            <MultiSelectFilter label="分类" options={categories.map(c => ({value: c, label: c}))} selected={selectedCategories} onToggle={v => setSelectedCategories(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedCategories(new Set())} />
            <MultiSelectFilter label="标签" options={projectTags.map(t => ({value: t, label: t}))} selected={selectedTags} onToggle={v => setSelectedTags(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedTags(new Set())} />
            <div className="relative">
              <button className="text-xs px-2 py-1 rounded-md bg-muted/50 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1" onClick={() => setShowPersonPicker(!showPersonPicker)}>人员筛选 ({personFilter.length || '全部'}) <ChevronDown size={12} /></button>
              {showPersonPicker && (
                <div className="absolute z-20 bg-card border rounded-lg shadow-lg p-2 max-h-48 overflow-y-auto min-w-[160px]">
                  <label className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={personFilter.length === 0} onChange={() => setPersonFilter([])} />全部人员</label>
                  {activeMembers.map(m => <label key={m.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={personFilter.includes(m.id)} onChange={() => togglePersonFilter(m.id)} />{m.name}</label>)}
                </div>
              )}
            </div>
            <SimpleSelect value={timeFilter} onValueChange={v => setTimeFilter(v)} options={timeOptions.map(o => ({ value: o.value, label: o.label }))} className="w-[120px] h-7 text-xs" />
            {activeFilterCount > 0 && <button className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1" onClick={clearFilters}><X size={12} />清除 ({activeFilterCount})</button>}
            <span className="text-xs text-muted-foreground ml-auto">{filteredProjects.length} 条</span>
            <Tooltip><TooltipTrigger asChild><button onClick={() => setShowCompleted(v => !v)} className={`p-1.5 rounded-md hover:bg-muted transition-colors ${showCompleted ? 'text-primary' : 'text-muted-foreground'}`}>{showCompleted ? <Eye size={14} /> : <EyeOff size={14} />}</button></TooltipTrigger><TooltipContent>{showCompleted ? '隐藏已完成' : '显示已完成'}</TooltipContent></Tooltip>
          </div>
        )}
        noPadding
      >
        <div className="p-4 md:p-6 space-y-6">
          {viewMode === 'detail' && (
            <div className="space-y-4">
              {topProjects.map(project => <ProjectTreeNode key={project.id} project={project} filteredProjects={filteredProjects} members={state.members} expandedIds={expandedIds} toggleExpand={toggleExpand} tags={tags} depth={0} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} />)}
              {topProjects.length === 0 && <div className="bg-card rounded-xl border border-border"><EmptyState icon={FolderKanban} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>}
            </div>
          )}
          {viewMode === 'list' && (filteredProjects.length > 0 ? <ProjectListView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-card rounded-xl border border-border"><EmptyState icon={FolderKanban} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>)}
          {viewMode === 'table' && (filteredProjects.length > 0 ? <ProjectTableView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-card rounded-xl border border-border"><EmptyState icon={FolderKanban} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>)}
          {viewMode === 'kanban' && (filteredProjects.length > 0 ? <ProjectKanbanView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} tags={tags} /> : <div className="bg-card rounded-xl border border-border"><EmptyState icon={FolderKanban} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>)}
          {viewMode === 'matrix' && (filteredProjects.length > 0 ? <ProjectMatrixView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-card rounded-xl border border-border"><EmptyState icon={FolderKanban} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>)}
          {viewMode === 'timeline' && (filteredProjects.length > 0 ? <ProjectTimelineView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-card rounded-xl border border-border"><EmptyState icon={FolderKanban} title={emptyMessage} description={emptyDesc} actionLabel={emptyAction} onAction={emptyAction ? () => setShowCreateDialog(true) : undefined} /></div>)}
        </div>
      </PageShell>

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(v) => { if (!v) setShowCreateDialog(false); }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="font-semibold">新建项目</DialogTitle>
            <DialogDescription className="sr-only">创建新项目的表单</DialogDescription>
          </DialogHeader>
            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div><label className="block text-sm font-medium mb-1">项目名称 *</label><input className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="例：Q2产品迭代" value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} /></div>
              {projectTemplates.length > 0 && <div className="flex items-center gap-2"><button className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${useTemplate ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border hover:bg-muted'}`} onClick={() => setUseTemplate(!useTemplate)}>从模板创建</button></div>}
              {useTemplate && projectTemplates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">选择模板</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {projectTemplates.map(tpl => <button key={tpl.id} className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selectedTemplateId === tpl.id ? 'bg-primary/10 border-primary/40' : 'border-border hover:bg-muted'}`} onClick={() => { setSelectedTemplateId(tpl.id); applyTemplate(tpl.id); }}><div className="font-medium">{tpl.title}</div>{tpl.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.description}</div>}</button>)}
                  </div>
                </div>
              )}
              <div><label className="block text-sm font-medium mb-1">描述</label><textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" rows={2} placeholder="项目描述..." value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-sm font-medium mb-1">紧急程度</label><SimpleSelect value={formData.priority} onValueChange={(v) => setFormData(f => ({ ...f, priority: v as TaskPriority }))} options={[{ value: 'urgent', label: '紧急 (S)' }, { value: 'high', label: '高 (A)' }, { value: 'medium', label: '中 (B)' }, { value: 'low', label: '低 (C)' }]} className="w-full h-10 text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">开始日期</label><input type="date" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.startDate} onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))} /></div>
                <div><label className="block text-sm font-medium mb-1">截止日期</label><input type="date" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.endDate} onChange={e => setFormData(f => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">关联目标</label><SimpleSelect value={formData.goalId} onValueChange={(v) => setFormData(f => ({ ...f, goalId: v }))} options={state.goals.map(g => ({ value: g.id, label: g.title }))} placeholder="无" className="w-full h-10 text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">父项目</label><SimpleSelect value={formData.parentId} onValueChange={(v) => setFormData(f => ({ ...f, parentId: v }))} options={state.projects.map(p => ({ value: p.id, label: p.title }))} placeholder="无（顶级项目）" className="w-full h-10 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">主导人</label><SimpleSelect value={formData.leaderId} onValueChange={(v) => setFormData(f => ({ ...f, leaderId: v }))} options={activeMembers.map(m => ({ value: m.id, label: m.name }))} placeholder="未指定" className="w-full h-10 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1">协作人</label><div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border border-border rounded-lg px-2 py-1.5">{activeMembers.filter(m => m.id !== formData.leaderId).map(m => <button key={m.id} type="button" className={`px-2 py-0.5 rounded text-xs transition-colors ${formData.supporterIds.includes(m.id) ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`} onClick={() => setFormData(f => ({ ...f, supporterIds: f.supporterIds.includes(m.id) ? f.supporterIds.filter(x => x !== m.id) : [...f.supporterIds, m.id] }))}>{m.name}</button>)}</div></div>
              <div><label className="block text-sm font-medium mb-1">分类</label><SimpleSelect value={formData.category} onValueChange={(v) => setFormData(f => ({ ...f, category: v }))} options={categories.map(c => ({ value: c, label: c }))} placeholder="未分类" className="w-full h-10 text-sm" /></div>
              <div>
                <label className="block text-sm font-medium mb-1">标签</label>
                <div className="flex flex-wrap gap-1.5">{tags.map(t => <button key={t.id} type="button" className={`px-2 py-0.5 rounded text-xs transition-opacity ${formData.tags.includes(t.name) ? 'opacity-100 ring-1 ring-primary' : 'opacity-60'}`} style={{ backgroundColor: t.color + '22', color: t.color }} onClick={() => setFormData(f => ({ ...f, tags: f.tags.includes(t.name) ? f.tags.filter(x => x !== t.name) : [...f.tags, t.name] }))}>{t.name}</button>)}</div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors" onClick={() => setShowCreateDialog(false)}>关闭</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" onClick={handleCreate}>创建项目</button>
            </div>
        </DialogContent>
      </Dialog>

      {detailItem && <div className="flex-shrink-0 border-l border-border bg-card" style={{ width: 480 }}><ItemDetailPanel key={detailItem.id} inline isOpen={true} onClose={closeProjectDetail} itemType={detailItem.type} itemId={detailItem.id} /></div>}
    </div>
  );
}
