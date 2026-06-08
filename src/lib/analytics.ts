/**
 * Funnel analytics — lightweight session tracking
 * Used by BusinessTab for funnel metrics display
 */

interface FunnelStep {
  name: string;
  timestamp: number;
}

interface FunnelSession {
  id: string;
  steps: FunnelStep[];
  startTime: number;
  endTime?: number;
}

const STORAGE_KEY = 'tbh-funnel-sessions';

function getSessions(): FunnelSession[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export interface FunnelMetrics {
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  avgDuration: number;
  stepDropoff: Record<string, number>;
}

export function getFunnelMetrics(): FunnelMetrics {
  const sessions = getSessions();
  const completed = sessions.filter(s => s.endTime);
  const avgDuration = completed.length > 0
    ? completed.reduce((sum, s) => sum + (s.endTime! - s.startTime), 0) / completed.length / 1000
    : 0;

  const stepDropoff: Record<string, number> = {};
  for (const s of sessions) {
    for (let i = 0; i < s.steps.length; i++) {
      const name = s.steps[i].name;
      if (!stepDropoff[name]) stepDropoff[name] = 0;
      // Count dropoff: users who reached this step but not the next
      if (i < s.steps.length - 1 || !s.endTime) {
        stepDropoff[name]++;
      }
    }
  }

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    completionRate: sessions.length > 0 ? Math.round(completed.length / sessions.length * 100) : 0,
    avgDuration: Math.round(avgDuration * 10) / 10,
    stepDropoff,
  };
}
