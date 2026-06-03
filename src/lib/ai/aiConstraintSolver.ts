/**
 * AI 约束求解器 —— 基于能力向量和资源约束的任务分配优化
 * 对标 Asana AI Teammates 智能分配 + ClickUp Brain 资源建议
 *
 * 核心能力：
 * 1. 人-任务匹配：基于能力向量计算最优分配
 * 2. 约束感知：考虑负荷上限、角色权限、时间窗口
 * 3. 多目标优化：平衡负载均衡 + 能力匹配 + 优先级
 * 4. 动态调整建议：基于当前分配的优化建议
 *
 * 双模式：
 * - 确定性求解（无需 LLM）：基于评分函数的贪心分配
 * - LLM 深度求解：语义理解驱动的综合优化
 */
import type { AppState, Task } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { buildTeamCapabilityLocal, type CapabilityVector, type CapabilityDimension, DIMENSION_LABELS } from './aiTeamCapability';
import { handleError } from '@/lib/errorHandler';

// ===== 类型 =====

export interface AssignmentSuggestion {
  /** 任务ID */
  taskId: string;
  /** 任务标题 */
  taskTitle: string;
  /** 任务优先级 */
  taskPriority: string;
  /** 当前负责人（若已分配） */
  currentLeaderId: string | null;
  currentLeaderName: string | null;
  /** 推荐负责人ID */
  suggestedLeaderId: string;
  /** 推荐负责人名称 */
  suggestedLeaderName: string;
  /** 匹配度 0-100 */
  fitnessScore: number;
  /** 匹配理由 */
  reason: string;
  /** 是否为调整建议（变更现有分配） */
  isReassignment: boolean;
  /** 预期收益 */
  expectedBenefit: string;
}

export interface OptimizationResult {
  /** 新任务分配建议 */
  newAssignments: AssignmentSuggestion[];
  /** 调整建议（变更现有分配） */
  reassignments: AssignmentSuggestion[];
  /** 优化指标 */
  metrics: {
    /** 当前负载均衡度 0-100 */
    currentBalance: number;
    /** 优化后预期负载均衡度 */
    projectedBalance: number;
    /** 当前匹配度均值 */
    currentMatchAvg: number;
    /** 优化后预期匹配度均值 */
    projectedMatchAvg: number;
    /** 未分配任务数 */
    unassignedCount: number;
  };
  /** 全局优化建议 */
  globalSuggestions: string[];
  /** 是否来自 LLM */
  fromLLM: boolean;
  /** 生成时间 */
  generatedAt: string;
}

// ===== 确定性约束求解 =====

/** 计算任务所需能力维度（从标签/标题推断） */
function inferTaskRequirements(task: Task): Partial<Record<CapabilityDimension, number>> {
  const reqs: Partial<Record<CapabilityDimension, number>> = {};
  const tags = task.tags ?? [];
  const title = task.title;

  const TAG_DIM_MAP: Record<string, CapabilityDimension[]> = {
    '规划': ['planning'], '设计': ['design'], '执行': ['execution'],
    '检查': ['review'], '测试': ['testing'], '文档': ['documentation'],
    '前端': ['frontend'], '后端': ['backend'], '数据': ['data'],
    '运维': ['ops'], '安全': ['ops', 'backend'],
  };

  for (const tag of tags) {
    const dims = TAG_DIM_MAP[tag];
    if (dims) for (const d of dims) reqs[d] = (reqs[d] || 0) + 60;
  }

  if (/规划|方案|设计|架构/.test(title)) reqs.planning = 50;
  if (/测试|验证|QA/.test(title)) reqs.testing = 50;
  if (/文档|说明/.test(title)) reqs.documentation = 40;
  if (/前端|页面|组件/.test(title)) reqs.frontend = 50;
  if (/后端|接口|API/.test(title)) reqs.backend = 50;
  if (/数据|报表|分析/.test(title)) reqs.data = 50;
  if (/运维|部署|监控/.test(title)) reqs.ops = 50;
  if (/评审|检查|复盘/.test(title)) reqs.review = 40;

  // 默认：执行力
  if (Object.keys(reqs).length === 0) reqs.execution = 30;

  return reqs;
}

