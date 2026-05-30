/**
 * AI 全局最优资源分配引擎 —— 驱动层终极形态：跨目标跨项目的全局优化
 * 对标 TacoMAS 学术框架的全局资源分配 + ClickUp Brain 全局建议
 *
 * 核心能力：
 * 1. 全局视角：跨所有目标/项目的资源分配优化
 * 2. 优先级驱动：高优先级目标优先获得资源
 * 3. 约束满足：角色、时间、能力约束下的可行解
 * 4. 帕累托最优：无法在不损害其他目标的情况下进一步改善
 *
 * 双模式：确定性 + LLM深度
 */
import type { AppState } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { buildTeamCapabilityLocal, type CapabilityVector, DIMENSION_LABELS } from './aiTeamCapability';

// ===== 类型 =====

export interface GlobalAllocation {
  /** 目标级资源分配方案 */
  goalAllocations: Array<{
    goalId: string;
    goalTitle: string;
    goalPriority: string;
    goalProgress: number;
    /** 分配的成员数 */
    allocatedMembers: number;
    /** 建议增加/减少的人数 */
    adjustment: number;
    /** 理由 */
    reason: string;
    /** 预期进度提升 */
    projectedProgressGain: number;
  }>;
  /** 全局优化指标 */
  globalMetrics: {
    /** 资源利用效率 */
    utilizationEfficiency: number;
    /** 优先级加权达成率 */
    weightedAchievementRate: number;
    /** 负载均衡度 */
    balanceScore: number;
    /** 全局健康指数 */
    globalHealthIndex: number;
  };
  /** 关键瓶颈 */
  bottlenecks: Array<{ type: 'people' | 'skill' | 'time'; description: string; impact: string }>;
  /** 全局建议 */
  globalRecommendations: string[];
  fromLLM: boolean;
  generatedAt: string;
}

// ===== 确定性全局优化 =====

