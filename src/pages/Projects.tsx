import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore, useTags, useViewingMember, usePermissions } from '@/store/useStore';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import type { Project, ProjectStatus, TaskPriority, Comment } from '@/types';
import { Plus, FolderKanban, Search, Check, Users, Trash2, X, Filter, ChevronDown } from 'lucide-react';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { viewTabs, statusOptions, priorityOptions, bpOptions, timeOptions, priorityFromBp } from './projects/constants';
import type { ViewMode, BatchProps } from './projects/constants';
import { ProjectTreeNode, ProjectListView, ProjectTableView, ProjectKanbanView, ProjectMatrixView, ProjectTimelineView } from './projects/views';

export default function Projects() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const { tags } = useTags();
  const { isTeamView, viewingMember, setViewingMember, viewingMemberId } = useViewingMember();
  const currentUser = state.currentUser;
  const [detailItem, setDetailItem] = useState<{ type: 'project'; id: string } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('detail');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [personFilter, setPersonFilter] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState('');
  const [batchLeader, setBatchLeader] = useState('');

  // All users default to team view — no auto-switch to personal view

  const toggleExpand = useCallback((id: string) => { setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }, []);

  const activeMembers = useMemo(() => state.members.filter(m => m.status === 'active'), [state.members]);
  const categories = useMemo(() => { const cats = new Set<string>(); state.projects.forEach(p => { if (p.category) cats.add(p.category); }); return Array.from(cats).sort(); }, [state.projects]);
  const projectTags = useMemo(() => { const tgs = new Set<string>(); state.projects.forEach(p => (p.tags || []).forEach(t => tgs.add(t))); return Array.from(tgs).sort(); }, [state.projects]);

  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();

  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (state.comments || []).forEach((c: Comment) => { if (c.itemType === 'project') counts[c.itemId] = (counts[c.itemId] || 0) + 1; });
    return counts;
  }, [state.comments]);

  const filteredProjects = useMemo(() => {
    let result = state.projects;
    if (selectedStatuses.size > 0) result = result.filter(p => selectedStatuses.has(p.status));
    if (selectedPriorities.size > 0) result = result.filter(p => selectedPriorities.has(p.priority));
    if (selectedLevels.size > 0) result = result.filter(p => { const bp = bpOptions.find(o => o.value !== 'all' && priorityFromBp(o.value) === p.priority)?.value; return bp && selectedLevels.has(bp); });
    if (selectedCategories.size > 0) result = result.filter(p => selectedCategories.has(p.category));
    if (selectedTags.size > 0) result = result.filter(p => (p.tags || []).some(t => selectedTags.has(t)));
    if (personFilter.length > 0) result = result.filter(p => personFilter.some(pid => p.leaderId === pid || (p.supporterIds || []).includes(pid)));
    if (searchQuery.trim()) { const q = searchQuery.trim().toLowerCase(); result = result.filter(p => p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)); }
    if (timeFilter === 'today') {
      result = result.filter(p => p.endDate === todayStr || p.startDate === todayStr);
    } else if (timeFilter === 'this_week') {
      const dow = now.getDay() || 7;
      const ws = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + 1).toISOString().split('T')[0];
      const we = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + 7).toISOString().split('T')[0];
      result = result.filter(p => p.endDate >= ws && p.endDate <= we);
    } else if (timeFilter === 'this_month') {
      const ms = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      result = result.filter(p => p.startDate <= me && p.endDate >= ms);
    } else if (timeFilter === 'this_quarter') {
      const qi = Math.floor(now.getMonth() / 3);
      const qs = new Date(now.getFullYear(), qi * 3, 1).toISOString().split('T')[0];
      const qe = new Date(now.getFullYear(), qi * 3 + 3, 0).toISOString().split('T')[0];
      result = result.filter(p => p.startDate <= qe && p.endDate >= qs);
    }
    if (!isTeamView && viewingMember) {
      result = result.filter(p => p.leaderId === viewingMember.id || (p.supporterIds || []).includes(viewingMember.id));
    }
    return result;
  }, [state.projects, selectedStatuses, selectedPriorities, selectedLevels, selectedCategories, selectedTags, personFilter, timeFilter, searchQuery, todayStr, now, isTeamView, viewingMember]);

  const topProjects = filteredProjects.filter(p => !p.parentId);
  const activeFilterCount = [selectedStatuses.size > 0, selectedPriorities.size > 0, selectedLevels.size > 0, selectedCategories.size > 0, selectedTags.size > 0, personFilter.length > 0, timeFilter !== 'all', searchQuery.trim().length > 0].filter(Boolean).length;
  const clearFilters = () => { setSelectedStatuses(new Set()); setSelectedPriorities(new Set()); setSelectedLevels(new Set()); setSelectedCategories(new Set()); setSelectedTags(new Set()); setPersonFilter([]); setTimeFilter('all'); setSearchQuery(''); };

  const projectTemplates = state.templates.filter(t => t.type === 'project');
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [formData, setFormData] = useState({
    title: '', description: '', goalId: '', parentId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    leaderId: '', supporterIds: [] as string[], tags: [] as string[], category: '', priority: 'medium' as TaskPriority,
  });

  const batchProps = useMemo((): BatchProps => ({ batchMode, selectedIds, onToggleSelect: (id: string) => { setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); } }), [batchMode, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredProjects.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProjects.map(p => p.id)));
  }, [selectedIds.size, filteredProjects]);

  const batchDelete = useCallback(() => { if (!confirm(`确认删除选中的 ${selectedIds.size} 个项目？`)) return; selectedIds.forEach(id => dispatch({ type: 'DELETE_PROJECT', payload: id })); setSelectedIds(new Set()); setBatchMode(false); }, [selectedIds, dispatch]);
  const batchUpdateStatus = useCallback((status: string) => { if (!status) return; selectedIds.forEach(id => dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates: { status: status as ProjectStatus } } })); setSelectedIds(new Set()); setBatchStatus(''); }, [selectedIds, dispatch]);
  const batchAssign = useCallback((leaderId: string) => { if (!leaderId) return; selectedIds.forEach(id => dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates: { leaderId } } })); setSelectedIds(new Set()); setBatchLeader(''); }, [selectedIds, dispatch]);

  function handleCreate() {
    if (!formData.title.trim()) return;
    dispatch({ type: 'ADD_PROJECT', payload: { title: formData.title, description: formData.description, goalId: formData.goalId || null, parentId: formData.parentId || null, status: 'planning', priority: formData.priority, startDate: formData.startDate, endDate: formData.endDate, leaderId: formData.leaderId || state.currentUser?.id || '', supporterIds: formData.supporterIds, tags: formData.tags, category: formData.category, taskCount: 0, attachments: [], trackingRecords: [], repeatCycle: 'none' } });
    setShowCreateDialog(false);
    setFormData({ title: '', description: '', goalId: '', parentId: '', startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], leaderId: '', supporterIds: [], tags: [], category: '', priority: 'medium' });
    setUseTemplate(false); setSelectedTemplateId('');
  }

  function applyTemplate(tplId: string) {
    const tpl = projectTemplates.find(t => t.id === tplId);
    if (!tpl) return;
    try { const parsed = JSON.parse(tpl.content); setFormData(f => ({ ...f, title: parsed.title || tpl.title, description: parsed.description || tpl.description || '', tags: parsed.tags || [], category: parsed.category || '', priority: parsed.priority || 'medium' })); }
    catch { setFormData(f => ({ ...f, title: tpl.title, description: tpl.description })); }
  }

  function togglePersonFilter(pid: string) { setPersonFilter(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]); }
  const emptyMessage = activeFilterCount > 0 ? '没有匹配的项目，试试调整筛选条件' : '暂无项目，点击「新建项目」开始规划';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">项目中心</h2>
          <p className="text-sm text-muted-foreground mt-0.5">管理团队项目，推进目标落地执行</p>
        </div>
        <div className="flex items-center gap-2">
          {batchMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 mr-2">
              <span className="text-xs font-medium">已选 {selectedIds.size} 项</span>
               <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (!can('delete_projects')) return; batchDelete(); }}>
                 <Trash2 size={12} /> 删除
               </button>
              <select value={batchStatus} onChange={e => setBatchStatus(e.target.value)} className="border border-border rounded px-1.5 py-1 text-xs bg-white focus:outline-none">
                <option value="">改状态</option><option value="planning">规划中</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="paused">已暂停</option><option value="cancelled">已取消</option>
              </select>
              {batchStatus && <button className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground" onClick={() => { batchUpdateStatus(batchStatus); }}>确认</button>}
              <select value={batchLeader} onChange={e => setBatchLeader(e.target.value)} className="border border-border rounded px-1.5 py-1 text-xs bg-white focus:outline-none">
                <option value="">分配给</option>{activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {batchLeader && <button className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground" onClick={() => { batchAssign(batchLeader); }}>确认</button>}
              <button className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>清空</button>
            </div>
          )}
          <button onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); setBatchStatus(''); setBatchLeader(''); }} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${batchMode ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}><Check size={14} /><span className="hidden sm:inline">{batchMode ? '退出批量' : '批量操作'}</span></button>
          <button onClick={() => setShowCreateDialog(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"><Plus size={16} /> 新建项目</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          {viewTabs.map(tab => { const Icon = tab.icon; const active = viewMode === tab.value; return <button key={tab.value} onClick={() => setViewMode(tab.value)} className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${active ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><Icon size={14} /><span className="hidden sm:inline">{tab.label}</span></button>; })}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-2.5 md:p-3 flex items-center gap-2 flex-wrap">
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
            <div className="absolute z-20 bg-white border rounded-lg shadow-lg p-2 max-h-48 overflow-y-auto min-w-[160px]">
              <label className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={personFilter.length === 0} onChange={() => setPersonFilter([])} />全部人员</label>
              {activeMembers.map(m => <label key={m.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-xs"><input type="checkbox" checked={personFilter.includes(m.id)} onChange={() => togglePersonFilter(m.id)} />{m.name}</label>)}
            </div>
          )}
        </div>
        <select className="border border-border rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/20" value={timeFilter} onChange={e => setTimeFilter(e.target.value)}>{timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        {activeFilterCount > 0 && <button className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1" onClick={clearFilters}><X size={12} />清除 ({activeFilterCount})</button>}
        <span className="text-xs text-muted-foreground ml-auto">{filteredProjects.length} 条</span>
      </div>

      {viewMode === 'detail' && (
        <div className="space-y-4">
          {topProjects.map(project => <ProjectTreeNode key={project.id} project={project} filteredProjects={filteredProjects} members={state.members} expandedIds={expandedIds} toggleExpand={toggleExpand} tags={tags} depth={0} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} />)}
          {topProjects.length === 0 && <div className="bg-white rounded-xl border border-border p-12 text-center"><FolderKanban size={40} className="mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">{emptyMessage}</p></div>}
        </div>
      )}
      {viewMode === 'list' && (filteredProjects.length > 0 ? <ProjectListView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-white rounded-xl border border-border p-12 text-center"><FolderKanban size={40} className="mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">{emptyMessage}</p></div>)}
      {viewMode === 'table' && (filteredProjects.length > 0 ? <ProjectTableView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-white rounded-xl border border-border p-12 text-center"><FolderKanban size={40} className="mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">{emptyMessage}</p></div>)}
      {viewMode === 'kanban' && (filteredProjects.length > 0 ? <ProjectKanbanView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} tags={tags} /> : <div className="bg-white rounded-xl border border-border p-12 text-center"><FolderKanban size={40} className="mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">{emptyMessage}</p></div>)}
      {viewMode === 'matrix' && (filteredProjects.length > 0 ? <ProjectMatrixView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-white rounded-xl border border-border p-12 text-center"><FolderKanban size={40} className="mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">{emptyMessage}</p></div>)}
      {viewMode === 'timeline' && (filteredProjects.length > 0 ? <ProjectTimelineView projects={filteredProjects} members={state.members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} /> : <div className="bg-white rounded-xl border border-border p-12 text-center"><FolderKanban size={40} className="mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">{emptyMessage}</p></div>)}


      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateDialog(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-border w-full max-w-lg animate-slide-up">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">新建项目</h3>
              <button className="p-1 rounded hover:bg-muted" onClick={() => setShowCreateDialog(false)}><X size={16} /></button>
            </div>
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
                <div><label className="block text-sm font-medium mb-1">紧急程度</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.priority} onChange={e => setFormData(f => ({ ...f, priority: e.target.value as TaskPriority }))}><option value="urgent">紧急 (S)</option><option value="high">高 (A)</option><option value="medium">中 (B)</option><option value="low">低 (C)</option></select></div>
                <div><label className="block text-sm font-medium mb-1">开始日期</label><input type="date" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.startDate} onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))} /></div>
                <div><label className="block text-sm font-medium mb-1">截止日期</label><input type="date" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.endDate} onChange={e => setFormData(f => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">关联目标</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.goalId} onChange={e => setFormData(f => ({ ...f, goalId: e.target.value }))}><option value="">无</option>{state.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">父项目</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.parentId} onChange={e => setFormData(f => ({ ...f, parentId: e.target.value }))}><option value="">无（顶级项目）</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">主导人</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.leaderId} onChange={e => setFormData(f => ({ ...f, leaderId: e.target.value }))}><option value="">未指定</option>{activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">分类</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={formData.category} onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}><option value="">未分类</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div>
                <label className="block text-sm font-medium mb-1">标签</label>
                <div className="flex flex-wrap gap-1.5">{tags.map(t => <button key={t.id} type="button" className={`px-2 py-0.5 rounded text-xs transition-opacity ${formData.tags.includes(t.name) ? 'opacity-100 ring-1 ring-primary' : 'opacity-60'}`} style={{ backgroundColor: t.color + '22', color: t.color }} onClick={() => setFormData(f => ({ ...f, tags: f.tags.includes(t.name) ? f.tags.filter(x => x !== t.name) : [...f.tags, t.name] }))}>{t.name}</button>)}</div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors" onClick={() => setShowCreateDialog(false)}>关闭</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" onClick={handleCreate}>创建项目</button>
            </div>
          </div>
        </div>
      )}

      {detailItem && <ItemDetailPanel isOpen={!!detailItem} onClose={() => setDetailItem(null)} itemType={detailItem.type} itemId={detailItem.id} />}
    </div>
  );
}
