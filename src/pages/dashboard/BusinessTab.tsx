/**
 * 业务现况 Tab — 数据概览 + 目标进度 + 完成趋势
 */
import { useMemo } from 'react';
import { Target, FolderKanban, CheckCircle2, AlertTriangle, TrendingUp, Clock, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import { getFunnelMetrics } from '@/lib/analytics';
import { CHART_COLORS, StatCard, useFilteredData } from './shared';
import type { DashboardTabProps } from './shared';
import { AIFocusWidget } from '@/components/AIFocusWidget';

export default function BusinessTab({ onOpenDetail, onPageChange }: DashboardTabProps) {
  const { state, memberGoals, memberTasks, memberProjects, todayStr, getMemberName, commentCountMap } = useFilteredData();

  const stats = useMemo(() => {
    const activeGoals = memberGoals.filter(g => g.status === 'in_progress');
    const activeProjects = memberProjects.filter(p => p.status === 'in_progress');
    const myTasks = memberTasks.filter(t => t.leaderId === state.currentUser?.id && t.status !== 'done');
    const overdueTasks = memberTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < todayStr);
    const todayTodos = memberTasks.filter(t => t.leaderId === state.currentUser?.id && t.status !== 'done' && t.dueDate === todayStr);
    const completedThisWeek = memberTasks.filter(t => {
      if (!t.completedAt) return false;
      const d = new Date(t.completedAt);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    });
    return {
      activeGoals: activeGoals.length, activeProjects: activeProjects.length,
      myTasks: myTasks.length, overdueTasks: overdueTasks.length, todayTodos,
      completedThisWeek: completedThisWeek.length,
      overallGoalProgress: activeGoals.length > 0 ? Math.round(activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length) : 0,
    };
  }, [memberGoals, memberProjects, memberTasks, state.currentUser, todayStr]);

  const taskStatusData = useMemo(() => {
    const counts: Record<string, number> = { todo: 0, in_progress: 0, done: 0, blocked: 0, cancelled: 0 };
    memberTasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name: { todo: '待办', in_progress: '进行中', done: '完成', blocked: '阻塞', cancelled: '取消' }[name] ?? name, value }));
  }, [memberTasks]);

  const taskPriorityData = useMemo(() => {
    const counts: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0 };
    memberTasks.forEach(t => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name: { urgent: '紧急', high: '高', medium: '中', low: '低' }[name] ?? name, value }));
  }, [memberTasks]);

  const activeGoals = useMemo(() => memberGoals.filter(g => g.status === 'in_progress'), [memberGoals]);

  const trendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    const completedMap: Record<string, number> = {};
    const createdMap: Record<string, number> = {};
    for (const d of days) { completedMap[d] = 0; createdMap[d] = 0; }
    for (const t of memberTasks) {
      if (t.status === 'done' && t.completedAt) {
        const day = t.completedAt.slice(0, 10);
        if (day in completedMap) completedMap[day]++;
      }
      if (t.createdAt) {
        const day = t.createdAt.slice(0, 10);
        if (day in createdMap) createdMap[day]++;
      }
    }
    return days.map(d => {
      const dt = new Date(d);
      return { day: `${dt.getMonth() + 1}/${dt.getDate()}`, created: createdMap[d], completed: completedMap[d] };
    });
  }, [memberTasks]);

  return (
    <div className="space-y-6">
      {/* 4 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Target size={20} className="text-blue-600" />} label="进行中目标" value={stats.activeGoals} sub={`平均进度 ${stats.overallGoalProgress}%`} color="bg-blue-50" onClick={() => { onPageChange('goals'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-nav-filter', { detail: { page: 'goals', statuses: ['in_progress'] } })), 100); }} />
        <StatCard icon={<FolderKanban size={20} className="text-emerald-600" />} label="活跃项目" value={stats.activeProjects} color="bg-emerald-50" onClick={() => { onPageChange('projects'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-nav-filter', { detail: { page: 'projects', statuses: ['in_progress'] } })), 100); }} />
        <StatCard icon={<Clock size={20} className="text-orange-600" />} label="我的待办" value={stats.myTasks} sub={`今日 ${stats.todayTodos.length} 项`} color="bg-orange-50" onClick={() => { onPageChange('tasks'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-nav-filter', { detail: { page: 'tasks', statuses: ['todo', 'in_progress'] } })), 100); }} />
        <StatCard icon={<AlertTriangle size={20} className="text-red-600" />} label="已逾期" value={stats.overdueTasks} color="bg-red-50" onClick={() => { onPageChange('tasks'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-nav-filter', { detail: { page: 'tasks', timeFilter: 'overdue' } })), 100); }} />
      </div>

      {/* 饼图行：状态分布 + 优先级分布 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-border shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all" onClick={() => onPageChange('tasks')}>
          <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-muted-foreground">任务状态分布</span><BarChart3 size={14} className="text-muted-foreground/50" /></div>
          <div className="h-[120px]">{taskStatusData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={taskStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={2} strokeWidth={0}>{taskStatusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(v: number, n: string) => [`${v} 项`, n]} /></PieChart></ResponsiveContainer>) : (<div className="h-full flex items-center justify-center text-xs text-muted-foreground">暂无数据</div>)}</div>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all" onClick={() => onPageChange('tasks')}>
          <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-muted-foreground">优先级分布</span><BarChart3 size={14} className="text-muted-foreground/50" /></div>
          <div className="h-[120px]">{taskPriorityData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={taskPriorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={2} strokeWidth={0}>{taskPriorityData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(v: number, n: string) => [`${v} 项`, n]} /></PieChart></ResponsiveContainer>) : (<div className="h-full flex items-center justify-center text-xs text-muted-foreground">暂无数据</div>)}</div>
        </div>
      </div>

      {/* 近7天趋势 */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground">近7天任务趋势</span>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-500" />新建</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />完成</span>
          </div>
        </div>
        <div className="h-[160px]">
          {trendData.some(d => d.created > 0 || d.completed > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [`${v} 项`]} />
                <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="新建" />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="完成" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">暂无数据</div>
          )}
        </div>
      </div>

      {/* 目标进度 */}
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><TrendingUp size={18} className="text-primary" /><h2 className="font-semibold text-sm md:text-base">目标进度</h2></div>
        </div>
        <div className="divide-y divide-border">
          {activeGoals.slice(0, 5).map(goal => {
            const goalComments = commentCountMap[goal.id] || 0;
            return (
              <div key={goal.id} className="px-4 md:px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpenDetail(goal.id, 'goal')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium truncate flex-1 mr-2">{goal.title}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {goalComments > 0 && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{goalComments}</span>}
                    <span className="text-sm font-bold text-primary">{goal.progress}%</span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full animate-progress transition-all" style={{ width: `${goal.progress}%`, backgroundColor: goal.progress >= 80 ? 'hsl(var(--success))' : goal.progress >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--warning))' }} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground">{getMemberName(goal.leaderId)}</span>
                  <span className="text-xs text-muted-foreground/50">|</span>
                  <span className="text-xs text-muted-foreground">{goal.endDate && `截止 ${new Date(goal.endDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`}</span>
                </div>
              </div>
            );
          })}
          {activeGoals.length === 0 && <div className="px-5 py-10 text-center text-muted-foreground text-sm">暂无进行中的目标</div>}
        </div>
      </div>

      {/* 管理员效能概览 */}
      {state.currentUser?.role === 'admin' && (() => { const m = getFunnelMetrics(); return m.totalSessions > 0 ? (<div className="bg-white rounded-xl border border-border shadow-sm p-4"><div className="flex items-center gap-2 mb-2"><BarChart3 size={16} className="text-indigo-500" /><span className="text-xs font-semibold text-muted-foreground">效能概览</span></div><div className="text-xs text-muted-foreground space-y-1"><p>平均步数 <span className="font-medium text-foreground">{m.avgSteps.toFixed(1)}</span> · 平均耗时 <span className="font-medium text-foreground">{(m.avgDurationMs / 1000).toFixed(0)}s</span> · 闭环率 <span className="font-medium text-foreground">{(m.completionRate * 100).toFixed(0)}%</span></p><p>共 <span className="font-medium text-foreground">{m.totalSessions}</span> 个会话</p></div></div>) : null; })()}

      {/* AI 关注焦点 */}
      <AIFocusWidget />
    </div>
  );
}
