import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal, Project, Task } from '@/types';
import { ChevronRight, ChevronDown, Target, FolderKanban, ListChecks, Users, Clock, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-gray-400', in_progress: 'bg-blue-500', done: 'bg-green-500',
  blocked: 'bg-amber-500', cancelled: 'bg-red-400',
};
const STATUS_LABEL: Record<string, string> = {
  todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞', cancelled: '已取消',
};

export function CascadeDrilldownView() {
  const { state } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const seasons = state.seasons || [];
  const activeSeasons = seasons.filter(s => s.status !== 'closed');

  // Build cascade tree: Goal → Projects → Tasks
  const cascadeTree = useMemo(() => {
    let goals = state.goals.filter(g => !g.deletedAt);
    if (selectedSeasonId) goals = goals.filter(g => g.seasonId === selectedSeasonId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      // Include goals whose title matches, or that have matching projects/tasks
      const matchingGoalIds = new Set<string>();
      for (const g of goals) {
        if (g.title.toLowerCase().includes(q)) matchingGoalIds.add(g.id);
      }
      for (const p of state.projects) {
        if (p.title.toLowerCase().includes(q) && p.goalId) matchingGoalIds.add(p.goalId);
      }
      for (const t of state.tasks) {
        if (t.title.toLowerCase().includes(q)) {
          if (t.goalId) matchingGoalIds.add(t.goalId);
          if (t.projectId) {
            const proj = state.projects.find(p => p.id === t.projectId);
            if (proj?.goalId) matchingGoalIds.add(proj.goalId);
          }
        }
      }
      goals = goals.filter(g => matchingGoalIds.has(g.id));
    }

    return goals.map(g => {
      const projects = state.projects.filter(p => p.goalId === g.id && !p.deletedAt);
      const projectNodes = projects.map(p => {
        const tasks = state.tasks.filter(t => t.projectId === p.id && !t.deletedAt);
        // Filter by search query at task level
        const filteredTasks = searchQuery.trim()
          ? tasks
          : tasks;
        return { project: p, tasks: filteredTasks };
      });
      // Orphan tasks (linked to goal but not to a project)
      const orphanTasks = state.tasks.filter(t => t.goalId === g.id && !t.projectId && !t.deletedAt);
      return { goal: g, projectNodes, orphanTasks };
    });
  }, [state.goals, state.projects, state.tasks, selectedSeasonId, searchQuery]);

  function toggleGoal(id: string) {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleProject(id: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getMemberName(id: string | null): string {
    if (!id) return '';
    return state.members.find(m => m.id === id)?.name || '';
  }

  // Computed roll-up progress
  function goalProgressFromChildren(goalId: string): number {
    const goal = state.goals.find(g => g.id === goalId);
    if (!goal) return 0;
    // If goal has explicit progress, use that
    if (goal.progress > 0) return goal.progress;
    // Otherwise compute from tasks
    const tasks = state.tasks.filter(t => t.goalId === goalId && !t.deletedAt);
    if (tasks.length === 0) return 0;
    const done = tasks.filter(t => t.status === 'done').length;
    return Math.round(done / tasks.length * 100);
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="border border-input rounded px-2 py-1 text-sm flex-1 min-w-[140px] max-w-[280px]"
          placeholder="搜索目标/项目/任务..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <select
          className="border border-input rounded px-2 py-1 text-sm"
          value={selectedSeasonId || ''}
          onChange={e => setSelectedSeasonId(e.target.value || null)}
        >
          <option value="">全部周期</option>
          {activeSeasons.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {cascadeTree.length} 个目标 · {cascadeTree.reduce((s, n) => s + n.projectNodes.length, 0)} 个项目 · {cascadeTree.reduce((s, n) => s + n.orphanTasks.length + n.projectNodes.reduce((ps, pn) => ps + pn.tasks.length, 0), 0)} 个任务
        </span>
      </div>

      {cascadeTree.length === 0 && (
        <EmptyState title="暂无目标数据，创建目标并关联项目/任务以查看穿透视图" compact />
      )}

      {/* Cascade tree */}
      <div className="space-y-1">
        {cascadeTree.map(({ goal, projectNodes, orphanTasks }) => {
          const isGoalExpanded = expandedGoals.has(goal.id);
          const totalTasks = projectNodes.reduce((s, pn) => s + pn.tasks.length, 0) + orphanTasks.length;
          const doneTasks = projectNodes.reduce((s, pn) => s + pn.tasks.filter(t => t.status === 'done').length, 0) + orphanTasks.filter(t => t.status === 'done').length;
          const progress = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : goalProgressFromChildren(goal.id);
          const overdueTasks = projectNodes.flatMap(pn => pn.tasks).concat(orphanTasks).filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && new Date(t.dueDate) < new Date());

          return (
            <div key={goal.id} className="border border-border rounded-lg overflow-hidden">
              {/* Goal row */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => toggleGoal(goal.id)}
              >
                {isGoalExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[goal.status]}`} />
                <Target size={14} className="text-primary shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{goal.title}</span>
                {goal.leaderId && (
                  <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                    <Users size={10} /> {getMemberName(goal.leaderId)}
                  </span>
                )}
                {overdueTasks.length > 0 && (
                  <span className="text-[10px] text-orange-600 shrink-0 flex items-center gap-0.5">
                    <AlertTriangle size={10} /> {overdueTasks.length}逾期
                  </span>
                )}
                <span className="text-xs font-medium shrink-0">{progress}%</span>
                <div className="w-16 h-1.5 bg-gray-100 rounded-full shrink-0 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{doneTasks}/{totalTasks}</span>
              </div>

              {/* Expanded: projects and tasks */}
              {isGoalExpanded && (
                <div className="border-t border-border bg-muted/10">
                  {projectNodes.length === 0 && orphanTasks.length === 0 && (
                    <div className="px-8 py-3 text-xs text-muted-foreground italic">
                      尚未拆解为项目或任务，请在目标详情中关联项目
                    </div>
                  )}

                  {projectNodes.map(({ project, tasks }) => {
                    const isProjectExpanded = expandedProjects.has(project.id);
                    const projDone = tasks.filter(t => t.status === 'done').length;
                    const projProgress = tasks.length > 0 ? Math.round(projDone / tasks.length * 100) : project.progress || 0;
                    return (
                      <div key={project.id} className="border-b border-border/50 last:border-b-0">
                        <div
                          className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => toggleProject(project.id)}
                          style={{ paddingLeft: 32 }}
                        >
                          {isProjectExpanded ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[project.status]}`} />
                          <FolderKanban size={12} className="text-blue-500 shrink-0" />
                          <span className="text-xs font-medium truncate flex-1">{project.title}</span>
                          {project.leaderId && (
                            <span className="text-[10px] text-muted-foreground shrink-0">{getMemberName(project.leaderId)}</span>
                          )}
                          <span className="text-[10px] font-medium shrink-0">{projProgress}%</span>
                          <div className="w-10 h-1 bg-gray-100 rounded-full shrink-0 overflow-hidden">
                            <div className={`h-full rounded-full ${projProgress >= 80 ? 'bg-green-500' : projProgress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${projProgress}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{projDone}/{tasks.length}</span>
                        </div>

                        {isProjectExpanded && tasks.length > 0 && (
                          <div className="pb-1">
                            {tasks.map(task => renderTaskRow(task, getMemberName))}
                          </div>
                        )}
                        {isProjectExpanded && tasks.length === 0 && (
                          <div className="px-12 py-2 text-[11px] text-muted-foreground italic">暂无任务</div>
                        )}
                      </div>
                    );
                  })}

                  {orphanTasks.length > 0 && (
                    <div className="px-8 py-1.5">
                      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                        <ListChecks size={10} /> 直接关联任务（未归属项目）
                      </div>
                      {orphanTasks.map(task => renderTaskRow(task, getMemberName))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderTaskRow(task: Task, getMemberName: (id: string | null) => string) {
  const isOverdue = task.status !== 'done' && task.status !== 'cancelled' && task.dueDate && new Date(task.dueDate) < new Date();
  return (
    <div key={task.id} className="flex items-center gap-2 px-6 py-1.5 hover:bg-muted/20 transition-colors" style={{ paddingLeft: 48 }}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
      <ListChecks size={11} className="text-emerald-500 shrink-0" />
      <span className={`text-[11px] truncate flex-1 ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
        {task.title}
      </span>
      {task.leaderId && (
        <span className="text-[10px] text-muted-foreground shrink-0">{getMemberName(task.leaderId)}</span>
      )}
      {isOverdue && (
        <span className="text-[10px] text-orange-600 shrink-0 flex items-center gap-0.5">
          <Clock size={9} /> 逾期
        </span>
      )}
      <span className="text-[10px] text-muted-foreground shrink-0">{STATUS_LABEL[task.status] || task.status}</span>
    </div>
  );
}
