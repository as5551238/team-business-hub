const STORAGE_KEY = 'tbh-funnel-analytics';

interface FunnelEvent {
  step: string;
  timestamp: number;
  sessionId: string;
  metadata?: Record<string, string>;
}

interface FunnelSession {
  id: string;
  startTime: number;
  events: FunnelEvent[];
}

function getSessions(): FunnelSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: FunnelSession[]) {
  try {
    if (sessions.length > 50) sessions = sessions.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {}
}

let currentSession: FunnelSession | null = null;

export function startFunnelSession(): string {
  currentSession = { id: `funnel_${Date.now()}`, startTime: Date.now(), events: [] };
  return currentSession.id;
}

export function trackFunnelStep(step: string, metadata?: Record<string, string>) {
  if (!currentSession) startFunnelSession();
  currentSession!.events.push({ step, timestamp: Date.now(), sessionId: currentSession!.id, metadata });
}

export function endFunnelSession() {
  if (!currentSession) return;
  const sessions = getSessions();
  sessions.push(currentSession);
  saveSessions(sessions);
  currentSession = null;
}

export function getFunnelMetrics(): { avgSteps: number; avgDurationMs: number; completionRate: number; totalSessions: number } {
  const sessions = getSessions();
  if (sessions.length === 0) return { avgSteps: 0, avgDurationMs: 0, completionRate: 0, totalSessions: 0 };
  const completed = sessions.filter(s => s.events.some(e => e.step === 'start_review'));
  const totalSteps = sessions.reduce((sum, s) => sum + s.events.length, 0);
  const totalDuration = sessions.reduce((sum, s) => sum + (s.events[s.events.length - 1]?.timestamp ?? s.startTime) - s.startTime, 0);
  return { avgSteps: totalSteps / sessions.length, avgDurationMs: totalDuration / sessions.length, completionRate: completed.length / sessions.length, totalSessions: sessions.length };
}
