/**
 * AI 人-任务智能匹配引擎 —— 闭环核心：让对的人做对的事
 * 对标 Asana AI Teammates + 飞书智能分配
 *
 * 核心能力：
 * 1. 多维度匹配：能力+负荷+偏好+历史绩效+成长潜力
 * 2. 匹配解释：每个推荐都有可解释的理由
 * 3. 反向推荐：为人员推荐最适合的任务
 * 4. 团队组合优化：考虑协作化学反应
 *
 * 双模式：
 * - 确定性匹配（无需 LLM）：基于评分函数的多维匹配
 * - LLM 深度匹配：语义理解驱动的综合匹配
 */
import type { AppState, Task, Member } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { buildTeamCapabilityLocal, type CapabilityVector, type CapabilityDimension, DIMENSION_LABELS } from './aiTeamCapability';

// ===== 类型 =====

export interface MatchExplanation {
  /** 匹配维度 */
  dimension: string;
  /** 得分贡献 0-100 */
  contribution: number;
  /** 说明 */
  detail: string;
}

export interface TaskMatchResult {
  /** 任务ID */
  taskId: string;
  /** 任务标题 */
  taskTitle: string;
  /** 任务优先级 */
  taskPriority: string;
  /** 排名前N的候选人 */
  candidates: Array<{
    memberId: string;
    memberName: string;
    totalScore: number;
    explanations: MatchExplanation[];
  }>;
  /** 最佳候选人索引 */
  topCandidateIdx: number;
}

export interface MemberTaskRecommendation {
  /** 成员ID */
  memberId: string;
  /** 成员名称 */
  memberName: string;
  /** 推荐的待做任务 */
  recommendedTasks: Array<{
    taskId: string;
    taskTitle: string;
    taskPriority: string;
    matchScore: number;
    reason: string;
  }>;
  /** 成长建议：做哪些类型的任务可提升能力 */
  growthSuggestions: string[];
}

export interface MatchResult {
  /** 为每个未分配/需分配任务的匹配结果 */
  taskMatches: TaskMatchResult[];
  /** 为每个成员的任务推荐 */
  memberRecommendations: MemberTaskRecommendation[];
  /** 匹配质量指标 */
  qualityMetrics: {
    avgMatchScore: number;
    highMatchCount: number;
    lowMatchCount: number;
    coverageRate: number;
  };
  /** 是否来自 LLM */
  fromLLM: boolean;
  /** 生成时间 */
  generatedAt: string;
}

// ===== 确定性匹配 =====

