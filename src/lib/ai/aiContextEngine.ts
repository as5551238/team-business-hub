/**
 * AI 上下文引擎 —— 从 store 数据构建项目语境，供 LLM 和本地分析使用
 * 对标 Jira Rovo 的上下文理解能力：在需求、任务、知识、计划之间建立连续关系
 */
import type { AppState, Goal, Project, Task, Member } from '@/types';

// ===== 上下文实体 =====

export interface ItemContext {
  id: string;
  type: 'goal' | 'project' | 'task';
  title: string;
  status: string;
  priority: string;
  progress: number;
  /** 上游：此实体支撑的目标/项目 */
  parentTitle: string | null;
  parentId: string | null;
  parentType: 'goal' | 'project' | null;
  /** 下游：此实体包含的子项目/子任务 */
  childCount: number;
  childDoneCount: number;
  /** 人员 */
  leaderName: string;
  supporterNames: string[];
  /** 时间 */
  startDate: string | null;
  endDate: string | null;
  isOverdue: boolean;
  daysRemaining: number | null;
  /** KR 仅目标 */
  keyResults?: Array<{ title: string; current: number; target: number; unit: string; pct: number }>;
  /** 标签 */
  tags: string[];
  /** 阻塞信息 */
  blockedByCount: number;
  /** 最后更新距今天数 */
  daysSinceUpdate: number;
  /** AI 上下文摘要（确定性计算，无需 LLM） */
  contextSummary: string;
}

export interface AIProjectContext {
  /** 团队信息 */
  teamName: string;
  memberCount: number;
  /** 全部上下文实体 */
  items: ItemContext[];
  /** 目标→项目→任务的关联图谱 */
  links: Array<{ source: string; sourceType: 'goal' | 'project'; target: string; targetType: 'project' | 'task' }>;
  /** 人员负荷 */
  memberLoads: Array<{ name: string; role: string; activeItems: number; overdueItems: number; completionRate: number }>;
  /** 生成时间 */
  generatedAt: string;
}

// ===== 工具函数 =====

function isOverdue(endDate: string | null, status?: string): boolean {
  if (!endDate || status === 'done' || status === 'cancelled') return false;
  return new Date(endDate) < new Date();
}

function daysRemaining(endDate: string | null, status?: string): number | null {
  if (!endDate || status === 'done' || status === 'cancelled') return null;
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}

function daysSinceUpdate(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
}

/** 生成确定性上下文摘要（无需 LLM） */
function buildContextSummary(item: { type: 'goal' | 'project' | 'task'; status: string; progress: number; isOverdue: boolean; daysRemaining: number | null; childCount: number; childDoneCount: number; leaderName: string; blockedByCount: number; keyResults?: Array<{ pct: number }> }): string {
  const parts: string[] = [];
  const typeLabel = item.type === 'goal' ? '目标' : item.type === 'project' ? '项目' : '任务';
  const statusLabel: Record<string, string> = { todo: '待处理', in_progress: '进行中', done: '已完成', blocked: '已阻塞', cancelled: '已取消' };
  parts.push(`${typeLabel}「${statusLabel[item.status] || item.status}」`);
  parts.push(`进度${item.progress}%`);
  if (item.isOverdue) parts.push('已逾期');
  else if (item.daysRemaining !== null && item.daysRemaining >= 0) parts.push(`剩余${item.daysRemaining}天`);
  if (item.type !== 'task' && item.childCount > 0) parts.push(`子项${item.childDoneCount}/${item.childCount}完成`);
  if (item.blockedByCount > 0) parts.push(`被${item.blockedByCount}项阻塞`);
  if (item.leaderName && item.leaderName !== '未分配') parts.push(`负责人${item.leaderName}`);
  if (item.keyResults && item.keyResults.length > 0) {
    const offTrack = item.keyResults.filter(kr => kr.pct < 50).length;
    if (offTrack > 0) parts.push(`${offTrack}个KR偏移`);
  }
  return parts.join('，');
}

// ===== 上下文构建 =====

