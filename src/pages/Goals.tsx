import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore, useTags, useViewingMember, usePermissions } from '@/store/useStore';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import type { GoalStatus, GoalType, TaskPriority, RepeatCycle } from '@/types';
import { Trash2, Edit2, Plus, Target, Filter, ChevronDown, X, FileText, Search } from 'lucide-react';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import {
  GoalCard, GoalTreeNode, GoalListView, GoalTableView, GoalMatrixView, GoalTimelineView
} from './goals/views';
import { viewTabs, statusLabels, statusColors, bizLabels, bizColors, type ViewMode } from './goals/constants';

export default function Goals() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const { tags } = useTags();
  const { isTeamView, viewingMember, viewingMemberId, setViewingMember } = useViewingMember();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('detail');
  const [detailItem, setDetailItem] = useState<{ type: 'goal'; id: string } | null>(null);

  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [timeRange, setTimeRange] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [customRepeatDays, setCustomRepeatDays] = useState(0);
  const [customRepeatWeeks, setCustomRepeatWeeks] = useState(0);

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState('');
  const [batchAssignee, setBatchAssignee] = useState('');

  const activeMembers = useMemo(() => state.members.filter(m => m.status === 'active'), [state.members]);
  const goalTemplates = useMemo(() => state.templates.filter(t => t.type === 'goal'), [state.templates]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // All users default to team view — no auto-switch to personal view

  const toggleExpand = useCallback((id: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleMember = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const filteredGoals = useMemo(() => {
    let result = [...state.goals];
    if (selectedStatuses.size > 0) result = result.filter(g => selectedStatuses.has(g.status));
    if (selectedPriorities.size > 0) result = result.filter(g => selectedPriorities.has(g.priority));
    if (selectedLevels.size > 0) { const bpOf = (p: TaskPriority) => p === 'urgent' ? 'S' : p === 'high' ? 'A' : p === 'medium' ? 'B' : 'C'; result = result.filter(g => selectedLevels.has(bpOf(g.priority))); }
    if (selectedCategories.size > 0) result = result.filter(g => selectedCategories.has(g.category));
    if (selectedTags.size > 0) result = result.filter(g => (g.tags || []).some(t => selectedTags.has(t)));
    if (selectedMembers.size > 0) result = result.filter(g => selectedMembers.has(g.leaderId) || (g.supporterIds || []).some(s => selectedMembers.has(s)));
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(g => g.title.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q));
    }
    if (timeRange === 'today') {
      result = result.filter(g => g.startDate <= todayStr && g.endDate >= todayStr);
    } else if (timeRange === 'this_week') {
      const d = new Date(todayStr); const day = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); const ws = mon.toISOString().split('T')[0];
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6); const we = sun.toISOString().split('T')[0];
      result = result.filter(g => g.startDate <= we && g.endDate >= ws);
    } else if (timeRange === 'this_month') {
      const ms = new Date(new Date(todayStr).getFullYear(), new Date(todayStr).getMonth(), 1).toISOString().split('T')[0];
      const me = new Date(new Date(todayStr).getFullYear(), new Date(todayStr).getMonth() + 1, 0).toISOString().split('T')[0];
      result = result.filter(g => g.startDate <= me && g.endDate >= ms);
    } else if (timeRange === 'this_quarter') {
      const nowDate = new Date(todayStr); const qi = Math.floor(nowDate.getMonth() / 3);
      const qs = new Date(nowDate.getFullYear(), qi * 3, 1).toISOString().split('T')[0];
      const qe = new Date(nowDate.getFullYear(), qi * 3 + 3, 0).toISOString().split('T')[0];
      result = result.filter(g => g.startDate <= qe && g.endDate >= qs);
    }
    if (!isTeamView && viewingMember) {
      result = result.filter(g => g.leaderId === viewingMember.id || (g.supporterIds || []).includes(viewingMember.id));
    }
    return result;
  }, [state.goals, selectedStatuses, selectedPriorities, selectedLevels, selectedCategories, selectedTags, selectedMembers, searchText, timeRange, todayStr, isTeamView, viewingMember]);

  const commentCounts = useMemo(() => {
    const map = new Map<string, number>();
    state.comments.forEach(c => {
      if (c.itemType === 'goal') {
        map.set(c.itemId, (map.get(c.itemId) || 0) + 1);
      }
    });
    return map;
  }, [state.comments]);

  const topGoals = filteredGoals.filter(g => !g.parentId);
  const emptyMessage = filteredGoals.length < state.goals.length ? '没有匹配的目标，试试调整筛选条件' : '暂无目标，点击「新建目标」开始规划';

  const activeFilterCount = [selectedStatuses.size > 0, selectedPriorities.size > 0, selectedLevels.size > 0, selectedCategories.size > 0, selectedTags.size > 0, selectedMembers.size > 0, timeRange !== 'all', searchText.trim().length > 0].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedStatuses(new Set()); setSelectedPriorities(new Set()); setSelectedLevels(new Set());
    setSelectedCategories(new Set()); setSelectedTags(new Set()); setSelectedMembers(new Set());
    setTimeRange('all'); setSearchText('');
  };

  const handleBatchDelete = useCallback(() => {
    if (!confirm(`确认删除选中的 ${selectedIds.size} 个目标？`)) return;
    selectedIds.forEach(id => { dispatch({ type: 'DELETE_GOAL', payload: id }); });
    setSelectedIds(new Set());
    setBatchMode(false);
  }, [selectedIds, dispatch]);

  const handleBatchStatus = useCallback(() => {
    if (!can('edit_goals')) return;
    if (!batchStatus) return;
    selectedIds.forEach(id => {
      dispatch({ type: 'UPDATE_GOAL', payload: { id, updates: { status: batchStatus as GoalStatus } } });
    });
    setSelectedIds(new Set());
    setBatchStatus('');
  }, [selectedIds, dispatch, batchStatus]);

  const handleBatchAssign = useCallback(() => {
    if (!can('edit_goals')) return;
    if (!batchAssignee) return;
    selectedIds.forEach(id => {
      dispatch({ type: 'UPDATE_GOAL', payload: { id, updates: { leaderId: batchAssignee } } });
    });
    setSelectedIds(new Set());
    setBatchAssignee('');
  }, [selectedIds, dispatch, batchAssignee]);

  const [formData, setFormData] = useState({
    title: '', description: '', type: 'okr' as GoalType, priority: 'medium' as TaskPriority,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    parentId: '', krTitle: '', krTarget: '', krUnit: '', category: '', repeatCycle: 'none' as RepeatCycle,
  });

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
    } catch {
      setFormData(f => ({ ...f, title: tpl.title, description: tpl.description }));
    }
    setShowTemplateDropdown(false);
  }

  const selectClass = "border border-border rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/20";

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">目标管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">管理团队目标，确保业务方向一致性</p>
        </div>
        <div className="flex items-center gap-2">
          {batchMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 mr-2">
              <span className="text-xs font-medium">已选 {selectedIds.size} 项</span>
               <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (!can('delete_goals')) return; handleBatchDelete(); }}>
                 <Trash2 size={12} /> 删除
               </button>
              <select value={batchStatus} onChange={e => setBatchStatus(e.target.value)} className="border border-border rounded px-1.5 py-1 text-xs bg-white focus:outline-none">
                <option value="">改状态</option>
                <option value="planning">规划中</option>
                <option value="in_progress">进行中</option>
                <option value="completed">已完成</option>
                <option value="paused">已暂停</option>
              </select>
              {batchStatus && <button className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground" onClick={handleBatchStatus}>确认</button>}
              <select value={batchAssignee} onChange={e => setBatchAssignee(e.target.value)} className="border border-border rounded px-1.5 py-1 text-xs bg-white focus:outline-none">
                <option value="">分配给</option>
                {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {batchAssignee && <button className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground" onClick={handleBatchAssign}>确认</button>}
              <button className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>清空</button>
            </div>
          )}
          <button onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); setBatchStatus(''); setBatchAssignee(''); }} className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${batchMode ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
            <Edit2 size={14} />
            <span className="hidden sm:inline">{batchMode ? '退出批量' : '批量操作'}</span>
          </button>
          <button onClick={() => setShowCreateDialog(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> 新建目标
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          {viewTabs.map(tab => {
            const Icon = tab.icon;
            const active = viewMode === tab.value;
            return (
              <button key={tab.value} onClick={() => setViewMode(tab.value)} className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${active ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon size={14} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-2.5 md:p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-muted-foreground flex-shrink-0" />
        <div className="relative flex-1 min-w-[160px] max-w-[260px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-search-input type="text" placeholder="搜索..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs border border-input rounded-lg bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary/20" /></div>
        <MultiSelectFilter label="状态" options={[{value:'planning',label:'规划中'},{value:'in_progress',label:'进行中'},{value:'completed',label:'已完成'},{value:'paused',label:'已暂停'}]} selected={selectedStatuses} onToggle={v => setSelectedStatuses(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedStatuses(new Set())} className="!text-xs !px-2 !py-1 !min-w-0" />
        <MultiSelectFilter label="紧急程度" options={[{value:'urgent',label:'紧急'},{value:'high',label:'高'},{value:'medium',label:'中'},{value:'low',label:'低'}]} selected={selectedPriorities} onToggle={v => setSelectedPriorities(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedPriorities(new Set())} className={selectClass} />
        <MultiSelectFilter label="重要程度" options={[{value:'S',label:'S级'},{value:'A',label:'A级'},{value:'B',label:'B级'},{value:'C',label:'C级'}]} selected={selectedLevels} onToggle={v => setSelectedLevels(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedLevels(new Set())} className={selectClass} />
        <MultiSelectFilter label="分类" options={state.categories.map(c => ({value: c.name, label: c.name}))} selected={selectedCategories} onToggle={v => setSelectedCategories(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedCategories(new Set())} className={selectClass} />
        <MultiSelectFilter label="标签" options={tags.map(t => ({value: t.id, label: t.name}))} selected={selectedTags} onToggle={v => setSelectedTags(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; })} onClear={() => setSelectedTags(new Set())} className={selectClass} />
        <div className="relative">
          <button onClick={() => setShowPersonPicker(!showPersonPicker)} className="text-xs px-2 py-1 rounded-md bg-muted/50 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1">
            人员筛选 ({selectedMembers.size || '全部'}) <ChevronDown size={12} />
          </button>
          {showPersonPicker && (
            <div className="absolute z-20 bg-white border rounded-lg shadow-lg p-2 max-h-48 overflow-y-auto min-w-[160px]">
              <label className="flex items-center gap-2 py-0.5 cursor-pointer text-xs">
                <input type="checkbox" checked={selectedMembers.size === 0} onChange={() => setSelectedMembers(new Set())} />
                全部人员
              </label>
              {activeMembers.map(m => (
                <label key={m.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-xs">
                  <input type="checkbox" checked={selectedMembers.has(m.id)} onChange={toggleMember(m.id)} />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <select value={timeRange} onChange={e => setTimeRange(e.target.value)} className={selectClass}>
          <option value="all">全部时间</option>
          <option value="today">今天</option>
          <option value="this_week">本周</option>
          <option value="this_month">本月</option>
          <option value="this_quarter">本季度</option>
        </select>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1"><X size={12} /> 清除 ({activeFilterCount})</button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filteredGoals.length} 条</span>
      </div>

      {viewMode === 'detail' && (
        <div className="space-y-4">
          {topGoals.map(goal => (
            <GoalTreeNode key={goal.id} goal={goal} filteredGoals={filteredGoals} members={state.members} projects={state.projects} expandedGoals={expandedGoals} toggleExpand={toggleExpand} tags={tags} depth={0} onOpenDetail={() => setDetailItem({ type: 'goal', id: goal.id })} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          ))}
          {topGoals.length === 0 && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Target size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'list' && (
        <div>
          {filteredGoals.length > 0 ? (
            <GoalListView goals={filteredGoals} members={state.members} onOpenDetail={id => setDetailItem({ type: 'goal', id })} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          ) : (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Target size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'table' && (
        <div>
          {filteredGoals.length > 0 ? (
            <GoalTableView goals={filteredGoals} members={state.members} onOpenDetail={id => setDetailItem({ type: 'goal', id })} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          ) : (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Target size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'matrix' && (
        <div>
          {filteredGoals.length > 0 ? (
            <GoalMatrixView goals={filteredGoals} members={state.members} onOpenDetail={id => setDetailItem({ type: 'goal', id })} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          ) : (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Target size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'timeline' && (
        <div>
          {filteredGoals.length > 0 ? (
            <GoalTimelineView goals={filteredGoals} members={state.members} onOpenDetail={id => setDetailItem({ type: 'goal', id })} commentCounts={commentCounts} />
          ) : (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Target size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'kanban' && (
        <div>
          {filteredGoals.length > 0 ? (
            <div className="space-y-3">
              <div className="overflow-x-auto -mx-4 px-4 pb-2"><div className="flex gap-4 min-w-max">
                {[
                  { key: 'planning' as const, label: '规划中', color: 'border-t-gray-400' },
                  { key: 'in_progress' as const, label: '进行中', color: 'border-t-blue-500' },
                  { key: 'completed' as const, label: '已完成', color: 'border-t-green-500' },
                  { key: 'paused' as const, label: '已暂停', color: 'border-t-amber-400' },
                ].map(col => {
                  const colGoals = filteredGoals.filter(g => g.status === col.key);
                  const handleGoalDrop = (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.remove('bg-blue-50'); const goalId = e.dataTransfer.getData('text/plain'); if (!goalId || !can('edit_goals') || !col.key) return; dispatch({ type: 'UPDATE_GOAL', payload: { id: goalId, updates: { status: col.key as GoalStatus } } }); };
                  return (
                    <div key={col.key} className={`w-[280px] sm:w-[320px] flex-shrink-0 bg-muted/30 rounded-xl border border-border pt-3`} onDragOver={e => { e.preventDefault(); }} onDrop={handleGoalDrop}>
                      <div className={`flex items-center gap-2 px-4 pb-2 border-b-2 mx-3 mb-3 ${col.color}`}><span className="font-semibold text-sm">{col.label}</span><span className="text-xs text-muted-foreground ml-auto">{colGoals.length}</span></div>
                      <div className="px-3 pb-3 space-y-2 max-h-[60vh] overflow-y-auto">
                        {colGoals.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">拖入目标</p>}
                        {colGoals.map(goal => {
                          const leader = state.members.find(m => m.id === goal.leaderId);
                          return (
                            <div key={goal.id} className="bg-white rounded-lg border border-border shadow-sm p-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing" draggable="true" onDragStart={e => { e.dataTransfer.setData('text/plain', goal.id); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => setDetailItem({ type: 'goal', id: goal.id })}>
                              {batchMode && <div className="mb-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(goal.id)} className="rounded" onChange={() => toggleSelect(goal.id)} /></div>}
                              <div className="font-medium text-sm mb-1.5 truncate">{goal.title}</div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${bizColors[goal.priority]}`}>{bizLabels[goal.priority]}</span>
                                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${goal.progress}%` }} /></div>
                                <span className="text-[10px] font-medium text-muted-foreground">{goal.progress}%</span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{goal.endDate}</span>
                                {leader && <span>{leader.name}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div></div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Target size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      )}

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setShowCreateDialog(false); setShowTemplateDropdown(false); }} />
          <div className="relative bg-white rounded-xl shadow-xl border w-full max-w-lg animate-slide-up max-h-[90vh] flex flex-col">
            <div className="px-5 md:px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold">新建目标</h3>
              <button onClick={() => { setShowCreateDialog(false); setShowTemplateDropdown(false); }} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="px-5 md:px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowTemplateDropdown(!showTemplateDropdown)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1">
                  <FileText size={14} /> 从模板创建 <ChevronDown size={12} />
                </button>
                {showTemplateDropdown && goalTemplates.length > 0 && (
                  <div className="absolute z-30 bg-white border rounded-lg shadow-lg min-w-[200px] max-h-48 overflow-y-auto" style={{ marginTop: '-2px' }}>
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
          </div>
        </div>
      )}

      {detailItem && <ItemDetailPanel isOpen={true} onClose={() => setDetailItem(null)} itemType={detailItem.type} itemId={detailItem.id} />}
    </div>
  );
}
