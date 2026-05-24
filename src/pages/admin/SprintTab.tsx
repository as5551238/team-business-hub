import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Sprint, SprintStatus } from '@/types';
import { Plus, Trash2, Edit2, Play, CheckCircle, BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const STATUS_LABELS: Record<SprintStatus, string> = { planning: '规划中', active: '进行中', completed: '已完成' };
const STATUS_COLORS: Record<SprintStatus, string> = { planning: 'bg-gray-100 text-gray-600', active: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700' };

export function SprintTab() {
  const { state, dispatch } = useStore();
  const sprints = state.sprints || [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', goalIds: [] as string[], status: 'planning' as SprintStatus });
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  const activeMembers = useMemo(() => state.members.filter(m => m.status === 'active'), [state.members]);

  const selectedSprint = sprints.find(sp => sp.id === selectedSprintId);

  // Burndown data for selected sprint
  const burndownData = useMemo(() => {
    if (!selectedSprint) return [];
    const start = new Date(selectedSprint.startDate);
    const end = new Date(selectedSprint.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

    // Get tasks in this sprint's goals
    const sprintGoalIds = new Set(selectedSprint.goalIds);
    const sprintTasks = state.tasks.filter(t => t.goalId && sprintGoalIds.has(t.goalId));
    const totalTasks = sprintTasks.length;
    if (totalTasks === 0) return [];

    // Generate daily burndown points
    const days = Math.ceil((end.getTime() - start.getTime()) / (86400000)) + 1;
    const points = [];
    for (let d = 0; d <= Math.min(days, 30); d++) {
      const date = new Date(start.getTime() + d * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      const completedByDate = sprintTasks.filter(t => t.status === 'done' && t.completedAt && t.completedAt.split('T')[0] <= dateStr).length;
      const idealRemaining = Math.max(0, totalTasks - (totalTasks / days) * d);
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
    if (!selectedSprint) return { total: 0, done: 0, inProgress: 0, todo: 0 };
    const goalIds = new Set(selectedSprint.goalIds);
    const tasks = state.tasks.filter(t => t.goalId && goalIds.has(t.goalId));
    return { total: tasks.length, done: tasks.filter(t => t.status === 'done').length, inProgress: tasks.filter(t => t.status === 'in_progress').length, todo: tasks.filter(t => t.status === 'todo').length };
  }, [selectedSprint, state.tasks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">迭代管理</h3>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', startDate: '', endDate: '', goalIds: [], status: 'planning' }); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新建迭代</button>
      </div>

      {sprints.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">暂无迭代，创建第一个Sprint开始敏捷管理</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sprints.map(sp => (
          <div key={sp.id} onClick={() => setSelectedSprintId(sp.id)} className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedSprintId === sp.id ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-muted/30'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{sp.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[sp.status]}`}>{STATUS_LABELS[sp.status]}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{sp.startDate} ~ {sp.endDate}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">{sp.goalIds.length}个目标</span>
              <div className="flex-1" />
              {sp.status === 'planning' && <button onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_SPRINT', payload: { id: sp.id, updates: { status: 'active' } } }); }} className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"><Play size={14} /></button>}
              {sp.status === 'active' && <button onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_SPRINT', payload: { id: sp.id, updates: { status: 'completed' } } }); }} className="text-xs text-green-600 hover:text-green-800 cursor-pointer"><CheckCircle size={14} /></button>}
              <button onClick={e => { e.stopPropagation(); startEdit(sp); }} className="text-muted-foreground hover:text-primary cursor-pointer"><Edit2 size={14} /></button>
              <button onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_SPRINT', payload: sp.id }); if (selectedSprintId === sp.id) setSelectedSprintId(null); }} className="text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {selectedSprint && (
        <div className="border border-border rounded-lg p-4 space-y-4 bg-white">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={16} className="text-primary" /> {selectedSprint.name} — 燃尽图</h4>
            <div className="flex gap-3 text-xs">
              <span>总计 {sprintTaskStats.total}</span>
              <span className="text-green-600">完成 {sprintTaskStats.done}</span>
              <span className="text-blue-600">进行 {sprintTaskStats.inProgress}</span>
              <span className="text-gray-500">待办 {sprintTaskStats.todo}</span>
            </div>
          </div>
          {burndownData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={burndownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="ideal" stroke="#94a3b8" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5" name="理想线" />
                <Area type="monotone" dataKey="actual" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} name="实际线" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">暂无数据（需关联目标且目标下有任务）</p>
          )}
        </div>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-white">
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
              {state.goals.length === 0 && <p className="text-xs text-muted-foreground">暂无目标</p>}
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
