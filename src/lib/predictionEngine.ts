/**
 * 全生命周期预测引擎 — 四维预测
 *
 * Round 4 — 中期攻坚
 * - 延期预测: 基于 delayPrediction 自学习库 + CPM 关键路径
 * - 资源预测: 基于 resourceBottleneck + 项目时间窗口
 * - OKR达成概率: 基于 KR 进度趋势 + 历史达成率
 * - 风险前置预警: 综合 CPM + 延期 + 资源 + OKR 的风险雷达
 */

import { calculateCriticalPath } from './gantt/cpm';
import { predictDelayRisk } from './delayPrediction';
import { calcMemberLoads, type MemberLoad } from './resourceBottleneck';
import { handleError } from '@/lib/errorHandler';
import type { Task, Goal, KeyResult, Member } from '@/types';

// ===== 类型定义 =====

export type PredictionType = 'delay' | 'resource' | 'okr' | 'risk';

export interface PredictionResult {
  type: PredictionType;
  targetId: string;
  targetName?: string;
  score: number; // 0-100, 越高越危险
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  details: Record<string, unknown>;
  suggestions: string[];
  confidence: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface RiskRadar {
  overall: number; // 0-100
  dimensions: { delay: number; resource: number; okr: number; risk: number };
  alerts: Array<{ level: string; message: string; action: string }>;
  predictions: PredictionResult[];
}

// ===== 延期预测增强 =====

export function predictDelayEnhanced(task: Task, allTasks: Task[]): PredictionResult {
  const base = predictDelayRisk(task, allTasks);

  // CPM 影响因子: 关键路径上的任务延期影响更大
  const tasksForCPM = allTasks.filter(t => t.projectId === task.projectId && t.status !== 'cancelled');
  let isOnCriticalPath = false;
  try {
    const cpm = calculateCriticalPath(tasksForCPM);
    isOnCriticalPath = cpm.criticalTaskIds.has(task.id);
  } catch (e) { handleError(e, { module: 'predictionEngine', operation: 'CPM_CALC', severity: 'warn' }); }

  const baseScore = base.risk === 'high' ? 80 : base.risk === 'medium' ? 50 : base.risk === 'low' ? 25 : 5;
  const cpmBoost = isOnCriticalPath ? 15 : 0;
  const overdueDaysBoost = Math.min((base.predictedDaysOverdue || 0) * 3, 30);
  const score = Math.min(100, baseScore + cpmBoost + overdueDaysBoost);

  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : score >= 15 ? 'low' : 'none';

  const suggestions: string[] = [];
  if (isOnCriticalPath) suggestions.push('此任务位于关键路径，延期将直接影响项目工期');
  if ((base.predictedDaysOverdue || 0) > 3) suggestions.push('建议将截止日延后或增加资源投入');
  if (base.ratio && base.ratio > 1.2) suggestions.push('历史数据显示该负责人/优先级的任务平均超期20%以上');

  return {
    type: 'delay',
    targetId: task.id,
    targetName: task.title,
    score,
    level,
    summary: `延期风险${level === 'critical' ? '严重' : level === 'high' ? '高' : level === 'medium' ? '中等' : '低'}，预计超期${base.predictedDaysOverdue || 0}天${isOnCriticalPath ? '（关键路径）' : ''}`,
    details: { ...base, isOnCriticalPath, projectTaskCount: tasksForCPM.length },
    suggestions,
    confidence: base.confidence,
    timestamp: new Date().toISOString(),
  };
}

// ===== 资源预测 =====

export function predictResourceBottleneck(tasks: Task[], members: Member[]): PredictionResult {
  const loads = calcMemberLoads(tasks, members);
  const critical = loads.filter((l: MemberLoad) => l.status === 'critical');
  const overloaded = loads.filter((l: MemberLoad) => l.status === 'overloaded');

  // 即将超载：负载接近阈值
  const upcomingOverloaded = loads.filter((l: MemberLoad) => l.status === 'balanced' && l.loadIndex > 35);

  const score = Math.min(100, critical.length * 25 + overloaded.length * 15 + upcomingOverloaded.length * 5);
  const level = score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 25 ? 'medium' : score >= 10 ? 'low' : 'none';

  const suggestions: string[] = [];
  if (critical.length > 0) suggestions.push(`${critical.map((l: MemberLoad) => l.memberName).join('、')} 已严重超载，需重新分配任务`);
  if (upcomingOverloaded.length > 0) suggestions.push(`${upcomingOverloaded.map((l: MemberLoad) => l.memberName).join('、')} 即将超载，建议提前调整`);
  if (overloaded.length > 0) suggestions.push('考虑启用外部协作或调整任务优先级');

  return {
    type: 'resource',
    targetId: '__team__',
    targetName: '团队资源',
    score,
    level,
    summary: `${critical.length}人超载，${overloaded.length}人满载，${upcomingOverloaded.length}人即将满载`,
    details: {
      critical: critical.map((l: MemberLoad) => ({ name: l.memberName, loadIndex: l.loadIndex, activeTasks: l.activeTasks })),
      overloaded: overloaded.map((l: MemberLoad) => ({ name: l.memberName, loadIndex: l.loadIndex })),
      upcomingOverloaded: upcomingOverloaded.map((l: MemberLoad) => ({ name: l.memberName, loadIndex: l.loadIndex })),
    },
    suggestions,
    confidence: loads.length >= 3 ? 'high' : loads.length >= 2 ? 'medium' : 'low',
    timestamp: new Date().toISOString(),
  };
}

// ===== OKR 达成概率 =====

export function predictOKRAchievement(goal: Goal): PredictionResult {
  const krs = goal.keyResults || [];
  if (krs.length === 0) {
    return { type: 'okr', targetId: goal.id, targetName: goal.title, score: 0, level: 'none', summary: '无关键结果', details: {}, suggestions: [], confidence: 'low', timestamp: new Date().toISOString() };
  }

  // 进度趋势分析
  let totalProgress = 0;
  let atRiskKRs = 0;
  const krDetails: Array<{ title: string; progress: number; status: string }> = [];

  for (const kr of krs) {
    const progress = Number.isFinite(kr.currentValue) ? kr.currentValue : 0;
    const target = Number.isFinite(kr.targetValue) ? kr.targetValue : 100;
    const pct = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
    totalProgress += pct;

    // 简单趋势：基于时间进度 vs 实际进度
    const startDate = goal.startDate || goal.createdAt;
    const endDate = goal.endDate || '';
    let timeProgress = 50;
    if (startDate && endDate) {
      const total = new Date(endDate).getTime() - new Date(startDate).getTime();
      const elapsed = Date.now() - new Date(startDate).getTime();
      timeProgress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 50;
    }

    const isBehind = timeProgress > 60 && pct < 40;
    if (isBehind) atRiskKRs++;
    krDetails.push({ title: kr.title || `KR-${kr.id?.slice(0, 4)}`, progress: Math.round(pct), status: isBehind ? 'at_risk' : pct >= 80 ? 'on_track' : 'watch' });
  }

  const avgProgress = totalProgress / krs.length;
  const atRiskRatio = atRiskKRs / krs.length;
  const score = Math.min(100, Math.round(atRiskRatio * 80 + (avgProgress < 30 ? 30 : 0)));
  const level = score >= 70 ? 'critical' : score >= 50 ? 'high' : score >= 30 ? 'medium' : score >= 15 ? 'low' : 'none';

  const suggestions: string[] = [];
  if (atRiskKRs > 0) suggestions.push(`${atRiskKRs}个KR进度落后于时间进度，需加速`);
  if (avgProgress < 30) suggestions.push('整体进度偏低，建议重新审视执行策略');
  if (atRiskRatio > 0.5) suggestions.push('超过半数KR有风险，建议调整目标或增加资源');

  return {
    type: 'okr',
    targetId: goal.id,
    targetName: goal.title,
    score,
    level,
    summary: `达成概率${100 - score}%，${atRiskKRs}/${krs.length}个KR有风险，整体进度${Math.round(avgProgress)}%`,
    details: { avgProgress: Math.round(avgProgress), atRiskKRs, totalKRs: krs.length, krs: krDetails },
    suggestions,
    confidence: krs.length >= 3 ? 'high' : 'medium',
    timestamp: new Date().toISOString(),
  };
}

// ===== 风险前置预警 — 综合所有维度 =====

export function generateRiskRadar(
  allTasks: Task[],
  members: Member[],
  goals: Goal[],
  projectId?: string,
): RiskRadar {
  const predictions: PredictionResult[] = [];

  // 延期维度：取所有 in_progress 任务中风险最高的5个
  const activeTasks = allTasks.filter(t => t.status === 'in_progress' && (!projectId || t.projectId === projectId));
  const delayPredictions = activeTasks.slice(0, 10).map(t => predictDelayEnhanced(t, allTasks));
  predictions.push(...delayPredictions);

  // 资源维度
  predictions.push(predictResourceBottleneck(allTasks, members));

  // OKR维度
  const activeGoals = goals.filter(g => g.status === 'in_progress' || g.status === 'todo');
  for (const g of activeGoals.slice(0, 5)) {
    predictions.push(predictOKRAchievement(g));
  }

  // 计算各维度分数
  const delayScores = delayPredictions.map(p => p.score);
  const resourceScore = predictions.find(p => p.type === 'resource')?.score || 0;
  const okrScores = predictions.filter(p => p.type === 'okr').map(p => p.score);

  const validDelayScores = delayScores.filter(s => Number.isFinite(s));
  const validOkrScores = okrScores.filter(s => Number.isFinite(s));

  const delayDim = validDelayScores.length > 0 ? Math.round(validDelayScores.reduce((a, b) => a + b, 0) / validDelayScores.length) || 0 : 0;
  const safeResourceScore = Number.isFinite(resourceScore) ? resourceScore : 0;
  const okrDim = validOkrScores.length > 0 ? Math.round(validOkrScores.reduce((a, b) => a + b, 0) / validOkrScores.length) || 0 : 0;

  // 综合风险：加权平均（延期40% + 资源30% + OKR30%）
  const riskDim = Math.round(delayDim * 0.4 + safeResourceScore * 0.3 + okrDim * 0.3) || 0;
  const overall = Math.round(delayDim * 0.35 + safeResourceScore * 0.25 + okrDim * 0.2 + riskDim * 0.2) || 0;

  // 生成告警
  const alerts: Array<{ level: string; message: string; action: string }> = [];
  if (delayDim >= 50) alerts.push({ level: 'high', message: `${delayPredictions.filter(p => p.level === 'high' || p.level === 'critical').length}个任务延期风险高`, action: '查看延期预测详情，调整截止日或分配' });
  if (safeResourceScore >= 50) alerts.push({ level: 'medium', message: '团队资源紧张', action: '重新分配任务或增派人手' });
  if (okrDim >= 40) alerts.push({ level: 'medium', message: `${validOkrScores.filter(s => s >= 40).length}个目标达成风险`, action: '审视KR进度，加速滞后项' });
  if (riskDim >= 60) alerts.push({ level: 'critical', message: '项目整体风险较高', action: '立即执行风险缓解计划' });

  return { overall, dimensions: { delay: delayDim, resource: resourceScore, okr: okrDim, risk: riskDim }, alerts, predictions };
}

// ===== V2 增强功能 =====

/** 进度感知延期预测 — 综合当前进度%">
 *  原始引擎只看历史比率，V2 额外考虑任务当前完成度和剩余时间
 */
export function predictDelayV2(task: Task, allTasks: Task[]): PredictionResult {
  const base = predictDelayEnhanced(task, allTasks);

  // 进度修正：如果进度已高，风险降低
  const progress = (task as Record<string, unknown>).progress as number ?? 0;
  const hasDue = !!task.dueDate;
  let progressDiscount = 0;
  if (hasDue && progress > 0) {
    const now = new Date();
    const due = new Date(task.dueDate);
    const created = new Date(task.createdAt);
    const totalDays = Math.max(1, (due.getTime() - created.getTime()) / 86400000);
    const elapsedDays = Math.max(0, (now.getTime() - created.getTime()) / 86400000);
    const timeProgress = Math.min(1, elapsedDays / totalDays);
    // 如果进度领先于时间进度，大幅降低风险
    if (progress / 100 > timeProgress * 1.2) {
      progressDiscount = Math.round((progress / 100 - timeProgress) * 30);
    }
    // 如果进度远远落后于时间进度，增加风险
    if (progress / 100 < timeProgress * 0.5 && timeProgress > 0.3) {
      progressDiscount = -Math.round((timeProgress - progress / 100) * 25);
    }
  }

  // 已完成任务风险为零
  if (task.status === 'done') {
    return { ...base, score: 0, level: 'none', summary: '任务已完成', suggestions: [] };
  }

  const adjustedScore = Math.max(0, Math.min(100, base.score - progressDiscount));
  const adjustedLevel = adjustedScore >= 80 ? 'critical' : adjustedScore >= 60 ? 'high' : adjustedScore >= 35 ? 'medium' : adjustedScore >= 15 ? 'low' : 'none';

  const newSuggestions = [...base.suggestions];
  if (progressDiscount > 10) newSuggestions.push('当前进度领先于时间进度，延期风险已降低');
  if (progressDiscount < -10) newSuggestions.push('进度明显落后于时间消耗，建议立即干预');

  return {
    ...base,
    score: adjustedScore,
    level: adjustedLevel,
    summary: `${base.summary}${progressDiscount > 5 ? '（进度正常）' : progressDiscount < -5 ? '（进度滞后）' : ''}`,
    suggestions: newSuggestions,
    details: { ...base.details, progress, progressDiscount },
  };
}

/** 级联传播预测 — 当上游任务延期时，级联影响下游依赖
 *  支持多级传播（A→B→C）
 */
export function predictCascadeDelay(task: Task, allTasks: Task[]): PredictionResult {
  const visited = new Set<string>();
  const cascadeChain: string[] = [];
  let totalCascadeDays = 0;

  function traverse(taskId: string, depth: number) {
    if (visited.has(taskId) || depth > 5) return;
    visited.add(taskId);
    cascadeChain.push(taskId);

    // 找到所有被该任务阻塞的任务
    const blocked = allTasks.filter(t => (t.blockedBy || []).includes(taskId) && t.status !== 'done' && !t.deletedAt);
    for (const bt of blocked) {
      const delayPred = predictDelayRisk(bt, allTasks);
      const days = delayPred.predictedDaysOverdue || 0;
      totalCascadeDays += days * (1 - depth * 0.15); // 越远级联影响衰减
      traverse(bt.id, depth + 1);
    }
  }

  traverse(task.id, 0);

  const directDelay = predictDelayEnhanced(task, allTasks);
  const totalImpact = (directDelay.details?.predictedDaysOverdue || 0) + totalCascadeDays;

  const score = Math.min(100, directDelay.score + cascadeChain.length * 8);
  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : score >= 15 ? 'low' : 'none';

  const suggestions = [...directDelay.suggestions];
  if (cascadeChain.length > 2) suggestions.push(`级联影响：延期将波及 ${cascadeChain.length - 1} 个下游任务`);
  if (totalImpact > 7) suggestions.push('总影响天数超过一周，建议调整依赖链或并行化执行');

  return {
    type: 'risk',
    targetId: task.id,
    targetName: task.title,
    score,
    level,
    summary: `级联风险${level === 'critical' ? '严重' : level === 'high' ? '高' : '中等'}：影响 ${cascadeChain.length - 1} 个下游任务，累计影响约 ${Math.round(totalImpact)} 天`,
    details: { cascadeChain, totalCascadeDays: Math.round(totalCascadeDays), totalImpact: Math.round(totalImpact) },
    suggestions,
    confidence: cascadeChain.length > 3 ? 'low' : 'medium',
    timestamp: new Date().toISOString(),
  };
}

/** 统一 V2 风险雷达 — 整合原引擎 + 进度感知 + 级联传播 */
export function generateRiskRadarV2(tasks: Task[], members: Member[], goals: Goal[], projectId?: string): RiskRadar {
  // 用 V2 进度感知延期预测替代原始预测
  const activeTasks = tasks
    .filter(t => !t.deletedAt && t.status !== 'done' && t.status !== 'cancelled')
    .slice(0, 15); // 提升采样量 10→15
  const activeGoals = goals.filter(g => !g.deletedAt && g.status !== 'done' && g.status !== 'cancelled').slice(0, 8); // 5→8

  const predictions: PredictionResult[] = [];

  // V2 延期预测
  for (const task of activeTasks) {
    const pred = predictDelayV2(task, tasks);
    predictions.push(pred);
    // 高风险任务额外做级联分析
    if (pred.score >= 50 && (task.blockedBy || []).length === 0) {
      predictions.push(predictCascadeDelay(task, tasks));
    }
  }

  // 资源预测
  predictions.push(predictResourceBottleneck(tasks, members));

  // OKR 预测
  for (const goal of activeGoals) {
    predictions.push(predictOKRAchievement(goal));
  }

  // 计算维度分数
  const delayScores = predictions.filter(p => p.type === 'delay').map(p => p.score);
  const cascadeScore = predictions.filter(p => p.type === 'risk' && p.details?.cascadeChain).map(p => p.score);
  const resourceScore = predictions.find(p => p.type === 'resource')?.score || 0;
  const okrScores = predictions.filter(p => p.type === 'okr').map(p => p.score);

  const delayDim = delayScores.length > 0 ? Math.round(delayScores.reduce((a, b) => a + b, 0) / delayScores.length) : 0;
  const cascadeDim = cascadeScore.length > 0 ? Math.round(cascadeScore.reduce((a, b) => a + b, 0) / cascadeScore.length) : 0;
  const okrDim = okrScores.length > 0 ? Math.round(okrScores.reduce((a, b) => a + b, 0) / okrScores.length) : 0;
  const safeResourceScore = Number.isFinite(resourceScore) ? resourceScore : 0;

  // V2 加权：延期30% + 级联20% + 资源25% + OKR25%
  const riskDim = Math.round(delayDim * 0.3 + cascadeDim * 0.2 + safeResourceScore * 0.25 + okrDim * 0.25);
  const overall = Math.round(delayDim * 0.25 + cascadeDim * 0.15 + safeResourceScore * 0.2 + okrDim * 0.2 + riskDim * 0.2);

  const alerts: Array<{ level: string; message: string; action: string }> = [];
  if (delayDim >= 50) alerts.push({ level: 'high', message: `${delayScores.filter(s => s >= 50).length}个任务延期风险高`, action: '调整截止日或增加资源' });
  if (cascadeDim >= 40) alerts.push({ level: 'high', message: '存在级联延期风险', action: '检查依赖链，考虑并行化' });
  if (safeResourceScore >= 50) alerts.push({ level: 'medium', message: '团队资源紧张', action: '重新分配任务' });
  if (okrDim >= 40) alerts.push({ level: 'medium', message: `${okrScores.filter(s => s >= 40).length}个目标达成风险`, action: '审视KR进度' });
  if (riskDim >= 60) alerts.push({ level: 'critical', message: '项目整体风险较高', action: '执行风险缓解计划' });

  return { overall, dimensions: { delay: delayDim, resource: safeResourceScore, okr: okrDim, risk: riskDim }, alerts, predictions };
}
