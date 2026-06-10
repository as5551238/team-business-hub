/**
 * AI 动态资源再分配引擎 —— 闭环核心：资源流动到最需要的地方
 * 对标 Asana Workload + ClickUp Brain 资源建议
 *
 * 核心能力：
 * 1. 资源供需分析：目标/项目的资源需求 vs 当前分配
 * 2. 再分配方案：识别过载→欠载的人员迁移策略
 * 3. 优先级驱动的再分配：高优先级项目优先获得资源
 * 4. 约束感知：不破坏已有关键路径和角色
 *
 * 双模式：
 * - 确定性再分配（无需 LLM）：基于负载均衡的贪心迁移
 * - LLM 深度再分配：语义理解驱动的综合优化
 */
import type { AppState } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { buildTeamCapabilityLocal, type CapabilityVector, DIMENSION_LABELS } from './aiTeamCapability';

// ===== 类型 =====

export type ReallocAction = 'move' | 'share' | 'defer' | 'escalate' | 'split';

export interface ReallocSuggestion {
  /** 动作类型 */
  action: ReallocAction;
  /** 任务ID */
  taskId: string;
  /** 任务标题 */
  taskTitle: string;
  /** 任务优先级 */
  taskPriority: string;
  /** 源成员 */
  fromMemberId: string;
  fromMemberName: string;
  /** 目标成员（move/share时） */
  toMemberId: string | null;
  toMemberName: string | null;
  /** 理由 */
  reason: string;
  /** 预期改善 */
  expectedImprovement: string;
  /** 紧迫度 */
  urgency: 'immediate' | 'soon' | 'optional';
}

export interface ResourceImbalance {
  /** 过载成员 */
  overloadedMembers: Array<{ memberId: string; memberName: string; activeTasks: number; overloadPct: number }>;
  /** 欠载成员 */
  underloadedMembers: Array<{ memberId: string; memberName: string; activeTasks: number; capacityRemaining: number }>;
  /** 紧缺维度 */
  scarceDimensions: string[];
  /** 过剩维度 */
  surplusDimensions: string[];
}

export interface ReallocResult {
  /** 资源供需分析 */
  imbalance: ResourceImbalance;
  /** 再分配建议 */
  suggestions: ReallocSuggestion[];
  /** 再分配前后对比指标 */
  beforeMetrics: { balanceScore: number; avgLoad: number; maxLoad: number; minLoad: number };
  afterMetrics: { balanceScore: number; avgLoad: number; maxLoad: number; minLoad: number };
  /** 是否来自 LLM */
  fromLLM: boolean;
  /** 生成时间 */
  generatedAt: string;
}

// ===== 确定性再分配 =====

/** 分析资源供需不平衡 */
function analyzeImbalance(capabilityMap: ReturnType<typeof buildTeamCapabilityLocal>, ctx: AIProjectContext): ResourceImbalance {
  const overloaded = capabilityMap.members.filter(m => m.loadFactor > 100);
  const underloaded = capabilityMap.members.filter(m => m.loadFactor < 40);

  const overloadedMembers = overloaded.map(m => ({
    memberId: m.memberId, memberName: m.memberName,
    activeTasks: Math.round(m.loadFactor / 10), overloadPct: m.loadFactor - 100,
  }));

  const underloadedMembers = underloaded.map(m => ({
    memberId: m.memberId, memberName: m.memberName,
    activeTasks: Math.round(m.loadFactor / 10), capacityRemaining: 100 - m.loadFactor,
  }));

  const scarceDimensions = capabilityMap.teamGaps.slice(0, 3).map(g => DIMENSION_LABELS[g]);
  const surplusDimensions = capabilityMap.teamStrengths.slice(0, 3).map(s => DIMENSION_LABELS[s]);

  return {
    overloadedMembers, underloadedMembers, scarceDimensions, surplusDimensions,
  };
}