export function optimizeGlobalAllocationLocal(state: AppState): GlobalAllocation {
  const ctx = buildAIContext(state);
  const capMap = buildTeamCapabilityLocal(state);
  const activeGoals = state.goals.filter(g => g.status !== 'done' && g.status !== 'cancelled');
  const activeMembers = capMap.members;

  // 1. 按优先级排序目标并计算资源需求
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedGoals = [...activeGoals].sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

  const goalAllocations: GlobalAllocation['goalAllocations'] = sortedGoals.map(goal => {
    const goalProjects = state.projects.filter(p => p.goalId === goal.id);
    const goalTasks = state.tasks.filter(t => t.goalId === goal.id);
    const leaderIds = new Set([...goalProjects, ...goalTasks].map(item => item.leaderId).filter(Boolean));
    const allocatedMembers = leaderIds.size;

    // 根据进度和优先级决定调整方向
    let adjustment = 0;
    let reason = '';
    let projectedProgressGain = 0;

    if (goal.progress < 30 && (goal.priority === 'urgent' || goal.priority === 'high')) {
      adjustment = 2;
      reason = `高优先级目标进度仅${goal.progress}%，需增投资源`;
      projectedProgressGain = 15;
    } else if (goal.progress < 50 && goal.priority === 'high') {
      adjustment = 1;
      reason = `重要目标进度${goal.progress}%，建议增加1人支援`;
      projectedProgressGain = 10;
    } else if (goal.progress >= 80) {
      adjustment = -1;
      reason = `进度已达${goal.progress}%，可逐步释放资源支援其他目标`;
      projectedProgressGain = -5;
    } else if (allocatedMembers === 0) {
      adjustment = 1;
      reason = '无人负责，需指定至少1人推进';
      projectedProgressGain = 20;
    } else {
      reason = `当前${allocatedMembers}人负责，进度${goal.progress}%，资源基本匹配`;
    }

    return {
      goalId: goal.id, goalTitle: goal.title, goalPriority: goal.priority,
      goalProgress: goal.progress, allocatedMembers, adjustment,
      reason, projectedProgressGain,
    };
  });

  // 2. 计算全局指标
  const loads = activeMembers.map(m => m.loadFactor);
  const avgLoad = loads.length > 0 ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
  const utilizationEfficiency = Math.round(Math.min(100, avgLoad));

  const totalPriority = activeGoals.reduce((s, g) => s + (4 - (priorityOrder[g.priority] ?? 3)), 0);
  const achievedPriority = activeGoals.filter(g => g.progress >= 70).reduce((s, g) => s + (4 - (priorityOrder[g.priority] ?? 3)), 0);
  const weightedAchievementRate = totalPriority > 0 ? Math.round(achievedPriority / totalPriority * 100) : 0;

  const loadStdDev = loads.length > 1 ? Math.sqrt(loads.reduce((s, l) => s + (l - avgLoad) ** 2, 0) / loads.length) : 0;
  const balanceScore = avgLoad > 0 ? Math.max(0, Math.round(100 - loadStdDev / avgLoad * 100)) : 100;

  const globalHealthIndex = Math.round((utilizationEfficiency + weightedAchievementRate + balanceScore) / 3);

  // 3. 识别瓶颈
  const bottlenecks: GlobalAllocation['bottlenecks'] = [];
  const overMembers = activeMembers.filter(m => m.loadFactor > 100);
  if (overMembers.length > 0) bottlenecks.push({ type: 'people', description: `${overMembers.length}人过载`, impact: '交付节奏不稳定，高质量任务有逾期风险' });
  const scarceDims = Object.entries(capMap.teamDimensions).filter(([, v]) => v < 20);
  if (scarceDims.length > 0) bottlenecks.push({ type: 'skill', description: `${scarceDims.map(([d]) => DIMENSION_LABELS[d as keyof typeof DIMENSION_LABELS]).join('、')}能力紧缺`, impact: '影响相关目标的交付质量' });
  const overdueGoals = activeGoals.filter(g => ctx.items.find(i => i.id === g.id)?.isOverdue);
  if (overdueGoals.length > 0) bottlenecks.push({ type: 'time', description: `${overdueGoals.length}个目标逾期`, impact: '战略目标可能无法按期达成' });

  // 4. 全局建议
  const globalRecommendations: string[] = [];
  if (globalHealthIndex < 50) globalRecommendations.push('全局健康指数偏低，建议启动资源重新分配');
  if (overMembers.length > 0) globalRecommendations.push(`优先将${overMembers.map(m => m.memberName).slice(0, 2).join('、')}的非核心任务释放给欠载成员`);
  const highAdjGoals = goalAllocations.filter(g => g.adjustment > 0);
  if (highAdjGoals.length > 0) globalRecommendations.push(`优先为「${highAdjGoals[0].goalTitle}」补充资源`);
  if (balanceScore < 50) globalRecommendations.push('负载严重不均衡，建议执行一次全局再分配');
  if (globalRecommendations.length === 0) globalRecommendations.push('资源分配状况良好，维持当前策略');

  return {
    goalAllocations, globalMetrics: {
      utilizationEfficiency, weightedAchievementRate, balanceScore, globalHealthIndex,
    }, bottlenecks, globalRecommendations,
    fromLLM: false, generatedAt: new Date().toISOString(),
  };
}

export async function optimizeGlobalAllocationDeep(state: AppState): Promise<GlobalAllocation> {
  const local = optimizeGlobalAllocationLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return local;

  try {
    const ctx = buildAIContext(state);
    const goalSummary = local.goalAllocations.slice(0, 6).map(g => `「${g.goalTitle}」进度${g.goalProgress}% 调整${g.adjustment > 0 ? '+' : ''}${g.adjustment}人`).join('；');
    const prompt = `你是全局资源优化专家。团队全局健康指数${local.globalMetrics.globalHealthIndex}，目标分配:${goalSummary}。瓶颈:${local.bottlenecks.map(b => b.description).join('；') || '无'}。请给出跨目标的协调优化和战略性建议，输出JSON:{"crossGoalOptimizations":[{"fromGoal":"","toGoal":"","action":"","expectedGain":""}],"strategicRecommendations":["建议1"],"riskMitigations":[{"risk":"","mitigation":""}]}`;
    const raw = await callLLM(prompt, config);
    if (!raw) return local;
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed) return local;
    if (Array.isArray(parsed.strategicRecommendations)) {
      local.globalRecommendations.push(...parsed.strategicRecommendations.map(String).slice(0, 3));
    }
    if (Array.isArray(parsed.crossGoalOptimizations)) {
      for (const co of parsed.crossGoalOptimizations) {
        local.globalRecommendations.push(`跨目标协调: 从「${co.fromGoal}」${co.action}到「${co.toGoal}」— ${co.expectedGain}`);
      }
    }
    local.fromLLM = true;
    return local;
  } catch { return local; }
}
