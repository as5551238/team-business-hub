/**
 * AI 分析引擎 — 确定性分析纯函数单元测试
 * 覆盖：computeHealth / detectRisks / computeEfficiency / analyzeTeam
 */
import { describe, it, expect } from 'vitest';
import { computeHealth, detectRisks, computeEfficiency, analyzeTeam } from '@/lib/ai/analysisEngine';
import type { PeriodSnapshot } from '@/lib/ai/dataCollector';

/** 构造最小可用快照的工厂函数 */
function makeSnapshot(overrides: Partial<PeriodSnapshot> = {}): PeriodSnapshot {
  return {
    period: 'weekly',
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    goals: {
      total: 0, active: 0, done: 0, blocked: 0, cancelled: 0,
      overdue: 0, stalled: 0, avgProgress: 0, items: [],
    },
    projects: {
      total: 0, active: 0, done: 0, blocked: 0,
      overdue: 0, stalled: 0, avgProgress: 0, items: [],
    },
    tasks: {
      total: 0, active: 0, done: 0, blocked: 0,
      overdue: 0, newInPeriod: 0, completedInPeriod: 0,
      blockedByCount: 0, avgCompletionDays: null,
      onTimeCount: 0, onTimeRate: 100, items: [],
    },
    members: [],
    ...overrides,
  };
}

describe('computeHealth', () => {
  it('空快照应返回满分', () => {
    const result = computeHealth(makeSnapshot());
    expect(result.overall).toBe(100);
    expect(result.level).toBe('excellent');
  });

  it('有逾期目标时应扣分', () => {
    const snap = makeSnapshot({
      goals: {
        total: 2, active: 2, done: 0, blocked: 0, cancelled: 0,
        overdue: 1, stalled: 0, avgProgress: 50,
        items: [
          { id: 'g1', title: 'G1', status: 'in_progress', priority: 'high', progress: 50, startDate: '2026-01-01', endDate: '2026-01-10', leaderId: 'u1', leaderName: 'A', isOverdue: true, isStalled: false, keyResults: [] },
          { id: 'g2', title: 'G2', status: 'in_progress', priority: 'medium', progress: 60, startDate: '2026-01-01', endDate: '2026-12-31', leaderId: 'u2', leaderName: 'B', isOverdue: false, isStalled: false, keyResults: [] },
        ],
      },
    });
    const result = computeHealth(snap);
    expect(result.goals).toBeLessThan(100);
    expect(result.overall).toBeLessThan(100);
  });

  it('有阻塞任务时应扣分', () => {
    const snap = makeSnapshot({
      tasks: {
        total: 3, active: 2, done: 1, blocked: 1,
        overdue: 0, newInPeriod: 0, completedInPeriod: 0,
        blockedByCount: 1, avgCompletionDays: 5,
        onTimeCount: 1, onTimeRate: 100,
        items: [
          { id: 't1', title: 'T1', status: 'blocked', priority: 'medium', startDate: null, dueDate: null, completedAt: null, leaderId: 'u1', leaderName: 'A', projectId: null, goalId: null, isOverdue: false, blockedBy: ['t0'] },
          { id: 't2', title: 'T2', status: 'in_progress', priority: 'medium', startDate: null, dueDate: null, completedAt: null, leaderId: 'u2', leaderName: 'B', projectId: null, goalId: null, isOverdue: false, blockedBy: [] },
        ],
      },
    });
    const result = computeHealth(snap);
    expect(result.tasks).toBeLessThan(100);
  });

  it('KR偏移应扣分', () => {
    const snap = makeSnapshot({
      goals: {
        total: 1, active: 1, done: 0, blocked: 0, cancelled: 0,
        overdue: 0, stalled: 0, avgProgress: 10,
        items: [{
          id: 'g1', title: 'G1', status: 'in_progress', priority: 'high',
          progress: 10, startDate: '2026-01-01', endDate: '2026-12-31',
          leaderId: 'u1', leaderName: 'A', isOverdue: false, isStalled: false,
          keyResults: [{ title: 'KR1', target: 100, current: 10, unit: '%', pct: 10 }],
        }],
      },
    });
    const result = computeHealth(snap);
    expect(result.goals).toBeLessThan(100);
  });

  it('level 映射正确', () => {
    // excellent >= 85
    const excellent = computeHealth(makeSnapshot());
    expect(excellent.level).toBe('excellent');

    // 构造一个风险级别的快照
    const riskSnap = makeSnapshot({
      goals: {
        total: 1, active: 1, done: 0, blocked: 1, cancelled: 0,
        overdue: 1, stalled: 1, avgProgress: 10,
        items: [{ id: 'g1', title: 'G', status: 'in_progress', priority: 'urgent', progress: 10, startDate: '2026-01-01', endDate: '2026-01-01', leaderId: '', leaderName: '', isOverdue: true, isStalled: true, keyResults: [] }],
      },
      tasks: {
        total: 1, active: 1, done: 0, blocked: 1,
        overdue: 1, newInPeriod: 0, completedInPeriod: 0,
        blockedByCount: 1, avgCompletionDays: null,
        onTimeCount: 0, onTimeRate: 0,
        items: [{ id: 't1', title: 'T', status: 'blocked', priority: 'urgent', startDate: null, dueDate: '2026-01-01', completedAt: null, leaderId: '', leaderName: '', projectId: null, goalId: null, isOverdue: true, blockedBy: [] }],
      },
    });
    const riskResult = computeHealth(riskSnap);
    expect(riskResult.overall).toBeLessThan(50);
    expect(['risk', 'critical']).toContain(riskResult.level);
  });
});