/** 计算负载指标 */
function computeLoadMetrics(members: CapabilityVector[]): { balanceScore: number; avgLoad: number; maxLoad: number; minLoad: number } {
  const loads = members.map(m => m.loadFactor);
  if (loads.length === 0) return { balanceScore: 100, avgLoad: 0, maxLoad: 0, minLoad: 0 };
  const avgLoad = Math.round(loads.reduce((a, b) => a + b, 0) / loads.length);
  const maxLoad = Math.max(...loads);
  const minLoad = Math.min(...loads);
  const stdDev = Math.sqrt(loads.reduce((s, l) => s + (l - avgLoad) ** 2, 0) / loads.length);
  const balanceScore = Math.max(0, Math.round(100 - (avgLoad > 0 ? stdDev / avgLoad * 100 : 0)));
  return { balanceScore, avgLoad, maxLoad, minLoad };
}

/** 确定性再分配主函数 */
export function reallocateResourcesLocal(state: AppState): ReallocResult {
  const ctx = buildAIContext(state);
  const capabilityMap = buildTeamCapabilityLocal(state);
  const imbalance = analyzeImbalance(capabilityMap, ctx);
  const beforeMetrics = computeLoadMetrics(capabilityMap.members);

  const suggestions: ReallocSuggestion[] = [];

  // 1. 过载→欠载迁移
  for (const overMember of imbalance.overloadedMembers) {
    const overTasks = state.tasks.filter(t => t.leaderId === overMember.memberId && t.status !== 'done' && t.status !== 'cancelled' && t.priority !== 'urgent');
    const sortedTasks = overTasks.sort((a, b) => {
      const pOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
      return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
    });

    for (const underMember of imbalance.underloadedMembers) {
      if (overMember.overloadPct <= 0) break;

      // 找一个可以迁移的任务
      for (const task of sortedTasks) {
        const toCapability = capabilityMap.members.find(m => m.memberId === underMember.memberId);
        if (!toCapability) continue;

        // 欠载成员有基本能力承接
        const canHandle = toCapability.overallScore >= 20;
        if (canHandle) {
          suggestions.push({
            action: 'move', taskId: task.id, taskTitle: task.title, taskPriority: task.priority,
            fromMemberId: overMember.memberId, fromMemberName: overMember.memberName,
            toMemberId: underMember.memberId, toMemberName: underMember.memberName,
            reason: `${overMember.memberName}过载${overMember.overloadPct}%，${underMember.memberName}仍有${underMember.capacityRemaining}%容量`,
            expectedImprovement: `降低${overMember.memberName}负荷${10}%，提升均衡度`,
            urgency: overMember.overloadPct > 50 ? 'immediate' : 'soon',
          });
          overMember.overloadPct -= 30;
          underMember.capacityRemaining -= 30;
          break;
        }
      }
    }
  }

  // 2. 紧急任务加人（share）
  const urgentOrHigh = state.tasks.filter(t => (t.priority === 'urgent' || t.priority === 'high') && t.status === 'in_progress' && (t.supporterIds ?? []).length === 0);
  for (const task of urgentOrHigh.slice(0, 3)) {
    const leader = capabilityMap.members.find(m => m.memberId === task.leaderId);
    if (!leader || leader.loadFactor < 80) continue;

    const bestSupporter = capabilityMap.members
      .filter(m => m.memberId !== task.leaderId && m.loadFactor < 70)
      .sort((a, b) => b.overallScore - a.overallScore)[0];

    if (bestSupporter) {
      suggestions.push({
        action: 'share', taskId: task.id, taskTitle: task.title, taskPriority: task.priority,
        fromMemberId: task.leaderId, fromMemberName: leader.memberName,
        toMemberId: bestSupporter.memberId, toMemberName: bestSupporter.memberName,
        reason: `高优先级任务仅${leader.memberName}一人，且其负荷${leader.loadFactor}%偏高`,
        expectedImprovement: `加速${task.title}交付，降低${leader.memberName}瓶颈风险`,
        urgency: task.priority === 'urgent' ? 'immediate' : 'soon',
      });
    }
  }

  // 3. 低优先级任务延缓
  const lowPriorityActive = state.tasks.filter(t => t.priority === 'low' && t.status === 'in_progress');
  for (const task of lowPriorityActive.slice(0, 2)) {
    const leader = capabilityMap.members.find(m => m.memberId === task.leaderId);
    if (leader && leader.loadFactor > 80) {
      suggestions.push({
        action: 'defer', taskId: task.id, taskTitle: task.title, taskPriority: task.priority,
        fromMemberId: task.leaderId, fromMemberName: leader.memberName,
        toMemberId: null, toMemberName: null,
        reason: `${leader.memberName}过载，低优先级任务建议延缓`,
        expectedImprovement: `释放${leader.memberName} ${10}%容量`,
        urgency: 'optional',
      });
    }
  }

  // 4. 紧缺维度的能力建议
  for (const dim of imbalance.scarceDimensions.slice(0, 2)) {
    suggestions.push({
      action: 'escalate', taskId: '', taskTitle: `补充${dim}能力`, taskPriority: 'medium',
      fromMemberId: '', fromMemberName: '',
      toMemberId: null, toMemberName: null,
      reason: `${dim}能力在团队中紧缺，影响交付质量`,
      expectedImprovement: `提升${dim}维度整体实力，减少瓶颈`,
      urgency: 'soon',
    });
  }

  // 模拟再分配后指标
  const afterMetrics = { ...beforeMetrics };
  if (suggestions.filter(s => s.action === 'move').length > 0) {
    afterMetrics.balanceScore = Math.min(100, beforeMetrics.balanceScore + 15);
    afterMetrics.maxLoad = Math.max(0, beforeMetrics.maxLoad - 20);
    afterMetrics.minLoad = Math.min(100, beforeMetrics.minLoad + 15);
  }

  return {
    imbalance, suggestions,
    beforeMetrics, afterMetrics,
    fromLLM: false, generatedAt: new Date().toISOString(),
  };
}

