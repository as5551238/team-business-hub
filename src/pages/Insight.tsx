import { useMemo, useState, useCallback, Suspense, lazy } from 'react';
import { useStore } from '@/store/useStore';
import { useViewingMember, useReviewList, usePermissions } from '@/store/hooks';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { BarChart3, Target, CheckCircle2, Clock, TrendingUp, Users, FolderKanban, FileText, Lightbulb, Save, Calendar, Brain, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabErrorBoundary, TabLoader } from '@/components/TabErrorBoundary';
import ViewModeSwitch from '@/components/ViewModeSwitch';
import { resolveToken } from '@/lib/resolveToken';
import type { ReviewPeriod, ReviewMetrics, Goal, Project, Task, ReviewEntry } from '@/types';

const AIAnalysisTab = lazy(() => import('@/pages/admin/AIAnalysisTab'));
const AIReviewPanel = lazy(() => import('@/components/AIReviewPanel'));

const COLORS = [resolveToken('primary'), resolveToken('success'), resolveToken('warning'), resolveToken('destructive'), resolveToken('chart-purple'), resolveToken('chart-pink')];

type InsightTab = 'dashboard' | 'review' | 'compare' | 'ai';

const periodLabels: Record<string, string> = { day: '日', week: '周', month: '月', quarter: '季', year: '年', custom: '自定义' };