/** 计算人-任务匹配度 */
function computeMatchScore(member: CapabilityVector, task: Task, requirements: Partial<Record<CapabilityDimension, number>>): number {
  let score = 0;
  let totalWeight = 0;

  for (const [dim, weight] of Object.entries(requirements)) {
    totalWeight += weight;
    const memberScore = member.dimensions[dim as CapabilityDimension] || 0;
    // 匹配度 = 成员得分 / 需求权重 * 归一化
    score += Math.min(100, memberScore) * (weight / 100);
  }

  if (totalWeight === 0) return 50; // 无明确需求时给基础分

  const matchPct = Math.round(score / totalWeight * 100);

  // 负荷惩罚
  const loadPenalty = member.loadFactor > 100 ? 30 : member.loadFactor > 80 ? 15 : member.loadFactor > 60 ? 5 : 0;

  return Math.max(0, Math.min(100, matchPct - loadPenalty));
}

/** 生成匹配理由 */
function buildMatchReason(member: CapabilityVector, task: Task, requirements: Partial<Record<CapabilityDimension, number>>, matchScore: number): string {
  const parts: string[] = [];

  for (const [dim, weight] of Object.entries(requirements)) {
    const memberVal = member.dimensions[dim as CapabilityDimension] || 0;
    if (weight >= 40 && memberVal >= 40) {
      parts.push(`${DIMENSION_LABELS[dim as CapabilityDimension]}能力匹配(${memberVal}分)`);
    }
  }

  if (member.loadFactor > 80) parts.push(`负荷较高(${member.loadFactor}%)`);
  if (member.strengths.length > 0) parts.push(`擅长${member.strengths.slice(0, 2).map(s => DIMENSION_LABELS[s]).join('、')}`);

  return parts.length > 0 ? parts.join('，') : `综合匹配度${matchScore}%`;
}

/** 计算负载均衡度 */
function computeBalance(members: CapabilityVector[]): number {
  const loads = members.filter(m => m.loadFactor > 0).map(m => m.loadFactor);
  if (loads.length <= 1) return 100;
  const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
  const stdDev = Math.sqrt(loads.reduce((s, l) => s + (l - avg) ** 2, 0) / loads.length);
  return Math.max(0, Math.round(100 - (avg > 0 ? stdDev / avg * 100 : 0)));
}

