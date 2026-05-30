/**
 * AI 确定性分析引擎 —— 无需外部 API 即可提供健康度、风险、效率指标
 */
import type { HealthScore, RiskItem, EfficiencyMetrics, MemberAnalysis, TeamAnalysis, AnalysisPeriod } from './types';
import type { PeriodSnapshot } from './dataCollector';
import { getPeriodRange } from './dataCollector';

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function scoreToLevel(s: number): HealthScore['level'] {
  if (s >= 85) return 'excellent';
  if (s >= 70) return 'good';
  if (s >= 50) return 'fair';
  if (s >= 30) return 'risk';
  return 'critical';
}

// ===== 健康度评分 =====

function goalHealthScore(snap: PeriodSnapshot): number {
  const g = snap.goals;
  if (g.active === 0) return 100; // 无活跃目标默认满分
  let score = 100;
  // 逾期扣分
  score -= (g.overdue / g.active) * 30;
  // 停滞扣分
  score -= (g.stalled / g.active) * 20;
  // 进度偏差扣分
  const progressDeficit = g.active > 0 ? Math.max(0, 50 - g.avgProgress) / 50 : 0;
  score -= progressDeficit * 20;
  // 阻塞扣分
  score -= (g.blocked / Math.max(1, g.total)) * 15;
  // KR偏移扣分
  const offTrackKR = g.items.reduce((c, item) => c + item.keyResults.filter(kr => kr.pct < 50).length, 0);
  const totalKR = g.items.reduce((c, item) => c + item.keyResults.length, 0);
  if (totalKR > 0) score -= (offTrackKR / totalKR) * 15;
  return clamp(Math.round(score), 0, 100);
}

function projectHealthScore(snap: PeriodSnapshot): number {
  const p = snap.projects;
  if (p.active === 0) return 100;
  let score = 100;
  score -= (p.overdue / p.active) * 30;
  score -= (p.stalled / p.active) * 20;
  const deficit = p.active > 0 ? Math.max(0, 50 - p.avgProgress) / 50 : 0;
  score -= deficit * 20;
  score -= (p.blocked / Math.max(1, p.total)) * 15;
  // 无任务项目扣分
  const noTaskProjects = p.items.filter(i => i.taskCount === 0 && i.status === 'in_progress').length;
  score -= (noTaskProjects / Math.max(1, p.active)) * 15;
  return clamp(Math.round(score), 0, 100);
}

function taskHealthScore(snap: PeriodSnapshot): number {
  const t = snap.tasks;
  if (t.active === 0) return 100;
  let score = 100;
  score -= (t.overdue / t.active) * 30;
  score -= (t.blocked / Math.max(1, t.active)) * 20;
  score -= (t.blockedByCount / Math.max(1, t.active)) * 15;
  // 按期完成率扣分
  if (t.onTimeRate < 70) score -= (70 - t.onTimeRate) / 70 * 20;
  // 完成率低扣分
  const compRate = t.active + t.done > 0 ? t.done / (t.active + t.done) : 1;
  if (compRate < 0.5) score -= (0.5 - compRate) / 0.5 * 15;
  return clamp(Math.round(score), 0, 100);
}

export function computeHealth(snap: PeriodSnapshot): HealthScore {
  const goals = goalHealthScore(snap);
  const projects = projectHealthScore(snap);
  const tasks = taskHealthScore(snap);
  const overall = Math.round(goals * 0.3 + projects * 0.3 + tasks * 0.4);
  return { overall: clamp(overall, 0, 100), goals, projects, tasks, level: scoreToLevel(overall) };
}

// ===== 风险识别 =====

let riskCounter = 0;
function nextRiskId() { return `r_${Date.now()}_${++riskCounter}`; }

function goalRisks(snap: PeriodSnapshot): RiskItem[] {
  const risks: RiskItem[] = [];
  for (const g of snap.goals.items) {
    if (g.isOverdue && g.status !== 'done' && g.status !== 'cancelled') {
      risks.push({
        id: nextRiskId(), severity: 'high', type: 'overdue',
        itemType: 'goal', itemId: g.id, itemTitle: g.title,
        description: `目标「${g.title}」已逾期，截止日期 ${g.endDate}`,
        suggestion: '评估目标完成可能性，考虑调整截止日期或拆解为更小目标',
        memberId: g.leaderId, memberName: g.leaderName,
        suggestedAction: { type: 'update_status', label: '标记为延期', payload: { itemType: 'goal', itemId: g.id, newStatus: 'blocked' } },
      });
    }
    if (g.isStalled) {
      risks.push({
        id: nextRiskId(), severity: 'medium', type: 'stalled',
        itemType: 'goal', itemId: g.id, itemTitle: g.title,
        description: `目标「${g.title}」长期无更新，可能已停滞`,
        suggestion: '确认目标是否仍在推进，更新进度或调整状态',
        memberId: g.leaderId, memberName: g.leaderName,
      });
    }
    // KR偏移
    for (const kr of g.keyResults) {
      if (kr.pct < 30 && g.status === 'in_progress') {
        risks.push({
          id: nextRiskId(), severity: 'medium', type: 'kr_off_track',
          itemType: 'goal', itemId: g.id, itemTitle: g.title,
          description: `关键结果「${kr.title}」进度仅 ${kr.pct}%，严重偏移`,
          suggestion: '聚焦该关键结果，重新分配资源或调整目标值',
          memberId: g.leaderId, memberName: g.leaderName,
        });
      }
    }
  }
  return risks;
}

