/**
 * KPI 评分计算模块 — OKR+KPI 双轨融合
 *
 * 评分规则：
 * - baseline 模式：0→baseline=0分，baseline→target=0→100分（线性插值），超 target 封顶 100
 * - 无 baseline/target 时：退化为 OKR 进度模式（currentValue/targetValue × 100）
 * - 权重归一化：actualWeight = weight / ∑(allKpiKr.weight)
 * - 整体状态：≥80=green, ≥60=yellow, <60=red
 */
import type { KeyResult, KpiStatus, DualTrackSummary } from '@/types';

/** 计算单个 KR 的 KPI 评分 (0-100) */
export function calcKpiKrScore(kr: KeyResult): { score: number; status: KpiStatus } {
  const baseline = kr.kpiBaseline ?? 0;
  const target = kr.kpiTarget ?? kr.targetValue;
  const current = kr.currentValue;

  let score: number;
  if (baseline >= target) {
    // 退化：直接用完成率
    score = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  } else {
    // baseline→target 线性映射为 0→100
    if (current <= baseline) score = 0;
    else if (current >= target) score = 100;
    else score = ((current - baseline) / (target - baseline)) * 100;
  }

  const status: KpiStatus = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
  return { score: Math.round(score * 10) / 10, status };
}

/** 计算目标下所有 KPI KR 的权重加权总分 */
export function calcKpiGoalScore(krs: KeyResult[]): {
  weightedTotal: number;
  overallStatus: KpiStatus;
  redCount: number;
  yellowCount: number;
  greenCount: number;
} {
  const kpiKrs = krs.filter(kr => kr.track === 'kpi' || kr.track === 'both');
  if (kpiKrs.length === 0) {
    return { weightedTotal: 0, overallStatus: 'green', redCount: 0, yellowCount: 0, greenCount: 0 };
  }

  const totalWeight = kpiKrs.reduce((sum, kr) => sum + (kr.weight ?? 1), 0);
  let weightedTotal = 0;
  let redCount = 0;
  let yellowCount = 0;
  let greenCount = 0;

  for (const kr of kpiKrs) {
    const { score, status } = calcKpiKrScore(kr);
    const normalizedWeight = (kr.weight ?? 1) / totalWeight;
    weightedTotal += score * normalizedWeight;
    if (status === 'red') redCount++;
    else if (status === 'yellow') yellowCount++;
    else greenCount++;
  }

  weightedTotal = Math.round(weightedTotal * 10) / 10;
  const overallStatus: KpiStatus = weightedTotal >= 80 ? 'green' : weightedTotal >= 60 ? 'yellow' : 'red';

  return { weightedTotal, overallStatus, redCount, yellowCount, greenCount };
}

/** 计算冲高率：(targetValue - kpiTarget) / kpiTarget × 100 */
function calcStretchRate(kr: KeyResult): number | null {
  if (kr.track !== 'both' || kr.kpiTarget == null || kr.kpiTarget === 0) return null;
  return Math.round(((kr.targetValue - kr.kpiTarget) / kr.kpiTarget) * 1000) / 10;
}

/** 计算目标的 OKR 均值信心度 */
function calcAvgConfidence(krs: KeyResult[]): number {
  const withConf = krs.filter(kr => kr.confidence != null);
  if (withConf.length === 0) return 0;
  return Math.round((withConf.reduce((s, kr) => s + (kr.confidence ?? 0), 0) / withConf.length) * 10) / 10;
}

/** 计算完整的双轨汇总 */
export function calcDualTrack(krs: KeyResult[]): DualTrackSummary | undefined {
  const hasKpi = krs.some(kr => kr.track === 'kpi' || kr.track === 'both');
  if (!hasKpi) return undefined;

  const okrProgress = krs.length > 0
    ? Math.round(krs.reduce((s, kr) => s + (kr.selected ? (kr.currentValue / (kr.targetValue || 1)) * 100 : 0), 0) / krs.filter(k => k.selected).length)
    : 0;

  const { weightedTotal, overallStatus, redCount, yellowCount, greenCount } = calcKpiGoalScore(krs);
  const stretchRate = krs.filter(kr => kr.track === 'both').length > 0
    ? Math.round(krs.filter(kr => kr.track === 'both').reduce((s, kr) => s + (calcStretchRate(kr) ?? 0), 0) / krs.filter(kr => kr.track === 'both').length * 10) / 10
    : null;

  return {
    okr: {
      progress: okrProgress,
      avgConfidence: calcAvgConfidence(krs),
      stretchRate,
    },
    kpi: {
      weightedScore: weightedTotal,
      overallStatus,
      redCount,
      yellowCount,
      greenCount,
    },
  };
}

/** 获取 KR 的 KPI 状态标签颜色 */
export function getKpiStatusColor(status: KpiStatus): string {
  switch (status) {
    case 'green': return 'text-green-600 bg-green-50 border-green-200';
    case 'yellow': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'red': return 'text-red-600 bg-red-50 border-red-200';
  }
}

/** 获取 KR 的 KPI 状态中文标签 */
export function getKpiStatusLabel(status: KpiStatus): string {
  switch (status) {
    case 'green': return '达标';
    case 'yellow': return '风险';
    case 'red': return '落后';
  }
}
