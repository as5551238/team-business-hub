/**
 * AI 任务路由引擎 — 统一入口 + 多策略选择
 * 
 * 将分散的 smart_assign(最低负荷)、aiMatcher(4轴评分)、
 * aiConstraintSolver(约束优化) 统一到一个入口，
 * 通过策略参数自动选择路由算法。
 *
 * R17: 多策略路由引擎
 */
import type { AppState, Task, Member } from '@/types';
import { buildTeamCapabilityLocal, type CapabilityVector } from './aiTeamCapability';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { matchTasksLocal } from './aiMatcher';
import { handleError } from '@/lib/errorHandler';

// ===== 路由策略定义 =====

export type RoutingStrategy =
  | 'load-balance'   // 最低负荷优先（原 smart_assign）
  | 'best-fit'       // 能力最佳匹配（4轴评分）
  | 'growth'         // 成长导向（偏好可发展技能的成员）
  | 'urgency'        // 紧急优先（最有经验的人处理紧急任务）
  | 'auto';          // 自动选择（根据任务特征决定策略）

export const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  'load-balance': '负荷均衡',
  'best-fit': '能力最佳匹配',
  'growth': '成长导向',
  'urgency': '紧急优先',
  'auto': '智能选择',
};

// ===== 路由结果 =====

export interface RoutingResult {
  /** 任务ID */
  taskId?: string;
  /** 推荐的成员ID */
  memberId: string;
  /** 成员姓名 */
  memberName: string;
  /** 置信度 0-100 */
  confidence: number;
  /** 使用的策略 */
  strategy: RoutingStrategy;
  /** 推荐理由 */
  reason: string;
  /** 得分明细 */
  scoreBreakdown?: {
    ability: number;
    load: number;
    experience: number;
    growth: number;
  };
}

// ===== 策略自动选择 =====

function autoSelectStrategy(task: Task, state: AppState): RoutingStrategy {
  // 紧急任务 → urgency
  if (task.priority === 'urgent') return 'urgency';
  // 3人以下小团队 → load-balance（无分化必要）
  const activeMembers = state.members.filter(m => !m.deletedAt);
  if (activeMembers.length <= 3) return 'load-balance';
  // 检测负荷不均 → load-balance
  const loads = activeMembers.map(m =>
    state.tasks.filter(t => !t.deletedAt && t.leaderId === m.id && t.status !== 'done' && t.status !== 'cancelled').length
  );
  const maxLoad = Math.max(...loads);
  const minLoad = Math.min(...loads);
  if (maxLoad - minLoad >= 5) return 'load-balance';
  // 默认 → best-fit
  return 'best-fit';
}

// ===== 各策略实现 =====

function routeLoadBalance(
  task: Task,
  activeMembers: Member[],
  state: AppState,
): RoutingResult {
  const loads = activeMembers.map(m => ({
    id: m.id,
    name: m.name,
    count: state.tasks.filter(t => !t.deletedAt && t.leaderId === m.id && t.status !== 'done' && t.status !== 'cancelled').length,
  }));
  loads.sort((a, b) => a.count - b.count);
  const best = loads[0];
  const maxLoad = loads[loads.length - 1].count;
  const confidence = maxLoad > 0 ? Math.round(100 - (best.count / maxLoad) * 30) : 95;
  return {
    memberId: best.id,
    memberName: best.name,
    confidence: Math.max(60, confidence),
    strategy: 'load-balance',
    reason: `当前 ${best.count} 个任务（最低负荷），团队最高 ${maxLoad} 个`,
    scoreBreakdown: { ability: 50, load: 100, experience: 50, growth: 50 },
  };
}

function routeBestFit(
  task: Task,
  activeMembers: Member[],
  state: AppState,
  ctx: AIProjectContext,
  capabilities: Map<string, CapabilityVector>,
): RoutingResult {
  // 使用 aiMatcher 的评分逻辑
  const matchResults = matchTasksLocal([task], activeMembers, ctx, capabilities);
  const taskResult = matchResults.find(r => r.taskId === task.id);
  if (!taskResult || taskResult.candidates.length === 0) {
    // fallback to load-balance
    return routeLoadBalance(task, activeMembers, state);
  }
  const top = taskResult.candidates[0];
  return {
    memberId: top.memberId,
    memberName: top.memberName,
    confidence: Math.min(95, Math.round(top.totalScore)),
    strategy: 'best-fit',
    reason: top.explanations.map(e => `${e.dimension}: ${e.detail}`).join('；'),
    scoreBreakdown: {
      ability: top.explanations.find(e => e.dimension === '能力')?.contribution ?? 40,
      load: top.explanations.find(e => e.dimension === '负荷')?.contribution ?? 25,
      experience: top.explanations.find(e => e.dimension === '经验')?.contribution ?? 20,
      growth: top.explanations.find(e => e.dimension === '成长')?.contribution ?? 15,
    },
  };
}

