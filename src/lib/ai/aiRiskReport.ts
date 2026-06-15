/**
 * 风险报告模板生成器
 *
 * 按需或定期生成，包含：
 * - 整体风险评分与等级
 * - 高优风险清单（含缓解建议）
 * - 进度延误预测
 * - 资源瓶颈预警
 * - AI 综合研判与行动建议
 */

import type { AppState } from '@/store/types';
import { callLLM } from '@/lib/ai/llmService';
import { collectSnapshot } from '@/lib/ai/dataCollector';
import { detectRisks } from '@/lib/ai/analysisEngine';
import { predictRisksLocal } from '@/lib/ai/aiRiskPredictor';
import type { PredictedRisk, SchedulePrediction, ResourceBottleneck } from '@/lib/ai/aiRiskPredictor';

export interface RiskReport {
  generatedAt: number;
  overallRiskScore: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  topRisks: RiskReportItem[];
  scheduleDelays: ScheduleDelayItem[];
  resourceBottlenecks: BottleneckItem[];
  trendComparison: RiskTrend;
  actionPlan: string;
}

export interface RiskReportItem {
  id: string;
  title: string;
  category: 'schedule' | 'resource' | 'cascade' | 'quality' | 'dependency';
  severity: 'critical' | 'high' | 'medium';
  description: string;
  affectedItems: Array<{ id: string; title: string }>;
  mitigations: Array<{ action: string; priority: 'urgent' | 'high' | 'medium' }>;
}

export interface ScheduleDelayItem {
  itemId: string;
  itemTitle: string;
  itemType: 'goal' | 'project' | 'task';
  plannedEnd: string | null;
  predictedEnd: string;
  delayDays: number;
  confidence: number;
}

export interface BottleneckItem {
  memberName: string;
  activeTasks: number;
  teamAvg: number;
  overloadMultiplier: number;
  predictedOverdue: number;
  cascadeImpact: Array<{ id: string; title: string }>;
}

export interface RiskTrend {
  currentRiskCount: number;
  criticalCount: number;
  highCount: number;
  trendDirection: 'worsening' | 'stable' | 'improving';
  trendNote: string;
}

// ===== 本地生成 =====

export function generateRiskReportLocal(state: AppState): RiskReport {
  const tasks = Object.values(state.tasks);
  const goals = Object.values(state.goals);

  // 复用 aiRiskPredictor 的完整预测能力
  const prediction = predictRisksLocal(state);

  // 也用 analysisEngine 做基础风险检测，作为交叉验证
  const snap = collectSnapshot(state, 'weekly');
  const basicRisks = detectRisks(snap);

  // 整体风险评分 & 等级
  const overallRiskScore = prediction.overallRiskScore;
  const riskLevel = overallRiskScore >= 70 ? 'critical' as const
    : overallRiskScore >= 45 ? 'high' as const
    : overallRiskScore >= 20 ? 'medium' as const
    : 'low' as const;

  // 顶部风险（最多 8 条）
  const topRisks: RiskReportItem[] = prediction.risks.slice(0, 8).map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    severity: r.probability as 'critical' | 'high' | 'medium',
    description: r.description,
    affectedItems: r.affectedItems.map(a => ({ id: a.id, title: a.title })),
    mitigations: r.mitigations.map(m => ({ action: m.action, priority: m.priority })),
  }));

  // 进度延误预测
  const scheduleDelays: ScheduleDelayItem[] = prediction.schedulePredictions
    .filter(s => s.delayDays > 0)
    .slice(0, 8)
    .map(s => ({
      itemId: s.itemId,
      itemTitle: s.itemTitle,
      itemType: s.itemType,
      plannedEnd: s.plannedEnd,
      predictedEnd: s.predictedEnd,
      delayDays: s.delayDays,
      confidence: s.confidence,
    }));

  // 资源瓶颈
  const resourceBottlenecks: BottleneckItem[] = prediction.resourceBottlenecks
    .slice(0, 5)
    .map(b => ({
      memberName: b.memberName,
      activeTasks: b.activeTasks,
      teamAvg: b.teamAvg,
      overloadMultiplier: b.overloadMultiplier,
      predictedOverdue: b.predictedOverdue,
      cascadeImpact: b.cascadeImpact.map(c => ({ id: c.id, title: c.title })),
    }));

  // 趋势对比
  const trendComparison = computeTrend(prediction.risks, tasks, goals);

  // 行动计划（本地版）
  const actionPlan = generateLocalActionPlan(topRisks, scheduleDelays, resourceBottlenecks);

  return {
    generatedAt: Date.now(),
    overallRiskScore,
    riskLevel,
    topRisks,
    scheduleDelays,
    resourceBottlenecks,
    trendComparison,
    actionPlan,
  };
}