describe('detectRisks', () => {
  it('无风险快照应返回空数组', () => {
    const risks = detectRisks(makeSnapshot());
    expect(risks).toEqual([]);
  });

  it('逾期目标应检测为高风险', () => {
    const snap = makeSnapshot({
      goals: {
        total: 1, active: 1, done: 0, blocked: 0, cancelled: 0,
        overdue: 1, stalled: 0, avgProgress: 30,
        items: [{ id: 'g1', title: 'G', status: 'in_progress', priority: 'high', progress: 30, startDate: '2026-01-01', endDate: '2026-01-10', leaderId: 'u1', leaderName: 'A', isOverdue: true, isStalled: false, keyResults: [] }],
      },
    });
    const risks = detectRisks(snap);
    expect(risks.length).toBeGreaterThanOrEqual(1);
    expect(risks[0].type).toBe('overdue');
    expect(risks[0].severity).toBe('high');
    expect(risks[0].itemType).toBe('goal');
  });

  it('未分配负责人的任务应为低风险', () => {
    const snap = makeSnapshot({
      tasks: {
        total: 1, active: 1, done: 0, blocked: 0,
        overdue: 0, newInPeriod: 0, completedInPeriod: 0,
        blockedByCount: 0, avgCompletionDays: null,
        onTimeCount: 0, onTimeRate: 100,
        items: [{ id: 't1', title: 'T', status: 'in_progress', priority: 'medium', startDate: null, dueDate: null, completedAt: null, leaderId: '', leaderName: '未分配', projectId: null, goalId: null, isOverdue: false, blockedBy: [] }],
      },
    });
    const risks = detectRisks(snap);
    const noLeader = risks.find(r => r.type === 'no_leader');
    expect(noLeader).toBeDefined();
    expect(noLeader!.severity).toBe('low');
  });

  it('成员过载应检测为风险', () => {
    const snap = makeSnapshot({
      members: [
        { id: 'm1', name: 'Overloaded', role: 'member', activeGoals: 0, activeProjects: 0, activeTasks: 30, completedTasks: 0, overdueTasks: 5, blockedTasks: 0, avgProgress: 30 },
        { id: 'm2', name: 'Normal', role: 'member', activeGoals: 0, activeProjects: 0, activeTasks: 2, completedTasks: 1, overdueTasks: 0, blockedTasks: 0, avgProgress: 70 },
        { id: 'm3', name: 'Normal2', role: 'member', activeGoals: 0, activeProjects: 0, activeTasks: 3, completedTasks: 1, overdueTasks: 0, blockedTasks: 0, avgProgress: 80 },
        { id: 'm4', name: 'Normal3', role: 'member', activeGoals: 0, activeProjects: 0, activeTasks: 1, completedTasks: 1, overdueTasks: 0, blockedTasks: 0, avgProgress: 90 },
      ],
    });
    const risks = detectRisks(snap);
    const overload = risks.find(r => r.type === 'overloaded');
    expect(overload).toBeDefined();
    expect(overload!.memberName).toBe('Overloaded');
  });

  it('KR偏移应检测为风险', () => {
    const snap = makeSnapshot({
      goals: {
        total: 1, active: 1, done: 0, blocked: 0, cancelled: 0,
        overdue: 0, stalled: 0, avgProgress: 20,
        items: [{
          id: 'g1', title: 'G', status: 'in_progress', priority: 'high',
          progress: 20, startDate: '2026-01-01', endDate: '2026-12-31',
          leaderId: 'u1', leaderName: 'A', isOverdue: false, isStalled: false,
          keyResults: [{ title: 'KR', target: 100, current: 10, unit: '%', pct: 10 }],
        }],
      },
    });
    const risks = detectRisks(snap);
    const krRisk = risks.find(r => r.type === 'kr_off_track');
    expect(krRisk).toBeDefined();
  });

  it('风险按严重程度排序', () => {
    const snap = makeSnapshot({
      tasks: {
        total: 3, active: 2, done: 1, blocked: 0,
        overdue: 1, newInPeriod: 0, completedInPeriod: 0,
        blockedByCount: 0, avgCompletionDays: null,
        onTimeCount: 0, onTimeRate: 0,
        items: [
          { id: 't1', title: 'T1', status: 'in_progress', priority: 'medium', startDate: null, dueDate: null, completedAt: null, leaderId: '', leaderName: '未分配', projectId: null, goalId: null, isOverdue: false, blockedBy: [] },
          { id: 't2', title: 'T2', status: 'in_progress', priority: 'urgent', startDate: null, dueDate: '2026-01-01', completedAt: null, leaderId: 'u1', leaderName: 'A', projectId: null, goalId: null, isOverdue: true, blockedBy: [] },
        ],
      },
    });
    const risks = detectRisks(snap);
    for (let i = 1; i < risks.length; i++) {
      const sev = { high: 0, medium: 1, low: 2 };
      expect(sev[risks[i].severity]).toBeGreaterThanOrEqual(sev[risks[i - 1].severity]);
    }
  });
});

