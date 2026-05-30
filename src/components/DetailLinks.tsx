import React, { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { ItemType } from '@/types';
import { Button } from '@/components/ui/button';
import { Link2, Plus, Trash2, Target, FolderKanban, CheckSquare, AlertTriangle, Clock } from 'lucide-react';
import { Section } from './detail-shared';

interface DetailLinksProps {
  itemId: string;
  itemType: ItemType;
  canEdit: boolean;
}

interface AggData {
  completionRate: number;
  overdueCount: number;
  totalCount: number;
  doneCount: number;
  inProgressCount: number;
  latestActivity: string | null;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}月前`;
}

export function DetailLinks({ itemId, itemType, canEdit }: DetailLinksProps) {
  const { state, dispatch } = useStore();
  const [showAddLink, setShowAddLink] = useState(false);
  const [addLinkType, setAddLinkType] = useState<ItemType>('goal');
  const [addLinkTargetId, setAddLinkTargetId] = useState('');
  const [addLinkLabel, setAddLinkLabel] = useState('');

  const links = useMemo(() => state.itemLinks.filter(l => (l.sourceId === itemId && l.sourceType === itemType) || (l.targetId === itemId && l.targetType === itemType)), [state.itemLinks, itemId, itemType]);

  // 预建索引
  const indexMaps = useMemo(() => {
    const tasksByProject = new Map<string, typeof state.tasks>();
    for (const t of state.tasks) {
      const list = tasksByProject.get(t.projectId || '') ?? [];
      list.push(t);
      tasksByProject.set(t.projectId || '', list);
    }
    const projectsByGoal = new Map<string, typeof state.projects>();
    for (const p of state.projects) {
      const list = projectsByGoal.get(p.goalId || '') ?? [];
      list.push(p);
      projectsByGoal.set(p.goalId || '', list);
    }
    return { tasksByProject, projectsByGoal };
  }, [state.tasks, state.projects]);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // 聚合数据计算
  const aggregates = useMemo(() => {
    const result = new Map<string, AggData>();
    for (const link of links) {
      const isSource = link.sourceId === itemId;
      const otherId = isSource ? link.targetId : link.sourceId;
      const otherType = isSource ? link.targetType : link.sourceType;
      const key = `${otherType}:${otherId}`;
      if (result.has(key)) continue;

      if (otherType === 'goal') {
        const goal = state.goals.find(g => g.id === otherId);
        if (!goal) continue;
        const childProjects = indexMaps.projectsByGoal.get(otherId) ?? [];
        const childTasks = childProjects.flatMap(p => indexMaps.tasksByProject.get(p.id) ?? []);
        const all = [...childProjects, ...childTasks] as { status: string; dueDate?: string | null; updatedAt?: string }[];
        result.set(key, {
          completionRate: all.length > 0 ? Math.round(all.filter(i => i.status === 'done').length / all.length * 100) : goal.progress ?? 0,
          overdueCount: all.filter(i => i.status !== 'done' && i.status !== 'cancelled' && i.dueDate && i.dueDate < today).length,
          totalCount: all.length, doneCount: all.filter(i => i.status === 'done').length,
          inProgressCount: all.filter(i => i.status === 'in_progress').length,
          latestActivity: all.reduce<string | null>((max, i) => (!max || (i.updatedAt && i.updatedAt > max)) ? i.updatedAt ?? max : max, null),
        });
      } else if (otherType === 'project') {
        const proj = state.projects.find(p => p.id === otherId);
        if (!proj) continue;
        const childTasks = indexMaps.tasksByProject.get(otherId) ?? [];
        result.set(key, {
          completionRate: childTasks.length > 0 ? Math.round(childTasks.filter(t => t.status === 'done').length / childTasks.length * 100) : proj.progress ?? 0,
          overdueCount: childTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < today).length,
          totalCount: childTasks.length, doneCount: childTasks.filter(t => t.status === 'done').length,
          inProgressCount: childTasks.filter(t => t.status === 'in_progress').length,
          latestActivity: childTasks.reduce<string | null>((max, t) => (!max || (t.updatedAt && t.updatedAt > max)) ? t.updatedAt ?? max : max, null),
        });
      } else {
        const task = state.tasks.find(t => t.id === otherId);
        if (!task) continue;
        const subs = task.subtasks || [];
        result.set(key, {
          completionRate: subs.length > 0 ? Math.round(subs.filter(s => s.completed).length / subs.length * 100) : (task.status === 'done' ? 100 : 0),
          overdueCount: (task.dueDate && task.dueDate < today && task.status !== 'done' && task.status !== 'cancelled') ? 1 : 0,
          totalCount: subs.length || 1, doneCount: subs.filter(s => s.completed).length || (task.status === 'done' ? 1 : 0),
          inProgressCount: task.status === 'in_progress' ? 1 : 0,
          latestActivity: task.updatedAt ?? null,
        });
      }
    }
    return result;
  }, [links, state.goals, state.projects, state.tasks, indexMaps, today, itemId, itemType]);

  const linkTargets = useMemo(() => {
    const targets: { id: string; title: string; type: ItemType }[] = [];
    state.goals.forEach(g => { if (g.id !== itemId) targets.push({ id: g.id, title: g.title, type: 'goal' }); });
    state.projects.forEach(p => { if (p.id !== itemId) targets.push({ id: p.id, title: p.title, type: 'project' }); });
    state.tasks.forEach(t => { if (t.id !== itemId) targets.push({ id: t.id, title: t.title, type: 'task' }); });
    return targets;
  }, [state.goals, state.projects, state.tasks, itemId]);

  function getItemTitle(id: string, type: ItemType) {
    if (type === 'goal') return state.goals.find(g => g.id === id)?.title || id;
    if (type === 'project') return state.projects.find(p => p.id === id)?.title || id;
    return state.tasks.find(t => t.id === id)?.title || id;
  }

  function getTypeIcon(type: ItemType) {
    if (type === 'goal') return <Target className="w-3.5 h-3.5" />;
    if (type === 'project') return <FolderKanban className="w-3.5 h-3.5" />;
    return <CheckSquare className="w-3.5 h-3.5" />;
  }

  function handleAddLink() {
    if (!addLinkTargetId || !canEdit) return;
    dispatch({ type: 'ADD_ITEM_LINK', payload: { sourceId: itemId, sourceType: itemType, targetId: addLinkTargetId, targetType: addLinkType, label: addLinkLabel || undefined, createdAt: new Date().toISOString() } });
    setAddLinkTargetId('');
    setAddLinkLabel('');
    setShowAddLink(false);
  }

  function handleDeleteLink(linkId: string) {
    if (!canEdit) return;
    if (!confirm('确认删除此关联？')) return;
    dispatch({ type: 'DELETE_ITEM_LINK', payload: linkId });
  }

  return (
    <Section title="脉络图" icon={<Link2 className="w-3.5 h-3.5" />}>
      <div className="space-y-2">
        {links.length === 0 && <p className="text-xs text-muted-foreground">暂无关联</p>}
        {links.map(link => {
          const isSource = link.sourceId === itemId;
          const otherId = isSource ? link.targetId : link.sourceId;
          const otherType = isSource ? link.targetType : link.sourceType;
          const agg = aggregates.get(`${otherType}:${otherId}`);
          return (
            <div key={link.id} className="border rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                {getTypeIcon(otherType)}
                <span className="flex-1 truncate font-medium">{getItemTitle(otherId, otherType)}</span>
                {link.label && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-accent rounded">{link.label}</span>}
                <span className="text-xs text-muted-foreground">{isSource ? '\u2192' : '\u2190'}</span>
                <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" onClick={() => handleDeleteLink(link.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
              </div>
              {agg && agg.totalCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 flex-1">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${agg.completionRate}%` }} />
                    </div>
                    <span className="w-8 text-right">{agg.completionRate}%</span>
                  </div>
                  <span>{agg.doneCount}/{agg.totalCount}完成</span>
                  {agg.inProgressCount > 0 && <span className="text-blue-600">{agg.inProgressCount}进行中</span>}
                  {agg.overdueCount > 0 && <span className="text-destructive font-medium flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />{agg.overdueCount}逾期</span>}
                  {agg.latestActivity && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatRelativeTime(agg.latestActivity)}</span>}
                </div>
              )}
            </div>
          );
        })}
        {showAddLink ? (
          <div className="space-y-2 p-2 border rounded bg-accent/30">
            <select className="w-full text-sm border border-input rounded px-2 py-1 bg-white" value={addLinkType} onChange={e => { setAddLinkType(e.target.value as ItemType); setAddLinkTargetId(''); }}>
              <option value="goal">目标</option>
              <option value="project">项目</option>
              <option value="task">任务</option>
            </select>
            <select className="w-full text-sm border border-input rounded px-2 py-1 bg-white" value={addLinkTargetId} onChange={e => setAddLinkTargetId(e.target.value)}>
              <option value="">选择...</option>
              {linkTargets.filter(t => t.type === addLinkType).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input type="text" className="w-full text-sm border border-input rounded px-2 py-1" placeholder="标签（可选）" value={addLinkLabel} onChange={e => setAddLinkLabel(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleAddLink} disabled={!addLinkTargetId}>确认</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddLink(false)}>取消</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddLink(true)}><Plus className="w-3.5 h-3.5" />添加关联</Button>
        )}
      </div>
    </Section>
  );
}