/** 确定性约束求解主函数 */
export function optimizeAssignmentsLocal(state: AppState): OptimizationResult {
  const capabilityMap = buildTeamCapabilityLocal(state);
  const activeMembers = capabilityMap.members;

  if (activeMembers.length === 0) {
    return {
      newAssignments: [], reassignments: [],
      metrics: { currentBalance: 100, projectedBalance: 100, currentMatchAvg: 0, projectedMatchAvg: 0, unassignedCount: 0 },
      globalSuggestions: ['团队暂无活跃成员'], fromLLM: false, generatedAt: new Date().toISOString(),
    };
  }

  const unassignedTasks = state.tasks.filter(t => !t.leaderId && t.status !== 'done' && t.status !== 'cancelled');
  const assignedTasks = state.tasks.filter(t => t.leaderId && t.status !== 'done' && t.status !== 'cancelled');

  const currentBalance = computeBalance(activeMembers);

  // 1. 未分配任务的建议
  const newAssignments: AssignmentSuggestion[] = unassignedTasks.map(task => {
    const reqs = inferTaskRequirements(task);
    const scored = activeMembers.map(m => ({
      member: m,
      score: computeMatchScore(m, task, reqs),
      reason: buildMatchReason(m, task, reqs, computeMatchScore(m, task, reqs)),
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score <= 0) return null;

    return {
      taskId: task.id, taskTitle: task.title, taskPriority: task.priority,
      currentLeaderId: null, currentLeaderName: null,
      suggestedLeaderId: best.member.memberId, suggestedLeaderName: best.member.memberName,
      fitnessScore: best.score, reason: best.reason,
      isReassignment: false,
      expectedBenefit: best.score >= 70 ? '高度匹配，可快速推进' : best.score >= 40 ? '基本匹配，需要注意短板' : '匹配度一般，建议关注支持',
    };
  }).filter(Boolean) as AssignmentSuggestion[];

  // 2. 已分配任务的优化建议（仅针对匹配度明显低于其他人的情况）
  const reassignments: AssignmentSuggestion[] = [];
  for (const task of assignedTasks) {
    const currentLeader = activeMembers.find(m => m.memberId === task.leaderId);
    if (!currentLeader) continue;

    const reqs = inferTaskRequirements(task);
    const currentScore = computeMatchScore(currentLeader, task, reqs);

    // 找更优人选
    const alternatives = activeMembers
      .filter(m => m.memberId !== task.leaderId)
      .map(m => ({ member: m, score: computeMatchScore(m, task, reqs) }))
      .sort((a, b) => b.score - a.score);

    const bestAlt = alternatives[0];
    if (bestAlt && bestAlt.score > currentScore + 20 && bestAlt.member.loadFactor < currentLeader.loadFactor) {
      reassignments.push({
        taskId: task.id, taskTitle: task.title, taskPriority: task.priority,
        currentLeaderId: task.leaderId, currentLeaderName: currentLeader.memberName,
        suggestedLeaderId: bestAlt.member.memberId, suggestedLeaderName: bestAlt.member.memberName,
        fitnessScore: bestAlt.score,
        reason: `${bestAlt.member.memberName}匹配度${bestAlt.score}%优于当前${currentLeader.memberName}的${currentScore}%，且负荷更低`,
        isReassignment: true,
        expectedBenefit: `匹配度提升${bestAlt.score - currentScore}分，降低${currentLeader.memberName}负荷`,
      });
    }
  }

  // 3. 指标计算
  const allMatchScores = [...newAssignments, ...reassignments].map(a => a.fitnessScore);
  const currentMatchAvg = assignedTasks.length > 0
    ? Math.round(assignedTasks.reduce((s, t) => {
        const leader = activeMembers.find(m => m.memberId === t.leaderId);
        return s + (leader ? computeMatchScore(leader, t, inferTaskRequirements(t)) : 0);
      }, 0) / assignedTasks.length)
    : 0;

  const projectedMatchAvg = allMatchScores.length > 0
    ? Math.round(allMatchScores.reduce((a, b) => a + b, 0) / allMatchScores.length)
    : currentMatchAvg;

  // 4. 全局建议
  const globalSuggestions: string[] = [];
  const avgLoad = activeMembers.reduce((s, m) => s + m.loadFactor, 0) / activeMembers.length;
  if (avgLoad > 80) globalSuggestions.push('团队整体负荷偏高，建议暂停新增任务');
  if (capabilityMap.concentrationRisks.length > 0) {
    globalSuggestions.push(`${capabilityMap.concentrationRisks[0].dimension}能力过于集中，建议培养备选人员`);
  }
  const highLoad = activeMembers.filter(m => m.loadFactor > 100);
  if (highLoad.length > 0) globalSuggestions.push(`${highLoad.map(m => m.memberName).join('、')}过载，优先释放任务`);
  if (unassignedTasks.length > 3) globalSuggestions.push(`${unassignedTasks.length}个任务未分配，建议尽快指定负责人`);

  return {
    newAssignments: newAssignments.sort((a, b) => {
      const pOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (pOrder[a.taskPriority] ?? 3) - (pOrder[b.taskPriority] ?? 3) || b.fitnessScore - a.fitnessScore;
    }),
    reassignments: reassignments.slice(0, 5),
    metrics: {
      currentBalance, projectedBalance: currentBalance,
      currentMatchAvg, projectedMatchAvg,
      unassignedCount: unassignedTasks.length,
    },
    globalSuggestions,
    fromLLM: false,
    generatedAt: new Date().toISOString(),
  };
}

// ===== LLM 深度约束求解 =====

function buildOptimizationPrompt(ctx: AIProjectContext, capabilityMap: ReturnType<typeof buildTeamCapabilityLocal>, localResult: OptimizationResult): string {
  const memberLoads = capabilityMap.members.slice(0, 8).map(m =>
    `- ${m.memberName}: 负荷${m.loadFactor}%, 强项[${m.strengths.slice(0, 3).map(s => DIMENSION_LABELS[s]).join(',')}]`
  ).join('\n');

  const assignments = localResult.newAssignments.slice(0, 5).map(a =>
    `- 「${a.taskTitle}」→ ${a.suggestedLeaderName} (匹配${a.fitnessScore}%)`
  ).join('\n');

  return `你是团队资源优化专家。基于团队能力画像和当前分配状态，进行深度资源优化。

## 团队能力画像
${memberLoads}

## 确定性分配建议
${assignments || '无'}

## 调整建议
${localResult.reassignments.slice(0, 3).map(r => `- 「${r.taskTitle}」从${r.currentLeaderName}→${r.suggestedLeaderName}`).join('\n') || '无'}

## 负载均衡度
- 当前: ${localResult.metrics.currentBalance}%
- 未分配任务: ${localResult.metrics.unassignedCount}个

## 请深度分析
1. 是否有更优的人员组合方案？
2. 跨项目/目标的资源共享机会
3. 能力培养导向的分配策略
4. 时间窗口约束下的最优调度

## 输出格式（严格 JSON）
{"reassignments":[{"taskId":"","taskTitle":"","fromMemberId":"","fromMemberName":"","toMemberId":"","toMemberName":"","reason":"","expectedBenefit":""}],"globalSuggestions":["建议1"],"trainingAssignments":[{"taskId":"","memberId":"","memberName":"","reason":"通过此任务培养xx能力"}]}`;
}

export async function optimizeAssignmentsDeep(state: AppState): Promise<OptimizationResult> {
  const localResult = optimizeAssignmentsLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return localResult;

  try {
    const ctx = buildAIContext(state);
    const capabilityMap = buildTeamCapabilityLocal(state);
    const prompt = buildOptimizationPrompt(ctx, capabilityMap, localResult);
    const raw = await callLLM(prompt, config);
    if (!raw) return localResult;

    let parsed: { reassignments?: Array<{ taskId?: string; taskTitle?: string; fromMemberId?: string; fromMemberName?: string; toMemberId?: string; toMemberName?: string; reason?: string; expectedBenefit?: string }>; globalSuggestions?: unknown[]; trainingAssignments?: Array<{ taskId?: string; taskTitle?: string; memberId?: string; memberName?: string; reason?: string }> } | null = null;
    try { parsed = JSON.parse(raw); } catch (e) { handleError(e, { module: 'aiConstraintSolver', operation: 'PARSE_LLM_JSON', severity: 'warn' });
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) try { parsed = JSON.parse(match[0]); } catch (e2) { handleError(e2, { module: 'aiConstraintSolver', operation: 'PARSE_LLM_JSON_FALLBACK', severity: 'warn' }); }
    }
    if (!parsed) return localResult;

    // 合并LLM调整建议
    if (Array.isArray(parsed.reassignments)) {
      for (const r of parsed.reassignments) {
        localResult.reassignments.push({
          taskId: String(r.taskId || ''),
          taskTitle: String(r.taskTitle || '').slice(0, 100),
          taskPriority: 'medium',
          currentLeaderId: String(r.fromMemberId || ''),
          currentLeaderName: String(r.fromMemberName || ''),
          suggestedLeaderId: String(r.toMemberId || ''),
          suggestedLeaderName: String(r.toMemberName || ''),
          fitnessScore: 60,
          reason: String(r.reason || '').slice(0, 200),
          isReassignment: true,
          expectedBenefit: String(r.expectedBenefit || ''),
        });
      }
    }

    if (Array.isArray(parsed.globalSuggestions)) {
      const existing = new Set(localResult.globalSuggestions);
      for (const s of parsed.globalSuggestions) {
        if (!existing.has(String(s))) localResult.globalSuggestions.push(String(s));
      }
    }

    // 培养导向分配
    if (Array.isArray(parsed.trainingAssignments)) {
      for (const ta of parsed.trainingAssignments) {
        localResult.newAssignments.push({
          taskId: String(ta.taskId || ''),
          taskTitle: String(ta.taskTitle || '培养任务').slice(0, 100),
          taskPriority: 'low',
          currentLeaderId: null, currentLeaderName: null,
          suggestedLeaderId: String(ta.memberId || ''),
          suggestedLeaderName: String(ta.memberName || ''),
          fitnessScore: 40,
          reason: `培养导向: ${String(ta.reason || '').slice(0, 100)}`,
          isReassignment: false,
          expectedBenefit: `能力成长: ${String(ta.reason || '')}`,
        });
      }
    }

    localResult.fromLLM = true;
    return localResult;
  } catch {
    return localResult;
  }
}