describe('computeEfficiency', () => {
  it('空快照效率指标合理', () => {
    const result = computeEfficiency(makeSnapshot());
    expect(result.completionRate).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('完成数 > 新增数时趋势为 up', () => {
    const snap = makeSnapshot({
      tasks: {
        total: 10, active: 5, done: 5, blocked: 0,
        overdue: 0, newInPeriod: 2, completedInPeriod: 5,
        blockedByCount: 0, avgCompletionDays: 3,
        onTimeCount: 5, onTimeRate: 100, items: [],
      },
    });
    const result = computeEfficiency(snap);
    expect(result.trend).toBe('up');
    expect(result.completionRate).toBe(50);
  });

  it('完成数 < 新增数时趋势为 down', () => {
    const snap = makeSnapshot({
      tasks: {
        total: 10, active: 8, done: 2, blocked: 0,
        overdue: 0, newInPeriod: 5, completedInPeriod: 2,
        blockedByCount: 0, avgCompletionDays: 10,
        onTimeCount: 2, onTimeRate: 40, items: [],
      },
    });
    const result = computeEfficiency(snap);
    expect(result.trend).toBe('down');
  });
});

describe('analyzeTeam', () => {
  it('返回完整团队分析结构', () => {
    const result = analyzeTeam(makeSnapshot());
    expect(result.health).toBeDefined();
    expect(result.risks).toBeInstanceOf(Array);
    expect(result.efficiency).toBeDefined();
    expect(result.members).toBeInstanceOf(Array);
    expect(result.period).toBe('weekly');
    expect(result.analyzedAt).toBeTruthy();
  });
});
