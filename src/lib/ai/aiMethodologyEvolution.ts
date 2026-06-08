/**
 * AI 方法论自进化引擎 —— 驱动层：方法论根据实践效果自动进化
 * 对标 AISMM×OKR 学术框架的迭代优化思想
 *
 * 核心能力：
 * 1. 方法论效果追踪：记录每种方法论的应用和效果
 * 2. 效果评估：方法论采纳后的改善度量
 * 3. 自适应调整：根据效果数据调整方法论推荐权重
 * 4. 进化日志：方法论演变的完整记录
 *
 * 双模式：确定性 + LLM深度
 */
import type { AppState } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { buildTeamCapabilityLocal } from './aiTeamCapability';
import type { MethodologyId } from './aiMethodology';
import { handleError } from '@/lib/errorHandler';
import { saveSettingDualWrite } from '@/supabase/teamSettings';

// ===== 类型 =====

export interface MethodologyEffectRecord {
  methodologyId: MethodologyId;
  methodologyName: string;
  appliedAt: string;
  /** 应用前的健康分 */
  healthBefore: number;
  /** 应用后的健康分 */
  healthAfter: number;
  /** 改善幅度 */
  improvement: number;
  /** 是否推荐继续 */
  recommend: boolean;
}

export interface EvolutionEntry {
  timestamp: string;
  type: 'weight_adjust' | 'deprecate' | 'promote' | 'new_insight';
  methodologyId: MethodologyId;
  description: string;
  dataDriven: boolean;
}

export interface MethodologyEvolutionResult {
  /** 各方法论的效果记录（从localStorage读取） */
  effectRecords: MethodologyEffectRecord[];
  /** 推荐权重调整 */
  weightAdjustments: Array<{ methodologyId: MethodologyId; name: string; oldWeight: number; newWeight: number; reason: string }>;
  /** 进化日志 */
  evolutionLog: EvolutionEntry[];
  /** 当前最优方法论 */
  topMethodology: { id: MethodologyId; name: string; score: number } | null;
  /** 进化建议 */
  evolutionSuggestions: string[];
  fromLLM: boolean;
  generatedAt: string;
}

const EFFECT_STORAGE_KEY = 'tbh-methodology-effects';
const EVOLUTION_STORAGE_KEY = 'tbh-methodology-evolution';

// ===== 存储 =====

