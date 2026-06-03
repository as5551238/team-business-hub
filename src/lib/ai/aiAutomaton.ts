/**
 * AI Automaton — Autonomous agent that periodically scans data and executes actions
 *
 * Unlike trigger-based rules (which react to specific events), the Automaton
 * proactively scans for patterns and makes decisions:
 * - Detects overloaded members and suggests reassignment
 * - Finds stalled goals and creates follow-up tasks
 * - Identifies KR lag and auto-adjusts priorities
 * - Monitors team health and sends proactive alerts
 *
 * This bridges the gap from "AI chat" to "AI execute" — the system acts
 * autonomously within user-defined guardrails.
 */
import type { AppState, Action } from '@/store/reducer';
import { AI_ACTION_MAP } from './aiActions';
import { handleError } from '@/lib/errorHandler';

export interface AutomatonRule {
  id: string;
  name: string;
  enabled: boolean;
  scanIntervalMin: number;  // minutes between scans
  condition: (state: AppState) => AutomatonScanResult | null;
  action: (state: AppState, scanResult: AutomatonScanResult) => Action | null;
  description: string;
}

export interface AutomatonScanResult {
  summary: string;
  items: Array<{ id: string; type: string; title: string; detail: string }>;
  priority: 'low' | 'medium' | 'high';
}