function projectRisks(snap: PeriodSnapshot): RiskItem[] {
  const risks: RiskItem[] = [];
  for (const p of snap.projects.items) {
    if (p.isOverdue && p.status !== 'done' && p.status !== 'cancelled') {
      risks.push({
        id: nextRiskId(), severity: 'high', type: 'overdue',
        itemType: 'project', itemId: p.id, itemTitle: p.title,
        description: `项目「${p.title}」已逾期，截止日期 ${p.endDate}`,
        suggestion: '评估延期原因，调整计划或增加资源投入',
        memberId: p.leaderId, memberName: p.leaderName,
        suggestedAction: { type: 'update_status', label: '标记为延期', payload: { itemType: 'project', itemId: p.id, newStatus: 'blocked' } },
      });
    }
    if (p.isStalled) {
      risks.push({
        id: nextRiskId(), severity: 'medium', type: 'stalled',
        itemType: 'project', itemId: p.id, itemTitle: p.title,
        description: `项目「${p.title}」长期无更新`,
        suggestion: '重新评估项目优先级和资源分配',
        memberId: p.leaderId, memberName: p.leaderName,
      });
    }
    if (p.taskCount === 0 && p.status === 'in_progress') {
      risks.push({
        id: nextRiskId(), severity: 'medium', type: 'stalled',
        itemType: 'project', itemId: p.id, itemTitle: p.title,
        description: `项目「${p.title}」无任务，无法推进`,
        suggestion: '为项目创建明确的任务分解',
        memberId: p.leaderId, memberName: p.leaderName,
      });
    }
  }
  return risks;
}

function taskRisks(snap: PeriodSnapshot): RiskItem[] {
  const risks: RiskItem[] = [];
  for (const t of snap.tasks.items) {
    if (t.isOverdue && t.status !== 'done' && t.status !== 'cancelled') {
      risks.push({
        id: nextRiskId(), severity: t.priority === 'urgent' ? 'high' : 'medium',
        type: 'overdue', itemType: 'task', itemId: t.id, itemTitle: t.title,
        description: `任务「${t.title}」已逾期${t.dueDate ? '，截止 ' + t.dueDate : ''}`,
        suggestion: '尽快完成或重新评估优先级',
        memberId: t.leaderId, memberName: t.leaderName,
        suggestedAction: { type: 'update_status', label: '标记为延期', payload: { itemType: 'task', itemId: t.id, newStatus: 'blocked' } },
      });
    }
    if (t.blockedBy.length > 0 && t.status === 'blocked') {
      risks.push({
        id: nextRiskId(), severity: 'medium', type: 'blocked',
        itemType: 'task', itemId: t.id, itemTitle: t.title,
        description: `任务「${t.title}」被 ${t.blockedBy.length} 个任务阻塞`,
        suggestion: '解除阻塞依赖，优先推进阻塞项',
        memberId: t.leaderId, memberName: t.leaderName,
      });
    }
    if (!t.leaderId || t.leaderName === '未分配') {
      risks.push({
        id: nextRiskId(), severity: 'low', type: 'no_leader',
        itemType: 'task', itemId: t.id, itemTitle: t.title,
        description: `任务「${t.title}」未分配负责人`,
        suggestion: '指定负责人以确保任务推进',
      });
    }
  }
  return risks;
}

function memberOverloadRisks(snap: PeriodSnapshot): RiskItem[] {
  const risks: RiskItem[] = [];
  const avgActive = snap.members.length > 0
    ? snap.members.reduce((s, m) => s + m.activeTasks, 0) / snap.members.length
    : 0;
  const threshold = Math.max(avgActive * 2, 8); // 超过平均值2倍或8个以上任务
  for (const m of snap.members) {
    if (m.activeTasks > threshold) {
      risks.push({
        id: nextRiskId(), severity: m.overdueTasks > 3 ? 'high' : 'medium',
        type: 'overloaded', itemType: 'task', itemId: '', itemTitle: `${m.name} 工作过载`,
        description: `${m.name} 活跃任务 ${m.activeTasks} 个（团队均值 ${Math.round(avgActive)}），逾期 ${m.overdueTasks} 个`,
        suggestion: '考虑重新分配任务，减轻该成员负荷',
        memberId: m.id, memberName: m.name,
      });
    }
  }
  return risks;
}