function loadEffectRecords(): MethodologyEffectRecord[] {
  try {
    const raw = localStorage.getItem(EFFECT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { handleError(e, { module: 'aiMethodologyEvolution', operation: 'LOAD_EFFECTS', severity: 'debug' }); return []; }
}

function saveEffectRecords(records: MethodologyEffectRecord[]) {
  try { localStorage.setItem(EFFECT_STORAGE_KEY, JSON.stringify(records.slice(-50))); { const _tid = localStorage.getItem('tbh-current-team') || ''; if (_tid) saveSettingDualWrite('methodology_effects', EFFECT_STORAGE_KEY, records.slice(-50), _tid); } } catch (e) { handleError(e, { module: 'aiMethodologyEvolution', operation: 'SAVE_EFFECTS', severity: 'debug' }); }
}

function loadEvolutionLog(): EvolutionEntry[] {
  try {
    const raw = localStorage.getItem(EVOLUTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { handleError(e, { module: 'aiMethodologyEvolution', operation: 'LOAD_EVOLUTION', severity: 'debug' }); return []; }
}

function saveEvolutionLog(log: EvolutionEntry[]) {
  try { localStorage.setItem(EVOLUTION_STORAGE_KEY, JSON.stringify(log.slice(-100))); { const _tid = localStorage.getItem('tbh-current-team') || ''; if (_tid) saveSettingDualWrite('methodology_evolution', EVOLUTION_STORAGE_KEY, log.slice(-100), _tid); } } catch (e) { handleError(e, { module: 'aiMethodologyEvolution', operation: 'SAVE_EVOLUTION', severity: 'debug' }); }
}

// ===== 确定性进化 =====

/** 默认方法论权重 */
const DEFAULT_WEIGHTS: Record<MethodologyId, number> = {
  okr: 50, pdca: 40, scrum: 45, kanban: 45,
  agile: 40, waterfall: 25, lean: 35, six_sigma: 20,
};

const METHOD_NAMES: Record<MethodologyId, string> = {
  okr: 'OKR目标与关键结果', pdca: 'PDCA戴明环', scrum: 'Scrum敏捷框架',
  kanban: '看板方法', agile: '敏捷开发', waterfall: '瀑布模型',
  lean: '精益管理', six_sigma: '六西格玛',
};

/** 记录方法论效果 */
export function recordMethodologyEffect(methodologyId: MethodologyId, healthBefore: number, healthAfter: number): void {
  const records = loadEffectRecords();
  records.push({
    methodologyId,
    methodologyName: METHOD_NAMES[methodologyId] || methodologyId,
    appliedAt: new Date().toISOString(),
    healthBefore, healthAfter,
    improvement: healthAfter - healthBefore,
    recommend: healthAfter >= healthBefore,
  });
  saveEffectRecords(records);
}

/** 基于效果数据计算调整权重 */
function computeAdjustedWeights(records: MethodologyEffectRecord[]): Record<MethodologyId, number> {
  const weights = { ...DEFAULT_WEIGHTS };

  // 按方法论聚合效果
  const effectByMethod = new Map<MethodologyId, { totalImprovement: number; count: number; recommendCount: number }>();
  for (const r of records) {
    const existing = effectByMethod.get(r.methodologyId) || { totalImprovement: 0, count: 0, recommendCount: 0 };
    existing.totalImprovement += r.improvement;
    existing.count++;
    if (r.recommend) existing.recommendCount++;
    effectByMethod.set(r.methodologyId, existing);
  }

  for (const [id, effect] of effectByMethod) {
    const avgImprovement = effect.count > 0 ? effect.totalImprovement / effect.count : 0;
    const recommendRate = effect.count > 0 ? effect.recommendCount / effect.count : 0.5;

    // 正效果提升权重，负效果降低
    let adjustment = 0;
    if (avgImprovement > 5) adjustment += 10;
    else if (avgImprovement > 0) adjustment += 5;
    else if (avgImprovement < -5) adjustment -= 15;
    else adjustment -= 5;

    if (recommendRate > 0.7) adjustment += 5;
    else if (recommendRate < 0.3) adjustment -= 10;

    weights[id] = Math.max(5, Math.min(95, (weights[id] || 40) + adjustment));
  }

  return weights;
}

/** 确定性进化主函数 */
export function evolveMethodologyLocal(state: AppState): MethodologyEvolutionResult {
  const records = loadEffectRecords();
  const previousLog = loadEvolutionLog();
  const adjustedWeights = computeAdjustedWeights(records);

  // 生成权重调整
  const weightAdjustments: MethodologyEvolutionResult['weightAdjustments'] = [];
  for (const [id, newWeight] of Object.entries(adjustedWeights)) {
    const oldWeight = DEFAULT_WEIGHTS[id as MethodologyId] || 40;
    if (Math.abs(newWeight - oldWeight) >= 5) {
      const effectRecord = records.filter(r => r.methodologyId === id);
      const avgImprovement = effectRecord.length > 0 ? Math.round(effectRecord.reduce((s, r) => s + r.improvement, 0) / effectRecord.length) : 0;
      weightAdjustments.push({
        methodologyId: id as MethodologyId,
        name: METHOD_NAMES[id as MethodologyId] || id,
        oldWeight, newWeight,
        reason: avgImprovement > 0 ? `平均改善${avgImprovement}分，提升权重` : avgImprovement < 0 ? `平均下降${Math.abs(avgImprovement)}分，降低权重` : '效果持平，微调',
      });
    }
  }

  // 进化日志
  const evolutionLog: EvolutionEntry[] = [];
  for (const adj of weightAdjustments) {
    evolutionLog.push({
      timestamp: new Date().toISOString(),
      type: adj.newWeight > adj.oldWeight ? 'promote' : 'deprecate',
      methodologyId: adj.methodologyId,
      description: `${adj.name}权重${adj.oldWeight}→${adj.newWeight}: ${adj.reason}`,
      dataDriven: true,
    });
  }

  // 保存进化日志
  const allLog = [...previousLog, ...evolutionLog];
  saveEvolutionLog(allLog);

  // 找出当前最优方法论
  let topMethodology: MethodologyEvolutionResult['topMethodology'] = null;
  const sortedWeights = Object.entries(adjustedWeights).sort(([, a], [, b]) => b - a);
  if (sortedWeights.length > 0) {
    topMethodology = {
      id: sortedWeights[0][0] as MethodologyId,
      name: METHOD_NAMES[sortedWeights[0][0] as MethodologyId] || sortedWeights[0][0],
      score: sortedWeights[0][1],
    };
  }

  // 进化建议
  const evolutionSuggestions: string[] = [];
  if (records.length < 3) evolutionSuggestions.push('方法论效果数据不足，建议持续使用并记录效果');
  if (topMethodology && topMethodology.score >= 70) evolutionSuggestions.push(`${topMethodology.name}表现最佳，建议团队优先采用`);
  const deprecatedMethods = weightAdjustments.filter(a => a.newWeight < a.oldWeight);
  if (deprecatedMethods.length > 0) evolutionSuggestions.push(`${deprecatedMethods.map(m => m.name).join('、')}效果不佳，建议调整使用方式或更换`);
  if (evolutionSuggestions.length === 0) evolutionSuggestions.push('方法论体系运行稳定，继续当前策略');

  return {
    effectRecords: records.slice(-10),
    weightAdjustments, evolutionLog,
    topMethodology, evolutionSuggestions,
    fromLLM: false, generatedAt: new Date().toISOString(),
  };
}

export async function evolveMethodologyDeep(state: AppState): Promise<MethodologyEvolutionResult> {
  const local = evolveMethodologyLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return local;

  try {
    const ctx = buildAIContext(state);
    const recordsSummary = local.effectRecords.slice(0, 5).map(r => `${r.methodologyName}: 改善${r.improvement}分`).join('；');
    const prompt = `你是方法论进化专家。团队方法论效果记录:${recordsSummary || '暂无'}。当前最优:${local.topMethodology?.name || '无'}。请识别方法论运用的时机、组合和深度优化的机会，输出JSON:{"timingInsights":"时机洞察","combinationSuggestions":["组合1"],"depthOptimizations":[{"methodology":"","suggestion":""}],"newEvolutionSuggestions":["建议1"]}`;
    const raw = await callLLM(prompt, config);
    if (!raw) return local;
    let parsed: { newEvolutionSuggestions?: unknown[]; depthOptimizations?: Array<{ methodology?: string; suggestion?: string }> } | null = null;
    try { parsed = JSON.parse(raw); } catch (e) { handleError(e, { module: 'aiMethodologyEvolution', operation: 'PARSE_LLM_JSON', severity: 'warn' }); const m = raw.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch (e2) { handleError(e2, { module: 'aiMethodologyEvolution', operation: 'PARSE_LLM_JSON_FALLBACK', severity: 'warn' }); } }
    if (!parsed) return local;
    if (Array.isArray(parsed.newEvolutionSuggestions)) {
      local.evolutionSuggestions.push(...parsed.newEvolutionSuggestions.map(String).slice(0, 3));
    }
    if (Array.isArray(parsed.depthOptimizations)) {
      for (const d of parsed.depthOptimizations) {
        local.evolutionLog.push({
          timestamp: new Date().toISOString(), type: 'new_insight',
          methodologyId: 'okr', description: `${String(d.methodology || '')}深度优化: ${String(d.suggestion || '')}`,
          dataDriven: false,
        });
      }
    }
    local.fromLLM = true;
    return local;
  } catch (e) { handleError(e, { module: 'aiMethodologyEvolution', operation: 'LLM_CALL', severity: 'warn' }); return local; }
}
