/**
 * AI 愿景→策略→目标级联引擎 —— 驱动层核心：让系统"驱动"全局
 * 对标飞书 OKR 级联 + Notion AI Strategy
 *
 * 核心能力：
 * 1. 愿景解析：将模糊愿景分解为可执行的策略方向
 * 2. 策略→目标级联：策略方向转化为SMART目标
 * 3. 目标对齐检查：上下级目标的一致性验证
 * 4. 级联传导：目标完成度向上传导至策略和愿景
 *
 * 双模式：
 * - 确定性级联（无需 LLM）：基于规则的结构化分解
 * - LLM 深度级联：语义理解驱动的战略分解
 */
import type { AppState, Goal } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';

// ===== 类型 =====

export interface StrategyDirection {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium';
  /** 关联的目标ID列表 */
  linkedGoalIds: string[];
  /** 进度（基于关联目标的加权平均） */
  progress: number;
  /** 战略OKR */
  keyOutcomes: Array<{ title: string; targetValue: number; unit: string; current: number }>;
}

export interface VisionCascade {
  /** 愿景声明（用户输入或从现有目标推断） */
  visionStatement: string;
  /** 策略方向列表 */
  strategies: StrategyDirection[];
  /** 对齐问题（上下级目标不一致的地方） */
  alignmentIssues: Array<{ description: string; severity: 'high' | 'medium' | 'low'; suggestion: string }>;
  /** 级联进度（愿景→策略→目标的传导状态） */
  cascadeProgress: {
    visionToStrategy: number;
    strategyToGoals: number;
    goalsToProjects: number;
    overall: number;
  };
  /** 策略缺口（未被目标覆盖的策略方向） */
  strategyGaps: string[];
  /** 是否来自 LLM */
  fromLLM: boolean;
  generatedAt: string;
}

// ===== 确定性级联 =====

