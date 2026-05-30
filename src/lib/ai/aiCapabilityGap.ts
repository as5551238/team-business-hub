/**
 * AI 能力缺口诊断引擎 —— 驱动层：识别团队能力差距并制定补全计划
 * 对标 SkillOpt 学术框架 + 飞书人才盘点
 *
 * 核心能力：
 * 1. 目标需求 vs 团队能力差距分析
 * 2. 能力缺口优先级排序
 * 3. 补全策略推荐（培训/招聘/调配/外协）
 * 4. 补全进度追踪
 *
 * 双模式：确定性 + LLM深度
 */
import type { AppState } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { buildTeamCapabilityLocal, type CapabilityDimension, DIMENSION_LABELS } from './aiTeamCapability';

// ===== 类型 =====

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GapStrategy = 'training' | 'hiring' | 'reassignment' | 'outsourcing' | 'tooling';

export interface CapabilityGap {
  dimension: CapabilityDimension;
  dimensionLabel: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  severity: GapSeverity;
  affectedGoals: Array<{ id: string; title: string }>;
  strategies: Array<{ type: GapStrategy; description: string; estimatedTime: string; effort: 'low' | 'medium' | 'high' }>;
}

export interface GapDiagnosisResult {
  gaps: CapabilityGap[];
  /** 整体能力充足度 0-100 */
  capabilitySufficiency: number;
  /** 紧急缺口（critical+high） */
  urgentGaps: number;
  /** 推荐的补全优先级行动 */
  priorityActions: Array<{ action: string; deadline: string; impact: string }>;
  fromLLM: boolean;
  generatedAt: string;
}

// ===== 确定性诊断 =====

/** 推断目标对能力的需求 */
function inferGoalRequirements(goals: AppState['goals']): Partial<Record<CapabilityDimension, number>> {
  const reqs: Partial<Record<CapabilityDimension, number>> = {};
  for (const g of goals) {
    if (g.status === 'done' || g.status === 'cancelled') continue;
    const title = g.title.toLowerCase();
    if (/规划|战略|方向/.test(title)) { reqs.planning = Math.max(reqs.planning || 0, 60); reqs.leadership = Math.max(reqs.leadership || 0, 50); }
    if (/执行|落地|交付/.test(title)) { reqs.execution = Math.max(reqs.execution || 0, 60); }
    if (/增长|扩张|市场/.test(title)) { reqs.analysis = Math.max(reqs.analysis || 0, 50); reqs.communication = Math.max(reqs.communication || 0, 50); }
    if (/技术|研发|产品/.test(title)) { reqs.backend = Math.max(reqs.backend || 0, 50); reqs.frontend = Math.max(reqs.frontend || 0, 40); reqs.design = Math.max(reqs.design || 0, 40); }
    if (/运营|效率|流程/.test(title)) { reqs.ops = Math.max(reqs.ops || 0, 50); reqs.planning = Math.max(reqs.planning || 0, 40); }
    if (/数据|智能|分析/.test(title)) { reqs.data = Math.max(reqs.data || 0, 60); reqs.analysis = Math.max(reqs.analysis || 0, 50); }
    // 通用：所有目标都需要执行力
    reqs.execution = Math.max(reqs.execution || 0, 30);
    reqs.communication = Math.max(reqs.communication || 0, 20);
  }
  return reqs;
}

