import { useState, useMemo, useRef, useEffect } from 'react';
import { useStore, useMemberLookup, usePermissions } from '@/store/useStore';
import type { Goal, TaskPriority } from '@/types';
import {
  Target, TrendingUp, Calendar, MoreHorizontal, Edit2, Trash2,
  FolderKanban, GripVertical, ChevronRight, Clock, CheckCircle2,
  ListTodo, LayoutGrid, ArrowUpDown, MessageSquare
} from 'lucide-react';
import {
  type ViewMode, statusLabels, statusColors, typeLabels, typeColors,
  bizLabels, bizColors, progressColor, progressTextColor
} from './constants';

export function GoalCard({ goal, members, projects, expanded, hasChildren, onToggle, tags, onOpenDetail, commentCount, batchMode, selected, onToggleSelect }: {
  goal: Goal;
  members: { id: string; name: string; avatar: string }[];
  projects: { id: string; title: string; goalId: string | null }[];
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  tags: Array<{ id: string; name: string; color: string }>;
  onOpenDetail: () => void;
  commentCount: number;
  batchMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { dispatch } = useStore();
  const { can } = usePermissions();
  const [showMenu, setShowMenu] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const leader = members.find(m => m.id === goal.leaderId);
  const supporters = [...new Set(goal.supporterIds || [])].map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;
  const relatedProjects = projects.filter(p => p.goalId === goal.id);
  const goalTags = tags.filter(t => (goal.tags || []).includes(t.id) || goal.description?.includes(t.name) || goal.title.includes(t.name));

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', goal.id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }
  function handleDragLeave() { setDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== goal.id) {
      dispatch({ type: 'MOVE_GOAL_PARENT', payload: { goalId: draggedId, newParentId: goal.id } });
    }
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${dragOver ? 'border-primary ring-2 ring-primary/30 shadow-md' : 'border-border'}`} draggable onDragStart={handleDragStart} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={onOpenDetail}>
      <div className="p-3 md:p-4">
        <div className="flex items-start gap-2 md:gap-3 mb-3">
          {batchMode ? (
            <button className="flex-shrink-0 mt-1" onClick={e => { e.stopPropagation(); onToggleSelect(); }}>
              <input type="checkbox" checked={selected} readOnly className="w-4 h-4 rounded" />
            </button>
          ) : null}
          <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5" title="拖拽调整层级">
            <GripVertical size={16} />
          </div>
          {hasChildren ? (
            <button className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-transform" onClick={e => { e.stopPropagation(); onToggle(); }}>
              <ChevronRight size={16} className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
            </button>
          ) : <div className="w-4 flex-shrink-0" />}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColors[goal.type]}`}>
            <Target size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 md:gap-2 flex-wrap">
              <h3 className="font-semibold text-xs md:text-sm">{goal.title}</h3>
              <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${typeColors[goal.type]}`}>{typeLabels[goal.type]}</span>
              <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${statusColors[goal.status]}`}>{statusLabels[goal.status]}</span>
              <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${bizColors[goal.priority]}`}>{bizLabels[goal.priority]}</span>
              {commentCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] md:text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  <MessageSquare size={10} /> {commentCount}
                </span>
              )}
              {goalTags.slice(0, 3).map(t => (
                <span key={t.id} className="text-[10px] md:text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: t.color + '22', color: t.color, border: '1px solid ' + t.color + '44' }}>{t.name}</span>
              ))}
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Calendar size={12} />
              <span>{goal.startDate} ~ {goal.endDate}</span>
            </div>
          </div>
          <div className="relative">
            <button className="p-1 rounded hover:bg-muted" onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}>
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="relative">
                <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenu(false); }} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border z-50 py-1">
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); setShowMenu(false); }}><Edit2 size={14} /> 编辑目标</button>
                  {goal.status !== 'completed' && (
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_GOAL', payload: { id: goal.id, updates: { status: 'completed' } } }); setShowMenu(false); }}><CheckCircle2 size={14} /> 标记完成</button>
                  )}
                  {can('delete_goals') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_GOAL', payload: goal.id }); setShowMenu(false); }}><Trash2 size={14} /> 删除目标</button>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressColor(goal.progress)}`} style={{ width: goal.progress + '%' }} />
          </div>
          <span className="text-sm font-bold min-w-[40px] text-right">{goal.progress}%</span>
        </div>
        {goal.keyResults.length > 0 && (
          <div className="space-y-2 mb-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">关键结果</div>
            {goal.keyResults.map(kr => {
              const krProg = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
              return (
                <div key={kr.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28 truncate flex-shrink-0">{kr.title}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: krProg + '%' }} />
                  </div>
                  <span className="text-xs font-medium min-w-[60px] text-right">{kr.currentValue}/{kr.targetValue}{kr.unit}</span>
                </div>
              );
            })}
          </div>
        )}
        {relatedProjects.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <FolderKanban size={14} className="text-muted-foreground" />
            {relatedProjects.slice(0, 3).map(p => <span key={p.id} className="text-xs bg-muted px-2 py-0.5 rounded-md">{p.title}</span>)}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            {leader && (
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-primary/40">
                  <span className="text-[10px] font-bold text-primary leading-none">{leader.name.charAt(0)}</span>
                </div>
                <span className="font-medium text-foreground/80">{leader.name}</span>
                <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">主导</span>
              </div>
            )}
            {supporters.length > 0 && (
              <div className="flex items-center gap-1 ml-1">
                <span className="text-[10px] text-muted-foreground mr-0.5">支持</span>
                <div className="flex -space-x-1.5">
                  {supporters.slice(0, 4).map(s => (
                    <div key={s.id} className="w-4 h-4 rounded-full bg-muted flex items-center justify-center ring-1 ring-white">
                      <span className="text-[8px] font-medium text-muted-foreground leading-none">{s.name.charAt(0)}</span>
                    </div>
                  ))}
                  {supporters.length > 4 && <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center ring-1 ring-white"><span className="text-[8px] text-muted-foreground">+{supporters.length - 4}</span></div>}
                </div>
              </div>
            )}
          </div>
          {goal.category && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{goal.category}</span>}
        </div>
      </div>
    </div>
  );
}

export function GoalTreeNode({ goal, filteredGoals, members, projects, expandedGoals, toggleExpand, tags, depth, onOpenDetail, commentCounts, batchMode, selectedIds, onToggleSelect, visited }: {
  goal: Goal; filteredGoals: Goal[]; members: { id: string; name: string; avatar: string }[];
  projects: { id: string; title: string; goalId: string | null }[];
  expandedGoals: Set<string>; toggleExpand: (id: string) => void;
  tags: Array<{ id: string; name: string; color: string }>; depth: number; onOpenDetail: (id: string) => void;
  commentCounts: Map<string, number>; batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void;
  visited?: Set<string>;
}) {
  if (depth > 10 || (visited && visited.has(goal.id))) return null;
  const children = filteredGoals.filter(g => g.parentId === goal.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedGoals.has(goal.id);
  const nextVisited = new Set(visited); nextVisited.add(goal.id);
  return (
    <div>
      <GoalCard goal={goal} members={members} projects={projects} expanded={isExpanded} hasChildren={hasChildren} onToggle={() => toggleExpand(goal.id)} tags={tags} onOpenDetail={() => onOpenDetail(goal.id)} commentCount={commentCounts.get(goal.id) || 0} batchMode={batchMode} selected={selectedIds.has(goal.id)} onToggleSelect={() => onToggleSelect(goal.id)} />
      {hasChildren && isExpanded && (
        <div className="mt-3 space-y-3 border-l-2 border-primary/20 pl-4" style={{ marginLeft: Math.min(depth * 20 + 16, 80) + 'px' }}>
          {children.map(child => (
            <GoalTreeNode key={child.id} goal={child} filteredGoals={filteredGoals} members={members} projects={projects} expandedGoals={expandedGoals} toggleExpand={toggleExpand} tags={tags} depth={depth + 1} onOpenDetail={onOpenDetail} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} visited={nextVisited} />
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalListView({ goals, members, onOpenDetail, commentCounts, batchMode, selectedIds, onToggleSelect }: { goals: Goal[]; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Map<string, number>; batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }) {
  const { dispatch } = useStore();
  const { can } = usePermissions();
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  type TreeItem = { goal: Goal; depth: number; connector: string; parentTitle: string };
  const treeItems = useMemo(() => {
    const goalMap = new Map<string, Goal>();
    goals.forEach(g => goalMap.set(g.id, g));
    const roots: Goal[] = [];
    const childMap = new Map<string, Goal[]>();
    goals.forEach(g => {
      if (g.parentId && goalMap.has(g.parentId)) {
        if (!childMap.has(g.parentId)) childMap.set(g.parentId, []);
        const arr = childMap.get(g.parentId);
        if (arr) arr.push(g);
      } else {
        roots.push(g);
      }
    });
    const result: TreeItem[] = [];
    function walk(goal: Goal, depth: number, connector: string) {
      const parentTitle = goal.parentId ? (goalMap.get(goal.parentId)?.title || '') : '';
      result.push({ goal, depth, connector, parentTitle });
      const kids = childMap.get(goal.id) || [];
      kids.forEach((child, i) => {
        walk(child, depth + 1, i === kids.length - 1 ? '└ ' : '├ ');
      });
    }
    roots.forEach(r => walk(r, 0, ''));
    return result;
  }, [goals]);

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const childrenMap = useMemo(() => {
    const m = new Map<string, TreeItem[]>();
    for (const item of treeItems) {
      const pid = item.goal.parentId;
      if (pid) { if (!m.has(pid)) m.set(pid, []); m.get(pid)!.push(item); }
    }
    return m;
  }, [treeItems]);

  const visibleItems = useMemo(() => {
    const result: TreeItem[] = [];
    let skipDepth = -1;
    for (const item of treeItems) {
      if (skipDepth >= 0 && item.depth > skipDepth) continue;
      skipDepth = -1;
      if ((childrenMap.get(item.goal.id)?.length || 0) > 0 && !expandedIds.has(item.goal.id)) skipDepth = item.depth;
      result.push(item);
    }
    return result;
  }, [treeItems, expandedIds, childrenMap]);

  return (
    <div className="bg-white rounded-xl border divide-y">
      {visibleItems.map(item => {
        const { goal, depth, connector, parentTitle } = item;
        const leader = members.find(m => m.id === goal.leaderId);
        const hasKids = (childrenMap.get(goal.id)?.length || 0) > 0;
        const cc = commentCounts.get(goal.id) || 0;
        return (
          <div key={goal.id} className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 hover:bg-muted/30 transition-colors group cursor-pointer" style={{ paddingLeft: (16 + depth * 24) + 'px' }} onClick={() => onOpenDetail(goal.id)}>
            {batchMode && (
              <button className="flex-shrink-0" onClick={e => { e.stopPropagation(); onToggleSelect(goal.id); }}>
                <input type="checkbox" checked={selectedIds.has(goal.id)} readOnly className="w-3.5 h-3.5 rounded" />
              </button>
            )}
            {depth > 0 && <span className="text-xs text-primary/40 flex-shrink-0 select-none w-4">{connector}</span>}
            {hasKids ? (
              <button className="flex-shrink-0 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); toggle(goal.id); }}>
                <ChevronRight size={14} className={`transition-transform duration-200 ${expandedIds.has(goal.id) ? 'rotate-90' : ''}`} />
              </button>
            ) : <div className="w-3.5 flex-shrink-0" />}
            <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${typeColors[goal.type]}`}><Target size={12} /></div>
            <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${statusColors[goal.status]}`}>{statusLabels[goal.status]}</span>
            <div className="flex-1 min-w-0"><span className="text-xs md:text-sm font-medium truncate block">{goal.title}</span></div>
            {cc > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0"><MessageSquare size={10} />{cc}</span>}
            {goal.parentId && parentTitle && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex-shrink-0 max-w-[120px] truncate hidden sm:inline">子←{parentTitle}</span>}
            <div className="flex items-center gap-2 w-36 md:w-44 flex-shrink-0">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${progressColor(goal.progress)}`} style={{ width: goal.progress + '%' }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground min-w-[32px] text-right">{goal.progress}%</span>
            </div>
            {leader && (
              <div className="flex items-center gap-1 flex-shrink-0 hidden md:flex">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[10px] font-bold text-primary">{leader.name.charAt(0)}</span></div>
              </div>
            )}
            <span className="text-[10px] md:text-xs text-muted-foreground flex-shrink-0 w-20 text-right hidden sm:inline">{goal.endDate}</span>
            <div className="relative flex-shrink-0">
              <button className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); setShowMenuId(showMenuId === goal.id ? null : goal.id); }}><MoreHorizontal size={14} /></button>
              {showMenuId === goal.id && (
                <div className="relative">
                  <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenuId(null); }} />
                  <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border z-50 py-1">
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left" onClick={e => { e.stopPropagation(); }}><Edit2 size={12} /> 编辑</button>
                    {can('delete_goals') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_GOAL', payload: goal.id }); setShowMenuId(null); }}><Trash2 size={12} /> 删除</button>}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GoalTableView({ goals, members, onOpenDetail, commentCounts, batchMode, selectedIds, onToggleSelect }: { goals: Goal[]; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Map<string, number>; batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }) {
  const { dispatch } = useStore();
  const { can } = usePermissions();
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: string) {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setSortKey(key); setSortDir('asc'); }
  }

  const goalMap = useMemo(() => {
    const m = new Map<string, Goal>();
    goals.forEach(g => m.set(g.id, g));
    return m;
  }, [goals]);

  const treeSorted = useMemo(() => {
    const roots: Goal[] = [];
    const childMap = new Map<string, Goal[]>();
    goals.forEach(g => {
      if (g.parentId && goalMap.has(g.parentId)) {
        if (!childMap.has(g.parentId)) childMap.set(g.parentId, []);
        const arr = childMap.get(g.parentId);
        if (arr) arr.push(g);
      } else {
        roots.push(g);
      }
    });
    const result: Array<{ goal: Goal; depth: number; connector: string }> = [];
    function walk(goal: Goal, depth: number, connector: string) {
      result.push({ goal, depth, connector });
      const kids = childMap.get(goal.id) || [];
      kids.forEach((child, i) => {
        walk(child, depth + 1, i === kids.length - 1 ? '└ ' : '├ ');
      });
    }
    roots.forEach(r => walk(r, 0, ''));
    return result;
  }, [goals, goalMap]);

  const sorted = useMemo(() => {
    const sortableKeys = ['title', 'status', 'priority', 'progress', 'leaderId', 'endDate', 'category', 'type'];
    if (sortableKeys.includes(sortKey)) {
      const arr = [...treeSorted];
      arr.sort((a, b) => {
        let va: any = a.goal[sortKey as keyof Goal];
        let vb: any = b.goal[sortKey as keyof Goal];
        if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb as string).toLowerCase(); }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      return arr;
    }
    return treeSorted;
  }, [treeSorted, sortKey, sortDir]);

  const columns: Array<{ key: string; label: string }> = [
    { key: 'title', label: '目标名称' }, { key: 'level', label: '层级' }, { key: 'type', label: '类型' }, { key: 'status', label: '状态' },
    { key: 'priority', label: '重要程度' }, { key: 'progress', label: '进度' }, { key: 'leaderId', label: '主导人' },
    { key: 'endDate', label: '截止日期' }, { key: 'category', label: '分类' },
  ];

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-muted-foreground/50" />;
    return <span className="text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <table className="w-full text-xs md:text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            {batchMode && <th className="w-8" />}
            {columns.map(col => (
              <th key={col.key} className="text-left px-3 md:px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort(col.key)}>
                <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map(({ goal, depth, connector }) => {
            const leader = members.find(m => m.id === goal.leaderId);
            const parentGoal = goal.parentId ? goalMap.get(goal.parentId) : null;
            const cc = commentCounts.get(goal.id) || 0;
            return (
              <tr key={goal.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onOpenDetail(goal.id)}>
                {batchMode && (
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onToggleSelect(goal.id)}><input type="checkbox" checked={selectedIds.has(goal.id)} readOnly className="w-3.5 h-3.5 rounded" /></button>
                  </td>
                )}
                <td className="px-3 md:px-4 py-2.5 font-medium max-w-[200px]" style={{ paddingLeft: (16 + depth * 20) + 'px' }}>
                  <span className="truncate block">
                    {depth > 0 && <span className="text-xs text-primary/40 mr-1 select-none">{connector}</span>}
                    {goal.title}
                  </span>
                </td>
                <td className="px-3 md:px-4 py-2.5 text-xs hidden md:table-cell">
                  {parentGoal ? <span className="text-muted-foreground truncate block max-w-[120px]">子←{parentGoal.title}</span> : <span className="text-muted-foreground/50">顶级</span>}
                </td>
                <td className="px-3 md:px-4 py-2.5"><span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${typeColors[goal.type]}`}>{typeLabels[goal.type]}</span></td>
                <td className="px-3 md:px-4 py-2.5"><span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${statusColors[goal.status]}`}>{statusLabels[goal.status]}</span></td>
                <td className="px-3 md:px-4 py-2.5 hidden sm:table-cell"><span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${bizColors[goal.priority]}`}>{bizLabels[goal.priority]}</span></td>
                <td className="px-3 md:px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-12 md:w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: goal.progress + '%' }} /></div>
                    <span className={`text-xs font-semibold ${progressTextColor(goal.progress)}`}>{goal.progress}%</span>
                  </div>
                </td>
                <td className="px-3 md:px-4 py-2.5 hidden lg:table-cell">
                  {leader ? <div className="flex items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[10px] font-bold text-primary">{leader.name.charAt(0)}</span></div><span className="text-xs">{leader.name}</span></div> : <span className="text-xs text-muted-foreground">-</span>}
                </td>
                <td className="px-3 md:px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">{goal.endDate}</td>
                <td className="px-3 md:px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">{goal.category || '-'}</td>
                <td className="px-3 md:px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    {cc > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded-full">{cc}</span>}
                    <div className="relative">
                      <button className="p-1 rounded hover:bg-muted" onClick={e => { e.stopPropagation(); setShowMenuId(showMenuId === goal.id ? null : goal.id); }}><MoreHorizontal size={14} /></button>
                      {showMenuId === goal.id && (
                        <div className="relative">
                          <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenuId(null); }} />
                          <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border z-50 py-1">
                            <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left" onClick={e => { e.stopPropagation(); }}><Edit2 size={12} /> 编辑</button>
                            {can('delete_goals') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_GOAL', payload: goal.id }); setShowMenuId(null); }}><Trash2 size={12} /> 删除</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GoalMatrixQuadrantCard({ goal, members, onOpenDetail, commentCounts, dragRef }: { goal: Goal; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Map<string, number>; dragRef: React.MutableRefObject<{ id: string; el: HTMLElement } | null> }) {
  const leader = members.find(m => m.id === goal.leaderId);
  const cc = commentCounts.get(goal.id) || 0;
  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { id: goal.id, el: e.currentTarget };
    e.currentTarget.classList.add('opacity-30', 'scale-95');
  };
  return (
    <div className="bg-white rounded-lg border p-2.5 md:p-3 hover:shadow-sm transition-shadow cursor-pointer select-none" onMouseDown={handleDown} onTouchStart={handleDown} onClick={() => onOpenDetail(goal.id)}>
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-xs font-medium truncate flex-1">{goal.title}</span>
        <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${bizColors[goal.priority]}`}>{bizLabels[goal.priority]}</span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] px-1 py-0.5 rounded ${statusColors[goal.status]}`}>{statusLabels[goal.status]}</span>
        {cc > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded-full">{cc}</span>}
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: goal.progress + '%' }} />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">{goal.progress}%</span>
      </div>
      <div className="flex items-center justify-between">
        {leader && <div className="flex items-center gap-1"><div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[8px] font-bold text-primary">{leader.name.charAt(0)}</span></div><span className="text-[10px] text-muted-foreground">{leader.name}</span></div>}
        <span className="text-[10px] text-muted-foreground">{goal.endDate}</span>
      </div>
    </div>
  );
}

function GoalMatrixQuadrantBox({ qKey, quadrants, grouped, quadrantBoxRefs, members, onOpenDetail, commentCounts, dragRef }: { qKey: string; quadrants: Record<string, { title: string; accent: string; hoverAccent: string; priorityMap: TaskPriority }>; grouped: Record<string, Goal[]>; quadrantBoxRefs: React.MutableRefObject<Record<string, HTMLElement | null>>; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Map<string, number>; dragRef: React.MutableRefObject<{ id: string; el: HTMLElement } | null> }) {
  const q = quadrants[qKey];
  const items = grouped[qKey];
  return (
    <div data-quadrant={qKey} ref={el => { quadrantBoxRefs.current[qKey] = el; }} className={`rounded-xl border p-2.5 md:p-3 min-h-[160px] md:min-h-[200px] ${q.accent}`}>
      <div className="text-xs font-bold mb-3 text-foreground/70">{q.title} ({items.length})</div>
      <div className="space-y-2">
        {items.map(g => <GoalMatrixQuadrantCard key={g.id} goal={g} members={members} onOpenDetail={onOpenDetail} commentCounts={commentCounts} dragRef={dragRef} />)}
        {items.length === 0 && <div className="text-xs text-muted-foreground/50 py-4 text-center">拖拽目标到此区域</div>}
      </div>
    </div>
  );
}

export function GoalMatrixView({ goals, members, onOpenDetail, commentCounts, batchMode, selectedIds, onToggleSelect }: { goals: Goal[]; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Map<string, number>; batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }) {
  const { dispatch } = useStore();
  const dragRef = useRef<{ id: string; el: HTMLElement } | null>(null);
  const hoverQRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const quadrantBoxRefs = useRef<Record<string, HTMLElement | null>>({});

  function getQuadrant(g: Goal): string {
    if (g.priority === 'urgent') return 'Q1';
    if (g.priority === 'high') return 'Q2';
    if (g.priority === 'medium') return 'Q3';
    return 'Q4';
  }

  const quadrants: Record<string, { title: string; accent: string; hoverAccent: string; priorityMap: TaskPriority }> = {
    Q1: { title: '紧急重要 (S/A)', accent: 'border-red-200 bg-red-50/30', hoverAccent: 'border-red-300 bg-red-50/60 ring-2 ring-red-200', priorityMap: 'urgent' },
    Q2: { title: '重要不紧急 (A/B)', accent: 'border-blue-200 bg-blue-50/30', hoverAccent: 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-200', priorityMap: 'high' },
    Q3: { title: '紧急不重要 (S/C)', accent: 'border-amber-200 bg-amber-50/30', hoverAccent: 'border-amber-300 bg-amber-50/60 ring-2 ring-amber-200', priorityMap: 'medium' },
    Q4: { title: '不紧急不重要 (B/C)', accent: 'border-gray-200 bg-gray-50/30', hoverAccent: 'border-gray-300 bg-gray-50/60 ring-2 ring-gray-200', priorityMap: 'low' },
  };

  const grouped: Record<string, Goal[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  goals.forEach(g => { grouped[getQuadrant(g)].push(g); });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      let found = false;
      for (const [key, el] of Object.entries(quadrantBoxRefs.current)) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          if (hoverQRef.current !== key) {
            hoverQRef.current = key;
            Object.entries(quadrantBoxRefs.current).forEach(([k, box]) => {
              if (!box) return;
              if (k === key) { box.className = box.className.replace(quadrants[k].accent, quadrants[k].hoverAccent); }
              else { box.className = box.className.replace(quadrants[k].hoverAccent, quadrants[k].accent); }
            });
          }
          found = true;
          break;
        }
      }
      if (!found && hoverQRef.current) {
        const prevKey = hoverQRef.current;
        hoverQRef.current = null;
        const box = quadrantBoxRefs.current[prevKey];
        if (box) box.className = box.className.replace(quadrants[prevKey].hoverAccent, quadrants[prevKey].accent);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current || !e.touches[0]) return;
      const touch = e.touches[0];
      let found = false;
      for (const [key, el] of Object.entries(quadrantBoxRefs.current)) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          if (hoverQRef.current !== key) {
            hoverQRef.current = key;
            Object.entries(quadrantBoxRefs.current).forEach(([k, box]) => {
              if (!box) return;
              if (k === key) { box.className = box.className.replace(quadrants[k].accent, quadrants[k].hoverAccent); }
              else { box.className = box.className.replace(quadrants[k].hoverAccent, quadrants[k].accent); }
            });
          }
          found = true;
          break;
        }
      }
      if (!found && hoverQRef.current) {
        const prevKey = hoverQRef.current;
        hoverQRef.current = null;
        const box = quadrantBoxRefs.current[prevKey];
        if (box) box.className = box.className.replace(quadrants[prevKey].hoverAccent, quadrants[prevKey].accent);
      }
    };
    const onUp = () => {
      if (dragRef.current) {
        if (dragRef.current.el) dragRef.current.el.classList.remove('opacity-30', 'scale-95');
        if (hoverQRef.current && quadrants[hoverQRef.current]) {
          dispatch({ type: 'UPDATE_GOAL', payload: { id: dragRef.current.id, updates: { priority: quadrants[hoverQRef.current].priorityMap } } });
        }
        const prevHover = hoverQRef.current;
        dragRef.current = null;
        if (prevHover && quadrantBoxRefs.current[prevHover]) {
          const box = quadrantBoxRefs.current[prevHover];
          if (box) box.className = box.className.replace(quadrants[prevHover].hoverAccent, quadrants[prevHover].accent);
        }
        hoverQRef.current = null;
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [dispatch]);

  return (
    <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 gap-3 select-none">
      {(['Q1','Q2','Q3','Q4'] as const).map(qKey => (
        <GoalMatrixQuadrantBox key={qKey} qKey={qKey} quadrants={quadrants} grouped={grouped} quadrantBoxRefs={quadrantBoxRefs} members={members} onOpenDetail={onOpenDetail} commentCounts={commentCounts} dragRef={dragRef} />
      ))}
    </div>
  );
}

export function GoalTimelineView({ goals, members, onOpenDetail, commentCounts }: { goals: Goal[]; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Map<string, number> }) {
  const sorted = useMemo(() => [...goals].sort((a, b) => a.endDate.localeCompare(b.endDate)), [goals]);
  const buckets: Record<string, Goal[]> = {};
  sorted.forEach(g => {
    const key = g.endDate;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(g);
  });
  const dateKeys = Object.keys(buckets).sort();
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {dateKeys.map(date => {
        const isOverdue = date < todayStr;
        const isToday = date === todayStr;
        return (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`text-sm font-bold ${isOverdue ? 'text-red-500' : isToday ? 'text-primary' : 'text-foreground'}`}>
                {date}
                {isToday && <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">今天</span>}
                {isOverdue && <span className="ml-1 text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">已逾期</span>}
              </div>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">{buckets[date].length} 个目标</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {buckets[date].map(goal => {
                const leader = members.find(m => m.id === goal.leaderId);
                const cc = commentCounts.get(goal.id) || 0;
                return (
                  <div key={goal.id} className="bg-white rounded-lg border p-2.5 md:p-3 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => onOpenDetail(goal.id)}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${statusColors[goal.status]}`}>{statusLabels[goal.status]}</span>
                      <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded ${bizColors[goal.priority]}`}>{bizLabels[goal.priority]}</span>
                      {cc > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded-full">{cc}</span>}
                    </div>
                    <div className="text-xs md:text-sm font-medium truncate mb-2">{goal.title}</div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${progressColor(goal.progress)}`} style={{ width: goal.progress + '%' }} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{goal.progress}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      {leader && <div className="flex items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[10px] font-bold text-primary">{leader.name.charAt(0)}</span></div><span className="text-[10px] text-muted-foreground">{leader.name}</span></div>}
                      <span className="text-[10px] text-muted-foreground">{goal.type === 'okr' ? 'OKR' : goal.type === 'kpi' ? 'KPI' : '里程碑'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
