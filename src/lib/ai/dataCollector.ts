/**
 * AI 分析数据采集层 —— 从 store 提取结构化数据供分析引擎和 LLM 使用
 */
import type { AppState, Goal, Project, Task, Member } from '@/types';
import type { AnalysisPeriod } from './types';

/** 判断日期是否在指定周期内 */
function inPeriod(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

/** 获取周期起止时间 */
export function getPeriodRange(period: AnalysisPeriod): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  switch (period) {
    case 'daily': start.setDate(start.getDate() - 1); break;
    case 'weekly': start.setDate(start.getDate() - 7); break;
    case 'monthly': start.setMonth(start.getMonth() - 1); break;
    case 'quarterly': start.setMonth(start.getMonth() - 3); break;
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** 判断是否逾期（已完成/已取消的不会逾期） */
export function isOverdue(endDate: string | null, status?: string): boolean {
  if (!endDate) return false;
  if (status === 'done' || status === 'cancelled') return false;
  return new Date(endDate) < new Date();
}

/** 计算两个日期间的天数 */
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/** 判断项目/目标是否停滞（非完成状态且长期无更新） */
function isStalled(updatedAt: string, daysThreshold = 14): boolean {
  const diff = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
  return diff > daysThreshold;
}

/** 数值夹紧 */
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

/** 成员ID -> 名称映射 */
function memberMap(members: Member[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const mem of members) m[mem.id] = mem.name || mem.nickname;
  return m;
}

// ===== 周期数据快照 =====
export interface PeriodSnapshot {
  period: AnalysisPeriod;
  periodStart: string;
  periodEnd: string;
  /** 目标汇总 */
  goals: {
    total: number; active: number; done: number; blocked: number; cancelled: number;
    overdue: number; stalled: number; avgProgress: number;
    items: Array<{
      id: string; title: string; status: string; priority: string;
      progress: number; startDate: string; endDate: string;
      leaderId: string; leaderName: string;
      isOverdue: boolean; isStalled: boolean;
      keyResults: Array<{ title: string; target: number; current: number; unit: string; pct: number }>;
    }>;
  };
  /** 项目汇总 */
  projects: {
    total: number; active: number; done: number; blocked: number;
    overdue: number; stalled: number; avgProgress: number;
    items: Array<{
      id: string; title: string; status: string; priority: string;
      progress: number; startDate: string; endDate: string;
      leaderId: string; leaderName: string; goalId: string | null;
      taskCount: number; isOverdue: boolean; isStalled: boolean;
    }>;
  };
  /** 任务汇总 */
  tasks: {
    total: number; active: number; done: number; blocked: number;
    overdue: number; newInPeriod: number; completedInPeriod: number;
    blockedByCount: number; avgCompletionDays: number | null;
    onTimeCount: number; onTimeRate: number;
    items: Array<{
      id: string; title: string; status: string; priority: string;
      startDate: string | null; dueDate: string | null; completedAt: string | null;
      leaderId: string; leaderName: string;
      projectId: string | null; goalId: string | null;
      isOverdue: boolean; blockedBy: string[];
    }>;
  };
  /** 成员汇总 */
  members: Array<{
    id: string; name: string; role: string;
    activeGoals: number; activeProjects: number; activeTasks: number;
    completedTasks: number; overdueTasks: number; blockedTasks: number;
    avgProgress: number;
  }>;
}

/** 从 AppState 提取周期数据快照 */
export function collectSnapshot(state: AppState, period: AnalysisPeriod): PeriodSnapshot {
  const { start, end } = getPeriodRange(period);
  const mMap = memberMap(state.members);
  const now = new Date().toISOString();

  // 目标
  const goalItems = state.goals.map(g => ({
    id: g.id, title: g.title, status: g.status, priority: g.priority,
    progress: g.progress, startDate: g.startDate, endDate: g.endDate,
    leaderId: g.leaderId, leaderName: mMap[g.leaderId] || '未分配',
    isOverdue: isOverdue(g.endDate, g.status),
    isStalled: isStalled(g.updatedAt) && g.status === 'in_progress',
    keyResults: (g.keyResults || []).map(kr => ({
      title: kr.title, target: kr.targetValue, current: kr.currentValue,
      unit: kr.unit, pct: kr.targetValue > 0 ? Math.round(kr.currentValue / kr.targetValue * 100) : 0,
    })),
  }));

  const activeGoals = goalItems.filter(g => g.status === 'in_progress' || g.status === 'todo');
  const overdueGoals = goalItems.filter(g => g.isOverdue);
  const stalledGoals = goalItems.filter(g => g.isStalled);
  const doneGoals = goalItems.filter(g => g.status === 'done');
  const avgGoalProgress = activeGoals.length > 0 ? Math.round(activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length) : 0;

  // 项目
  const projectItems = state.projects.map(p => ({
    id: p.id, title: p.title, status: p.status, priority: p.priority,
    progress: p.progress, startDate: p.startDate, endDate: p.endDate,
    leaderId: p.leaderId, leaderName: mMap[p.leaderId] || '未分配',
    goalId: p.goalId, taskCount: p.taskCount || 0,
    isOverdue: isOverdue(p.endDate, p.status),
    isStalled: isStalled(p.updatedAt) && p.status === 'in_progress',
  }));

  const activeProjects = projectItems.filter(p => p.status === 'in_progress' || p.status === 'todo');
  const overdueProjects = projectItems.filter(p => p.isOverdue);
  const stalledProjects = projectItems.filter(p => p.isStalled);
  const avgProjectProgress = activeProjects.length > 0 ? Math.round(activeProjects.reduce((s, p) => s + p.progress, 0) / activeProjects.length) : 0;

  // 任务
  const completedInPeriod = state.tasks.filter(t => t.status === 'done' && t.completedAt && inPeriod(t.completedAt, start, end));
  const newInPeriod = state.tasks.filter(t => inPeriod(t.createdAt, start, end));
  const doneTasks = state.tasks.filter(t => t.status === 'done');
  const completionDays = doneTasks.map(t => daysBetween(t.startDate, t.completedAt)).filter((d): d is number => d !== null);
  const onTimeDone = doneTasks.filter(t => !t.dueDate || (t.completedAt && t.completedAt <= t.dueDate));
  const tasksWithBlockers = state.tasks.filter(t => (t.blockedBy || []).length > 0 && t.status !== 'done' && t.status !== 'cancelled');

  const taskItems = state.tasks.map(t => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority,
    startDate: t.startDate, dueDate: t.dueDate, completedAt: t.completedAt,
    leaderId: t.leaderId, leaderName: mMap[t.leaderId] || '未分配',
    projectId: t.projectId, goalId: t.goalId,
    isOverdue: isOverdue(t.dueDate, t.status),
    blockedBy: t.blockedBy || [],
  }));

  const activeTasks = taskItems.filter(t => t.status === 'in_progress' || t.status === 'todo');
  const overdueTasks = taskItems.filter(t => t.isOverdue);

  // 成员（预建 supporterIds Map，O(n) 替代 O(n²)）
  const goalSupporters = new Map(state.goals.map(g => [g.id, g.supporterIds ?? []]));
  const projectSupporters = new Map(state.projects.map(p => [p.id, p.supporterIds ?? []]));
  const taskSupporters = new Map(state.tasks.map(t => [t.id, t.supporterIds ?? []]));

  const memberItems = state.members.filter(m => m.status === 'active').map(m => {
    const myActiveGoals = activeGoals.filter(g => g.leaderId === m.id || (goalSupporters.get(g.id) || []).includes(m.id));
    const myActiveProjects = activeProjects.filter(p => p.leaderId === m.id || (projectSupporters.get(p.id) || []).includes(m.id));
    const myActiveTasks = activeTasks.filter(t => t.leaderId === m.id || (taskSupporters.get(t.id) || []).includes(m.id));
    const myCompleted = completedInPeriod.filter(t => t.leaderId === m.id);
    const myOverdue = overdueTasks.filter(t => t.leaderId === m.id);
    const myBlocked = tasksWithBlockers.filter(t => t.leaderId === m.id);
    const allItems = [...myActiveGoals, ...myActiveProjects, ...myActiveTasks];
    const avgProg = allItems.length > 0 ? Math.round(allItems.reduce((s, g) => s + g.progress, 0) / allItems.length) : 100;
    return {
      id: m.id, name: m.name || m.nickname, role: m.role,
      activeGoals: myActiveGoals.length, activeProjects: myActiveProjects.length,
      activeTasks: myActiveTasks.length, completedTasks: myCompleted.length,
      overdueTasks: myOverdue.length, blockedTasks: myBlocked.length,
      avgProgress: avgProg,
    };
  });

  return {
    period, periodStart: start.toISOString(), periodEnd: end.toISOString(),
    goals: {
      total: state.goals.length, active: activeGoals.length,
      done: doneGoals.length, blocked: goalItems.filter(g => g.status === 'blocked').length,
      cancelled: goalItems.filter(g => g.status === 'cancelled').length,
      overdue: overdueGoals.length, stalled: stalledGoals.length,
      avgProgress: avgGoalProgress, items: goalItems,
    },
    projects: {
      total: state.projects.length, active: activeProjects.length,
      done: projectItems.filter(p => p.status === 'done').length,
      blocked: projectItems.filter(p => p.status === 'blocked').length,
      overdue: overdueProjects.length, stalled: stalledProjects.length,
      avgProgress: avgProjectProgress, items: projectItems,
    },
    tasks: {
      total: state.tasks.length, active: activeTasks.length,
      done: doneTasks.length, blocked: taskItems.filter(t => t.status === 'blocked').length,
      overdue: overdueTasks.length, newInPeriod: newInPeriod.length,
      completedInPeriod: completedInPeriod.length,
      blockedByCount: tasksWithBlockers.length,
      avgCompletionDays: completionDays.length > 0 ? Math.round(completionDays.reduce((a, b) => a + b, 0) / completionDays.length) : null,
      onTimeCount: onTimeDone.length,
      onTimeRate: doneTasks.length > 0 ? Math.round(onTimeDone.length / doneTasks.length * 100) : 0,
      items: taskItems,
    },
    members: memberItems,
  };
}