export function diagnoseCapabilityGapLocal(state: AppState): GapDiagnosisResult {
  const ctx = buildAIContext(state);
  const capMap = buildTeamCapabilityLocal(state);
  const activeGoals = state.goals.filter(g => g.status !== 'cancelled' && g.status !== 'done');
  const requirements = inferGoalRequirements(activeGoals);

  const gaps: CapabilityGap[] = [];
  for (const [dim, required] of Object.entries(requirements)) {
    const current = capMap.teamDimensions[dim as CapabilityDimension] || 0;
    const gap = required - current;
    if (gap > 10) {
      const severity: GapSeverity = gap > 40 ? 'critical' : gap > 25 ? 'high' : gap > 15 ? 'medium' : 'low';
      const affectedGoals = activeGoals.filter(g => {
        const title = g.title.toLowerCase();
        const dimLabel = DIMENSION_LABELS[dim as CapabilityDimension];
        return title.includes(dimLabel) || (g.tags ?? []).some(t => t.includes(dimLabel));
      }).map(g => ({ id: g.id, title: g.title }));

      const strategies: CapabilityGap['strategies'] = [];
      if (gap > 30) strategies.push({ type: 'hiring', description: `招聘${DIMENSION_LABELS[dim as CapabilityDimension]}方向人才`, estimatedTime: '1-2个月', effort: 'high' });
      strategies.push({ type: 'training', description: `团队内部培训${DIMENSION_LABELS[dim as CapabilityDimension]}能力`, estimatedTime: '2-4周', effort: 'medium' });
      if (severity !== 'critical') strategies.push({ type: 'reassignment', description: `调配有${DIMENSION_LABELS[dim as CapabilityDimension]}基础的成员参与`, estimatedTime: '1周', effort: 'low' });

      gaps.push({
        dimension: dim as CapabilityDimension,
        dimensionLabel: DIMENSION_LABELS[dim as CapabilityDimension],
        currentLevel: current, requiredLevel: required, gap,
        severity, affectedGoals, strategies,
      });
    }
  }

  gaps.sort((a, b) => b.gap - a.gap);

  const totalRequired = Object.values(requirements).reduce((s, v) => s + v, 0);
  const totalCurrent = Object.entries(requirements).reduce((s, [dim, req]) => s + Math.min(capMap.teamDimensions[dim as CapabilityDimension] || 0, req), 0);
  const capabilitySufficiency = totalRequired > 0 ? Math.round(totalCurrent / totalRequired * 100) : 100;

  const urgentGaps = gaps.filter(g => g.severity === 'critical' || g.severity === 'high').length;

  const priorityActions: GapDiagnosisResult['priorityActions'] = gaps.slice(0, 3).map(g => ({
    action: g.strategies[0]?.description || `补全${g.dimensionLabel}能力缺口`,
    deadline: g.severity === 'critical' ? '2周内' : g.severity === 'high' ? '1个月内' : '本季度',
    impact: `提升${g.affectedGoals.length}个目标的达成概率`,
  }));

  return {
    gaps, capabilitySufficiency, urgentGaps, priorityActions,
    fromLLM: false, generatedAt: new Date().toISOString(),
  };
}

export async function diagnoseCapabilityGapDeep(state: AppState): Promise<GapDiagnosisResult> {
  const local = diagnoseCapabilityGapLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return local;

  try {
    const ctx = buildAIContext(state);
    const gapSummary = local.gaps.slice(0, 5).map(g => `${g.dimensionLabel}: 当前${g.currentLevel}/需要${g.requiredLevel}(${g.severity})`).join('；');
    const prompt = `你是团队能力诊断专家。团队整体能力充足度${local.capabilitySufficiency}%，缺口:${gapSummary || '无'}。请识别隐性能力缺口（如跨领域协作、创新思维等不确定量化但重要的能力），输出JSON:{"hiddenGaps":[{"dimension":"","description":"","severity":"high|medium","suggestion":""}],"priorityActions":["行动1"]}`;
    const raw = await callLLM(prompt, config);
    if (!raw) return local;
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed) return local;
    if (Array.isArray(parsed.hiddenGaps)) {
      for (const hg of parsed.hiddenGaps) {
        local.gaps.push({
          dimension: 'communication', dimensionLabel: String(hg.description || hg.dimension || '隐性能力'),
          currentLevel: 20, requiredLevel: 60, gap: 40,
          severity: hg.severity === 'high' ? 'high' : 'medium',
          affectedGoals: [], strategies: [{ type: 'training', description: String(hg.suggestion || ''), estimatedTime: '4周', effort: 'medium' }],
        });
      }
    }
    if (Array.isArray(parsed.priorityActions)) {
      for (const a of parsed.priorityActions) local.priorityActions.push({ action: String(a), deadline: '本月', impact: '提升团队综合能力' });
    }
    local.fromLLM = true;
    return local;
  } catch { return local; }
}