// ===== LLM 深度再分配 =====

function buildReallocPrompt(ctx: AIProjectContext, localResult: ReallocResult): string {
  return `你是团队资源优化专家。基于供需分析和确定性建议，进行深度资源再分配方案设计。

## 资源供需
- 过载: ${localResult.imbalance.overloadedMembers.map(m => `${m.memberName}(${m.overloadPct}%)`).join('、') || '无'}
- 欠载: ${localResult.imbalance.underloadedMembers.map(m => `${m.memberName}(余${m.capacityRemaining}%)`).join('、') || '无'}
- 紧缺维度: ${localResult.imbalance.scarceDimensions.join('、') || '无'}

## 确定性建议
${localResult.suggestions.slice(0, 5).map(s => `- ${s.action === 'move' ? '迁移' : s.action === 'share' ? '共享' : s.action === 'defer' ? '延缓' : '升级'}: ${s.reason}`).join('\n') || '无'}

## 请深度分析
1. 是否有更优的迁移组合？
2. 跨项目资源共享机会
3. 时间敏感的资源调度策略
4. 组织层面的资源优化建议

## 输出格式（严格 JSON）
{"suggestions":[{"action":"move|share|defer|escalate|split","taskId":"","taskTitle":"","fromMemberId":"","fromMemberName":"","toMemberId":"","toMemberName":"","reason":"","expectedImprovement":"","urgency":"immediate|soon|optional"}],"orgLevelInsight":"组织层面洞察"}`;
}

export async function reallocateResourcesDeep(state: AppState): Promise<ReallocResult> {
  const localResult = reallocateResourcesLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return localResult;

  try {
    const ctx = buildAIContext(state);
    const prompt = buildReallocPrompt(ctx, localResult);
    const raw = await callLLM(prompt, config);
    if (!raw) return localResult;

    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) try { parsed = JSON.parse(match[0]); } catch {}
    }
    if (!parsed?.suggestions) return localResult;

    const validActions = ['move', 'share', 'defer', 'escalate', 'split'];
    const validUrgencies = ['immediate', 'soon', 'optional'];

    for (const s of parsed.suggestions) {
      localResult.suggestions.push({
        action: validActions.includes(s.action) ? s.action : 'move',
        taskId: String(s.taskId || ''),
        taskTitle: String(s.taskTitle || '').slice(0, 100),
        taskPriority: 'medium',
        fromMemberId: String(s.fromMemberId || ''),
        fromMemberName: String(s.fromMemberName || ''),
        toMemberId: s.toMemberId ? String(s.toMemberId) : null,
        toMemberName: s.toMemberName ? String(s.toMemberName) : null,
        reason: String(s.reason || '').slice(0, 200),
        expectedImprovement: String(s.expectedImprovement || '').slice(0, 200),
        urgency: validUrgencies.includes(s.urgency) ? s.urgency : 'soon',
      });
    }

    localResult.fromLLM = true;
    return localResult;
  } catch {
    return localResult;
  }
}