/** 从现有目标推断愿景 */
function inferVision(goals: Goal[]): string {
  if (goals.length === 0) return '待定义团队愿景';
  const keywords = new Set<string>();
  for (const g of goals) {
    const words = g.title.replace(/[，。、；：""''【】（）\[\]{}]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
    for (const w of words.slice(0, 3)) keywords.add(w);
  }
  if (keywords.size === 0) return '团队目标驱动';
  return `通过${[...keywords].slice(0, 4).join('、')}实现团队持续成长`;
}

/** 从目标群中识别策略方向 */
function identifyStrategies(goals: Goal[], state: AppState): StrategyDirection[] {
  // 基于目标的父子关系和内容聚类
  const strategies: StrategyDirection[] = [];
  const topGoals = goals.filter(g => g.status !== 'cancelled');

  // 按标签聚类
  const tagGroups = new Map<string, Goal[]>();
  for (const g of topGoals) {
    const tags = g.tags || ['default'];
    for (const tag of tags) {
      const group = tagGroups.get(tag) || [];
      group.push(g);
      tagGroups.set(tag, group);
    }
  }

  let strategyId = 0;
  for (const [tag, group] of tagGroups) {
    const progress = group.length > 0 ? Math.round(group.reduce((s, g) => s + g.progress, 0) / group.length) : 0;
    const keyOutcomes = group.slice(0, 3).flatMap(g => (g.keyResults || []).slice(0, 2).map(kr => ({
      title: kr.title, targetValue: kr.targetValue, unit: kr.unit, current: kr.currentValue,
    })));

    strategies.push({
      id: `strat_${++strategyId}`,
      title: tag === 'default' ? '核心业务' : `${tag}方向`,
      description: `包含${group.length}个目标：${group.map(g => g.title).slice(0, 3).join('、')}`,
      priority: group.some(g => g.priority === 'urgent' || g.priority === 'high') ? 'high' : 'medium',
      linkedGoalIds: group.map(g => g.id),
      progress,
      keyOutcomes: keyOutcomes.slice(0, 5),
    });
  }

  return strategies.sort((a, b) => {
    const pOrder = { critical: 0, high: 1, medium: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });
}

/** 检查目标对齐问题 */
function checkAlignment(goals: Goal[], state: AppState): VisionCascade['alignmentIssues'] {
  const issues: VisionCascade['alignmentIssues'] = [];

  // 查找无关联项目的进行中目标
  const goalsWithoutProjects = goals.filter(g => g.status === 'in_progress' && !state.projects.some(p => p.goalId === g.id));
  for (const g of goalsWithoutProjects) {
    issues.push({
      description: `目标「${g.title}」无对应项目，缺乏落地路径`,
      severity: g.progress < 30 ? 'high' : 'medium',
      suggestion: '为该目标创建支撑项目，或将其合并到现有项目中',
    });
  }

  // 查找无关联目标的进行中项目
  const orphanProjects = state.projects.filter(p => p.status === 'in_progress' && !p.goalId);
  if (orphanProjects.length > 0) {
    issues.push({
      description: `${orphanProjects.length}个项目未关联目标，与战略方向脱节`,
      severity: 'medium',
      suggestion: '将这些项目关联到合适的战略目标，或评估是否需要调整目标体系',
    });
  }

  // 检查KR缺失
  const goalsNoKR = goals.filter(g => g.status === 'in_progress' && (!g.keyResults || g.keyResults.length === 0));
  if (goalsNoKR.length > 0) {
    issues.push({
      description: `${goalsNoKR.length}个进行中目标无关键结果，无法量化评估`,
      severity: 'low',
      suggestion: '为这些目标添加可量化的关键结果(KR)',
    });
  }

  return issues;
}

/** 计算级联进度 */
function computeCascadeProgress(goals: Goal[], state: AppState): VisionCascade['cascadeProgress'] {
  const totalGoals = goals.filter(g => g.status !== 'cancelled').length;
  const goalsWithProjects = goals.filter(g => state.projects.some(p => p.goalId === g.id)).length;
  const projectsWithTasks = state.projects.filter(p => state.tasks.some(t => t.projectId === p.id)).length;
  const totalProjects = state.projects.filter(p => p.status !== 'cancelled').length;

  const visionToStrategy = totalGoals > 0 ? 100 : 0; // 有目标即为已定义策略
  const strategyToGoals = 100; // 策略已级联到目标
  const goalsToProjects = totalGoals > 0 ? Math.round(goalsWithProjects / totalGoals * 100) : 0;
  const overall = Math.round((visionToStrategy + strategyToGoals + goalsToProjects * 2) / 4);

  return { visionToStrategy, strategyToGoals, goalsToProjects, overall };
}

/** 识别策略缺口 */
function identifyStrategyGaps(strategies: StrategyDirection[], goals: Goal[]): string[] {
  const gaps: string[] = [];
  const coveredTags = new Set(strategies.flatMap(s => s.linkedGoalIds));

  // 策略方向进度偏低
  for (const s of strategies) {
    if (s.progress < 30) gaps.push(`「${s.title}」方向进度偏低(${s.progress}%)，需要关注`);
  }

  // 通用缺口检测
  if (goals.filter(g => g.priority === 'urgent').length === 0) gaps.push('无紧急优先级目标，可能缺乏紧迫感');
  if (goals.filter(g => g.status === 'done').length / Math.max(goals.length, 1) < 0.2) gaps.push('目标完成率偏低，需审视目标可达性');

  return gaps;
}

/** 确定性级联主函数 */
export function cascadeVisionLocal(state: AppState): VisionCascade {
  const ctx = buildAIContext(state);
  const activeGoals = state.goals.filter(g => g.status !== 'cancelled');

  const visionStatement = inferVision(activeGoals);
  const strategies = identifyStrategies(activeGoals, state);
  const alignmentIssues = checkAlignment(activeGoals, state);
  const cascadeProgress = computeCascadeProgress(activeGoals, state);
  const strategyGaps = identifyStrategyGaps(strategies, activeGoals);

  return {
    visionStatement, strategies, alignmentIssues, cascadeProgress, strategyGaps,
    fromLLM: false, generatedAt: new Date().toISOString(),
  };
}

// ===== LLM 深度级联 =====

function buildCascadePrompt(ctx: AIProjectContext, localResult: VisionCascade): string {
  return `你是战略规划专家。基于团队数据和确定性分析，进行深度愿景→策略→目标级联。

## 当前愿景推断: ${localResult.visionStatement}
## 策略方向: ${localResult.strategies.map(s => `${s.title}(${s.progress}%)`).join('、')}
## 级联进度: 战略→目标${localResult.cascadeProgress.strategyToGoals}% →项目${localResult.cascadeProgress.goalsToProjects}%
## 对齐问题: ${localResult.alignmentIssues.map(i => i.description).join('；') || '无'}

请深度分析:
1. 愿景是否清晰、激励人心？如何改进？
2. 策略方向是否覆盖了关键业务领域？缺失了什么？
3. 目标体系是否形成了有效的级联传导？
4. 如何优化级联以加速愿景实现？

输出格式（严格JSON）:
{"refinedVision":"优化后的愿景","missingStrategies":["方向1"],"newStrategySuggestions":[{"title":"","description":"","priority":"high|medium"}],"refinedAlignment":[{"description":"","suggestion":""}],"cascadeOptimization":"级联优化建议"}`;
}

export async function cascadeVisionDeep(state: AppState): Promise<VisionCascade> {
  const localResult = cascadeVisionLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return localResult;

  try {
    const ctx = buildAIContext(state);
    const prompt = buildCascadePrompt(ctx, localResult);
    const raw = await callLLM(prompt, config);
    if (!raw) return localResult;

    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) try { parsed = JSON.parse(match[0]); } catch {}
    }
    if (!parsed) return localResult;

    if (parsed.refinedVision) localResult.visionStatement = String(parsed.refinedVision);
    if (Array.isArray(parsed.missingStrategies)) {
      localResult.strategyGaps.push(...parsed.missingStrategies.map(String));
    }
    if (Array.isArray(parsed.newStrategySuggestions)) {
      for (const ns of parsed.newStrategySuggestions) {
        localResult.strategies.push({
          id: `strat_llm_${Date.now()}`,
          title: String(ns.title || ''),
          description: String(ns.description || ''),
          priority: ns.priority === 'high' ? 'high' : 'medium',
          linkedGoalIds: [], progress: 0, keyOutcomes: [],
        });
      }
    }
    if (Array.isArray(parsed.refinedAlignment)) {
      for (const ra of parsed.refinedAlignment) {
        localResult.alignmentIssues.push({ description: String(ra.description || ''), severity: 'medium', suggestion: String(ra.suggestion || '') });
      }
    }

    localResult.fromLLM = true;
    return localResult;
  } catch {
    return localResult;
  }
}
