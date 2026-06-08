import { useState, useMemo, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { usePermissions, useActiveMembers } from '@/store/hooks';
import type { Sprint, SprintStatus, Task, TaskStatus } from '@/types';
import { Plus, Trash2, Edit2, Play, CheckCircle, BarChart3, Clock, AlertTriangle, Columns3, List, Zap, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { resolveToken } from '@/lib/resolveToken';

const STATUS_LABELS: Record<SprintStatus, string> = { planning: '规划中', active: '进行中', completed: '已完成' };
const STATUS_COLORS: Record<SprintStatus, string> = { planning: 'bg-gray-100 text-gray-600', active: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700' };
const TASK_STATUS_LABELS: Record<string, string> = { todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞', cancelled: '已取消' };
const TASK_STATUS_COLORS: Record<TaskStatus, string> = { todo: 'bg-gray-100 text-gray-600', in_progress: 'bg-blue-100 text-blue-600', done: 'bg-green-100 text-green-600', blocked: 'bg-amber-100 text-amber-700', cancelled: 'bg-slate-100 text-slate-400' };

const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'done'];

function isOverdue(task: Task): boolean {
  if (task.status === 'done' || task.status === 'cancelled') return false;
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < new Date();
}

export function SprintTab() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const canManage = can('settings_manage');
  const sprints = state.sprints || [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', goalIds: [] as string[], status: 'planning' as SprintStatus });
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<'board' | 'chart' | 'list'>('board');

  const { activeMembers } = useActiveMembers();

  const selectedSprint = sprints.find(sp => sp.id === selectedSprintId);

  const getSprintTasks = (sprintId: string) => state.tasks.filter(t => t.sprintId === sprintId && !t.deletedAt);

  // Points-based burndown data
  const burndownData = useMemo(() => {
    if (!selectedSprint) return [];
    const start = new Date(selectedSprint.startDate);
    const end = new Date(selectedSprint.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

    const sprintTasks = getSprintTasks(selectedSprint.id);
    const totalPoints = sprintTasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    // Fallback to count-based if no story points set
    const usePoints = totalPoints > 0;
    const total = usePoints ? totalPoints : sprintTasks.length;
    if (total === 0) return [];

    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    const safeDays = Math.max(days, 1);
    const points = [];
    for (let d = 0; d <= safeDays; d++) {
      const date = new Date(start.getTime() + d * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      let completedByDate: number;
      if (usePoints) {
        completedByDate = sprintTasks.filter(t => t.status === 'done' && t.completedAt && t.completedAt.split('T')[0] <= dateStr).reduce((sum, t) => sum + (t.storyPoints || 0), 0);
      } else {
        completedByDate = sprintTasks.filter(t => t.status === 'done' && t.completedAt && t.completedAt.split('T')[0] <= dateStr).length;
      }
      const idealRemaining = Math.max(0, total - (total / safeDays) * d);
      const actualRemaining = total - completedByDate;
      points.push({
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        ideal: Math.round(idealRemaining * 10) / 10,
        actual: actualRemaining,
      });
    }
    return points;
  }, [selectedSprint, state.tasks]);

  // Velocity data (completed story points per completed sprint)
  const velocityData = useMemo(() => {
    const completed = sprints.filter(sp => sp.status === 'completed');
    return completed.map(sp => {
      const tasks = getSprintTasks(sp.id);
      const points = tasks.filter(t => t.status === 'done').reduce((sum, t) => sum + (t.storyPoints || 0), 0);
      const count = tasks.filter(t => t.status === 'done').length;
      return { name: sp.name.length > 10 ? sp.name.substring(0, 10) + '…' : sp.name, points, count };
    });
  }, [sprints, state.tasks]);

  // Running average velocity (last 3 sprints)
  const avgVelocity = useMemo(() => {
    if (velocityData.length === 0) return 0;
    const last3 = velocityData.slice(-3);
    return Math.round(last3.reduce((s, v) => s + v.points, 0) / last3.length);
  }, [velocityData]);

  function handleSave() {
    if (editingId) {
      dispatch({ type: 'UPDATE_SPRINT', payload: { id: editingId, updates: form } });
    } else {
      dispatch({ type: 'ADD_SPRINT', payload: form });
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', startDate: '', endDate: '', goalIds: [], status: 'planning' });
  }

  function startEdit(sp: Sprint) {
    setForm({ name: sp.name, startDate: sp.startDate, endDate: sp.endDate, goalIds: sp.goalIds, status: sp.status });
    setEditingId(sp.id);
    setShowForm(true);
  }

  function toggleGoal(goalId: string) {
    const next = form.goalIds.includes(goalId) ? form.goalIds.filter(id => id !== goalId) : [...form.goalIds, goalId];
    setForm({ ...form, goalIds: next });
  }

  const sprintTaskStats = useMemo(() => {
    if (!selectedSprint) return { total: 0, done: 0, inProgress: 0, todo: 0, blocked: 0, overdue: 0, totalPoints: 0, donePoints: 0 };
    const tasks = getSprintTasks(selectedSprint.id);
    return {
      total: tasks.length, done: tasks.filter(t => t.status === 'done').length, inProgress: tasks.filter(t => t.status === 'in_progress').length, todo: tasks.filter(t => t.status === 'todo').length, blocked: tasks.filter(t => t.status === 'blocked').length, overdue: tasks.filter(isOverdue).length,
      totalPoints: tasks.reduce((s, t) => s + (t.storyPoints || 0), 0),
      donePoints: tasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.storyPoints || 0), 0),
    };
  }, [selectedSprint, state.tasks]);

  const sprintTasks = useMemo(() => {
    if (!selectedSprint) return [];
    return getSprintTasks(selectedSprint.id);
  }, [selectedSprint, state.tasks]);

  const sprintCompletionRate = sprintTaskStats.total > 0 ? Math.round(sprintTaskStats.done / sprintTaskStats.total * 100) : 0;
  const pointsCompletionRate = sprintTaskStats.totalPoints > 0 ? Math.round(sprintTaskStats.donePoints / sprintTaskStats.totalPoints * 100) : 0;

  const sprintStatsMap = useMemo(() => {
    const map: Record<string, { total: number; done: number; rate: number; totalPoints: number; donePoints: number }> = {};
    for (const sp of sprints) {
      const tasks = getSprintTasks(sp.id);
      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'done').length;
      const totalPoints = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
      const donePoints = tasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.storyPoints || 0), 0);
      map[sp.id] = { total, done, rate: total > 0 ? Math.round(done / total * 100) : 0, totalPoints, donePoints };
    }
    return map;
  }, [sprints, state.tasks]);

  return (
    <div className="space-y-4">
       <div className="flex items-center justify-between">
         <h3 className="font-semibold text-sm">迭代管理</h3>
         {canManage && <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', startDate: '', endDate: '', goalIds: [], status: 'planning' }); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新建迭代</button>}
       </div>

      {sprints.length === 0 && <EmptyState title="暂无迭代，创建第一个Sprint开始敏捷管理" compact />}

      {/* Sprint cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sprints.map(sp => {
          const stats = sprintStatsMap[sp.id];
          return (
          <div key={sp.id} onClick={() => setSelectedSprintId(sp.id)} className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedSprintId === sp.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{sp.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[sp.status]}`}>{STATUS_LABELS[sp.status]}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{sp.startDate} ~ {sp.endDate}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-muted-foreground">{sp.goalIds.length}个目标</span>
              <span className="text-[11px] text-muted-foreground">· {stats.total}个任务</span>
              {stats.totalPoints > 0 && <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">· <Zap className="w-2.5 h-2.5" />{stats.donePoints}/{stats.totalPoints}点</span>}
            </div>
            {stats.total > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">进度</span>
                  <span className="font-medium">{stats.rate}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${stats.rate}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1" />
              {sp.status === 'planning' && <button onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_SPRINT', payload: { id: sp.id, updates: { status: 'active' } } }); }} className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer" aria-label="启动迭代"><Play size={14} /></button>}
              {sp.status === 'active' && <button onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_SPRINT', payload: { id: sp.id, updates: { status: 'completed' } } }); }} className="text-xs text-green-600 hover:text-green-800 cursor-pointer" aria-label="完成迭代"><CheckCircle size={14} /></button>}
              {canManage && <button onClick={e => { e.stopPropagation(); startEdit(sp); }} className="text-muted-foreground hover:text-primary cursor-pointer" aria-label="编辑迭代"><Edit2 size={14} /></button>}
              {canManage && <button onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_SPRINT', payload: sp.id }); if (selectedSprintId === sp.id) setSelectedSprintId(null); }} className="text-muted-foreground hover:text-destructive cursor-pointer" aria-label="删除迭代"><Trash2 size={14} /></button>}
            </div>
          </div>
          );
        })}
      </div>

      {/* Selected sprint detail */}
      {selectedSprint && (
        <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={16} className="text-primary" /> {selectedSprint.name}</h4>
            <div className="flex items-center gap-3 text-xs">
              <span>总计 {sprintTaskStats.total}</span>
              <span className="text-green-600">完成 {sprintTaskStats.done}</span>
              <span className="text-blue-600">进行 {sprintTaskStats.inProgress}</span>
              <span className="text-gray-500">待办 {sprintTaskStats.todo}</span>
              {sprintTaskStats.blocked > 0 && <span className="text-red-600 flex items-center gap-0.5"><AlertTriangle size={11} /> 阻塞 {sprintTaskStats.blocked}</span>}
              {sprintTaskStats.overdue > 0 && <span className="text-orange-600 flex items-center gap-0.5"><Clock size={11} /> 逾期 {sprintTaskStats.overdue}</span>}
              {sprintTaskStats.totalPoints > 0 && <span className="text-primary flex items-center gap-0.5"><Zap className="w-3 h-3" /> {sprintTaskStats.donePoints}/{sprintTaskStats.totalPoints}点</span>}
            </div>
          </div>

          {/* Progress bar */}
          {sprintTaskStats.total > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">完成率{pointsCompletionRate > 0 ? `（故事点 ${pointsCompletionRate}%）` : ''}</span>
                <span className="font-medium">{sprintCompletionRate}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${sprintCompletionRate}%` }} />
              </div>
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex items-center gap-2 border-b border-border pb-2">
            {(['board', 'chart', 'list'] as const).map(mode => (
              <button key={mode} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors', detailView === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} onClick={() => setDetailView(mode)}>
                {mode === 'board' && <Columns3 size={13} />}
                {mode === 'chart' && <BarChart3 size={13} />}
                {mode === 'list' && <List size={13} />}
                {mode === 'board' ? '看板' : mode === 'chart' ? '图表' : '列表'}
              </button>
            ))}
          </div>

          {/* Board view — Kanban columns with drag-and-drop */}
          {detailView === 'board' && (
            <SprintKanbanBoard sprintTasks={sprintTasks} dispatch={dispatch} />
          )}

          {/* Chart view — Burndown + Velocity */}
          {detailView === 'chart' && (
            <div className="space-y-4">
              {/* Burndown */}
              {burndownData.length > 0 ? (
                <div>
                  <h5 className="text-xs font-semibold text-muted-foreground mb-2">燃尽图{burndownData[0]?.actual !== undefined && sprintTaskStats.totalPoints > 0 ? '（故事点）' : '（任务数）'}</h5>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={burndownData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={resolveToken('border')} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="ideal" stroke={resolveToken('muted-foreground')} fill={resolveToken('muted')} strokeWidth={2} strokeDasharray="5 5" name="理想线" />
                      <Area type="monotone" dataKey="actual" stroke={resolveToken('primary')} fill="#3b82f620" strokeWidth={2} name="实际线" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">暂无燃尽数据（需关联任务到该迭代）</p>
              )}
              {/* Velocity chart */}
              {velocityData.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-muted-foreground mb-1">速度图（已完成迭代的故事点）</h5>
                  {avgVelocity > 0 && <p className="text-[10px] text-muted-foreground mb-2">近3轮平均速度：{avgVelocity} 点/迭代</p>}
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={velocityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={resolveToken('border')} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="points" fill={resolveToken('primary')} radius={[4, 4, 0, 0]} name="故事点" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {velocityData.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">完成至少1个迭代后将显示速度图</p>
              )}
            </div>
          )}

          {/* List view */}
          {detailView === 'list' && (
            <div>
              {sprintTasks.length > 0 ? (
                <div className="space-y-1 max-h-[360px] overflow-y-auto">
                  {sprintTasks.map(t => {
                    const overdue = isOverdue(t);
                    return (
                      <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'done' ? 'bg-green-500' : t.status === 'blocked' ? 'bg-red-500' : t.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        <span className={`truncate flex-1 ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                        {t.storyPoints > 0 && <span className="shrink-0 flex items-center gap-0.5 text-amber-600"><Zap className="w-2.5 h-2.5" />{t.storyPoints}</span>}
                        <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] ${TASK_STATUS_COLORS[t.status]}`}>{TASK_STATUS_LABELS[t.status]}</span>
                        {overdue && <span className="shrink-0 text-orange-600 flex items-center gap-0.5"><Clock size={10} />逾期</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="该迭代暂无关联任务，请在任务详情中将任务分配到此迭代" compact />
              )}
            </div>
          )}
        </div>
      )}

      {/* Sprint form */}
      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h4 className="text-xs font-semibold">{editingId ? '编辑迭代' : '新建迭代'}</h4>
          <div>
            <label className="text-xs text-muted-foreground">名称</label>
            <input type="text" className="w-full border border-input rounded px-2 py-1 text-sm mt-1" placeholder="如：Sprint 1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">开始日期</label>
              <input type="date" className="w-full border border-input rounded px-2 py-1 text-sm mt-1" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">结束日期</label>
              <input type="date" className="w-full border border-input rounded px-2 py-1 text-sm mt-1" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">关联目标</label>
            <div className="mt-1 max-h-[160px] overflow-y-auto space-y-1">
              {state.goals.map(g => (
                <label key={g.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted cursor-pointer">
                  <input type="checkbox" checked={form.goalIds.includes(g.id)} onChange={() => toggleGoal(g.id)} />
                  <span className="truncate">{g.title}</span>
                </label>
              ))}
              {state.goals.length === 0 && <EmptyState title="暂无目标" compact />}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.name.trim() || !form.startDate || !form.endDate || form.endDate <= form.startDate} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 cursor-pointer">{editingId ? '保存' : '创建'}</button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted cursor-pointer">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sprint Kanban Board with Drag-and-Drop ─────────────────────────

const NEXT_STATUS_MAP: Record<TaskStatus, TaskStatus | null> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'in_progress',
  blocked: 'in_progress',
  cancelled: null,
};

const TASK_STATUS_COLORS_HEX: Record<TaskStatus, string> = {
  todo: '#9ca3af',
  in_progress: '#3b82f6',
  done: '#22c55e',
  blocked: '#f59e0b',
  cancelled: '#94a4b8',
};

interface SprintKanbanBoardProps {
  sprintTasks: Task[];
  dispatch: React.Dispatch<unknown>;
}

function SprintKanbanBoard({ sprintTasks, dispatch }: SprintKanbanBoardProps) {
  const dragTaskIdRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    dragTaskIdRef.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // Reduce opacity of dragged card after a frame (so browser captures ghost first)
    const target = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => { target.style.opacity = '0.4'; });
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    dragTaskIdRef.current = null;
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, col: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(col);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || dragTaskIdRef.current;
    if (!taskId) return;
    const task = sprintTasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
      dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { status: newStatus } } });
    }
    dragTaskIdRef.current = null;
    setDropTarget(null);
  }, [sprintTasks, dispatch]);

  const quickMoveStatus = useCallback((taskId: string, currentStatus: TaskStatus) => {
    const next = NEXT_STATUS_MAP[currentStatus];
    if (next) {
      dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { status: next } } });
    }
  }, [dispatch]);

  return (
    <div className="grid grid-cols-3 gap-3">
      {BOARD_COLUMNS.map(col => {
        const colTasks = sprintTasks.filter(t => t.status === col);
        const colPoints = colTasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
        const isDropTarget = dropTarget === col;
        return (
          <div
            key={col}
            className={cn(
              'space-y-2 rounded-lg p-1.5 transition-colors min-h-[200px]',
              isDropTarget && 'bg-primary/5 ring-2 ring-primary/30 ring-offset-1',
            )}
            onDragOver={e => handleDragOver(e, col)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, col)}
          >
            <div className={cn('text-xs font-medium px-2 py-1 rounded flex items-center justify-between', TASK_STATUS_COLORS[col])}>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS_HEX[col] }} />
                {TASK_STATUS_LABELS[col]}
              </span>
              <span>{colTasks.length}{colPoints > 0 ? ` · ${colPoints}pt` : ''}</span>
            </div>
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
              {colTasks.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 text-center py-6 border border-dashed border-border/50 rounded-lg">
                  {isDropTarget ? '松开放置' : '拖拽任务到此处'}
                </p>
              )}
              {colTasks.map(t => {
                const nextStatus = NEXT_STATUS_MAP[t.status];
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={e => handleDragStart(e, t.id)}
                    onDragEnd={handleDragEnd}
                    className="p-2 border border-border rounded-lg bg-card text-xs space-y-1 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing group"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-medium truncate flex-1">{t.title}</span>
                      {nextStatus && (
                        <button
                          onClick={() => quickMoveStatus(t.id, t.status)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-opacity cursor-pointer"
                          aria-label={`移至${TASK_STATUS_LABELS[nextStatus]}`}
                          title={`快速移至${TASK_STATUS_LABELS[nextStatus]}`}
                        >
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {t.storyPoints > 0 && <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5 text-amber-500" />{t.storyPoints}</span>}
                      {t.dueDate && <span className={cn('flex items-center gap-0.5', isOverdue(t) && 'text-red-500')}><Clock className="w-2.5 h-2.5" />{t.dueDate}</span>}
                    </div>
                    {(t.blockedBy || []).length > 0 && <span className="text-[10px] text-amber-600">{t.blockedBy.length}个依赖</span>}
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