function computeTrend(
  risks: PredictedRisk[],
  tasks: Array<{ status: string; dueDate?: string; updatedAt?: string }>,
  goals: Array<{ status: string; progress?: number }>
): RiskTrend {
  const criticalCount = risks.filter(r => r.probability === 'critical').length;
  const highCount = risks.filter(r => r.probability === 'high').length;
  const currentRiskCount = risks.length;

  // 简化趋势判断：逾期任务和高风险的比例暗示趋势方向
  const overdueActive = tasks.filter(t =>
    t.status !== 'done' && t.status !== 'cancelled' &&
    t.dueDate && t.dueDate < new Date().toISOString().split('T')[0]
  ).length;
  const lowProgressGoals = goals.filter(g =>
    g.status === 'in-progress' && (g.progress || 0) < 30
  ).length;

  let trendDirection: 'worsening' | 'stable' | 'improving';
  let trendNote: string;

  if (criticalCount >= 3 || (overdueActive > 5 && lowProgressGoals > 2)) {
    trendDirection = 'worsening';
    trendNote = '风险持续累积，需立即干预';
  } else if (criticalCount === 0 && highCount <= 1 && overdueActive <= 2) {
    trendDirection = 'improving';
    trendNote = '风险态势趋缓，保持警惕即可';
  } else {
    trendDirection = 'stable';
    trendNote = '风险态势持平，持续监控';
  }

  return { currentRiskCount, criticalCount, highCount, trendDirection, trendNote };
}

function generateLocalActionPlan(
  topRisks: RiskReportItem[],
  scheduleDelays: ScheduleDelayItem[],
  bottlenecks: BottleneckItem[]
): string {
  const parts: string[] = [];

  const criticalRisks = topRisks.filter(r => r.severity === 'critical');
  if (criticalRisks.length > 0) {
    parts.push(`紧急处理${criticalRisks.length}个关键风险：${criticalRisks.map(r => r.title).join('、')}`);
  }

  if (scheduleDelays.length > 0) {
    const maxDelay = scheduleDelays[0];
    parts.push(`最大延期风险：${maxDelay.itemTitle}预计延期${maxDelay.delayDays}天`);
  }

  if (bottlenecks.length > 0) {
    const worst = bottlenecks[0];
    parts.push(`资源瓶颈：${worst.memberName}过载${worst.overloadMultiplier}倍，需重新分配`);
  }

  if (parts.length === 0) {
    parts.push('当前风险可控，建议定期复查并关注隐性风险');
  }

  return parts.join('；') + '。';
}

// ===== LLM 增强版 =====

export async function generateRiskReportDeep(state: AppState): Promise<RiskReport> {
  const local = generateRiskReportLocal(state);

  try {
    const contextStr = JSON.stringify({
      overallRiskScore: local.overallRiskScore,
      riskLevel: local.riskLevel,
      topRisks: local.topRisks.map(r => ({
        title: r.title,
        category: r.category,
        severity: r.severity,
        mitigations: r.mitigations.map(m => m.action),
      })),
      scheduleDelays: local.scheduleDelays.slice(0, 3).map(d => ({
        item: d.itemTitle,
        delayDays: d.delayDays,
        confidence: d.confidence,
      })),
      bottlenecks: local.resourceBottlenecks.slice(0, 3).map(b => ({
        name: b.memberName,
        overload: b.overloadMultiplier,
        predictedOverdue: b.predictedOverdue,
      })),
      trend: local.trendComparison,
    });

    const prompt = `你是团队管理风险分析专家。根据当前风险数据生成综合研判和行动建议。
要求：
1. 200字以内
2. 按紧急程度排序，给出3-5条具体可执行建议
3. 每条建议需明确责任方和时间窗口
4. 语气专业、简洁、有力
5. 不要重复已有数据，聚焦增量洞察

数据：
${contextStr}`;

    const aiSuggestion = await callLLM(prompt, {
      provider: 'deepseek',
      apiKey: '',
      baseUrl: '',
      model: '',
      enabled: true,
    });

    if (aiSuggestion && aiSuggestion.trim()) {
      local.actionPlan = aiSuggestion.trim();
    }
  } catch {
    // LLM 失败时保留本地建议
  }

  return local;
}
