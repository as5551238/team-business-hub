import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { usePermissions } from '@/store/hooks';
import type { Goal, TaskPriority } from '@/types';
import { useVirtualScroll } from '@/hooks/useVirtualScroll';
import {
  Target, Calendar, MoreHorizontal, Edit2, Trash2,
  FolderKanban, GripVertical, ChevronRight, CheckCircle2,
  MessageSquare
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  statusLabels, statusColors, typeLabels, typeColors,
  bizLabels, bizColors, progressColor
} from './constants';

export const GoalCard = React.memo(function GoalCard({ goal, members, projects, expanded, hasChildren, onToggle, tags, onOpenDetail, commentCount, batchMode, selected, onToggleSelect }: {
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
  const supporters = [...new Set(goal.supporterIds ?? [])].map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;
  const relatedProjects = projects.filter(p => p.goalId === goal.id);
  const goalTags = tags.filter(t => (goal.tags ?? []).includes(t.id) || goal.description?.includes(t.name) || goal.title.includes(t.name));

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
    <div data-item-id={goal.id} data-item-type="goal" className={`bg-card rounded-xl border shadow-sm overflow-hidden transition-all ${dragOver ? 'border-primary ring-2 ring-primary/30 shadow-md' : 'border-border'}`} draggable onDragStart={handleDragStart} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={onOpenDetail}>
      <div className="p-3 md:p-4">
        <div className="flex items-start gap-2 md:gap-3 mb-3">
          {batchMode ? (
            <button className="flex-shrink-0 mt-1" onClick={e => { e.stopPropagation(); onToggleSelect(); }}>
              <input type="checkbox" checked={selected} readOnly className="w-4 h-4 rounded" />
            </button>
          ) : null}
          <Tooltip><TooltipTrigger asChild><div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5">
            <GripVertical size={16} />
          </div></TooltipTrigger><TooltipContent>拖拽调整层级</TooltipContent></Tooltip>
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
            <button className="p-1 rounded hover:bg-muted" onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }} aria-label="更多操作">
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="relative">
                <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenu(false); }} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-card rounded-lg shadow-lg border z-50 py-1">
                  {can('goals_edit') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); setShowMenu(false); }}><Edit2 size={14} /> 编辑目标</button>}
                  {can('goals_edit') && goal.status !== 'done' && (
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_GOAL', payload: { id: goal.id, updates: { status: 'done' } } }); setShowMenu(false); }}><CheckCircle2 size={14} /> 标记完成</button>
                  )}
                  {can('goals_delete') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); if (!confirm('确认删除此目标？')) return; dispatch({ type: 'DELETE_GOAL', payload: goal.id }); setShowMenu(false); }}><Trash2 size={14} /> 删除目标</button>}
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
          {goal.dualTrack && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
              goal.dualTrack.kpi.overallStatus === 'green' ? 'text-green-600 bg-green-50 border-green-200' :
              goal.dualTrack.kpi.overallStatus === 'yellow' ? 'text-amber-600 bg-amber-50 border-amber-200' :
              'text-red-600 bg-red-50 border-red-200'
            }`}>KPI {goal.dualTrack.kpi.weightedScore}分</span>
          )}
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
});

export const GoalTreeNode = React.memo(function GoalTreeNode({ goal, filteredGoals, members, projects, expandedGoals, toggleExpand, tags, depth, onOpenDetail, commentCounts, batchMode, selectedIds, onToggleSelect, visited }: {
  goal: Goal; filteredGoals: Goal[]; members: { id: string; name: string; avatar: string }[];
  projects: { id: string; title: string; goalId: string | null }[];
  expandedGoals: Set<string>; toggleExpand: (id: string) => void;
  tags: Array<{ id: string; name: string; color: string }>; depth: number; onOpenDetail: (id: string) => void;
  commentCounts: Record<string, number>; batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void;
  visited?: Set<string>;
}) {
  if (depth > 10 || (visited && visited.has(goal.id))) return null;
  const children = filteredGoals.filter(g => g.parentId === goal.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedGoals.has(goal.id);
  const nextVisited = new Set(visited); nextVisited.add(goal.id);
  return (
    <div>
      <GoalCard goal={goal} members={members} projects={projects} expanded={isExpanded} hasChildren={hasChildren} onToggle={() => toggleExpand(goal.id)} tags={tags} onOpenDetail={() => onOpenDetail(goal.id)} commentCount={commentCounts[goal.id] || 0} batchMode={batchMode} selected={selectedIds.has(goal.id)} onToggleSelect={() => onToggleSelect(goal.id)} />
      {hasChildren && isExpanded && (
        <div className="mt-3 space-y-3 border-l-2 border-primary/20 pl-4" style={{ marginLeft: Math.min(depth * 20 + 16, 80) + 'px' }}>
          {children.map(child => (
            <GoalTreeNode key={child.id} goal={child} filteredGoals={filteredGoals} members={members} projects={projects} expandedGoals={expandedGoals} toggleExpand={toggleExpand} tags={tags} depth={depth + 1} onOpenDetail={onOpenDetail} commentCounts={commentCounts} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} visited={nextVisited} />
          ))}
        </div>
      )}
    </div>
  );
});

export function GoalListView({ goals, members, onOpenDetail, commentCounts, batchMode, selectedIds, onToggleSelect }: { goals: Goal[]; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Record<string, number>; batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }) {
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

  const LIST_ROW_H = 48;
  const needsVirtual = visibleItems.length > 50;
  const virtual = useVirtualScroll({ itemCount: visibleItems.length, rowHeight: LIST_ROW_H });

  const listItem = (item: TreeItem) => {
    const { goal, depth, connector, parentTitle } = item;
    const leader = members.find(m => m.id === goal.leaderId);
    const hasKids = (childrenMap.get(goal.id)?.length || 0) > 0;
    const cc = commentCounts[goal.id] || 0;
    return (
      <div key={goal.id} data-item-id={goal.id} data-item-type="goal" className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 hover:bg-muted/30 transition-colors group cursor-pointer border-b border-border/50" style={{ paddingLeft: (16 + depth * 24) + 'px' }} onClick={() => onOpenDetail(goal.id)}>
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
          <button className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); setShowMenuId(showMenuId === goal.id ? null : goal.id); }} aria-label="更多操作"><MoreHorizontal size={14} /></button>
          {showMenuId === goal.id && (
            <div className="relative">
              <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenuId(null); }} />
              <div className="absolute right-0 top-full mt-1 w-32 bg-card rounded-lg shadow-lg border z-50 py-1">
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left" onClick={e => { e.stopPropagation(); }}><Edit2 size={12} /> 编辑</button>
                {can('goals_delete') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); if (!confirm('确认删除此目标？')) return; dispatch({ type: 'DELETE_GOAL', payload: goal.id }); setShowMenuId(null); }}><Trash2 size={12} /> 删除</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (needsVirtual) {
    return (
      <div className="bg-card rounded-xl border overflow-hidden">
        <div ref={virtual.scrollRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }} onScroll={virtual.onScroll}>
          <div style={{ height: virtual.totalHeight, overflow: 'hidden' }}>
            <div style={{ transform: `translateY(${virtual.startIdx * LIST_ROW_H}px)` }}>
              {visibleItems.slice(virtual.startIdx, virtual.endIdx).map(listItem)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border divide-y">
      {visibleItems.map(listItem)}
    </div>
  );
}

const GOAL_Q_ARROW_MAP: Record<string, { up?: string; down?: string; left?: string; right?: string }> = {
  Q1: { down: 'Q2', right: 'Q3' },
  Q2: { up: 'Q1', right: 'Q4' },
  Q3: { down: 'Q4', left: 'Q1' },
  Q4: { up: 'Q3', left: 'Q2' },
};

const GoalMatrixQuadrantCard = React.memo(function GoalMatrixQuadrantCard({ goal, members, onOpenDetail, commentCounts, dragRef, dragMovedRef, currentQuadrant, dispatch, canEdit }: { goal: Goal; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Record<string, number>; dragRef: React.MutableRefObject<{ id: string; el: HTMLElement } | null>; dragMovedRef: React.MutableRefObject<boolean>; currentQuadrant: string; dispatch: React.Dispatch<unknown>; canEdit: boolean }) {
  const leader = members.find(m => m.id === goal.leaderId);
  const cc = commentCounts[goal.id] || 0;
  const focusAfterMoveId = React.useRef<string | null>(null);
  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return;
    e.preventDefault();
    dragMovedRef.current = false;
    dragRef.current = { id: goal.id, el: e.currentTarget };
    e.currentTarget.classList.add('opacity-30', 'scale-95');
  };
  function handleGoalKeyDown(e: React.KeyboardEvent) {
    if (e.altKey && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      const arrows = GOAL_Q_ARROW_MAP[currentQuadrant];
      if (!arrows) return;
      let tq: string | undefined;
      if (e.key === 'ArrowUp') tq = arrows.up;
      else if (e.key === 'ArrowDown') tq = arrows.down;
      else if (e.key === 'ArrowLeft') tq = arrows.left;
      else if (e.key === 'ArrowRight') tq = arrows.right;
      if (tq && canEdit) {
        e.preventDefault();
        // Q1→urgent Q2→high Q3→medium Q4→low
        const pMap: Record<string, string> = { Q1: 'urgent', Q2: 'high', Q3: 'medium', Q4: 'low' };
        dispatch({ type: 'UPDATE_GOAL', payload: { id: goal.id, updates: { priority: pMap[tq] } } });
        focusAfterMoveId.current = goal.id;
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenDetail(goal.id);
    }
  }
  return (
    <div
      data-goal-id={goal.id}
      tabIndex={0}
      role="option"
      aria-label={`${goal.title}, 象限: ${currentQuadrant}, 优先级: ${goal.priority}`}
      className="bg-card rounded-lg border p-2.5 md:p-3 hover:shadow-sm transition-shadow cursor-pointer select-none focus:ring-2 focus:ring-primary focus:outline-none"
      onMouseDown={handleDown}
      onTouchStart={handleDown}
      onClick={() => { if (!dragMovedRef.current) onOpenDetail(goal.id); }}
      onKeyDown={handleGoalKeyDown}
    >
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
});

function GoalMatrixQuadrantBox({ qKey, quadrants, grouped, quadrantBoxRefs, members, onOpenDetail, commentCounts, dragRef, dragMovedRef, dispatch, canEdit }: { qKey: string; quadrants: Record<string, { title: string; accent: string; hoverAccent: string; priorityMap: TaskPriority }>; grouped: Record<string, Goal[]>; quadrantBoxRefs: React.MutableRefObject<Record<string, HTMLElement | null>>; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Record<string, number>; dragRef: React.MutableRefObject<{ id: string; el: HTMLElement } | null>; dragMovedRef: React.MutableRefObject<boolean>; dispatch: React.Dispatch<unknown>; canEdit: boolean }) {
  const q = quadrants[qKey];
  const items = grouped[qKey];
  return (
    <div data-quadrant={qKey} ref={el => { quadrantBoxRefs.current[qKey] = el; }} role="listbox" aria-label={`${q.title} 目标列表`} className={`rounded-xl border p-2.5 md:p-3 min-h-[160px] md:min-h-[200px] ${q.accent}`}>
      <div className="text-xs font-bold mb-3 text-foreground/70">{q.title} ({items.length})</div>
      <div className="space-y-2">
        {items.map(g => <GoalMatrixQuadrantCard key={g.id} goal={g} members={members} onOpenDetail={onOpenDetail} commentCounts={commentCounts} dragRef={dragRef} dragMovedRef={dragMovedRef} currentQuadrant={qKey} dispatch={dispatch} canEdit={canEdit} />)}
        {items.length === 0 && <div className="text-xs text-muted-foreground/50 py-4 text-center">拖拽目标到此区域</div>}
      </div>
    </div>
  );
}

export function GoalMatrixView({ goals, members, onOpenDetail, commentCounts, batchMode, selectedIds, onToggleSelect }: { goals: Goal[]; members: { id: string; name: string; avatar: string }[]; onOpenDetail: (id: string) => void; commentCounts: Record<string, number>; batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }) {
  const { dispatch } = useStore();
  const { can } = usePermissions();
  const dragRef = useRef<{ id: string; el: HTMLElement } | null>(null);
  const dragMovedRef = useRef(false);
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
        if (hoverQRef.current && quadrants[hoverQRef.current] && can('goals_edit')) {
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
        <GoalMatrixQuadrantBox key={qKey} qKey={qKey} quadrants={quadrants} grouped={grouped} quadrantBoxRefs={quadrantBoxRefs} members={members} onOpenDetail={onOpenDetail} commentCounts={commentCounts} dragRef={dragRef} dispatch={dispatch} canEdit={can('goals_edit')} />
      ))}
    </div>
  );
}
