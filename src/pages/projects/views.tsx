import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore, useMemberLookup } from '@/store/useStore';
import type { Project, ProjectStatus, TaskPriority } from '@/types';
import { FolderKanban, Calendar, MoreHorizontal, Edit2, Trash2, GripVertical, ChevronRight, MessageSquare, CheckCircle2, Target, Tag } from 'lucide-react';
import { statusLabels, statusColors, priorityLabels, priorityColors, bpLabels, bpFromPriority, getTouchPos } from './constants';
import type { BatchProps } from './constants';

function ProjectCard({ project, members, expanded, hasChildren, onToggle, onClick, tags, commentCount, batchMode, isSelected, onToggleSelect }: {
  project: Project; members: { id: string; name: string; avatar: string }[];
  expanded: boolean; hasChildren: boolean; onToggle: () => void;
  onClick: () => void; tags: Array<{ id: string; name: string; color: string }>;
  commentCount: number;
} & BatchProps) {
  const { dispatch } = useStore();
  const [showMenu, setShowMenu] = useState(false);
  const leader = members.find(m => m.id === project.leaderId);
  const supporters = [...new Set((project.supporterIds || []))].map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;
  const goal = useStore(s => s.state.goals.find(g => g.id === project.goalId));
  const uniqueTags = [...new Set((project.tags || []))];

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md border-border">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          {batchMode && <input type="checkbox" checked={isSelected} className="mt-1 rounded" onChange={e => { e.stopPropagation(); onToggleSelect(project.id); }} />}
          <GripVertical size={16} className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing" />
          {hasChildren && <button className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-transform" onClick={e => { e.stopPropagation(); onToggle(); }}><ChevronRight size={16} className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} /></button>}
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
            <button className="p-1 rounded hover:bg-muted" onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}><MoreHorizontal size={16} /></button>
            {showMenu && (
              <div className="relative">
                <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenu(false); }} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-border z-50 py-1">
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); onClick(); setShowMenu(false); }}><Edit2 size={14} /> 编辑</button>
                  {project.status !== 'completed' && <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_PROJECT', payload: { id: project.id, updates: { status: 'completed' } } }); setShowMenu(false); }}><CheckCircle2 size={14} /> 完成</button>}
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_PROJECT', payload: project.id }); setShowMenu(false); }}><Trash2 size={14} /> 删除</button>
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
              <div className="flex items-center gap-1" title={`主导人: ${leader.name}`}>
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-primary/40"><span className="text-[10px] font-bold text-primary leading-none">{leader.name.charAt(0)}</span></div>
                <span className="font-medium text-foreground/80">{leader.name}</span>
                <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">主导</span>
              </div>
            )}
            {supporters.length > 0 && (
              <div className="flex items-center gap-1 ml-1" title={`支持人: ${supporters.map(s => s!.name).join(', ')}`}>
                <span className="text-[10px] text-muted-foreground mr-0.5">支持</span>
                <div className="flex -space-x-1.5">
                  {supporters.slice(0, 4).map(s => <div key={s!.id} className="w-4 h-4 rounded-full bg-muted flex items-center justify-center ring-1 ring-white"><span className="text-[8px] font-medium text-muted-foreground leading-none">{s!.name.charAt(0)}</span></div>)}
                  {supporters.length > 4 && <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center ring-1 ring-white"><span className="text-[8px] text-muted-foreground">+{supporters.length - 4}</span></div>}
                </div>
              </div>
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
}

export function ProjectTreeNode({ project, filteredProjects, members, expandedIds, toggleExpand, tags, depth, setDetailItem, commentCounts, batchProps }: {
  project: Project; filteredProjects: Project[]; members: { id: string; name: string; avatar: string }[];
  expandedIds: Set<string>; toggleExpand: (id: string) => void;
  tags: Array<{ id: string; name: string; color: string }>; depth: number;
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps }) {
  const children = filteredProjects.filter(p => p.parentId === project.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(project.id);
  return (
    <div>
      <ProjectCard project={project} members={members} expanded={isExpanded} hasChildren={hasChildren} onToggle={() => toggleExpand(project.id)} onClick={() => setDetailItem({ type: 'project', id: project.id })} tags={tags} commentCount={commentCounts[project.id] || 0} batchMode={batchProps.batchMode} isSelected={batchProps.selectedIds.has(project.id)} onToggleSelect={batchProps.onToggleSelect} />
      {hasChildren && isExpanded && (
        <div className="mt-3 space-y-3 border-l-2 border-primary/20 pl-4" style={{ marginLeft: `${Math.min(depth * 20 + 16, 80)}px` }}>
          {children.map(child => <ProjectTreeNode key={child.id} project={child} filteredProjects={filteredProjects} members={members} expandedIds={expandedIds} toggleExpand={toggleExpand} tags={tags} depth={depth + 1} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} />)}
        </div>
      )}
    </div>
  );
}

export function ProjectListView({ projects, members, setDetailItem, commentCounts, batchProps }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps }) {
  const { dispatch } = useStore();
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  function progressColor(p: number) { return p >= 80 ? 'bg-green-500' : p >= 50 ? 'bg-blue-500' : 'bg-amber-500'; }
  return (
    <div className="bg-white rounded-xl border border-border divide-y divide-border/50">
      {projects.map(project => {
        const leader = (members || []).find(m => m.id === project.leaderId);
            return (
              <div key={project.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-muted/30 transition-colors group cursor-pointer" onClick={() => setDetailItem({ type: 'project', id: project.id })}>
                {batchProps.batchMode && <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(project.id)} className="rounded flex-shrink-0" onChange={() => batchProps.onToggleSelect(project.id)} /></span>}
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-orange-100 text-orange-700"><FolderKanban size={12} /></div>
            <span className={`text-[11px] px-1.5 py-0.5 rounded flex-shrink-0 ${statusColors[project.status]}`}>{statusLabels[project.status]}</span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block">{project.title}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 w-48 flex-shrink-0">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${progressColor(project.progress)}`} style={{ width: `${project.progress}%` }} /></div>
              <span className="text-xs font-medium text-muted-foreground min-w-[32px] text-right">{project.progress}%</span>
            </div>
            {leader && <div className="hidden md:flex items-center gap-1 flex-shrink-0"><div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[10px] font-bold text-primary">{leader.name.charAt(0)}</span></div></div>}
            <span className="text-[11px] text-muted-foreground flex-shrink-0 hidden sm:inline w-20 text-right">{project.endDate}</span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0 flex items-center gap-0.5"><MessageSquare size={11} />{commentCounts[project.id] || 0}</span>
            <div className="relative flex-shrink-0">
              <button className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); setShowMenuId(showMenuId === project.id ? null : project.id); }}><MoreHorizontal size={14} /></button>
              {showMenuId === project.id && (
                <div className="relative">
                  <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenuId(null); }} />
                  <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-border z-50 py-1">
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left" onClick={e => { e.stopPropagation(); setDetailItem({ type: 'project', id: project.id }); setShowMenuId(null); }}><Edit2 size={12} /> 编辑</button>
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_PROJECT', payload: project.id }); setShowMenuId(null); }}><Trash2 size={12} /> 删除</button>
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

export function ProjectTableView({ projects, members, setDetailItem, commentCounts, batchProps }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps }) {
  const { dispatch } = useStore();
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  const sorted = useMemo(() => {
    if (!sortCol) return projects;
    return [...projects].sort((a, b) => {
      const av = (a as any)[sortCol]; const bv = (b as any)[sortCol];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [projects, sortCol, sortDir]);
  function toggleSort(col: string) { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } }
  function Th({ col, children }: { col: string; children: React.ReactNode }) {
    return <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 select-none" onClick={() => toggleSort(col)}>{children} {sortCol === col && (sortDir === 'asc' ? '\u2191' : '\u2193')}</th>;
  }
  return (
    <div className="bg-white rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {batchProps.batchMode && <th className="w-10 px-2"><input type="checkbox" checked={batchProps.selectedIds.size === projects.length && projects.length > 0} className="rounded" onChange={e => { e.stopPropagation(); if (batchProps.selectedIds.size === projects.length) projects.forEach(p => batchProps.onToggleSelect(p.id)); else projects.forEach(p => { if (!batchProps.selectedIds.has(p.id)) batchProps.onToggleSelect(p.id); }); }} /></th>}
            <Th col="title">项目名称</Th><Th col="status">状态</Th><Th col="priority">紧急程度</Th><Th col="progress">进度</Th><Th col="leaderId">主导人</Th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">支持人</th><Th col="startDate">开始</Th><Th col="endDate">截止</Th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">分类</th><Th col="taskCount">任务</Th><th className="text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">@</th><th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {sorted.map(project => {
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
                    <button className="p-1 rounded hover:bg-muted" onClick={e => { e.stopPropagation(); setShowMenuId(showMenuId === project.id ? null : project.id); }}><MoreHorizontal size={14} /></button>
                    {showMenuId === project.id && (
                      <div className="relative">
                        <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setShowMenuId(null); }} />
                        <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-border z-50 py-1">
                          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left" onClick={e => { e.stopPropagation(); setDetailItem({ type: 'project', id: project.id }); setShowMenuId(null); }}><Edit2 size={12} /> 编辑</button>
                          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left text-destructive" onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_PROJECT', payload: project.id }); setShowMenuId(null); }}><Trash2 size={12} /> 删除</button>
                        </div>
                      </div>
                    )}
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

function KanbanMiniCard({ p, members, setDetailItem, commentCounts, batchProps, enableDrag }: { p: Project; members: { id: string; name: string; avatar: string }[]; setDetailItem: (item: { type: 'project'; id: string }) => void; commentCounts: Record<string, number>; batchProps: BatchProps; enableDrag?: boolean }) {
  const leader = (members || []).find(m => m.id === p.leaderId);
  return (
    <div className="bg-white rounded-lg border border-border p-3 hover:shadow-sm transition-shadow cursor-pointer" draggable={enableDrag} onDragStart={(e: React.DragEvent) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => setDetailItem({ type: 'project', id: p.id })}>
      {batchProps.batchMode && <div className="mb-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(p.id)} className="rounded" onChange={() => batchProps.onToggleSelect(p.id)} /></div>}
      <div className="font-medium text-sm mb-1.5 truncate">{p.title}</div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityColors[p.priority]}`}>{bpLabels[bpFromPriority(p.priority)]}</span>
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} /></div>
        <span className="text-[10px] font-medium text-muted-foreground">{p.progress}%</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{p.endDate}</span>
        <span className="flex items-center gap-1"><MessageSquare size={11} />{commentCounts[p.id] || 0}</span>
      </div>
      {leader && <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground"><div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[8px] font-bold text-primary">{leader.name.charAt(0)}</span></div>{leader.name}</div>}
    </div>
  );
}

export function ProjectKanbanView({ projects, members, setDetailItem, commentCounts, batchProps, tags: kanbanTags }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
  tags: Array<{ id: string; name: string; color: string }>;
} & { batchProps: BatchProps }) {
  const KANBAN_LS_KEY = 'tbh-projects-kanban';
  const [lsRaw] = useState(() => { try { return JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || '{}'); } catch { return {}; } });
  const [kanbanCustomMode, setKanbanCustomMode] = useState(lsRaw.customMode || false);
  const [customColumns, setCustomColumns] = useState<string[]>(lsRaw.columns || ['规划中', '进行中', '已完成']);
  const [kanbanGroupBy, setKanbanGroupBy] = useState<'status' | 'tag' | 'priority' | 'category' | 'level' | 'person' | 'time'>(lsRaw.groupBy || 'status');
  const [newColName, setNewColName] = useState('');
  useEffect(() => { try { localStorage.setItem(KANBAN_LS_KEY, JSON.stringify({ customMode: kanbanCustomMode, columns: customColumns, groupBy: kanbanGroupBy })); } catch {} }, [kanbanCustomMode, customColumns, kanbanGroupBy]);
  const defaultColumns: Array<{ key: ProjectStatus; label: string; color: string }> = [
    { key: 'planning', label: '规划中', color: 'border-t-gray-400' },
    { key: 'in_progress', label: '进行中', color: 'border-t-blue-500' },
    { key: 'completed', label: '已完成', color: 'border-t-green-500' },
  ];
  function addColumn() { const n = newColName.trim(); if (n && !customColumns.includes(n)) { setCustomColumns(prev => [...prev, n]); setNewColName(''); } }
  function removeColumn(idx: number) { setCustomColumns(prev => prev.filter((_, i) => i !== idx)); }

  const miniCardProps = { members, setDetailItem, commentCounts, batchProps };

  const { dispatch: storeDispatch } = useStore();
  const GROUP_OPTIONS: Array<{ key: string; label: string }> = [
    { key: 'status', label: '状态' }, { key: 'tag', label: '标签' },
    { key: 'priority', label: '紧急程度' }, { key: 'category', label: '分类' },
    { key: 'level', label: '等级' }, { key: 'person', label: '人员' },
    { key: 'time', label: '时间' },
  ];

  // Pre-compute at component level (not inside conditional renders - hooks rule)
  const kanbanUsedCategories = useMemo(() => {
    const set = new Set<string>();
    projects.forEach(p => { if (p.category) set.add(p.category); });
    return [...set].sort();
  }, [projects]);

  const kanbanUsedPersons = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach(p => {
      if (p.leaderId && !map.has(p.leaderId)) {
        const m = (members || []).find(m => m.id === p.leaderId);
        if (m) map.set(p.leaderId, m.name);
      }
    });
    return [...map.entries()];
  }, [projects, members]);
  const groupByBtns = (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
      {GROUP_OPTIONS.map(opt => (
        <button key={opt.key} className={`text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${kanbanGroupBy === opt.key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setKanbanGroupBy(opt.key as any)}>{opt.label}</button>
      ))}
    </div>
  );

  function renderCols(cols: Array<{ key: string; label: string; color?: string }>, getItems: (col: string) => Project[], enableDrag?: boolean, onDropCustom?: (projectId: string, colKey: string) => void) {
    return (
      <div className="overflow-x-auto -mx-4 px-4 pb-2"><div className="flex gap-4 min-w-max">
        {cols.map(col => {
          const items = getItems(col.key) || [];
          return (
            <div key={col.key} className={`w-[300px] flex-shrink-0 bg-muted/20 rounded-xl border border-border border-t-4 ${col.color || 'border-t-gray-400'} p-4`} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={(e: React.DragEvent) => { e.preventDefault(); const projectId = e.dataTransfer.getData('text/plain'); if (!projectId) return; if (onDropCustom) { onDropCustom(projectId, col.key); return; } if (enableDrag) { const validStatuses: Record<string, ProjectStatus> = { planning: 'planning', in_progress: 'in_progress', completed: 'completed' }; const newStatus = validStatuses[col.key]; if (newStatus) { storeDispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: { status: newStatus } } }); } } }}>
              <div className="flex items-center justify-between mb-4"><span className="text-sm font-semibold">{col.label}</span><span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{items.length}</span></div>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {items.map(p => <KanbanMiniCard key={p.id} p={p} {...miniCardProps} enableDrag={!!enableDrag || !!onDropCustom} />)}
                {items.length === 0 && <div className="text-xs text-muted-foreground/50 py-8 text-center">暂无项目</div>}
              </div>
            </div>
          );
        })}
      </div></div>
    );
  }

  if (kanbanGroupBy === 'tag') {
    const tagList = kanbanTags.map(t => t.name);
    const tagColumns = [...tagList, '未分类'];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
        {renderCols(tagColumns.map(t => ({ key: t, label: t })), col => projects.filter(p => p.status !== 'completed' && p.status !== 'cancelled' && (col === '未分类' ? (p.tags || []).length === 0 : (p.tags || []).includes(col))))}
      </div>
    );
  }

  if (kanbanGroupBy === 'priority') {
    const cols = [
      { key: 'urgent', label: '紧急', color: 'border-t-red-500' },
      { key: 'high', label: '高', color: 'border-t-orange-500' },
      { key: 'medium', label: '中', color: 'border-t-yellow-500' },
      { key: 'low', label: '低', color: 'border-t-blue-500' },
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
        {renderCols(cols, col => projects.filter(p => p.priority === col), undefined, (projectId, colKey) => { const pMap: Record<string, TaskPriority> = { urgent: 'urgent', high: 'high', medium: 'medium', low: 'low' }; if (pMap[colKey]) storeDispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: { priority: pMap[colKey] } } }); })}
      </div>
    );
  }

  if (kanbanGroupBy === 'category') {
    const catCols = kanbanUsedCategories.length > 0 ? [...kanbanUsedCategories, '未分类'] : ['未分类'];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
        {renderCols(catCols.map(c => ({ key: c, label: c })), col => projects.filter(p => col === '未分类' ? !p.category : p.category === col))}
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
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
        {renderCols(levelCols, col => projects.filter(p => bpFromPriority(p.priority) === col), undefined, (projectId, colKey) => { const bpToP: Record<string, TaskPriority> = { S: 'urgent', A: 'high', B: 'medium', C: 'low' }; if (bpToP[colKey]) storeDispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: { priority: bpToP[colKey] } } }); })}
      </div>
    );
  }

  if (kanbanGroupBy === 'person') {
    const personCols = kanbanUsedPersons.map(([id, name]) => ({ key: id, label: name, color: 'border-t-gray-400' }));
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
        {personCols.length > 0 ? renderCols(personCols, col => projects.filter(p => p.leaderId === col)) : <p className="text-xs text-muted-foreground text-center py-12">暂无数据</p>}
      </div>
    );
  }

  if (kanbanGroupBy === 'time') {
    const todayStr = new Date().toISOString().split('T')[0];
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
        {renderCols(timeCols, col => projects.filter(p => {
          if (col === 'overdue') return p.endDate && p.endDate < todayStr && p.status !== 'completed' && p.status !== 'cancelled';
          if (col === 'today') return p.endDate === todayStr;
          if (col === 'week') return p.endDate > todayStr && p.endDate <= weekEndStr;
          if (col === 'later') return p.endDate > weekEndStr;
          if (col === 'none') return !p.endDate;
          return false;
        }))}
      </div>
    );
  }

  if (kanbanCustomMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {groupByBtns}
          <button className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors" onClick={() => setKanbanCustomMode(false)}>默认看板</button>
          {customColumns.map((col, idx) => <span key={col} className="text-xs px-2 py-1 bg-muted rounded-lg flex items-center gap-1">{col}<button className="hover:text-red-500" onClick={() => removeColumn(idx)}>✕</button></span>)}
          <input type="text" placeholder="列名" value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addColumn(); }} className="text-xs border border-border rounded-lg px-2 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-primary/20" />
          <button className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90" onClick={addColumn}>+</button>
        </div>
        {renderCols(customColumns.map(c => ({ key: c, label: c, color: 'border-t-blue-400' })), () => projects)}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {groupByBtns}
        <button className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors" onClick={() => setKanbanCustomMode(true)}>自定义看板</button>
      </div>
      {renderCols(defaultColumns.map(c => ({ key: c.key, label: c.label, color: c.color })), col => projects.filter(p => p.status === col), true)}
    </div>
  );
}

function MatrixQuadrantCard({ project, members, setDetailItem, commentCounts, batchProps, dispatch, dragRef }: { project: Project; members: { id: string; name: string; avatar: string }[]; setDetailItem: (item: { type: 'project'; id: string }) => void; commentCounts: Record<string, number>; batchProps: BatchProps; dispatch: React.Dispatch<any>; dragRef: React.MutableRefObject<{ id: string; el: HTMLElement } | null> }) {
  const leader = (members || []).find(m => m.id === project.leaderId);
  return (
    <div className="bg-white rounded-lg border border-border p-3 hover:shadow-sm transition-shadow group cursor-pointer select-none" onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); dragMovedRef.current = false; dragRef.current = { id: project.id, el: e.currentTarget }; e.currentTarget.classList.add('opacity-30', 'scale-95'); }} onTouchStart={e => { const t = e.touches[0]; if (!t) return; dragMovedRef.current = false; dragRef.current = { id: project.id, el: e.currentTarget as HTMLElement }; (e.currentTarget as HTMLElement).classList.add('opacity-30', 'scale-95'); }} onClick={() => { if (!dragMovedRef.current) setDetailItem({ type: 'project', id: project.id }); }}>
      <div className="flex items-center gap-1 mb-1">
        {batchProps.batchMode && <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(project.id)} className="rounded" onChange={() => batchProps.onToggleSelect(project.id)} /></span>}
        <span className="text-xs font-medium truncate flex-1">{project.title}</span>
        <div className="relative flex-shrink-0">
          <button className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_PROJECT', payload: project.id }); }}><Trash2 size={12} className="text-destructive" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] px-1 py-0.5 rounded ${statusColors[project.status]}`}>{statusLabels[project.status]}</span>
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${project.progress}%` }} /></div>
        <span className="text-[10px] font-medium text-muted-foreground">{project.progress}%</span>
      </div>
      <div className="flex items-center justify-between">
        {leader && <div className="flex items-center gap-1"><div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[8px] font-bold text-primary">{leader.name.charAt(0)}</span></div><span className="text-[10px] text-muted-foreground">{leader.name}</span></div>}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MessageSquare size={10} />{commentCounts[project.id] || 0}</span>
          <span className="text-[10px] text-muted-foreground">{project.endDate}</span>
        </div>
      </div>
    </div>
  );
}

export function ProjectMatrixView({ projects, members, setDetailItem, commentCounts, batchProps }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps }) {
  const { dispatch } = useStore();
  const todayStr = new Date().toISOString().split('T')[0];
  const MS_DAY = 86400000;
  const URGENT_DAYS = 14;
  const dragRef = useRef<{ id: string; el: HTMLElement } | null>(null);
  const dragMovedRef = useRef(false);
  const hoverQRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLElement | null>>({});

  function daysUntilEnd(endDate: string) { return Math.ceil((new Date(endDate).getTime() - new Date(todayStr).getTime()) / MS_DAY); }
  function isUrgent(p: Project) { return p.status !== 'completed' && p.status !== 'cancelled' && p.status !== 'paused' && !!p.endDate && daysUntilEnd(p.endDate) <= URGENT_DAYS; }
  function isImportant(p: Project) { return p.priority === 'urgent' || p.priority === 'high'; }

  const quadrants: Record<string, { title: string; accent: string; hoverAccent: string; dropPriority: TaskPriority }> = {
    Q1: { title: '紧急重要', accent: 'border-red-200 bg-red-50/30', hoverAccent: 'border-red-300 bg-red-50/60 ring-2 ring-red-200', dropPriority: 'urgent' },
    Q2: { title: '重要不紧急', accent: 'border-blue-200 bg-blue-50/30', hoverAccent: 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-200', dropPriority: 'high' },
    Q3: { title: '紧急不重要', accent: 'border-amber-200 bg-amber-50/30', hoverAccent: 'border-amber-300 bg-amber-50/60 ring-2 ring-amber-200', dropPriority: 'medium' },
    Q4: { title: '不紧急不重要', accent: 'border-gray-200 bg-gray-50/30', hoverAccent: 'border-gray-300 bg-gray-50/60 ring-2 ring-gray-200', dropPriority: 'low' },
  };
  const qKeys = ['Q1', 'Q2', 'Q3', 'Q4'];

  const grouped: Record<string, Project[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  projects.forEach(p => {
    if (!p.priority || p.status === 'completed' || p.status === 'cancelled' || p.status === 'paused') { grouped.Q4.push(p); return; }
    switch (p.priority) {
      case 'urgent': grouped.Q1.push(p); break;
      case 'high': grouped.Q2.push(p); break;
      case 'medium': grouped.Q3.push(p); break;
      default: grouped.Q4.push(p); break;
    }
  });

  function resetHover() {
    const prevHover = hoverQRef.current;
    hoverQRef.current = null;
    if (prevHover && boxRefs.current[prevHover]) {
      const box = boxRefs.current[prevHover];
      if (box) box.className = box.className.replace(quadrants[prevHover].hoverAccent, quadrants[prevHover].accent);
    }
  }

  function handlePointerMove(cx: number, cy: number) {
    if (!dragRef.current) return;
    dragMovedRef.current = true;
    let found = false;
    for (const key of qKeys) {
      const el = boxRefs.current[key];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        if (hoverQRef.current !== key) {
          if (hoverQRef.current) {
            const prevBox = boxRefs.current[hoverQRef.current];
            if (prevBox) prevBox.className = prevBox.className.replace(quadrants[hoverQRef.current].hoverAccent, quadrants[hoverQRef.current].accent);
          }
          hoverQRef.current = key;
          const box = boxRefs.current[key];
          if (box) box.className = box.className.replace(quadrants[key].accent, quadrants[key].hoverAccent);
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
      const targetQ = hoverQRef.current;
      if (targetQ && quadrants[targetQ]) {
        dispatch({ type: 'UPDATE_PROJECT', payload: { id: dragRef.current.id, updates: { priority: quadrants[targetQ].dropPriority } } });
      }
      // Delay reset so onClick can check dragMovedRef before hoverQ is cleared
      const prevHover = targetQ;
      setTimeout(() => {
        if (prevHover && boxRefs.current[prevHover]) {
          const box = boxRefs.current[prevHover];
          if (box) box.className = box.className.replace(quadrants[prevHover].hoverAccent, quadrants[prevHover].accent);
        }
        hoverQRef.current = null;
      }, 50);
      dragRef.current = null;
    }
  }

  const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
  const onMouseUp = () => handlePointerUp();
  const onTouchMove = (e: TouchEvent) => { const pos = getTouchPos(e); handlePointerMove(pos.x, pos.y); };
  const onTouchEnd = () => handlePointerUp();

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); };
  }, [dispatch]);

  return (
    <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 gap-3 select-none">
      {qKeys.map(qKey => {
        const q = quadrants[qKey];
        const items = grouped[qKey];
        return (
          <div key={qKey} data-quadrant={qKey} ref={el => { boxRefs.current[qKey] = el; }} className={`rounded-xl border p-3 min-h-[200px] ${q.accent}`}>
            <div className="text-xs font-bold mb-3 text-foreground/70">{q.title} ({items.length})</div>
            <div className="space-y-2 max-h-[calc(100vh-420px)] overflow-y-auto">
              {items.map(p => <MatrixQuadrantCard key={p.id} project={p} members={members} setDetailItem={setDetailItem} commentCounts={commentCounts} batchProps={batchProps} dispatch={dispatch} dragRef={dragRef} />)}
              {items.length === 0 && <div className="text-xs text-muted-foreground/50 py-4 text-center">拖拽项目到此处</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectTimelineView({ projects, members, setDetailItem, commentCounts, batchProps }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
  commentCounts: Record<string, number>;
} & { batchProps: BatchProps }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Project[]>();
    projects.forEach(p => { const key = p.endDate || '未设置'; const arr = map.get(key) || []; arr.push(p); map.set(key, arr); });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [projects]);

  return (
    <div className="space-y-6">
      {grouped.map(([date, items]) => (
        <div key={date}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-sm font-semibold">{date}</span>
            <span className="text-xs text-muted-foreground">({items.length}个项目)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-4">
            {items.map(p => {
              const leader = (members || []).find(m => m.id === p.leaderId);
              return (
                <div key={p.id} className="bg-white rounded-lg border border-border p-3 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDetailItem({ type: 'project', id: p.id })}>
                  {batchProps.batchMode && <div className="mb-2" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(p.id)} className="rounded" onChange={() => batchProps.onToggleSelect(p.id)} /></div>}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[p.status]}`}>{statusLabels[p.status]}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityColors[p.priority]}`}>{bpLabels[bpFromPriority(p.priority)]}</span>
                  </div>
                  <div className="text-sm font-medium mb-1 truncate">{p.title}</div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} /></div>
                    <span className="text-[10px] text-muted-foreground">{p.progress}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    {leader && <span>{leader.name} · {p.startDate}</span>}
                    <span className="flex items-center gap-0.5"><MessageSquare size={11} />{commentCounts[p.id] || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectCanvasView({ projects, members, setDetailItem, batchProps }: {
  projects: Project[]; members: { id: string; name: string; avatar: string }[];
  setDetailItem: (item: { type: 'project'; id: string }) => void;
} & { batchProps: BatchProps }) {
  const { dispatch } = useStore();
  const [canvasScale, setCanvasScale] = useState(0.8);
  const [canvasPanX, setCanvasPanX] = useState(0);
  const [canvasPanY, setCanvasPanY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const itemDragRef = useRef<{ id: string; el: HTMLElement; startX: number; startY: number; origLeft: number; origTop: number } | null>(null);

  useEffect(() => {
    let lastCX = 0;
    let lastCY = 0;
    function onMove(cx: number, cy: number, movementX: number, movementY: number) {
      lastCX = cx;
      lastCY = cy;
      if (itemDragRef.current) {
        const d = itemDragRef.current;
        d.el.style.left = (d.origLeft + cx - d.startX) + 'px';
        d.el.style.top = (d.origTop + cy - d.startY) + 'px';
        return;
      }
      if (isPanningRef.current && innerRef.current) {
        panRef.current.x += movementX;
        panRef.current.y += movementY;
        innerRef.current.style.transform = `scale(${innerRef.current.dataset.scale || 0.8}) translate(${panRef.current.x}px,${panRef.current.y}px)`;
      }
    }
    function onUp() {
      if (itemDragRef.current) {
        const d = itemDragRef.current;
        const newLeft = d.origLeft + (lastCX - d.startX);
        const newTop = d.origTop + (lastCY - d.startY);
        dispatch({ type: 'UPDATE_PROJECT', payload: { id: d.id, updates: { canvasX: newLeft, canvasY: newTop } as Partial<Project> } });
        itemDragRef.current = null;
      }
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setCanvasPanX(panRef.current.x);
        setCanvasPanY(panRef.current.y);
      }
    }
    const mmHandler = (e: MouseEvent) => onMove(e.clientX, e.clientY, e.movementX, e.movementY);
    const muHandler = () => onUp();
    const tmHandler = (e: TouchEvent) => { const p = getTouchPos(e); onMove(p.x, p.y, p.x - lastCX, p.y - lastCY); lastCX = p.x; lastCY = p.y; };
    const teHandler = () => onUp();
    document.addEventListener('mousemove', mmHandler);
    document.addEventListener('mouseup', muHandler);
    document.addEventListener('touchmove', tmHandler, { passive: true });
    document.addEventListener('touchend', teHandler);
    return () => { document.removeEventListener('mousemove', mmHandler); document.removeEventListener('mouseup', muHandler); document.removeEventListener('touchmove', tmHandler); document.removeEventListener('touchend', teHandler); };
  }, [dispatch]);

  const statusBorderColors: Record<string, string> = { planning: 'border-gray-400', in_progress: 'border-blue-500', completed: 'border-green-500', paused: 'border-amber-400' };

  const startPan = useCallback(() => { isPanningRef.current = true; panRef.current = { x: canvasPanX, y: canvasPanY }; }, [canvasPanX, canvasPanY]);

  const startItemDrag = useCallback((e: React.MouseEvent | React.TouchEvent, id: string) => {
    let cx = 0; let cy = 0;
    if ('touches' in e && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else if ('clientX' in e) { cx = (e as React.MouseEvent).clientX; cy = (e as React.MouseEvent).clientY; }
    e.stopPropagation();
    const item = projects.find(p => p.id === id);
    if (!item || !innerRef.current) return;
    const el = e.currentTarget as HTMLElement;
    itemDragRef.current = { id, el, startX: cx, startY: cy, origLeft: item.canvasX ?? 0, origTop: item.canvasY ?? 0 };
  }, [projects]);

  return (
    <div ref={containerRef} className="relative bg-white rounded-xl border border-border shadow-sm overflow-hidden" style={{ height: '70vh' }} onMouseDown={startPan} onTouchStart={startPan}>
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      <div ref={innerRef} className="relative w-full h-full" data-scale={canvasScale} style={{ transform: `scale(${canvasScale}) translate(${canvasPanX}px,${canvasPanY}px)`, transformOrigin: '0 0' }}>
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          {projects.filter(p => (p.parentId || '')).map(proj => {
            const parent = projects.find(pp => pp.id === proj.parentId);
            if (!parent) return null;
            const px = (parent.canvasX ?? 0) * canvasScale + canvasPanX;
            const py = (parent.canvasY ?? 0) * canvasScale + canvasPanY;
            const cx = (proj.canvasX ?? 0) * canvasScale + canvasPanX;
            const cy = (proj.canvasY ?? 0) * canvasScale + canvasPanY;
            return <line key={proj.id + '-line'} x1={px} y1={py} x2={cx} y2={cy} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,4" />;
          })}
        </svg>
        {projects.map((project, index) => {
          const x = project.canvasX ?? (index * 220 % 800) + 40;
          const y = project.canvasY ?? (Math.floor(index * 220 / 800) * 160) + 40;
          const leader = members.find(m => m.id === project.leaderId);
          return (
            <div key={project.id} className={`absolute w-48 bg-white rounded-lg border-2 ${statusBorderColors[project.status] || 'border-gray-300'} shadow-md p-3 cursor-move hover:shadow-lg transition-shadow`} style={{ left: x, top: y }} onMouseDown={e => startItemDrag(e, project.id)} onTouchStart={e => startItemDrag(e, project.id)} onClick={e => { e.stopPropagation(); setDetailItem({ type: 'project', id: project.id }); }}>
              {batchProps.batchMode && <div className="mb-1" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(project.id)} className="rounded" onChange={e => { e.stopPropagation(); batchProps.onToggleSelect(project.id); }} /></div>}
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">{project.progress}%</span>
                {leader && <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">{leader.name.charAt(0)}</div>}
              </div>
              <div className="h-1 bg-muted rounded-full mt-1"><div className="h-full bg-primary rounded-full" style={{ width: `${project.progress}%` }} /></div>
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-white/90 rounded-lg shadow px-2 py-1">
        <button onClick={() => setCanvasScale(s => Math.min(2, s + 0.1))} className="text-xs px-2 py-1 border rounded">+</button>
        <span className="text-xs">{Math.round(canvasScale * 100)}%</span>
        <button onClick={() => setCanvasScale(s => Math.max(0.3, s - 0.1))} className="text-xs px-2 py-1 border rounded">-</button>
      </div>
    </div>
  );
}
