import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useMemberLookup, usePermissions } from '@/store/hooks';
import type { Project, ProjectStatus, TaskPriority } from '@/types';
import { FolderKanban, Calendar, MoreHorizontal, Edit2, Trash2, GripVertical, ChevronRight, MessageSquare, CheckCircle2, Target, Tag } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { handleError } from '@/lib/errorHandler';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { statusLabels, statusColors, priorityLabels, priorityColors, bpLabels, bpFromPriority, getTouchPos } from './constants';
import type { BatchProps } from './constants';
import { useVirtualScroll } from '@/hooks/useVirtualScroll';

import { KanbanMiniCard, PROJECT_Q_ARROW_MAP, MatrixQuadrantCard, ProjectKanbanView, ProjectMatrixView, ProjectTimelineView, ProjectCanvasView } from './ViewMatrixKanban';
export { ProjectKanbanView, ProjectMatrixView, ProjectTimelineView, ProjectCanvasView };
const ProjectCard = React.memo(function ProjectCard({ project, members, expanded, hasChildren, onToggle, onClick, tags, commentCount, batchMode, isSelected, onToggleSelect }: {
  project: Project; members: { id: string; name: string; avatar: string }[];
  expanded: boolean; hasChildren: boolean; onToggle: () => void;
  onClick: () => void; tags: Array<{ id: string; name: string; color: string }>;
  commentCount: number;
} & BatchProps) {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const [showMenu, setShowMenu] = useState(false);
  const leader = members.find(m => m.id === project.leaderId);
  const supporters = [...new Set((project.supporterIds || []))].map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;
  const goal = state.goals.find(g => g.id === project.goalId);
  const uniqueTags = [...new Set((project.tags || []))];

  return (
    <div data-item-id={project.id} data-item-type="project" className="bg-card rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md border-border">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          {batchMode && <div onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected} readOnly className="mt-1 rounded cursor-pointer" onClick={() => onToggleSelect(project.id)} /></div>}
          <GripVertical size={16} className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing" />
          {hasChildren && <button className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-transform" onClick={e => { e.stopPropagation(); onToggle(); }} aria-label="展开子项目" aria-expanded={expanded}><ChevronRight size={16} className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} /></button>}
          {!hasChildren && <div className="w-4 flex-shrink-0" />}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-orange-100 text-orange-700" onClick={onClick}><FolderKanban size={16} /></div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{project.title}</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[project.status]}`}>{statusLabels[project.status]}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[project.priority]}`}>{bpLabels[bpFromPriority(project.priority)]} · {priorityLabels[project.priority]}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar size={12} />{project.startDate} ~ {project.endDate}</span>
              {project.category && <span className="flex items-center gap-1"><Tag size={12} />{project.category}</span>}
            </div>
          </div>
          <div className="relative flex-shrink-0">
            <button className="p-1 rounded hover:bg-muted" onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }} aria-label="更多操作"><MoreHorizontal size={16} /></button>
            {showMenu && (
              <div className="relative">
                <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenu(false); }} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-card rounded-lg shadow-lg border border-border z-50 py-1">
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); onClick(); setShowMenu(false); }}><Edit2 size={14} /> 编辑</button>
                  {can('edit_projects') && project.status !== 'done' && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_PROJECT', payload: { id: project.id, updates: { status: 'done' } } }); setShowMenu(false); }}><CheckCircle2 size={14} /> 完成</button>}
                  {can('delete_projects') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); if (!confirm('确认删除此项目？')) return; dispatch({ type: 'DELETE_PROJECT', payload: project.id }); setShowMenu(false); }} aria-label="删除项目"><Trash2 size={14} /> 删除</button>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${project.progress}%`, backgroundColor: project.progress >= 80 ? 'hsl(var(--success))' : project.progress >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--warning))' }} />
          </div>
          <span className="text-sm font-bold min-w-[40px] text-right">{project.progress}%</span>
        </div>
        {goal && <div className="flex items-center gap-2 mb-3"><Target size={14} className="text-blue-500" /><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{goal.title}</span></div>}
        {uniqueTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {uniqueTags.map(tagName => { const t = tags.find(tg => tg.name === tagName); return <span key={tagName} className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (t?.color || '#888') + '22', color: t?.color || '#888', border: `1px solid ${(t?.color || '#888')}44` }}>{tagName}</span>; })}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            {leader && (
              <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-primary/40"><span className="text-[10px] font-bold text-primary leading-none">{leader.name.charAt(0)}</span></div>
                <span className="font-medium text-foreground/80">{leader.name}</span>
                <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">主导</span>
              </div></TooltipTrigger><TooltipContent>{`主导人: ${leader.name}`}</TooltipContent></Tooltip>
            )}
            {supporters.length > 0 && (
              <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1 ml-1">
                <span className="text-[10px] text-muted-foreground mr-0.5">支持</span>
                <div className="flex -space-x-1.5">
                  {supporters.slice(0, 4).map(s => <div key={s!.id} className="w-4 h-4 rounded-full bg-muted flex items-center justify-center ring-1 ring-white"><span className="text-[8px] font-medium text-muted-foreground leading-none">{s!.name.charAt(0)}</span></div>)}
                  {supporters.length > 4 && <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center ring-1 ring-white"><span className="text-[8px] text-muted-foreground">+{supporters.length - 4}</span></div>}
                </div>
              </div></TooltipTrigger><TooltipContent>{`支持人: ${supporters.map(s => s!.name).join(', ')}`}</TooltipContent></Tooltip>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><MessageSquare size={12} />{commentCount}</span>
            <span className="text-[10px] text-muted-foreground">{project.taskCount} 个任务</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export const ProjectTreeNode = React.memo(function ProjectTreeNode({ project, filteredProjects, members, expandedIds, toggleExpand, tags, depth, setDetailItem, commentCounts, batchProps, visited }: {
  project: Project; filteredProjects: Project[]; members: { id: string; name: string; avatar: string }[];
  expandedIds: Set<string>; toggleExpand: (id: string) => void;
  tags: Array<{ id: string; name: string; color: string }>; depth: number;
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps; visited?: Set<string> }) {
  if (depth > 10 || (visited && visited.has(project.id))) return null;
  const children = filteredProjects.filter(p => p.parentId === project.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(project.id);
  const nextVisited = new Set(visited); nextVisited.add(project.id);
  return (
    <div>
      <ProjectCard project={project} members={members} expanded={isExpanded} hasChildren={hasChildren} onToggle={() => toggleExpand(project.id)} onClick={() => setDetailItem({ type: 'project', id: project.id })} tags={tags} commentCount={commentCounts[project.id] || 0} batchMode={batchProps.batchMode} isSelected={batchProps.selectedIds.has(project.id)} onToggleSelect={batchProps.onToggleSelect} />
      {hasChildren && isExpanded && (
        <div className="mt-3 space-y-3 border-l-2 border-primary/20 pl-4" style={{ marginLeft: `${Math.min(depth * 20 + 16, 80)}px` }}>
          {children.map(child => <ProjectTreeNode key={child.id} project={child} filteredProjects={filteredProjects} members={members} expandedIds={expandedIds} toggleExpand={toggleExpand} tags={tags} depth={depth + 1} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} visited={nextVisited} />)}
        </div>
      )}
    </div>
  );
});

export function ProjectListView({ projects, members, setDetailItem, commentCounts, batchProps }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps }) {
  const { dispatch } = useStore();
  const { can } = usePermissions();
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  function progressColor(p: number) { return p >= 80 ? 'bg-green-500' : p >= 50 ? 'bg-blue-500' : 'bg-amber-500'; }

  const LIST_ROW_H = 48;
  const needsVirtual = projects.length > 50;
  const virtual = useVirtualScroll({ itemCount: projects.length, rowHeight: LIST_ROW_H });

  const listItem = (project: Project) => {
    const leader = (members || []).find(m => m.id === project.leaderId);
    return (
      <div key={project.id} data-item-id={project.id} data-item-type="project" className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-muted/30 transition-colors group cursor-pointer border-b border-border/50" onClick={() => setDetailItem({ type: 'project', id: project.id })}>
        {batchProps.batchMode && <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(project.id)} className="rounded flex-shrink-0" onChange={() => batchProps.onToggleSelect(project.id)} /></span>}
        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-orange-100 text-orange-700"><FolderKanban size={12} /></div>
        <span className={`text-[11px] px-1.5 py-0.5 rounded flex-shrink-0 ${statusColors[project.status]}`}>{statusLabels[project.status]}</span>
        <div className="flex-1 min-w-0"><span className="text-sm font-medium truncate block">{project.title}</span></div>
        <div className="hidden sm:flex items-center gap-2 w-48 flex-shrink-0">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${progressColor(project.progress)}`} style={{ width: `${project.progress}%` }} /></div>
          <span className="text-xs font-medium text-muted-foreground min-w-[32px] text-right">{project.progress}%</span>
        </div>
        {leader && <div className="hidden md:flex items-center gap-1 flex-shrink-0"><div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[10px] font-bold text-primary">{leader.name.charAt(0)}</span></div></div>}
        <span className="text-[11px] text-muted-foreground flex-shrink-0 hidden sm:inline w-20 text-right">{project.endDate}</span>
        <span className="text-[10px] text-muted-foreground flex-shrink-0 flex items-center gap-0.5"><MessageSquare size={11} />{commentCounts[project.id] || 0}</span>
        <div className="relative flex-shrink-0">
          <button className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); setShowMenuId(showMenuId === project.id ? null : project.id); }} aria-label="更多操作"><MoreHorizontal size={14} /></button>
          {showMenuId === project.id && (
            <div className="relative">
              <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenuId(null); }} />
              <div className="absolute right-0 top-full mt-1 w-32 bg-card rounded-lg shadow-lg border border-border z-50 py-1">
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left" onClick={e => { e.stopPropagation(); setDetailItem({ type: 'project', id: project.id }); setShowMenuId(null); }}><Edit2 size={12} /> 编辑</button>
                {can('delete_projects') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); if (!confirm('确认删除此项目？')) return; dispatch({ type: 'DELETE_PROJECT', payload: project.id }); setShowMenuId(null); }} aria-label="删除项目"><Trash2 size={12} /> 删除</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (needsVirtual) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div ref={virtual.scrollRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }} onScroll={virtual.onScroll}>
          <div style={{ height: virtual.totalHeight, overflow: 'hidden' }}>
            <div style={{ transform: `translateY(${virtual.startIdx * LIST_ROW_H}px)` }}>
              {projects.slice(virtual.startIdx, virtual.endIdx).map(listItem)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border divide-y divide-border/50">
      {projects.map(listItem)}
    </div>
  );
}