export function detectRisks(snap: PeriodSnapshot): RiskItem[] {
  return [
    ...goalRisks(snap),
    ...projectRisks(snap),
    ...taskRisks(snap),
    ...memberOverloadRisks(snap),
  ].sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}

// ===== 效率指标 =====

export function computeEfficiency(snap: PeriodSnapshot): EfficiencyMetrics {
  const t = snap.tasks;
  const total = t.active + t.done;
  const completionRate = total > 0 ? Math.round(t.done / total * 100) : 0;
  const overloadedMembers = snap.members.filter(m => m.overdueTasks > 0);
  const trend: EfficiencyMetrics['trend'] = t.completedInPeriod >= t.newInPeriod ? (t.completedInPeriod > t.newInPeriod ? 'up' : 'stable') : 'down';
  return {
    completionRate, onTimeRate: t.onTimeRate,
    avgCompletionDays: t.avgCompletionDays ?? 0,
    activeGoals: snap.goals.active, activeProjects: snap.projects.active, activeTasks: t.active,
    completedTasksInPeriod: t.completedInPeriod, newTasksInPeriod: t.newInPeriod,
    blockedTasks: t.blockedByCount, overdueTasks: t.overdue, trend,
  };
}

// ===== 成员级分析 =====

function computeMemberHealth(m: PeriodSnapshot['members'][0]): HealthScore {
  let s = 100;
  if (m.activeTasks > 0) {
    s -= (m.overdueTasks / m.activeTasks) * 35;
    s -= (m.blockedTasks / m.activeTasks) * 20;
  }
  s -= Math.max(0, 50 - m.avgProgress) / 50 * 20;
  s = clamp(Math.round(s), 0, 100);
  const tasks = s; // 成员维度以任务代表
  const projects = s;
  const goals = s;
  const overall = Math.round(goals * 0.3 + projects * 0.3 + tasks * 0.4);
  return { overall: clamp(overall, 0, 100), goals, projects, tasks, level: scoreToLevel(overall) };
}

function computeMemberRisks(m: PeriodSnapshot['members'][0], snap: PeriodSnapshot): RiskItem[] {
  const risks: RiskItem[] = [];
  if (m.overdueTasks > 0) {
    risks.push({
      id: nextRiskId(), severity: m.overdueTasks > 3 ? 'high' : 'medium',
      type: 'overdue', itemType: 'task', itemId: '', itemTitle: `${m.name} 逾期任务`,
      description: `${m.name} 有 ${m.overdueTasks} 个逾期任务`,
      suggestion: '优先处理逾期任务或重新评估优先级',
      memberId: m.id, memberName: m.name,
    });
  }
  if (m.blockedTasks > 0) {
    risks.push({
      id: nextRiskId(), severity: 'low', type: 'blocked',
      itemType: 'task', itemId: '', itemTitle: `${m.name} 阻塞任务`,
      description: `${m.name} 有 ${m.blockedTasks} 个阻塞任务`,
      suggestion: '推动解除阻塞依赖',
      memberId: m.id, memberName: m.name,
    });
  }
  return risks;
}

function computeMemberEfficiency(m: PeriodSnapshot['members'][0]): EfficiencyMetrics {
  const total = m.activeTasks + m.completedTasks;
  return {
    completionRate: total > 0 ? Math.round(m.completedTasks / total * 100) : 0,
    onTimeRate: 0, avgCompletionDays: 0,
    activeGoals: m.activeGoals, activeProjects: m.activeProjects, activeTasks: m.activeTasks,
    completedTasksInPeriod: m.completedTasks, newTasksInPeriod: 0,
    blockedTasks: m.blockedTasks, overdueTasks: m.overdueTasks,
    trend: m.completedTasks > m.overdueTasks ? 'up' : m.overdueTasks > 0 ? 'down' : 'stable',
  };
}

export function computeMemberAnalysis(snap: PeriodSnapshot): MemberAnalysis[] {
  return snap.members.map(m => ({
    memberId: m.id, memberName: m.name, role: m.role,
    health: computeMemberHealth(m),
    risks: computeMemberRisks(m, snap),
    efficiency: computeMemberEfficiency(m),
  }));
}

// ===== 团队完整分析 =====

export function analyzeTeam(snap: PeriodSnapshot): TeamAnalysis {
  const { start, end } = getPeriodRange(snap.period);
  return {
    health: computeHealth(snap),
    risks: detectRisks(snap),
    efficiency: computeEfficiency(snap),
    members: computeMemberAnalysis(snap),
    analyzedAt: new Date().toISOString(),
    period: snap.period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}
