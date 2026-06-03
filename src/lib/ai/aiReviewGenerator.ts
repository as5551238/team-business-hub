/**
 * AI 智能复盘生成 + OKR螺旋反馈引擎 —— 闭环核心：从完成中学习
 * 对标飞书 OKR 评分复盘 + Asana AI Status Summary
 *
 * 核心能力：
 * 1. 自动复盘生成：基于目标/项目/任务数据生结构化复盘
 * 2. OKR螺旋反馈：KR评分→经验提取→下周期改进建议
 * 3. 经验沉淀：将复盘结论转化为可复用的方法论
 * 4. 趋势对比：与历史复盘对比，识别改进或退步
 *
 * 双模式：
 * - 确定性复盘（无需 LLM）：基于数据的结构化复盘
 * - LLM 深度复盘：语义理解驱动的深度复盘
 */
import type { AppState, Goal } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { computeHealth, detectRisks } from './analysisEngine';
import { collectSnapshot, getPeriodRange } from './dataCollector';
import { handleError } from '@/lib/errorHandler';

// ===== 类型 =====

export interface ReviewSection {
  title: string;
  content: string;
  /** 量化指标 */
  metrics?: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'stable' }>;
}

export interface OKRFeedback {
  /** KR标题 */
  krTitle: string;
  /** 评分 0-1 */
  score: number;
  /** 评分说明 */
  scoreExplanation: string;
  /** 经验教训 */
  lesson: string;
  /** 下周期建议 */
  nextCycleSuggestion: string;
}

export interface ReviewResult {
  /** 复盘目标 */
  goalId: string;
  goalTitle: string;
  /** 复盘章节 */
  sections: ReviewSection[];
  /** OKR反馈 */
  okrFeedback: OKRFeedback[];
  /** 总体评分 */
  overallScore: number;
  /** 经验沉淀 */
  extractedLessons: string[];
  /** 下周期行动项 */
  actionItems: Array<{ action: string; priority: 'high' | 'medium' | 'low'; assignee: string | null }>;
  /** 是否来自 LLM */
  fromLLM: boolean;
  /** 生成时间 */
  generatedAt: string;
}

// ===== 确定性复盘 =====

/** 计算KR评分 */
function scoreKR(kr: { title: string; currentValue: number; targetValue: number; pct: number }): { score: number; explanation: string } {
  const rawPct = kr.pct;
  let score: number;
  if (rawPct >= 100) score = 1.0;
  else if (rawPct >= 90) score = 0.9;
  else if (rawPct >= 70) score = 0.7;
  else if (rawPct >= 50) score = 0.5;
  else if (rawPct >= 30) score = 0.3;
  else score = 0.1;

  const explanation = rawPct >= 70
    ? `进度${rawPct}%，达成良好`
    : rawPct >= 50
    ? `进度${rawPct}%，部分达成，需关注阻碍因素`
    : rawPct >= 30
    ? `进度${rawPct}%，达成不足，需分析原因`
    : `进度仅${rawPct}%，严重偏移，需复盘根本原因`;

  return { score, explanation };
}

