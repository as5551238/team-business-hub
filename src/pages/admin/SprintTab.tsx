import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { usePermissions, useActiveMembers } from '@/store/hooks';
import type { Sprint, SprintStatus, Task } from '@/types';
import { Plus, Trash2, Edit2, Play, CheckCircle, BarChart3, Clock, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { resolveToken } from '@/lib/resolveToken';

const STATUS_LABELS: Record<SprintStatus, string> = { planning: '规划中', active: '进行中', completed: '已完成' };
const STATUS_COLORS: Record<SprintStatus, string> = { planning: 'bg-gray-100 text-gray-600', active: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700' };
const TASK_STATUS_LABELS: Record<string, string> = { todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞', cancelled: '已取消' };
const TASK_STATUS_COLORS: Record<string, string> = { todo: 'text-gray-500', in_progress: 'text-blue-600', done: 'text-green-600', blocked: 'text-red-600', cancelled: 'text-gray-400' };

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

  const { activeMembers } = useActiveMembers();

  const selectedSprint = sprints.find(sp => sp.id === selectedSprintId);

  // Direct sprint→task mapping via sprintId
  const getSprintTasks = (sprintId: string) => state.tasks.filter(t => t.sprintId === sprintId);

  // Burndown data for selected sprint (uses direct sprintId mapping)
  const burndownData = useMemo(() => {
    if (!selectedSprint) return [];
    const start = new Date(selectedSprint.startDate);
    const end = new Date(selectedSprint.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

    const sprintTasks = getSprintTasks(selectedSprint.id);
    const totalTasks = sprintTasks.length;
    if (totalTasks === 0) return [];

    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    const safeDays = Math.max(days, 1);
    const points = [];
    for (let d = 0; d <= Math.min(safeDays, 30); d++) {
      const date = new Date(start.getTime() + d * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      const completedByDate = sprintTasks.filter(t => t.status === 'done' && t.completedAt && t.completedAt.split('T')[0] <= dateStr).length;
      const idealRemaining = Math.max(0, totalTasks - (totalTasks / safeDays) * d);
      const actualRemaining = totalTasks - completedByDate;
      points.push({ date: `${date.getMonth() + 1}/${date.getDate()}`, ideal: Math.round(idealRemaining * 10) / 10, actual: actualRemaining });
    }
    return points;
  }, [selectedSprint, state.tasks]);

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
    if (!selectedSprint) return { total: 0, done: 0, inProgress: 0, todo: 0, blocked: 0, overdue: 0 };
    const tasks = getSprintTasks(selectedSprint.id);
    return { total: tasks.length, done: tasks.filter(t => t.status === 'done').length, inProgress: tasks.filter(t => t.status === 'in_progress').length, todo: tasks.filter(t => t.status === 'todo').length, blocked: tasks.filter(t => t.status === 'blocked').length, overdue: tasks.filter(isOverdue).length };
  }, [selectedSprint, state.tasks]);

  // Sprint task list
  const sprintTasks = useMemo(() => {
    if (!selectedSprint) return [];
    return getSprintTasks(selectedSprint.id);
  }, [selectedSprint, state.tasks]);

  const sprintCompletionRate = sprintTaskStats.total > 0 ? Math.round(sprintTaskStats.done / sprintTaskStats.total * 100) : 0;

  // Per-sprint stats for card progress bars
  const sprintStatsMap = useMemo(() => {
    const map: Record<string, { total: number; done: number; rate: number }> = {};
    for (const sp of sprints) {
      const tasks = getSprintTasks(sp.id);
      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'done').length;
      map[sp.id] = { total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 };
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

      {selectedSprint && (
        <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={16} className="text-primary" /> {selectedSprint.name}</h4>
            <div className="flex gap-3 text-xs">
              <span>总计 {sprintTaskStats.total}</span>
              <span className="text-green-600">完成 {sprintTaskStats.done}</span>
              <span className="text-blue-600">进行 {sprintTaskStats.inProgress}</span>
              <span className="text-gray-500">待办 {sprintTaskStats.todo}</span>
              {sprintTaskStats.blocked > 0 && <span className="text-red-600 flex items-center gap-0.5"><AlertTriangle size={11} /> 阻塞 {sprintTaskStats.blocked}</span>}
              {sprintTaskStats.overdue > 0 && <span className="text-orange-600 flex items-center gap-0.5"><Clock size={11} /> 逾期 {sprintTaskStats.overdue}</span>}
            </div>
          </div>
          {/* Completion rate bar */}
          {sprintTaskStats.total > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">完成率</span>
                <span className="font-medium">{sprintCompletionRate}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${sprintCompletionRate}%` }} />
              </div>
            </div>
          )}
          {burndownData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={burndownData}>
                <CartesianGrid strokeDasharray="3 3" stroke={resolveToken('border')} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="ideal" stroke={resolveToken('muted-foreground')} fill={resolveToken('muted')} strokeWidth={2} strokeDasharray="5 5" name="理想线" />
                <Area type="monotone" dataKey="actual" stroke={resolveToken('primary')} fill={resolveToken('primary', 0.1)} strokeWidth={2} name="实际线" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground py-6 text-center">暂无燃尽数据（需关联任务到该迭代）</p>
          )}
          {/* Task list under burndown */}
          {sprintTasks.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-2">迭代任务（{sprintTasks.length}）</h5>
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {sprintTasks.map(t => {
                  const overdue = isOverdue(t);
                  return (
                    <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'done' ? 'bg-green-500' : t.status === 'blocked' ? 'bg-red-500' : t.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      <span className={`truncate flex-1 ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                      <span className={`shrink-0 ${TASK_STATUS_COLORS[t.status] || 'text-gray-500'}`}>{TASK_STATUS_LABELS[t.status] || t.status}</span>
                      {overdue && <span className="shrink-0 text-orange-600 flex items-center gap-0.5"><Clock size={10} />逾期</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {sprintTasks.length === 0 && selectedSprint && (
            <EmptyState title="该迭代暂无关联任务，请在任务详情中将任务分配到此迭代" compact />
          )}
        </div>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h4 className="text-xs font-semibold">{editingId ? '编辑迭代' : '新建迭代'}</h4>
          <div>
            <label className="text-xs text-muted-foreground">名称</label>
            <input className="w-full border border-input rounded px-2 py-1 text-sm mt-1" placeholder="如：Sprint 1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
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
            <button onClick={handleSave} disabled={!form.name.trim() || !form.startDate || !form.endDate || form.endDate <= form.startDate} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">{editingId ? '保存' : '创建'}</button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