/** 计算综合匹配评分 */
function computeFullMatchScore(member: CapabilityVector, task: Task, ctx: AIProjectContext): { score: number; explanations: MatchExplanation[] } {
  const explanations: MatchExplanation[] = [];
  let totalScore = 0;

  // 1. 能力匹配度（权重40%）
  const TAG_DIM_MAP: Record<string, CapabilityDimension[]> = {
    '规划': ['planning'], '设计': ['design'], '执行': ['execution'],
    '测试': ['testing'], '文档': ['documentation'], '前端': ['frontend'],
    '后端': ['backend'], '数据': ['data'], '运维': ['ops'],
  };

  let abilityScore = 30; // 基础分
  const tags = task.tags ?? [];
  const relevantDims = new Set<CapabilityDimension>();
  for (const tag of tags) {
    const dims = TAG_DIM_MAP[tag];
    if (dims) for (const d of dims) relevantDims.add(d);
  }
  if (/规划|方案|架构/.test(task.title)) relevantDims.add('planning');
  if (/测试|验证/.test(task.title)) relevantDims.add('testing');
  if (/文档|说明/.test(task.title)) relevantDims.add('documentation');

  if (relevantDims.size > 0) {
    let matchSum = 0;
    for (const dim of relevantDims) {
      matchSum += member.dimensions[dim];
    }
    abilityScore = Math.round(matchSum / relevantDims.size);
  }
  explanations.push({ dimension: '能力匹配', contribution: abilityScore, detail: relevantDims.size > 0 ? `相关维度: ${[...relevantDims].map(d => DIMENSION_LABELS[d]).join('、')}` : '通用执行力' });
  totalScore += abilityScore * 0.4;

  // 2. 负荷适配度（权重25%）
  let loadScore = 100;
  if (member.loadFactor > 120) loadScore = 10;
  else if (member.loadFactor > 100) loadScore = 25;
  else if (member.loadFactor > 80) loadScore = 50;
  else if (member.loadFactor > 60) loadScore = 75;
  explanations.push({ dimension: '负荷适配', contribution: loadScore, detail: `当前负荷${member.loadFactor}%` });
  totalScore += loadScore * 0.25;

  // 3. 经验匹配度（权重20%）
  let expScore = 20;
  if (member.experience.completedTasks > 20) expScore = 80;
  else if (member.experience.completedTasks > 10) expScore = 60;
  else if (member.experience.completedTasks > 5) expScore = 40;
  // 优先级越高越需要经验
  if (task.priority === 'urgent' || task.priority === 'high') {
    expScore = Math.min(100, expScore + 15);
  }
  explanations.push({ dimension: '经验匹配', contribution: expScore, detail: `完成${member.experience.completedTasks}个任务` });
  totalScore += expScore * 0.2;

  // 4. 成长潜力（权重15%）—— 如果成员在该任务相关维度有缺口，分配给他可以成长
  let growthScore = 30;
  const currentStrengths = new Set(member.strengths);
  const taskRelatedDims = [...relevantDims];
  const gapDims = taskRelatedDims.filter(d => !currentStrengths.has(d) && member.dimensions[d] < 50);
  if (gapDims.length > 0 && member.loadFactor < 80) {
    growthScore = 60 + gapDims.length * 10;
  }
  explanations.push({ dimension: '成长潜力', contribution: Math.min(100, growthScore), detail: gapDims.length > 0 ? `可提升${gapDims.map(d => DIMENSION_LABELS[d]).join('、')}` : '已擅长' });
  totalScore += Math.min(100, growthScore) * 0.15;

  return { score: Math.round(Math.min(100, totalScore)), explanations };
}

/** 确定性匹配主函数 */
export function matchTasksLocal(state: AppState): MatchResult {
  const ctx = buildAIContext(state);
  const capabilityMap = buildTeamCapabilityLocal(state);

  const unassignedTasks = state.tasks.filter(t => !t.leaderId && t.status !== 'done' && t.status !== 'cancelled');
  const activeMembers = capabilityMap.members;

  // 1. 为每个未分配任务找候选人
  const taskMatches: TaskMatchResult[] = unassignedTasks.map(task => {
    const candidates = activeMembers.map(m => {
      const { score, explanations } = computeFullMatchScore(m, task, ctx);
      return { memberId: m.memberId, memberName: m.memberName, totalScore: score, explanations };
    }).sort((a, b) => b.totalScore - a.totalScore);

    return {
      taskId: task.id, taskTitle: task.title, taskPriority: task.priority,
      candidates: candidates.slice(0, 3),
      topCandidateIdx: 0,
    };
  }).sort((a, b) => {
    const pOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (pOrder[a.taskPriority] ?? 3) - (pOrder[b.taskPriority] ?? 3);
  });

  // 2. 为每个成员推荐任务
  const allTasks = state.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const memberRecommendations: MemberTaskRecommendation[] = activeMembers.map(member => {
    const scored = allTasks.map(task => {
      const { score, explanations } = computeFullMatchScore(member, task, ctx);
      return { taskId: task.id, taskTitle: task.title, taskPriority: task.priority, matchScore: score, reason: explanations.filter(e => e.contribution >= 50).map(e => e.detail).join('；') || '综合匹配' };
    }).sort((a, b) => b.matchScore - a.matchScore);

    const growthSuggestions: string[] = [];
    if (member.gaps.length > 0) {
      growthSuggestions.push(`建议承担${member.gaps.slice(0, 2).map(g => DIMENSION_LABELS[g]).join('、')}相关任务以提升短板`);
    }
    if (member.strengths.length > 0) {
      growthSuggestions.push(`可发挥${member.strengths.slice(0, 2).map(s => DIMENSION_LABELS[s]).join('、')}优势承担高优先级任务`);
    }

    return {
      memberId: member.memberId, memberName: member.memberName,
      recommendedTasks: scored.slice(0, 5),
      growthSuggestions,
    };
  });

  // 3. 质量指标
  const allScores = taskMatches.flatMap(tm => tm.candidates.map(c => c.totalScore));
  const avgMatchScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const totalActive = allTasks.length;
  const assigned = allTasks.filter(t => t.leaderId).length;

  return {
    taskMatches,
    memberRecommendations,
    qualityMetrics: {
      avgMatchScore,
      highMatchCount: allScores.filter(s => s >= 70).length,
      lowMatchCount: allScores.filter(s => s < 30).length,
      coverageRate: totalActive > 0 ? Math.round(assigned / totalActive * 100) : 0,
    },
    fromLLM: false,
    generatedAt: new Date().toISOString(),
  };
}