/** 确定性复盘主函数 */
export function generateReviewLocal(state: AppState, goalId: string): ReviewResult | null {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return null;

  const ctx = buildAIContext(state);
  const goalCtx = ctx.items.find(i => i.id === goalId);

  const sections: ReviewSection[] = [];

  // 1. 概况
  sections.push({
    title: '目标概况',
    content: `目标「${goal.title}」状态${goal.status === 'done' ? '已完成' : goal.status === 'in_progress' ? '进行中' : goal.status}，进度${goal.progress}%`,
    metrics: [
      { label: '进度', value: `${goal.progress}%`, trend: goal.progress >= 70 ? 'up' : goal.progress >= 40 ? 'stable' : 'down' },
      { label: '子项完成', value: `${goalCtx?.childDoneCount || 0}/${goalCtx?.childCount || 0}` },
      { label: '是否逾期', value: goalCtx?.isOverdue ? '是' : '否' },
    ],
  });

  // 2. KR评分
  const keyResults = goal.keyResults || [];
  const okrFeedback: OKRFeedback[] = keyResults.map(kr => {
    const pct = kr.targetValue > 0 ? Math.round(kr.currentValue / kr.targetValue * 100) : 0;
    const { score, explanation } = scoreKR({ title: kr.title, currentValue: kr.currentValue, targetValue: kr.targetValue, pct });

    let lesson = '';
    if (score >= 0.7) lesson = '目标制定合理，执行到位，可参考类似目标设定方法';
    else if (score >= 0.5) lesson = '部分达成，需关注执行中的阻塞点并提前消除';
    else if (score >= 0.3) lesson = '达成不足，可能原因：目标过于激进、资源不足、执行偏离，建议下周期调整';
    else lesson = '严重偏移，需从根本上重新审视目标的合理性和执行策略';

    let suggestion = '';
    if (score >= 0.7) suggestion = '维持当前节奏，可适当提高挑战度';
    else if (score >= 0.5) suggestion = '增加资源投入或缩小范围，确保核心KR达成';
    else suggestion = '重新评估目标可行性，降低目标值或延长周期';

    return { krTitle: kr.title, score, scoreExplanation: explanation, lesson, nextCycleSuggestion: suggestion };
  });

  // 3. 执行分析
  const goalTasks = state.tasks.filter(t => t.goalId === goalId);
  const doneTasks = goalTasks.filter(t => t.status === 'done');
  const overdueTasks = goalTasks.filter(t => {
    if (t.status === 'done' || t.status === 'cancelled') return false;
    return t.dueDate ? new Date(t.dueDate) < new Date() : false;
  });
  const blockedTasks = goalTasks.filter(t => t.status === 'blocked');

  sections.push({
    title: '执行分析',
    content: `任务完成${doneTasks.length}/${goalTasks.length}，逾期${overdueTasks.length}，阻塞${blockedTasks.length}`,
    metrics: [
      { label: '完成率', value: `${goalTasks.length > 0 ? Math.round(doneTasks.length / goalTasks.length * 100) : 0}%` },
      { label: '逾期任务', value: `${overdueTasks.length}`, trend: overdueTasks.length > 0 ? 'down' : 'stable' },
      { label: '阻塞任务', value: `${blockedTasks.length}`, trend: blockedTasks.length > 0 ? 'down' : 'stable' },
    ],
  });

  // 4. 风险回顾
  const goalProjects = state.projects.filter(p => p.goalId === goalId);
  const relatedRisks: string[] = [];
  for (const p of goalProjects) {
    if (p.status === 'blocked') relatedRisks.push(`项目「${p.title}」被阻塞`);
    if (p.progress < 30 && p.status === 'in_progress') relatedRisks.push(`项目「${p.title}」进度不足30%`);
  }
  if (overdueTasks.length > 0) relatedRisks.push(`${overdueTasks.length}个任务逾期`);

  sections.push({
    title: '风险回顾',
    content: relatedRisks.length > 0 ? relatedRisks.join('；') : '未识别到显著风险',
  });

  // 5. 经验沉淀
  const extractedLessons: string[] = [];
  if (goal.progress >= 80) extractedLessons.push('高完成度目标的关键成功因素：清晰的目标定义和合理的资源分配');
  if (overdueTasks.length > goalTasks.length * 0.3) extractedLessons.push('逾期率偏高：未来目标设定时需留更多缓冲');
  if (blockedTasks.length > 0) extractedLessons.push('阻塞任务影响交付：需建立阻塞预警和快速解除机制');
  if (keyResults.filter(kr => (kr.targetValue > 0 ? Math.round(kr.currentValue / kr.targetValue * 100) : 0) < 50).length > 0) {
    extractedLessons.push('KR偏移：需在执行过程中建立更频繁的KR检查点');
  }
  if (extractedLessons.length === 0) extractedLessons.push('执行平稳，经验可复用');

  // 6. 行动项
  const actionItems: Array<{ action: string; priority: 'high' | 'medium' | 'low'; assignee: string | null }> = [];
  if (goal.status !== 'done') {
    if (overdueTasks.length > 0) actionItems.push({ action: `处理${overdueTasks.length}个逾期任务`, priority: 'high', assignee: null });
    if (blockedTasks.length > 0) actionItems.push({ action: `解除${blockedTasks.length}个任务阻塞`, priority: 'high', assignee: null });
    if (goal.progress < 50) actionItems.push({ action: '评估目标进度偏差原因并制定追赶计划', priority: 'medium', assignee: goal.leaderId });
  }
  actionItems.push({ action: '将复盘经验沉淀到团队知识库', priority: 'low', assignee: null });

  // 总体评分
  const krScores = okrFeedback.map(f => f.score);
  const avgKRScore = krScores.length > 0 ? krScores.reduce((a, b) => a + b, 0) / krScores.length : 0;
  const overallScore = Math.round(avgKRScore * 100);

  return {
    goalId, goalTitle: goal.title,
    sections, okrFeedback, overallScore,
    extractedLessons, actionItems,
    fromLLM: false, generatedAt: new Date().toISOString(),
  };
}