export function buildAIContext(state: AppState): AIProjectContext {
  const mMap: Record<string, string> = {};
  for (const m of state.members) mMap[m.id] = m.name || m.nickname;

  // 找父级标题
  const goalMap = new Map(state.goals.map(g => [g.id, g]));
  const projectMap = new Map(state.projects.map(p => [p.id, p]));

  // 构建目标上下文
  const goalItems: ItemContext[] = state.goals.map(g => {
    const childProjects = state.projects.filter(p => p.goalId === g.id);
    const childTasks = state.tasks.filter(t => t.goalId === g.id && !t.projectId);
    const childCount = childProjects.length + childTasks.length;
    const childDoneCount = childProjects.filter(p => p.status === 'done').length + childTasks.filter(t => t.status === 'done').length;
    const item = { type: 'goal' as const, status: g.status, progress: g.progress, isOverdue: isOverdue(g.endDate, g.status), daysRemaining: daysRemaining(g.endDate, g.status), childCount, childDoneCount, leaderName: mMap[g.leaderId] || '未分配', blockedByCount: 0, keyResults: (g.keyResults || []).map(kr => ({ title: kr.title, current: kr.currentValue, target: kr.targetValue, unit: kr.unit, pct: kr.targetValue > 0 ? Math.round(kr.currentValue / kr.targetValue * 100) : 0 })) };
    return {
      id: g.id, type: 'goal', title: g.title, status: g.status, priority: g.priority, progress: g.progress,
      parentTitle: null, parentId: null, parentType: null,
      childCount, childDoneCount,
      leaderName: mMap[g.leaderId] || '未分配', supporterNames: (g.supporterIds ?? []).map(id => mMap[id]).filter(Boolean),
      startDate: g.startDate, endDate: g.endDate, isOverdue: item.isOverdue, daysRemaining: item.daysRemaining,
      keyResults: item.keyResults, tags: g.tags ?? [], blockedByCount: 0,
      daysSinceUpdate: daysSinceUpdate(g.updatedAt),
      contextSummary: buildContextSummary(item),
    };
  });

  // 构建项目上下文
  const projectItems: ItemContext[] = state.projects.map(p => {
    const childTasks = state.tasks.filter(t => t.projectId === p.id);
    const childCount = childTasks.length;
    const childDoneCount = childTasks.filter(t => t.status === 'done').length;
    const parentGoal = p.goalId ? goalMap.get(p.goalId) : null;
    const item = { type: 'project' as const, status: p.status, progress: p.progress, isOverdue: isOverdue(p.endDate, p.status), daysRemaining: daysRemaining(p.endDate, p.status), childCount, childDoneCount, leaderName: mMap[p.leaderId] || '未分配', blockedByCount: 0 };
    return {
      id: p.id, type: 'project', title: p.title, status: p.status, priority: p.priority, progress: p.progress,
      parentTitle: parentGoal?.title ?? null, parentId: p.goalId, parentType: p.goalId ? 'goal' : null,
      childCount, childDoneCount,
      leaderName: mMap[p.leaderId] || '未分配', supporterNames: (p.supporterIds ?? []).map(id => mMap[id]).filter(Boolean),
      startDate: p.startDate, endDate: p.endDate, isOverdue: item.isOverdue, daysRemaining: item.daysRemaining,
      tags: p.tags ?? [], blockedByCount: 0,
      daysSinceUpdate: daysSinceUpdate(p.updatedAt),
      contextSummary: buildContextSummary(item),
    };
  });

  // 构建任务上下文
  const taskItems: ItemContext[] = state.tasks.map(t => {
    const parentProject = t.projectId ? projectMap.get(t.projectId) : null;
    const parentGoal = t.goalId ? goalMap.get(t.goalId) : null;
    const parent = parentProject || parentGoal;
    const item = { type: 'task' as const, status: t.status, progress: t.status === 'done' ? 100 : t.status === 'todo' ? 0 : 50, isOverdue: isOverdue(t.dueDate, t.status), daysRemaining: daysRemaining(t.dueDate, t.status), childCount: 0, childDoneCount: 0, leaderName: mMap[t.leaderId] || '未分配', blockedByCount: (t.blockedBy || []).length };
    return {
      id: t.id, type: 'task', title: t.title, status: t.status, priority: t.priority, progress: item.progress,
      parentTitle: parent?.title ?? null, parentId: t.projectId || t.goalId, parentType: t.projectId ? 'project' : t.goalId ? 'goal' : null,
      childCount: 0, childDoneCount: 0,
      leaderName: mMap[t.leaderId] || '未分配', supporterNames: (t.supporterIds ?? []).map(id => mMap[id]).filter(Boolean),
      startDate: t.startDate, endDate: t.dueDate, isOverdue: item.isOverdue, daysRemaining: item.daysRemaining,
      tags: t.tags ?? [], blockedByCount: item.blockedByCount,
      daysSinceUpdate: daysSinceUpdate(t.updatedAt),
      contextSummary: buildContextSummary(item),
    };
  });

  // 构建关联图谱
  const links: AIProjectContext['links'] = [];
  for (const g of state.goals) {
    for (const p of state.projects.filter(p => p.goalId === g.id)) {
      links.push({ source: g.id, sourceType: 'goal', target: p.id, targetType: 'project' });
    }
    for (const t of state.tasks.filter(t => t.goalId === g.id && !t.projectId)) {
      links.push({ source: g.id, sourceType: 'goal', target: t.id, targetType: 'task' });
    }
  }
  for (const p of state.projects) {
    for (const t of state.tasks.filter(t => t.projectId === p.id)) {
      links.push({ source: p.id, sourceType: 'project', target: t.id, targetType: 'task' });
    }
  }

  // 人员负荷
  const activeStatuses = new Set(['todo', 'in_progress']);
  const memberLoads = state.members.filter(m => m.status === 'active').map(m => {
    const myActive = state.tasks.filter(t => activeStatuses.has(t.status) && (t.leaderId === m.id || (t.supporterIds ?? []).includes(m.id)));
    const myOverdue = myActive.filter(t => isOverdue(t.dueDate, t.status));
    const myDone = state.tasks.filter(t => t.status === 'done' && t.leaderId === m.id);
    const myTotal = myActive.length + myDone.length;
    return {
      name: m.name || m.nickname, role: m.role,
      activeItems: myActive.length, overdueItems: myOverdue.length,
      completionRate: myTotal > 0 ? Math.round(myDone.length / myTotal * 100) : 0,
    };
  });

  return {
    teamName: state.members.find(m => m.role === 'admin')?.name || '团队',
    memberCount: state.members.filter(m => m.status === 'active').length,
    items: [...goalItems, ...projectItems, ...taskItems],
    links, memberLoads,
    generatedAt: new Date().toISOString(),
  };
}

