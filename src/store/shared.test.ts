import { describe, it, expect } from 'vitest';
import { calcGoalProgress, calcProjectProgress } from '../store/shared';
import type { Goal, Task, Project } from '../types';

// === calcGoalProgress 测试 ===

describe('calcGoalProgress', () => {
  const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
    id: 'g1',
    title: '测试目标',
    status: 'in_progress',
    priority: 'B',
    urgency: 'B',
    leaderId: 'm1',
    supporterIds: [],
    keyResults: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  });

  it('无KR且无子目标时返回0', () => {
    const goals = [makeGoal()];
    expect(calcGoalProgress(goals, 'g1')).toBe(0);
  });

  it('简单平均：2个KR各50%完成 = 50', () => {
    const goals = [makeGoal({
      keyResults: [
        { id: 'kr1', title: 'KR1', currentValue: 5, targetValue: 10, weight: 1, selected: true },
        { id: 'kr2', title: 'KR2', currentValue: 50, targetValue: 100, weight: 1, selected: true },
      ],
    })];
    expect(calcGoalProgress(goals, 'g1')).toBe(50);
  });

  it('加权平均：KR1(weight3,50%) + KR2(weight1,100%) = 62.5%→63', () => {
    const goals = [makeGoal({
      keyResults: [
        { id: 'kr1', title: 'KR1', currentValue: 5, targetValue: 10, weight: 3, selected: true },
        { id: 'kr2', title: 'KR2', currentValue: 100, targetValue: 100, weight: 1, selected: true },
      ],
    })];
    // (50 * 3/4) + (100 * 1/4) = 37.5 + 25 = 62.5 → 63
    expect(calcGoalProgress(goals, 'g1')).toBe(63);
  });

  it('selected过滤：仅selected的KR参与计算', () => {
    const goals = [makeGoal({
      keyResults: [
        { id: 'kr1', title: 'KR1', currentValue: 8, targetValue: 10, weight: 1, selected: true },
        { id: 'kr2', title: 'KR2', currentValue: 0, targetValue: 10, weight: 1, selected: false },
      ],
    })];
    // 只有 kr1 参与: 8/10 = 80%
    expect(calcGoalProgress(goals, 'g1')).toBe(80);
  });

  it('全部KR未selected时返回0', () => {
    const goals = [makeGoal({
      keyResults: [
        { id: 'kr1', title: 'KR1', currentValue: 8, targetValue: 10, weight: 1, selected: false },
      ],
    })];
    expect(calcGoalProgress(goals, 'g1')).toBe(0);
  });

  it('子目标平均：2个子目标各50%/100% = 75', () => {
    const goals = [
      makeGoal({ id: 'g1', keyResults: [] }),
      makeGoal({
        id: 'g2', parentId: 'g1',
        keyResults: [{ id: 'kr1', title: 'KR', currentValue: 5, targetValue: 10, weight: 1, selected: true }],
      }),
      makeGoal({
        id: 'g3', parentId: 'g1',
        keyResults: [{ id: 'kr2', title: 'KR', currentValue: 10, targetValue: 10, weight: 1, selected: true }],
      }),
    ];
    // g2=50%, g3=100%, avg=75%
    expect(calcGoalProgress(goals, 'g1')).toBe(75);
  });

  it('循环引用不会无限递归', () => {
    const goals = [
      makeGoal({ id: 'g1', parentId: 'g2', keyResults: [] }),
      makeGoal({ id: 'g2', parentId: 'g1', keyResults: [] }),
    ];
    expect(calcGoalProgress(goals, 'g1')).toBe(0);
  });
});

// === calcProjectProgress 测试 ===

describe('calcProjectProgress', () => {
  it('无任务时返回0', () => {
    expect(calcProjectProgress([], 'p1')).toBe(0);
  });

  it('done=100%, todo=0%, 平均=50%', () => {
    const tasks = [
      { id: 't1', projectId: 'p1', status: 'done', subtasks: [] } as Task,
      { id: 't2', projectId: 'p1', status: 'todo', subtasks: [] } as Task,
    ];
    expect(calcProjectProgress(tasks, 'p1')).toBe(50);
  });

  it('in_progress无子任务时算50%', () => {
    const tasks = [
      { id: 't1', projectId: 'p1', status: 'in_progress', subtasks: [] } as Task,
    ];
    expect(calcProjectProgress(tasks, 'p1')).toBe(50);
  });

  it('in_progress有子任务时按完成率算', () => {
    const tasks = [
      {
        id: 't1', projectId: 'p1', status: 'in_progress',
        subtasks: [{ id: 's1', title: 'S1', completed: true }, { id: 's2', title: 'S2', completed: false }],
      } as Task,
    ];
    // 1/2 = 50%
    expect(calcProjectProgress(tasks, 'p1')).toBe(50);
  });

  it('混合状态：done(100) + in_progress+75%子任务(75) + todo(0) = 58.3→58', () => {
    const tasks = [
      { id: 't1', projectId: 'p1', status: 'done', subtasks: [] } as Task,
      {
        id: 't2', projectId: 'p1', status: 'in_progress',
        subtasks: [
          { id: 's1', title: 'S1', completed: true },
          { id: 's2', title: 'S2', completed: true },
          { id: 's3', title: 'S3', completed: true },
          { id: 's4', title: 'S4', completed: false },
        ],
      } as Task,
      { id: 't3', projectId: 'p1', status: 'todo', subtasks: [] } as Task,
    ];
    // (100 + 75 + 0) / 3 = 58.33 → 58
    expect(calcProjectProgress(tasks, 'p1')).toBe(58);
  });

  it('只计算指定项目的任务', () => {
    const tasks = [
      { id: 't1', projectId: 'p1', status: 'done', subtasks: [] } as Task,
      { id: 't2', projectId: 'p2', status: 'todo', subtasks: [] } as Task,
    ];
    expect(calcProjectProgress(tasks, 'p1')).toBe(100);
  });
});