// ===== LLM 深度匹配 =====

function buildMatchPrompt(ctx: AIProjectContext, localResult: MatchResult, capabilityMap: ReturnType<typeof buildTeamCapabilityLocal>): string {
  const topMatches = localResult.taskMatches.slice(0, 5).map(tm =>
    `- 「${tm.taskTitle}」→ 最佳: ${tm.candidates[0]?.memberName || '无'} (${tm.candidates[0]?.totalScore || 0}%)`
  ).join('\n');

  return `你是团队人-任务匹配专家。基于团队能力画像和确定性匹配结果，进行深度优化匹配。

## 团队能力概况
${capabilityMap.members.slice(0, 6).map(m => `- ${m.memberName}: 强项[${m.strengths.slice(0, 2).map(s => DIMENSION_LABELS[s]).join(',')}] 负荷${m.loadFactor}%`).join('\n')}

## 确定性匹配结果
${topMatches || '无'}

## 请深度分析
1. 是否有非直觉但更优的匹配方案（如跨领域学习者）
2. 协同效应匹配（某些人一起做特定任务效果好）
3. 长期能力建设的匹配策略
4. 匹配中的潜在风险

## 输出格式（严格 JSON）
{"overrides":[{"taskId":"","taskTitle":"","suggestedMemberId":"","suggestedMemberName":"","reason":"","synergy":""}],"insights":"整体匹配洞察"}`;
}

export async function matchTasksDeep(state: AppState): Promise<MatchResult> {
  const localResult = matchTasksLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return localResult;

  try {
    const ctx = buildAIContext(state);
    const capabilityMap = buildTeamCapabilityLocal(state);
    const prompt = buildMatchPrompt(ctx, localResult, capabilityMap);
    const raw = await callLLM(prompt, config);
    if (!raw) return localResult;

    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) try { parsed = JSON.parse(match[0]); } catch {}
    }
    if (!parsed?.overrides) return localResult;

    // 将LLM覆盖建议融入结果
    for (const o of parsed.overrides) {
      const tm = localResult.taskMatches.find(t => t.taskId === o.taskId || t.taskTitle === o.taskTitle);
      if (tm) {
        tm.candidates.unshift({
          memberId: String(o.suggestedMemberId || ''),
          memberName: String(o.suggestedMemberName || ''),
          totalScore: 75,
          explanations: [
            { dimension: 'AI深度匹配', contribution: 75, detail: String(o.reason || '').slice(0, 100) },
            ...(o.synergy ? [{ dimension: '协同效应', contribution: 60, detail: String(o.synergy).slice(0, 80) }] : []),
          ],
        });
      }
    }

    localResult.fromLLM = true;
    return localResult;
  } catch {
    return localResult;
  }
}
