import { useMemo, useState, type ReactNode } from 'react';
import type { Knowledge, KnowledgePriority, KnowledgeStatus } from '@/types';
import { KNOWLEDGE_STATUSES, KNOWLEDGE_PRIORITIES, KnowledgeStatusBadge, KnowledgePriorityBadge } from './constants';
import { CalendarClock, CircleDot, Flag, Tag, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KnowledgeMember = { id: string; name: string };

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function MemberCount({ members, id }: { members: KnowledgeMember[]; id?: string }) {
  if (!id) return null;
  const m = members.find(x => x.id === id);
  return m ? m.name : '成员';
}

/* ============ 列表视图 ============ */
export function KnowledgeListView({ items, members, onEdit }: { items: Knowledge[]; members: KnowledgeMember[]; onEdit: (k: Knowledge) => void }) {
  if (items.length === 0) return <div className="text-sm text-muted-foreground py-16 text-center">暂无知识条目</div>;
  return (
    <div className="space-y-1">
      {items.map(k => (
        <div key={k.id} onClick={() => onEdit(k)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: k.color || '#d4d4d8' }} />
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-sm font-medium truncate">{k.title}</span>
            {k.category && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 flex-shrink-0"><CircleDot size={8} /> {k.category}</span>}
            <KnowledgeStatusBadge status={k.status} />
            <KnowledgePriorityBadge priority={k.priority} />
          </div>
          <div className="hidden md:flex items-center gap-1 flex-shrink-0">
            {k.assigneeId && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"><User size={8} /> <MemberCount members={members} id={k.assigneeId} /></span>}
            {k.dueDate && <span className={cn('inline-flex items-center gap-0.5 text-[10px] flex-shrink-0', new Date(k.dueDate).getTime() < Date.now() ? 'text-red-500' : 'text-muted-foreground/70')}><CalendarClock size={9} /> {formatTime(k.dueDate)}</span>}
          </div>
          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{formatTime(k.updatedAt)}</span>
        </div>
      ))}
    </div>
  );
}

/* ============ 表格视图 ============ */
export function KnowledgeTableView({ items, members, onEdit }: { items: Knowledge[]; members: KnowledgeMember[]; onEdit: (k: Knowledge) => void }) {
  if (items.length === 0) return <div className="py-16 text-center text-sm text-muted-foreground">暂无知识条目</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="px-2 py-2 font-medium">标题</th>
            <th className="px-2 py-2 font-medium">状态</th>
            <th className="px-2 py-2 font-medium">优先级</th>
            <th className="px-2 py-2 font-medium">负责人</th>
            <th className="px-2 py-2 font-medium">分类</th>
            <th className="px-2 py-2 font-medium">标签</th>
            <th className="px-2 py-2 font-medium">截止日期</th>
            <th className="px-2 py-2 font-medium">更新时间</th>
          </tr>
        </thead>
        <tbody>
          {items.map(k => (
            <tr key={k.id} onClick={() => onEdit(k)} className="border-b border-border/50 hover:bg-muted/40 cursor-pointer">
              <td className="px-2 py-2 font-medium max-w-[240px] truncate">{k.title}</td>
              <td className="px-2 py-2"><KnowledgeStatusBadge status={k.status} /></td>
              <td className="px-2 py-2"><KnowledgePriorityBadge priority={k.priority} /></td>
              <td className="px-2 py-2 text-xs text-muted-foreground"><MemberCount members={members} id={k.assigneeId} /></td>
              <td className="px-2 py-2 text-xs text-muted-foreground">{k.category || '—'}</td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-1 flex-wrap max-w-[180px]">
                  {(k.tags ?? []).slice(0, 3).map(t => (
                    <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary"><Tag size={8} /> {t}</span>
                  ))}
                  {(k.tags ?? []).length > 3 && <span className="text-[10px] text-muted-foreground">+{(k.tags ?? []).length - 3}</span>}
                </div>
              </td>
              <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{k.dueDate ? formatTime(k.dueDate) : '—'}</td>
              <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatTime(k.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============ 看板视图 ============ */
type KanbanGroupBy = 'status' | 'priority' | 'category' | 'assignee';

const KANBAN_GROUPS: { key: KanbanGroupBy; label: string }[] = [
  { key: 'status', label: '按状态' },
  { key: 'priority', label: '按优先级' },
  { key: 'category', label: '按分类' },
  { key: 'assignee', label: '按负责人' },
];

const STATUS_COL_COLORS: Record<string, string> = { draft: 'border-t-amber-400', active: 'border-t-emerald-500', archived: 'border-t-gray-400' };
const PRIORITY_COL_COLORS: Record<string, string> = { low: 'border-t-blue-400', medium: 'border-t-yellow-400', high: 'border-t-orange-500', urgent: 'border-t-red-500' };

function KanbanMiniCard({ k, members, onEdit }: { k: Knowledge; members: KnowledgeMember[]; onEdit: (k: Knowledge) => void }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', k.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => onEdit(k)}
      className="bg-card rounded-lg border border-border p-3 cursor-pointer hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-xs font-medium leading-snug line-clamp-2 flex-1">{k.title}</h4>
        <KnowledgePriorityBadge priority={k.priority} />
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 whitespace-pre-wrap">{k.content || '暂无内容'}</p>
      <div className="flex items-center gap-1 flex-wrap">
        {k.category && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600"><CircleDot size={8} /> {k.category}</span>}
        {k.assigneeId && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"><User size={8} /> <MemberCount members={members} id={k.assigneeId} /></span>}
        {k.dueDate && <span className={cn('inline-flex items-center gap-0.5 text-[10px]', new Date(k.dueDate).getTime() < Date.now() ? 'text-red-500' : 'text-muted-foreground/70')}><CalendarClock size={9} /> {formatTime(k.dueDate)}</span>}
      </div>
    </div>
  );
}

export function KnowledgeKanbanView({ items, members, onEdit, onUpdateField }: {
  items: Knowledge[];
  members: KnowledgeMember[];
  onEdit: (k: Knowledge) => void;
  onUpdateField: (id: string, updates: Partial<Knowledge>) => void;
}) {
  const [groupBy, setGroupBy] = useState<KanbanGroupBy>('status');

  const usedCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(k => { if (k.category) set.add(k.category); });
    return [...set].sort();
  }, [items]);

  const usedAssignees = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach(k => {
      if (k.assigneeId && !map.has(k.assigneeId)) {
        const m = members.find(x => x.id === k.assigneeId);
        if (m) map.set(k.assigneeId, m.name);
      }
    });
    return [...map.entries()];
  }, [items, members]);

  const groupByBtns = (
    <div className="flex items-center gap-1">
      {KANBAN_GROUPS.map(g => (
        <button key={g.key} onClick={() => setGroupBy(g.key)} className={cn('text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap', groupBy === g.key ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground')}>{g.label}</button>
      ))}
    </div>
  );

  function renderBoard(cols: Array<{ key: string; label: string; color?: string }>, getItems: (colKey: string) => Knowledge[], dropPatch: (colKey: string) => Partial<Knowledge>) {
    return (
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-max">
          {cols.map(col => {
            const colItems = getItems(col.key);
            return (
              <div key={col.key} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onUpdateField(id, dropPatch(col.key)); }} className={cn('w-[280px] flex-shrink-0 bg-muted/20 rounded-xl border border-border border-t-4 p-3', col.color || 'border-t-gray-400')}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{colItems.length}</span>
                </div>
                <div className="space-y-2.5 max-h-[55vh] overflow-y-auto">
                  {colItems.map(k => <KanbanMiniCard key={k.id} k={k} members={members} onEdit={onEdit} />)}
                  {colItems.length === 0 && <div className="text-xs text-muted-foreground/50 py-8 text-center">拖拽条目到此</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  let board: ReactNode = null;
  if (groupBy === 'status') {
    const cols = KNOWLEDGE_STATUSES.map(s => ({ key: s.value, label: s.label, color: STATUS_COL_COLORS[s.value] }));
    board = renderBoard(cols, colKey => items.filter(k => (k.status ?? 'active') === colKey), colKey => ({ status: colKey as KnowledgeStatus }));
  } else if (groupBy === 'priority') {
    const cols = KNOWLEDGE_PRIORITIES.map(p => ({ key: p.value, label: p.label, color: PRIORITY_COL_COLORS[p.value] }));
    board = renderBoard(cols, colKey => items.filter(k => (k.priority ?? 'medium') === colKey), colKey => ({ priority: colKey as KnowledgePriority }));
  } else if (groupBy === 'category') {
    const cats = usedCategories.length > 0 ? [...usedCategories, '未分类'] : ['未分类'];
    board = renderBoard(cats.map(c => ({ key: c, label: c })), colKey => colKey === '未分类' ? items.filter(k => !k.category) : items.filter(k => k.category === colKey), colKey => ({ category: colKey === '未分类' ? '' : colKey }));
  } else {
    const assignees = usedAssignees.length > 0 ? [...usedAssignees.map(([id, name]) => ({ key: id, label: name })), { key: '__none__', label: '未分配' }] : [{ key: '__none__', label: '未分配' }];
    board = renderBoard(assignees, colKey => colKey === '__none__' ? items.filter(k => !k.assigneeId) : items.filter(k => k.assigneeId === colKey), colKey => ({ assigneeId: colKey === '__none__' ? undefined : colKey }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">{groupByBtns}</div>
      {board}
    </div>
  );
}