/** Pre-built automaton rules */
export const BUILTIN_AUTOMATON_RULES: AutomatonRule[] = [
  {
    id: 'auto-overload-rebalance',
    name: '团队负载自动平衡',
    enabled: true,
    scanIntervalMin: 30,
    description: '检测成员过载并自动建议重新分配任务',
    condition(state) {
      const loads: Record<string, { name: string; active: number; total: number }> = {};
      const activeStatuses = new Set(['todo', 'in_progress']);
      for (const t of state.tasks) {
        if (t.status === 'done' || t.status === 'cancelled' || !t.leaderId) continue;
        if (!loads[t.leaderId]) {
          const m = state.members.find(m => m.id === t.leaderId);
          loads[t.leaderId] = { name: m?.name || '?', active: 0, total: 0 };
        }
        loads[t.leaderId].total++;
        if (activeStatuses.has(t.status)) loads[t.leaderId].active++;
      }
      const overloaded = Object.entries(loads)
        .filter(([, l]) => l.active >= 5)
        .map(([id, l]) => ({ id, type: 'member', title: l.name, detail: `${l.active} 个进行中任务（共 ${l.total}）` }));
      if (overloaded.length === 0) return null;
      return { summary: `${overloaded.length} 位成员负载过高`, items: overloaded, priority: overloaded.length >= 2 ? 'high' : 'medium' };
    },
    action(state, scanResult) {
      // For the most overloaded member, find their lowest-priority unstarted task and smart-assign it
      const aiAction = AI_ACTION_MAP.get('smart_assign');
      if (!aiAction) return null;
      // Find the most overloaded member's first todo task
      const topMember = scanResult.items[0];
      const todoTask = state.tasks.find(t => t.leaderId === topMember.id && t.status === 'todo');
      if (!todoTask) return null;
      return (aiAction.execute(state, { taskId: todoTask.id }) as Action);
    },
  },
  {
    id: 'auto-stalled-goal-nudge',
    name: '停滞目标自动推进',
    enabled: true,
    scanIntervalMin: 60,
    description: '检测7天未更新的进行中目标，自动创建跟进任务',
    condition(state) {
      const now = Date.now();
      const stalled = state.goals.filter(g => {
        if (g.status !== 'in_progress') return false;
        if (!g.updatedAt) return true;  // Never updated
        return (now - new Date(g.updatedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
      }).map(g => ({ id: g.id, type: 'goal', title: g.title, detail: `已 ${Math.ceil((now - new Date(g.updatedAt || g.createdAt).getTime()) / 86400000)} 天未更新` }));
      if (stalled.length === 0) return null;
      return { summary: `${stalled.length} 个目标进度停滞`, items: stalled, priority: stalled.length >= 2 ? 'high' : 'medium' };
    },
    action(state, scanResult) {
      // Create a follow-up task for the first stalled goal
      const aiAction = AI_ACTION_MAP.get('create_task');
      if (!aiAction) return null;
      const goal = scanResult.items[0];
      const result = aiAction.execute(state, {
        title: `跟进：${goal.title} 进度更新`,
        goalId: goal.id,
        priority: 'B',
      });
      if (result && !('error' in result)) return result as Action;
      return null;
    },
  },
  {
    id: 'auto-risk-scan',
    name: '风险自动检测',
    enabled: true,
    scanIntervalMin: 120,
    description: '定期扫描全量风险项并生成报告通知',
    condition(state) {
      // Check for overdue + blocked + high-priority items
      const today = new Date().toISOString().split('T')[0];
      const overdue = state.tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled').length;
      const blocked = state.tasks.filter(t => t.status === 'blocked').length;
      const highPrio = state.tasks.filter(t => t.priority === 'S' && t.status !== 'done').length;
      const totalRisk = overdue + blocked + highPrio;
      if (totalRisk === 0) return null;
      const items: AutomatonScanResult['items'] = [];
      if (overdue > 0) items.push({ id: 'overdue', type: 'metric', title: '逾期任务', detail: `${overdue} 个` });
      if (blocked > 0) items.push({ id: 'blocked', type: 'metric', title: '阻塞任务', detail: `${blocked} 个` });
      if (highPrio > 0) items.push({ id: 'high-prio', type: 'metric', title: '最高优先级', detail: `${highPrio} 个` });
      return { summary: `发现 ${totalRisk} 个风险项`, items, priority: totalRisk >= 5 ? 'high' : 'medium' };
    },
    action(state, scanResult) {
      // Just create a notification — no data mutation
      return {
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `automaton-risk-${Date.now()}`,
          type: 'risk_alert',
          title: `自动风险扫描：${scanResult.summary}`,
          message: scanResult.items.map(i => `${i.title}: ${i.detail}`).join('；'),
          read: false,
          createdAt: new Date().toISOString(),
        },
      };
    },
  },
  {
    id: 'auto-weekly-digest',
    name: '周报自动生成',
    enabled: true,
    scanIntervalMin: 10080,
    description: '每周自动生成本周工作摘要并推送',
    condition(state) {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();
      if (day !== 5 || hour < 16) return null;
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const completedThisWeek = state.tasks.filter(t => t.status === 'done' && t.updatedAt >= weekAgo).length;
      const createdThisWeek = state.tasks.filter(t => t.createdAt >= weekAgo).length;
      const overdue = state.tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled').length;
      if (completedThisWeek === 0 && createdThisWeek === 0) return null;
      return {
        summary: `本周完成${completedThisWeek}项新建${createdThisWeek}项逾期${overdue}项`,
        items: [
          { id: 'completed', type: 'metric', title: '本周完成', detail: `${completedThisWeek} 个任务` },
          { id: 'created', type: 'metric', title: '本周新建', detail: `${createdThisWeek} 个任务` },
          { id: 'overdue', type: 'metric', title: '当前逾期', detail: `${overdue} 个任务` },
        ],
        priority: 'medium',
      };
    },
    action(state, scanResult) {
      return {
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `automaton-weekly-${Date.now()}`,
          type: 'system',
          title: `本周工作摘要`,
          message: scanResult.summary,
          read: false,
          createdAt: new Date().toISOString(),
        },
      };
    },
  },
  {
    id: 'auto-archive-done',
    name: '已完成任务自动归档',
    enabled: true,
    scanIntervalMin: 1440,
    description: '已完成超过24小时的任务自动从看板移除',
    condition(state) {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const archivable = state.tasks.filter(t =>
        t.status === 'done' &&
        t.updatedAt &&
        new Date(t.updatedAt).getTime() < oneDayAgo
      );
      if (archivable.length === 0) return null;
      return {
        summary: `${archivable.length} 个已完成任务可归档`,
        items: archivable.slice(0, 10).map(t => ({ id: t.id, type: 'task', title: t.title, detail: `完成于 ${new Date(t.updatedAt).toLocaleDateString()}` })),
        priority: archivable.length > 20 ? 'high' : 'low',
      };
    },
    action(state, scanResult) {
      return {
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `automaton-archive-${Date.now()}`,
          type: 'system',
          title: '可归档任务提醒',
          message: scanResult.summary,
          read: false,
          createdAt: new Date().toISOString(),
        },
      };
    },
  },
];