export function ProjectTableView({ projects, members, setDetailItem, commentCounts, batchProps }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps }) {
  const { dispatch } = useStore();
  const { can } = usePermissions();
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  const sorted = useMemo(() => {
    if (!sortCol) return projects;
    return [...projects].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol]; const bv = (b as Record<string, unknown>)[sortCol];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [projects, sortCol, sortDir]);
  function toggleSort(col: string) { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } }
  function Th({ col, children }: { col: string; children: React.ReactNode }) {
    return <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 select-none" onClick={() => toggleSort(col)}>{children} {sortCol === col && (sortDir === 'asc' ? '\u2191' : '\u2193')}</th>;
  }
  const TABLE_ROW_H = 42;
  const needsVirtual = sorted.length > 50;
  const virtual = useVirtualScroll({ itemCount: sorted.length, rowHeight: TABLE_ROW_H });
  const visibleSorted = needsVirtual ? sorted.slice(virtual.startIdx, virtual.endIdx) : sorted;

  return (
    <div className="bg-card rounded-xl border border-border overflow-x-auto">
      <div className={needsVirtual ? 'overflow-y-auto' : ''} style={needsVirtual ? { maxHeight: 'calc(100vh - 220px)' } : undefined} ref={needsVirtual ? virtual.scrollRef : undefined} onScroll={needsVirtual ? virtual.onScroll : undefined}>
        <table className="w-full text-sm">
          <thead className={`border-b border-border bg-muted/30${needsVirtual ? ' sticky top-0 z-10' : ''}`}>
            {batchProps.batchMode && <th className="w-10 px-2"><input type="checkbox" checked={batchProps.selectedIds.size === projects.length && projects.length > 0} className="rounded" onChange={e => { e.stopPropagation(); if (batchProps.selectedIds.size === projects.length) projects.forEach(p => batchProps.onToggleSelect(p.id)); else projects.forEach(p => { if (!batchProps.selectedIds.has(p.id)) batchProps.onToggleSelect(p.id); }); }} /></th>}
            <Th col="title">项目名称</Th><Th col="status">状态</Th><Th col="priority">紧急程度</Th><Th col="progress">进度</Th><Th col="leaderId">主导人</Th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">支持人</th><Th col="startDate">开始</Th><Th col="endDate">截止</Th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">分类</th><Th col="taskCount">任务</Th><th className="text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">@</th><th className="w-10"></th>
          </thead>
          <tbody className="divide-y divide-border/50">
            {needsVirtual && virtual.startIdx > 0 && <tr style={{ height: virtual.startIdx * TABLE_ROW_H }} />}
            {visibleSorted.map(project => {
            const leader = (members || []).find(m => m.id === project.leaderId);
            const supporters = (project.supporterIds || []).map(id => (members || []).find(m => m.id === id)).filter(Boolean).map(s => s!.name);
            return (
              <tr key={project.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setDetailItem({ type: 'project', id: project.id })}>
                {batchProps.batchMode && <td className="px-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(project.id)} className="rounded" onChange={() => batchProps.onToggleSelect(project.id)} /></td>}
                <td className="px-4 py-2.5 font-medium max-w-[200px]"><span className="truncate block">{project.title}</span></td>
                <td className="px-4 py-2.5"><span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[project.status]}`}>{statusLabels[project.status]}</span></td>
                <td className="px-4 py-2.5"><span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[project.priority]}`}>{bpLabels[bpFromPriority(project.priority)]} · {priorityLabels[project.priority]}</span></td>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} /></div><span className="text-xs font-semibold">{project.progress}%</span></div></td>
                <td className="px-4 py-2.5">{leader ? <div className="flex items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[10px] font-bold text-primary">{leader.name.charAt(0)}</span></div><span className="text-xs">{leader.name}</span></div> : <span className="text-xs text-muted-foreground">-</span>}</td>
                <td className="px-4 py-2.5">{supporters.length > 0 ? <span className="text-xs text-muted-foreground truncate block max-w-[100px]">{supporters.join(', ')}</span> : <span className="text-xs text-muted-foreground">-</span>}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{project.startDate}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{project.endDate}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{project.category || '-'}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{project.taskCount}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{commentCounts[project.id] || 0}</td>
                <td className="px-4 py-2.5">
                  <div className="relative">
                    <button className="p-1 rounded hover:bg-muted" onClick={e => { e.stopPropagation(); setShowMenuId(showMenuId === project.id ? null : project.id); }} aria-label="更多操作"><MoreHorizontal size={14} /></button>
                    {showMenuId === project.id && (
                      <div className="relative">
                        <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenuId(null); }} />
                        <div className="absolute right-0 top-full mt-1 w-32 bg-card rounded-lg shadow-lg border border-border z-50 py-1">
                          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left" onClick={e => { e.stopPropagation(); setDetailItem({ type: 'project', id: project.id }); setShowMenuId(null); }}><Edit2 size={12} /> 编辑</button>
                          {can('delete_projects') && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); if (!confirm('确认删除此项目？')) return; dispatch({ type: 'DELETE_PROJECT', payload: project.id }); setShowMenuId(null); }} aria-label="删除项目"><Trash2 size={12} /> 删除</button>}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
            })}
            {needsVirtual && virtual.endIdx < sorted.length && <tr style={{ height: (sorted.length - virtual.endIdx) * TABLE_ROW_H }} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
