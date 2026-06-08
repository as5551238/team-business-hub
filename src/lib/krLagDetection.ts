/**
 * KR Lag Detection — detect and alert when Key Results are behind schedule
 * Uses linear interpolation of expected vs actual progress
 */

import type { Goal, KeyResult } from '@/types';

export interface KrLagAlert {
  goalId: string;
  goalTitle: string;
  krId: string;
  krTitle: string;
  expectedProgress: number; // 0-100
  actualProgress: number;   // 0-100
  lagPercent: number;       // expected - actual (positive = behind)
  severity: 'warning' | 'critical';
  suggestedAction: string;
}

/**
 * Calculate expected KR progress based on time elapsed
 * Returns 0-100 where 100 = target should be fully met by now
 */
function expectedKrProgress(kr: KeyResult, goalStartDate: string, goalEndDate: string): number {
  const now = Date.now();
  const start = new Date(goalStartDate).getTime();
  const end = new Date(goalEndDate).getTime();
  if (end <= start) return 50; // Invalid dates, assume 50%
  if (now <= start) return 0;  // Not started yet
  if (now >= end) return 100;  // Past deadline
  return Math.round(((now - start) / (end - start)) * 100);
}

/**
 * Detect lagging KRs across all active goals
 */
export function detectKrLags(goals: Goal[]): KrLagAlert[] {
  const alerts: KrLagAlert[] = [];
  const activeGoals = goals.filter(g =>
    !g.deletedAt &&
    g.status === 'in_progress' &&
    g.keyResults.length > 0 &&
    g.startDate &&
    g.endDate
  );

  for (const goal of activeGoals) {
    for (const kr of goal.keyResults) {
      if (kr.selected === false) continue;
      const expected = expectedKrProgress(kr, goal.startDate, goal.endDate);
      const actual = kr.targetValue > 0 ? Math.round((kr.currentValue / kr.targetValue) * 100) : 0;
      const lag = expected - actual;

      if (lag >= 15) {
        alerts.push({
          goalId: goal.id,
          goalTitle: goal.title,
          krId: kr.id,
          krTitle: kr.title,
          expectedProgress: expected,
          actualProgress: actual,
          lagPercent: lag,
          severity: lag >= 30 ? 'critical' : 'warning',
          suggestedAction: lag >= 30
            ? `KR「${kr.title}」严重滞后(落后${lag}%)，建议：1)重新评估目标值 2)增加资源投入 3)拆分为更小里程碑`
            : `KR「${kr.title}」略有滞后(落后${lag}%)，建议：1)检查阻塞因素 2)调整优先级 3)确认资源充足`,
        });
      }
    }
  }

  return alerts.sort((a, b) => b.lagPercent - a.lagPercent);
}