function routeGrowth(
  task: Task,
  activeMembers: Member[],
  state: AppState,
  capabilities: Map<string, CapabilityVector>,
): RoutingResult {
  // 成长导向：找到有技能缺口但潜力匹配的成员
  interface GrowthCandidate {
    id: string;
    name: string;
    growthScore: number;
    loadCount: number;
    gapDimensions: string[];
  }
  const candidates: GrowthCandidate[] = activeMembers.map(m => {
    const cap = capabilities.get(m.id);
    const loadCount = state.tasks.filter(t => !t.deletedAt && t.leaderId === m.id && t.status !== 'done' && t.status !== 'cancelled').length;
    if (!cap) return { id: m.id, name: m.name, growthScore: 0, loadCount, gapDimensions: [] };
    // 成长评分 = 有缺口维度数 × (1 - 负荷/10) × 整体得分权重
    const gaps = Object.entries(cap.dimensions)
      .filter(([, v]) => v > 15 && v < 50)
      .map(([k]) => k);
    const growthScore = gaps.length * 20 * Math.max(0.1, 1 - loadCount / 10) * (cap.overallScore / 100);
    return { id: m.id, name: m.name, growthScore, loadCount, gapDimensions: gaps };
  });
  candidates.sort((a, b) => b.growthScore - a.growthScore);
  const best = candidates[0];
  if (!best || best.growthScore === 0) {
    return routeLoadBalance(task, activeMembers, state);
  }
  return {
    memberId: best.id,
    memberName: best.name,
    confidence: Math.min(85, Math.round(best.growthScore + 40)),
    strategy: 'growth',
    reason: `有 ${best.gapDimensions.length} 个发展维度可提升（${best.gapDimensions.slice(0, 2).join('、')}），当前 ${best.loadCount} 个任务`,
    scoreBreakdown: { ability: 30, load: 20, experience: 15, growth: 85 },
  };
}

function routeUrgency(
  task: Task,
  activeMembers: Member[],
  state: AppState,
  capabilities: Map<string, CapabilityVector>,
): RoutingResult {
  // 紧急优先：最有经验的成员
  interface UrgencyCandidate {
    id: string;
    name: string;
    overallScore: number;
    loadCount: number;
  }
  const candidates: UrgencyCandidate[] = activeMembers.map(m => {
    const cap = capabilities.get(m.id);
    const loadCount = state.tasks.filter(t => !t.deletedAt && t.leaderId === m.id && t.status !== 'done' && t.status !== 'cancelled').length;
    return { id: m.id, name: m.name, overallScore: cap?.overallScore ?? 30, loadCount };
  });
  // 按整体能力排序，但也考虑负荷（最多超过均值2个任务则降权）
  const avgLoad = candidates.reduce((s, c) => s + c.loadCount, 0) / Math.max(1, candidates.length);
  candidates.sort((a, b) => {
    const scoreA = a.overallScore * (a.loadCount <= avgLoad + 2 ? 1 : 0.5);
    const scoreB = b.overallScore * (b.loadCount <= avgLoad + 2 ? 1 : 0.5);
    return scoreB - scoreA;
  });
  const best = candidates[0];
  return {
    memberId: best.id,
    memberName: best.name,
    confidence: Math.min(95, Math.round(best.overallScore)),
    strategy: 'urgency',
    reason: `综合能力 ${(best.overallScore ?? 0).toFixed(0)} 分，当前 ${best.loadCount} 个任务`,
    scoreBreakdown: { ability: 90, load: 40, experience: 90, growth: 10 },
  };
}

// ===== 统一入口 =====

/**
 * AI 任务路由 — 统一入口
 * @param taskId 要路由的任务ID
 * @param state 应用状态
 * @param strategy 路由策略，默认 'auto'
 * @returns 路由推荐结果
 */
export function routeTask(
  taskId: string,
  state: AppState,
  strategy: RoutingStrategy = 'auto',
): RoutingResult {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return { taskId, memberId: '', memberName: '', confidence: 0, strategy, reason: '任务不存在' };

  const activeMembers = state.members.filter(m => !m.deletedAt);
  if (activeMembers.length === 0) return { taskId, memberId: '', memberName: '', confidence: 0, strategy, reason: '团队无活跃成员' };

  // 自动策略选择
  const effectiveStrategy = strategy === 'auto' ? autoSelectStrategy(task, state) : strategy;

  // 负荷均衡策略不需要能力上下文
  if (effectiveStrategy === 'load-balance') {
    return { taskId: task.id, ...routeLoadBalance(task, activeMembers, state) };
  }

  // 构建上下文和能力模型
  let ctx: AIProjectContext;
  let capabilities: Map<string, CapabilityVector>;
  try {
    ctx = buildAIContext(state);
    capabilities = buildTeamCapabilityLocal(state);
  } catch (e) {
    handleError(e, { module: 'AIRoutingEngine', operation: 'BUILD_CONTEXT', severity: 'warning' });
    return { taskId: task.id, ...routeLoadBalance(task, activeMembers, state) };
  }

  switch (effectiveStrategy) {
    case 'best-fit':
      return { taskId: task.id, ...routeBestFit(task, activeMembers, state, ctx, capabilities) };
    case 'growth':
      return { taskId: task.id, ...routeGrowth(task, activeMembers, state, capabilities) };
    case 'urgency':
      return { taskId: task.id, ...routeUrgency(task, activeMembers, state, capabilities) };
    default:
      return { taskId: task.id, ...routeLoadBalance(task, activeMembers, state) };
  }
}

/**
 * 批量路由 — 为多个未分配任务生成推荐
 */
export function routeBatchTasks(
  taskIds: string[],
  state: AppState,
  strategy: RoutingStrategy = 'auto',
): RoutingResult[] {
  return taskIds.map(id => routeTask(id, state, strategy));
}