// ===== Automaton Runner =====

let _automatonTimer: ReturnType<typeof setInterval> | null = null;
let _lastScanTime: Record<string, number> = {};

export function startAutomaton(getState: () => AppState, dispatch: (action: Action) => void) {
  stopAutomaton();
  // Check every 5 minutes
  _automatonTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    const state = getState();
    for (const rule of BUILTIN_AUTOMATON_RULES) {
      if (!rule.enabled) continue;
      const lastScan = _lastScanTime[rule.id] || 0;
      if (Date.now() - lastScan < rule.scanIntervalMin * 60 * 1000) continue;
      _lastScanTime[rule.id] = Date.now();
      try {
        const scanResult = rule.condition(state);
        if (!scanResult) continue;
        const action = rule.action(state, scanResult);
        if (action) dispatch(action);
      } catch (e) {
        console.warn(`Automaton rule "${rule.name}" failed:`, e);
      }
    }
  }, 5 * 60 * 1000);
}

export function stopAutomaton() {
  if (_automatonTimer) { clearInterval(_automatonTimer); _automatonTimer = null; }
}

export function runAutomatonOnce(getState: () => AppState, dispatch: (action: Action) => void) {
  const state = getState();
  const results: Array<{ rule: AutomatonRule; result: AutomatonScanResult | null; actionTaken: boolean }> = [];
  for (const rule of BUILTIN_AUTOMATON_RULES) {
    try {
      const scanResult = rule.condition(state);
      let actionTaken = false;
      if (scanResult) {
        const action = rule.action(state, scanResult);
        if (action) { dispatch(action); actionTaken = true; }
      }
      results.push({ rule, result: scanResult, actionTaken });
    } catch (e) {
      results.push({ rule, result: null, actionTaken: false });
      handleError(e, { module: 'aiAutomaton', operation: 'RUN_ONCE', severity: 'info' });
    }
  }
  return results;
}

// ===== Persistence & Toggle =====

const AUTOMATON_CONFIG_KEY = 'tbh-automaton-config';

function loadAutomatonConfig(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(AUTOMATON_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { handleError(e, { module: 'aiAutomaton', operation: 'LOAD_CONFIG', severity: 'debug' }); }
  return {};
}

function saveAutomatonConfig(config: Record<string, boolean>) {
  try { localStorage.setItem(AUTOMATON_CONFIG_KEY, JSON.stringify(config)); } catch (e) { handleError(e, { module: 'aiAutomaton', operation: 'SAVE_CONFIG', severity: 'debug' }); }
}

/** Initialize enabled state from localStorage */
export function initAutomatonConfig() {
  const config = loadAutomatonConfig();
  for (const rule of BUILTIN_AUTOMATON_RULES) {
    if (config[rule.id] !== undefined) {
      rule.enabled = config[rule.id];
    }
  }
}

/** Toggle an automaton rule's enabled state and persist */
export function toggleAutomatonRule(ruleId: string, enabled: boolean) {
  const rule = BUILTIN_AUTOMATON_RULES.find(r => r.id === ruleId);
  if (rule) rule.enabled = enabled;
  const config = loadAutomatonConfig();
  config[ruleId] = enabled;
  saveAutomatonConfig(config);
}

// Auto-init on module load
initAutomatonConfig();