// ===== LLM 深度复盘 =====

function buildReviewPrompt(goal: Goal, ctx: AIProjectContext, localResult: ReviewResult): string {
  const krFeedback = localResult.okrFeedback.map(f => `- ${f.krTitle}: 评分${f.score}, ${f.scoreExplanation}`).join('\n');

  return `你是团队OKR复盘专家。基于目标数据和确定性复盘，生成深度复盘报告。

## 目标: ${goal.title}
- 状态: ${goal.status}, 进度: ${goal.progress}%
- KR数量: ${(goal.keyResults || []).length}

## KR评分
${krFeedback || '无KR'}

## 执行数据
- 完成率: ${localResult.sections.find(s => s.title === '执行分析')?.metrics?.find(m => m.label === '完成率')?.value || 'N/A'}
- 逾期任务: ${localResult.sections.find(s => s.title === '执行分析')?.metrics?.find(m => m.label === '逾期任务')?.value || 0}

## 请深度分析
1. 根本原因分析：为什么某些KR没有达成？
2. 成功模式提取：哪些做法值得延续？
3. 下周期OKR建议：基于经验的改进方向
4. 团队学习和成长洞察

## 输出格式（严格 JSON）
{"deepAnalysis":"根本原因分析","successPatterns":["模式1"],"lessons":["教训1"],"nextCycleOKRSuggestion":{"objectives":["建议O1"],"keyResultsIndicators":["KR方向1"]},"teamGrowthInsight":"团队成长洞察"}`;
}

export async function generateReviewDeep(state: AppState, goalId: string): Promise<ReviewResult | null> {
  const localResult = generateReviewLocal(state, goalId);
  if (!localResult) return null;
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return localResult;

  try {
    const goal = state.goals.find(g => g.id === goalId);
    if (!goal) return localResult;

    const ctx = buildAIContext(state);
    const prompt = buildReviewPrompt(goal, ctx, localResult);
    const raw = await callLLM(prompt, config);
    if (!raw) return localResult;

    let parsed: { deepAnalysis?: string; successPatterns?: unknown[]; lessons?: unknown[]; nextCycleOKRSuggestion?: { objectives?: string[]; keyResultsIndicators?: string[] }; teamGrowthInsight?: string } | null = null;
    try { parsed = JSON.parse(raw); } catch (e) { handleError(e, { module: 'aiReviewGenerator', operation: 'PARSE_LLM_JSON', severity: 'warn' });
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) try { parsed = JSON.parse(match[0]); } catch (e2) { handleError(e2, { module: 'aiReviewGenerator', operation: 'PARSE_LLM_JSON_FALLBACK', severity: 'warn' }); }
    }
    if (!parsed) return localResult;

    // 添加深度分析章节
    if (parsed.deepAnalysis) {
      localResult.sections.push({ title: '深度分析', content: String(parsed.deepAnalysis).slice(0, 500) });
    }

    // 添加成功模式
    if (Array.isArray(parsed.successPatterns)) {
      localResult.extractedLessons.push(...parsed.successPatterns.map(String).slice(0, 3));
    }

    // 添加LLM教训
    if (Array.isArray(parsed.lessons)) {
      for (const l of parsed.lessons) localResult.extractedLessons.push(String(l));
    }

    // 下周期OKR建议
    if (parsed.nextCycleOKRSuggestion) {
      const suggestion = parsed.nextCycleOKRSuggestion;
      const items: string[] = [];
      if (Array.isArray(suggestion.objectives)) items.push(`建议目标: ${suggestion.objectives.join('、')}`);
      if (Array.isArray(suggestion.keyResultsIndicators)) items.push(`KR方向: ${suggestion.keyResultsIndicators.join('、')}`);
      if (items.length > 0) {
        localResult.sections.push({ title: '下周期OKR建议', content: items.join('。') });
      }
    }

    // 团队成长洞察
    if (parsed.teamGrowthInsight) {
      localResult.sections.push({ title: '团队成长洞察', content: String(parsed.teamGrowthInsight).slice(0, 300) });
    }

    localResult.fromLLM = true;
    return localResult;
  } catch {
    return localResult;
  }
}