/** 从上下文中提取关注焦点（最需关注的 N 个实体） */
export function extractFocusItems(ctx: AIProjectContext, topN = 5): ItemContext[] {
  return [...ctx.items]
    .filter(i => i.status !== 'done' && i.status !== 'cancelled')
    .sort((a, b) => {
      // 逾期 > 高优先级 > KR偏移 > 停滞 > 即将到期
      const scoreA = (a.isOverdue ? 100 : 0) + (a.priority === 'urgent' ? 50 : a.priority === 'high' ? 30 : a.priority === 'medium' ? 10 : 0) + (a.keyResults?.filter(kr => kr.pct < 50).length || 0) * 20 + (a.daysSinceUpdate > 14 ? 15 : 0) + (a.blockedByCount > 0 ? 15 : 0) + (a.daysRemaining !== null && a.daysRemaining >= 0 && a.daysRemaining <= 3 ? 10 : 0);
      const scoreB = (b.isOverdue ? 100 : 0) + (b.priority === 'urgent' ? 50 : b.priority === 'high' ? 30 : b.priority === 'medium' ? 10 : 0) + (b.keyResults?.filter(kr => kr.pct < 50).length || 0) * 20 + (b.daysSinceUpdate > 14 ? 15 : 0) + (b.blockedByCount > 0 ? 15 : 0) + (b.daysRemaining !== null && b.daysRemaining >= 0 && b.daysRemaining <= 3 ? 10 : 0);
      return scoreB - scoreA;
    })
    .slice(0, topN);
}