function getPeriodRange(period: string, customStart: string, customEnd: string): [string, string] {
  const now = new Date();
  if (period === 'day') { const d = now.toISOString().split('T')[0]; return [d, d]; }
  if (period === 'week') {
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return [mon.toISOString().split('T')[0], sun.toISOString().split('T')[0]];
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return [first, last];
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const first = new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0];
    const last = new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().split('T')[0];
    return [first, last];
  }
  if (period === 'year') { return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`]; }
  if (period === 'custom') { return [customStart, customEnd]; }
  return ['', ''];
}

type DateRangeItem = { startDate?: string | null; createdAt: string; endDate?: string | null; completedAt?: string | null; dueDate?: string | null; status: string };

function computeMetrics(goals: Goal[], projects: Project[], tasks: Task[], start: string, end: string): ReviewMetrics {
  const inRange = (item: DateRangeItem) => {
    const s = item.startDate || item.createdAt;
    const e = item.endDate || item.completedAt || item.dueDate;
    if (s && s > end) return false;
    if (e && e < start) return false;
    return true;
  };
  // Single-pass counting — was 8 .filter() calls, now O(G+P+T) total
  let goalsCompleted = 0, goalsInProgress = 0;
  for (const g of goals) {
    if (!inRange(g)) continue;
    if (g.status === 'done') goalsCompleted++;
    else if (g.status === 'in_progress') goalsInProgress++;
  }
  let projectsCompleted = 0, projectsInProgress = 0;
  for (const p of projects) {
    if (!inRange(p)) continue;
    if (p.status === 'done') projectsCompleted++;
    else if (p.status === 'in_progress') projectsInProgress++;
  }
  let tasksCompleted = 0, tasksOverdue = 0, tasksTotal = 0;
  for (const t of tasks) {
    if (!inRange(t)) continue;
    if (t.status === 'cancelled') continue;
    tasksTotal++;
    if (t.status === 'done') tasksCompleted++;
    if (t.status !== 'done' && t.dueDate && t.dueDate < end) tasksOverdue++;
  }
  return {
    goalsCompleted, goalsInProgress,
    projectsCompleted, projectsInProgress,
    tasksCompleted, tasksOverdue, tasksTotal,
    completionRate: tasksTotal > 0 ? Math.round(tasksCompleted / tasksTotal * 100) : 0,
  };
}

function generateSuggestions(metrics: ReviewMetrics): string[] {
  const suggestions: string[] = [];
  if (metrics.completionRate < 50) suggestions.push('当前完成率不足50%，建议减少在途任务（WIP），聚焦高优先级事项，避免多线作战导致效率下降。');
  if (metrics.tasksOverdue > 5) suggestions.push(`逾期任务达${metrics.tasksOverdue}个，建议建立更严格的需求评估机制，合理预估工期，并设置里程碑检查点。`);
  if (metrics.goalsInProgress > metrics.goalsCompleted) suggestions.push('进行中的目标数量多于已完成数量，建议优先关闭接近完成的目标，释放团队精力。');
  if (metrics.tasksCompleted > 0) suggestions.push(`本周期完成了${metrics.tasksCompleted}个任务，值得肯定！建议持续保持节奏，并对高质量产出给予团队认可。`);
  if (metrics.completionRate >= 80) suggestions.push('任务完成率表现优秀，可以考虑适当提升目标挑战度，推动团队成长。');
  suggestions.push('建议每周安排固定时间的团队站会或同步会议，及时对齐进度和风险。');
  if (suggestions.length < 4) suggestions.push('关注团队成员工作负载均衡，避免个别成员过载而其他人空闲的情况。');
  return suggestions.slice(0, 5);
}

const tabItems: { key: InsightTab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'dashboard', label: '数据看板', icon: BarChart3 },
  { key: 'ai', label: 'AI 洞察', icon: Brain },
  { key: 'review', label: '改进复盘', icon: FileText },
  { key: 'compare', label: '成员对比', icon: Users },
];

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  const oneWeek = 604800000;
  const weekNum = Math.ceil((diff / oneWeek) + start.getDay() / 7);
  return `W${weekNum}`;
}

export default function Insight() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const { viewingMemberId, setViewingMember, viewingMember, isTeamView } = useViewingMember();
  const [tab, setTab] = useState<InsightTab>('dashboard');
  const [period, setPeriod] = useState<string>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAIReview, setShowAIReview] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const mid = viewingMember?.id || null;
  const memberFilter = useCallback((items: (Goal | Project | Task)[], field: string) => {
    if (isTeamView || !mid) return items;
    return items.filter((it) => String((it as Record<string, unknown>)[field]) === mid || (it.supporterIds ?? []).includes(mid));
  }, [isTeamView, mid]);

  const activeGoals = useMemo(() => memberFilter(state.goals, 'leaderId'), [memberFilter, state.goals]);
  const activeProjects = useMemo(() => memberFilter(state.projects, 'leaderId'), [memberFilter, state.projects]);
  const activeTasks = useMemo(() => memberFilter(state.tasks, 'leaderId'), [memberFilter, state.tasks]);

  const totalTasks = activeTasks.length;
  const completedTasks = useMemo(() => activeTasks.filter(t => t.status === 'done').length, [activeTasks]);
  const overdueTasks = useMemo(() => activeTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < todayStr).length, [activeTasks, todayStr]);
  const overallCompletionRate = useMemo(() => totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0, [totalTasks, completedTasks]);

  const weeklyTrend = useMemo(() => {
    const weekMap: Record<string, { completed: number; created: number }> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const monday = new Date(d);
      const day = monday.getDay();
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
      const key = getWeekKey(monday.toISOString().split('T')[0]);
      weekMap[key] = { completed: 0, created: 0 };
    }
    activeTasks.forEach(t => {
      const created = t.createdAt?.split('T')[0] || '';
      const completed = t.completedAt?.split('T')[0] || '';
      const startBound = new Date(now);
      startBound.setDate(startBound.getDate() - 84);
      const startBoundStr = startBound.toISOString().split('T')[0];
      if (created && created >= startBoundStr) {
        const wk = getWeekKey(created);
        if (weekMap[wk]) weekMap[wk].created++;
      }
      if (completed && completed >= startBoundStr) {
        const wk = getWeekKey(completed);
        if (weekMap[wk]) weekMap[wk].completed++;
      }
    });
    return Object.entries(weekMap).map(([week, data]) => ({ week, ...data }));
  }, [activeTasks]);

  const goalStats = useMemo(() => {
    const statuses = [
      { name: '进行中', status: 'in_progress' as const, color: resolveToken('primary') },
      { name: '已完成', status: 'done' as const, color: resolveToken('success') },
      { name: '规划中', status: 'todo' as const, color: resolveToken('warning') },
      { name: '已暂停', status: 'blocked' as const, color: resolveToken('destructive') },
    ];
    return statuses.map(s => ({ name: s.name, value: activeGoals.filter(g => g.status === s.status).length, color: s.color })).filter(d => d.value > 0);
  }, [activeGoals]);

  const memberTaskStats = useMemo(() => {
    const source = isTeamView ? state.members.filter(m => m.status === 'active') : (viewingMember ? [viewingMember] : []);
    // Build member->task stats in O(T) single pass instead of O(M×T) nested loops
    const statsMap = new Map<string, { completed: number; inProgress: number; todo: number; total: number }>();
    for (const t of state.tasks) {
      const mids = new Set([t.leaderId, ...(t.supporterIds ?? [])]);
      for (const mid of mids) {
        if (!statsMap.has(mid)) statsMap.set(mid, { completed: 0, inProgress: 0, todo: 0, total: 0 });
        const s = statsMap.get(mid)!;
        s.total++;
        if (t.status === 'done') s.completed++;
        else if (t.status === 'in_progress') s.inProgress++;
        else if (t.status === 'todo') s.todo++;
      }
    }
    return source.map(m => ({
      name: m.name,
      ...(statsMap.get(m.id) || { completed: 0, inProgress: 0, todo: 0, total: 0 }),
    })).filter(d => d.total > 0).slice(0, 10);
  }, [state.members, state.tasks, isTeamView, viewingMember]);

  const comparisonData = useMemo(() => {
    const source = viewingMemberId ? state.members.filter(m => m.id === viewingMemberId && m.status === 'active') : state.members.filter(m => m.status === 'active');
    // Build stats maps in O(T+G+P) instead of O(M×(T+G+P))
    const taskStats = new Map<string, { done: number; overdue: number; total: number }>();
    for (const t of state.tasks) {
      const mids = new Set([t.leaderId, ...(t.supporterIds ?? [])]);
      for (const mid of mids) {
        if (!taskStats.has(mid)) taskStats.set(mid, { done: 0, overdue: 0, total: 0 });
        const s = taskStats.get(mid)!;
        s.total++;
        if (t.status === 'done') s.done++;
        if (t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < todayStr) s.overdue++;
      }
    }
    const goalCounts = new Map<string, number>();
    for (const g of state.goals) {
      for (const mid of new Set([g.leaderId, ...(g.supporterIds ?? [])])) {
        goalCounts.set(mid, (goalCounts.get(mid) || 0) + 1);
      }
    }
    const projCounts = new Map<string, number>();
    for (const p of state.projects) {
      for (const mid of new Set([p.leaderId, ...(p.supporterIds ?? [])])) {
        projCounts.set(mid, (projCounts.get(mid) || 0) + 1);
      }
    }
    return source.map(m => {
      const ts = taskStats.get(m.id) || { done: 0, overdue: 0, total: 0 };
      const rate = ts.total > 0 ? Math.round((ts.done / ts.total) * 100) : 0;
      return { name: m.name, goals: goalCounts.get(m.id) || 0, projects: projCounts.get(m.id) || 0, tasks: ts.total, done: ts.done, rate, overdue: ts.overdue };
    }).sort((a, b) => b.rate - a.rate);
  }, [state.members, state.goals, state.projects, state.tasks, todayStr, viewingMemberId]);

  const [rangeStart, rangeEnd] = useMemo(() => getPeriodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const reviewData = useMemo(() => {
    if (isTeamView || !viewingMemberId) return { goals: state.goals, projects: state.projects, tasks: state.tasks };
    const mg = state.goals.filter(g => g.leaderId === viewingMemberId || (g.supporterIds ?? []).includes(viewingMemberId));
    const mp = state.projects.filter(p => p.leaderId === viewingMemberId || (p.supporterIds ?? []).includes(viewingMemberId));
    const mt = state.tasks.filter(t => t.leaderId === viewingMemberId || (t.supporterIds ?? []).includes(viewingMemberId));
    return { goals: mg, projects: mp, tasks: mt };
  }, [isTeamView, viewingMemberId, state.goals, state.projects, state.tasks]);

  const metrics = useMemo(() => computeMetrics(reviewData.goals, reviewData.projects, reviewData.tasks, rangeStart, rangeEnd), [reviewData, rangeStart, rangeEnd]);
  const suggestions = useMemo(() => generateSuggestions(metrics), [metrics]);
  const allReviews = useReviewList();
  const filteredReviews = useMemo(() => {
    const userId = state.currentUser?.id;
    return [...allReviews]
      .filter(r => !r.memberId || r.memberId === userId) // only own + team reviews
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [allReviews, state.currentUser?.id]);

  function handleSave() {
    if (!content.trim()) return;
    const payload = { period: period as ReviewPeriod, periodStart: rangeStart, periodEnd: rangeEnd, memberId: isTeamView ? null : viewingMemberId, content: content.trim(), improvements: suggestions, metrics };
    if (editingId) { dispatch({ type: 'UPDATE_REVIEW', payload: { id: editingId, updates: payload } }); setEditingId(null); }
    else { dispatch({ type: 'ADD_REVIEW', payload }); }
    setContent('');
  }

  function handleEdit(review: ReviewEntry) { setEditingId(review.id); setPeriod(review.period); setContent(review.content); }
  function handleDelete(id: string) { dispatch({ type: 'DELETE_REVIEW', payload: id }); if (editingId === id) { setEditingId(null); setContent(''); } }

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* 标题行 — 固定不滚动 */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <h1 className="text-xl font-bold">数据洞察</h1>
        <EmptyState title="多维度分析团队数据，驱动决策优化" compact />
      </div>

      <div className="flex-shrink-0 px-4 md:px-6 pb-2 flex items-center gap-2 overflow-x-auto">
        <ViewModeSwitch items={tabItems.map(t => ({ value: t.key, label: t.label, icon: t.icon }))} value={tab} onChange={v => setTab(v as InsightTab)} />
        {tab === 'review' && editingId && <button onClick={() => { setEditingId(null); setContent(''); }} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors">新建复盘</button>}
        {tab === 'review' && <button onClick={() => setShowAIReview(v => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"><Sparkles size={14} />AI 智能复盘</button>}
        {!isTeamView && viewingMember && (
          <span className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{viewingMember.name[0]}</div>
            {viewingMember.name}
          </span>
        )}
      </div>

      {/* 可滚动内容区域 — 移动端额外底部留白 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-20 md:pb-4">
      <div key={tab} className="animate-fade-in">
      {tab === 'dashboard' && (
        <TabErrorBoundary name="数据看板">
          <Suspense fallback={<TabLoader />}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: <Target size={20} className="text-blue-600" />, label: '目标总数', value: activeGoals.length, sub: `${activeGoals.filter(g => g.status === 'in_progress').length} 进行中`, color: 'bg-blue-50' },
              { icon: <FolderKanban size={20} className="text-emerald-600" />, label: '项目总数', value: activeProjects.length, sub: `${activeProjects.filter(p => p.status === 'in_progress').length} 进行中`, color: 'bg-emerald-50' },
              { icon: <CheckCircle2 size={20} className="text-green-600" />, label: '任务完成率', value: `${overallCompletionRate}%`, sub: `${completedTasks}/${totalTasks}`, color: 'bg-green-50' },
              { icon: <Clock size={20} className="text-red-600" />, label: '逾期任务', value: overdueTasks, sub: '需立即处理', color: 'bg-red-50' },
            ].map((stat, i) => (
              <div key={i} className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-start justify-between">
                  <div><p className="text-sm text-muted-foreground">{stat.label}</p><p className="text-2xl font-bold mt-1">{stat.value}</p><p className="text-xs text-muted-foreground mt-1">{stat.sub}</p></div>
                  <div className={`p-2.5 rounded-lg ${stat.color}`}>{stat.icon}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border shadow-sm p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-primary" />周任务趋势</h3>
              <div className="overflow-x-auto -mx-5 px-5">
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={weeklyTrend}>
                      <defs>
                        <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={resolveToken('primary')} stopOpacity={0.3} /><stop offset="95%" stopColor={resolveToken('primary')} stopOpacity={0} /></linearGradient>
                        <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={resolveToken('success')} stopOpacity={0.3} /><stop offset="95%" stopColor={resolveToken('success')} stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={resolveToken('muted')} />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="completed" name="完成" stroke={resolveToken('primary')} fill="url(#gC)" strokeWidth={2} />
                      <Area type="monotone" dataKey="created" name="新建" stroke={resolveToken('success')} fill="url(#gN)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Target size={16} className="text-primary" />目标状态分布</h3>
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart><Pie data={goalStats} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>{goalStats.map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">{goalStats.map((d, i) => <div key={i} className="flex items-center gap-2 text-sm"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} /><span className="text-muted-foreground">{d.name}</span><span className="font-medium ml-auto">{d.value}</span></div>)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border shadow-sm p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Users size={16} className="text-primary" />成员任务分布 (Top 10)</h3>
              <div className="overflow-x-auto -mx-5 px-5">
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={memberTaskStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={resolveToken('muted')} />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
                      <Tooltip />
                      <Bar dataKey="completed" name="已完成" fill={resolveToken('success')} stackId="a" />
                      <Bar dataKey="inProgress" name="进行中" fill={resolveToken('primary')} stackId="a" />
                      <Bar dataKey="todo" name="待处理" fill={resolveToken('warning')} stackId="a" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><FolderKanban size={16} className="text-primary" />项目进度概览</h3>
              <div className="space-y-3">
                {activeProjects.filter(p => p.status !== 'cancelled').sort((a, b) => b.progress - a.progress).slice(0, 8).map(p => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1"><span className="text-sm truncate flex-1 mr-3">{p.title}</span><span className="text-sm font-bold min-w-[40px] text-right">{p.progress}%</span></div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${p.progress}%`, backgroundColor: p.progress >= 80 ? resolveToken('success') : p.progress >= 50 ? resolveToken('primary') : resolveToken('warning') }} /></div>
                  </div>
                ))}
              </div>
              </div>
            </div>
           </div>
         </Suspense>
       </TabErrorBoundary>
        )}

      {tab === 'review' && (
        <TabErrorBoundary name="改进复盘">
          <Suspense fallback={<TabLoader />}>
        <div className="space-y-6">
          {/* AI 智能复盘 */}
          {showAIReview && (
            <div className="bg-card rounded-xl border border-purple-200 shadow-sm p-4 md:p-6">
              <Suspense fallback={<TabLoader />}>
                <AIReviewPanel onClose={() => setShowAIReview(false)} />
              </Suspense>
            </div>
          )}
          <div className="bg-card rounded-xl border border-border shadow-sm p-4 md:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">复盘周期</label>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card">
                  <option value="day">日复盘</option><option value="week">周复盘</option><option value="month">月复盘</option><option value="quarter">季度复盘</option><option value="year">年度复盘</option><option value="custom">自定义范围</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">复盘对象</label>
                <select value={isTeamView ? '__team__' : viewingMemberId} onChange={(e) => setViewingMember(e.target.value === '__team__' ? null : e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card">
                  <option value="__team__">团队整体</option>
                  {state.members.filter(m => m.status === 'active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1.5">时间范围</label>
                <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-gray-50 text-sm text-gray-600"><Calendar size={14} className="text-gray-400 shrink-0" /><span className="truncate">{rangeStart || '--'} ~ {rangeEnd || '--'}</span></div>
              </div>
            </div>

            {period === 'custom' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">开始日期</label><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">结束日期</label><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card" /></div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: '目标完成/进行中', value: `${metrics.goalsCompleted}/${metrics.goalsInProgress}`, bg: 'bg-green-50 border-green-100', text: 'text-green-800', icon: <Target size={14} className="text-green-700" /> },
                { label: '项目完成/进行中', value: `${metrics.projectsCompleted}/${metrics.projectsInProgress}`, bg: 'bg-blue-50 border-blue-100', text: 'text-blue-800', icon: <FolderKanban size={14} className="text-blue-700" /> },
                { label: '任务完成/总数', value: `${metrics.tasksCompleted}/${metrics.tasksTotal}`, bg: 'bg-purple-50 border-purple-100', text: 'text-purple-800', icon: <CheckCircle2 size={14} className="text-purple-700" /> },
                { label: '总完成率', value: `${metrics.completionRate}%`, bg: 'bg-amber-50 border-amber-100', text: metrics.completionRate >= 80 ? 'text-green-600' : metrics.completionRate >= 50 ? 'text-amber-600' : 'text-red-600', icon: <TrendingUp size={14} className="text-amber-700" /> },
              ].map((s, i) => (
                <div key={i} className={`p-3 ${s.bg} rounded-lg border`}>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">{s.icon}{s.label}</div>
                  <div className={`text-lg font-semibold ${s.text}`}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2"><Lightbulb size={16} className="text-amber-500" />改进建议</h3>
              <div className="space-y-2">{suggestions.map((s, i) => <div key={i} className="flex items-start gap-2.5 p-3 bg-amber-50/60 rounded-lg border border-amber-100"><span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-medium">{i + 1}</span><p className="text-sm text-gray-700">{s}</p></div>)}</div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">自我反思</h3>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="记录本周期的工作反思、心得体会和改进计划..." className="w-full h-28 px-3 py-2 border border-border rounded-lg text-sm bg-card resize-y"></textarea>
              <div className="flex justify-end mt-2">
                <button onClick={handleSave} disabled={!content.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <Save size={16} />{editingId ? '更新复盘' : '保存复盘'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm p-4 md:p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2"><FileText size={16} className="text-gray-400" />历史复盘 <span className="text-xs font-normal text-gray-400">({filteredReviews.length})</span></h2>
            {filteredReviews.length === 0 ? (
              <div className="py-12 text-center text-gray-400"><FileText size={40} className="mx-auto mb-2 opacity-40" /><p className="text-sm">暂无复盘记录</p></div>
            ) : (
              <div className="space-y-3">
                {filteredReviews.map(review => {
                  const member = review.memberId ? state.members.find(m => m.id === review.memberId) : null;
                  return (
                    <div key={review.id} className="p-4 border border-border rounded-lg hover:border-blue-200 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${review.memberId ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{review.memberId ? (member?.name || '未知') : '团队'}</span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{periodLabels[review.period] || review.period}复盘</span>
                          <span className="text-xs text-gray-400">{review.periodStart} ~ {review.periodEnd}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(!review.memberId || review.memberId === state.currentUser?.id || state.currentUser?.role === 'admin') && <button onClick={() => handleEdit(review)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors"><FileText size={14} /></button>}
                          {can('team_manage') && <button onClick={() => handleDelete(review.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Clock size={14} /></button>}
                        </div>
                      </div>
                      {review.content && <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{review.content}</p>}
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-1">
                        <span>目标 {review.metrics.goalsCompleted}/{review.metrics.goalsCompleted + review.metrics.goalsInProgress}</span>
                        <span>任务 {review.metrics.tasksCompleted}/{review.metrics.tasksTotal}</span>
                        <span className={review.metrics.completionRate >= 80 ? 'text-green-600' : review.metrics.completionRate >= 50 ? 'text-amber-600' : 'text-red-600'}>完成率 {review.metrics.completionRate}%</span>
                      </div>
                      <div className="text-xs text-gray-400">{new Date(review.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </Suspense>
        </TabErrorBoundary>
        )}

      {tab === 'compare' && (
        <TabErrorBoundary name="成员对比">
          <Suspense fallback={<TabLoader />}>
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 size={16} className="text-primary" />成员对比分析</h3>
              <EmptyState title="活跃成员关键指标一览，按完成率排序" compact />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/50"><th className="px-5 py-3 text-left font-medium text-muted-foreground">成员</th><th className="px-5 py-3 text-center font-medium text-muted-foreground">目标数</th><th className="px-5 py-3 text-center font-medium text-muted-foreground">项目数</th><th className="px-5 py-3 text-center font-medium text-muted-foreground">任务总数</th><th className="px-5 py-3 text-center font-medium text-muted-foreground">已完成</th><th className="px-5 py-3 text-center font-medium text-muted-foreground">完成率</th><th className="px-5 py-3 text-center font-medium text-muted-foreground">逾期</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {comparisonData.map(m => (
                    <tr key={m.name} className="hover:bg-muted/30">
                      <td className="px-5 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{m.name[0]}</div><span className="font-medium">{m.name}</span></div></td>
                      <td className="px-5 py-3 text-center">{m.goals}</td>
                      <td className="px-5 py-3 text-center">{m.projects}</td>
                      <td className="px-5 py-3 text-center">{m.tasks}</td>
                      <td className="px-5 py-3 text-center text-green-600 font-medium">{m.done}</td>
                      <td className="px-5 py-3 text-center"><div className="inline-flex items-center gap-2"><div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${m.rate}%`, backgroundColor: m.rate >= 70 ? resolveToken('success') : m.rate >= 40 ? resolveToken('primary') : resolveToken('warning') }} /></div><span className="font-medium">{m.rate}%</span></div></td>
                      <td className="px-5 py-3 text-center"><span className={m.overdue > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{m.overdue}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border shadow-sm p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-primary" />完成率对比</h3>
              <div className="overflow-x-auto -mx-5 px-5">
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={comparisonData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={resolveToken('muted')} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="rate" name="完成率(%)" fill={resolveToken('primary')} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="overdue" name="逾期" fill={resolveToken('destructive')} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border shadow-sm p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Target size={16} className="text-primary" />任务量分布</h3>
              <div className="overflow-x-auto -mx-5 px-5">
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={comparisonData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={resolveToken('muted')} />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                      <Tooltip />
                      <Bar dataKey="done" name="已完成" fill={resolveToken('success')} stackId="a" />
                      <Bar dataKey="tasks" name="未完成" fill={resolveToken('warning')} stackId="a" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
         </Suspense>
         </TabErrorBoundary>
       )}

      {tab === 'ai' && (
        <TabErrorBoundary name="AI洞察">
          <Suspense fallback={<TabLoader />}>
            <AIAnalysisTab viewingMemberId={viewingMemberId} isTeamView={isTeamView} />
          </Suspense>
        </TabErrorBoundary>
      )}
       </div>
      </div>{/* end scrollable content area */}
    </div>
  );
}
