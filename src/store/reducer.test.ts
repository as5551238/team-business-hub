/**
 * Reducer 核心动作测试 — 验证状态转换逻辑
 * Mock 外部副作用（supabase / delayPrediction），聚焦纯状态变换
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 外部模块（必须在 import reducer 之前）
vi.mock('@/store/supabase', () => ({
  supabaseInsert: vi.fn(),
  supabaseUpdate: vi.fn(),
  supabaseDelete: vi.fn(),
  supabaseUpsert: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('@/lib/delayPrediction', () => ({
  learnFromCompletedTask: vi.fn(),
}));

vi.mock('@/supabase/client', () => ({
  isSupabaseConfigured: vi.fn(() => false),
}));

import { reducer } from './reducer';
import type { AppState, Member, Goal, Task, Project } from '@/types';

// ==================== 测试辅助 ====================

const makeMember = (overrides: Partial<Member> = {}): Member => ({
  id: 'm1',
  name: '测试用户',
  nickname: '测试',
  wechatId: '',
  phone: '',
  email: '',
  role: 'admin',
  department: '',
  avatar: '',
  status: 'active',
  joinDate: '2026-01-01',
  permissions: [],
  teamId: '__default__',
  ...overrides,
});

const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  title: '测试目标',
  description: '',
  type: 'okr',
  status: 'in_progress',
  priority: 'medium',
  parentId: null,
  level: 0,
  category: '',
  startDate: '',
  endDate: '',
  leaderId: 'm1',
  supporterIds: [],
  tags: [],
  keyResults: [],
  selectedKRIds: [],
  attachments: [],
  trackingRecords: [],
  repeatCycle: 'none',
  progress: 0,
  discussionThreadId: null,
  summary: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  title: '测试任务',
  description: '',
  projectId: null,
  goalId: null,
  parentId: null,
  status: 'todo',
  priority: 'medium',
  leaderId: 'm1',
  supporterIds: [],
  tags: [],
  category: '',
  startDate: null,
  dueDate: null,
  reminderDate: null,
  completedAt: null,
  subtasks: [],
  attachments: [],
  trackingRecords: [],
  repeatCycle: 'none',
  blockedBy: [],
  sprintId: null,
  discussionThreadId: null,
  summary: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  title: '测试项目',
  description: '',
  goalId: null,
  parentId: null,
  status: 'in_progress',
  priority: 'medium',
  startDate: '',
  endDate: '',
  leaderId: 'm1',
  supporterIds: [],
  tags: [],
  category: '',
  attachments: [],
  trackingRecords: [],
  repeatCycle: 'none',
  taskCount: 0,
  progress: 0,
  discussionThreadId: null,
  summary: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    members: [makeMember()],
    goals: [],
    projects: [],
    tasks: [],
    notifications: [],
    activities: [],
    itemLinks: [],
    tags: [],
    categories: [],
    templates: [],
    scheduleEvents: [],
    notes: [],
    knowledge: [],
    savedViews: [],
    reviews: [],
    comments: [],
    bookmarks: [],
    batchOperations: [],
    statusFlowRules: [],
    automationRules: [],
    sprints: [],
    teams: [],
    teamMembers: [],
    currentUser: makeMember(),
    viewingMemberId: null,
    currentTeamId: null,
    ...overrides,
  };
}

// ==================== 测试 ====================

describe('reducer — Goal actions', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('ADD_GOAL 添加目标并带默认值', () => {
    const next = reducer(state, { type: 'ADD_GOAL', payload: { title: 'Q2目标', leaderId: 'm1' } });
    expect(next.goals).toHaveLength(1);
    expect(next.goals[0].title).toBe('Q2目标');
    expect(next.goals[0].progress).toBe(0);
    expect(next.goals[0].tags).toEqual([]);
    expect(next.goals[0].keyResults).toEqual([]);
  });

  it('UPDATE_GOAL 更新标题', () => {
    state.goals = [makeGoal()];
    const next = reducer(state, { type: 'UPDATE_GOAL', payload: { id: 'g1', updates: { title: '更新后标题' } } });
    expect(next.goals[0].title).toBe('更新后标题');
  });

  it('UPDATE_GOAL 进度级联到父目标', () => {
    // 父目标无自己的KR，进度由子目标驱动
    state.goals = [
      makeGoal({ id: 'parent', keyResults: [] }),
      makeGoal({ id: 'child', parentId: 'parent', keyResults: [{ id: 'kr2', title: 'KR2', currentValue: 5, targetValue: 10, weight: 1, selected: true }] }),
    ];
    const next = reducer(state, { type: 'UPDATE_GOAL', payload: { id: 'child', updates: { keyResults: [{ id: 'kr2', title: 'KR2', currentValue: 10, targetValue: 10, weight: 1, selected: true }] } } });
    const parent = next.goals.find(g => g.id === 'parent')!;
    // 子目标 KR 已完成 → 子进度100% → 父进度应由子目标驱动
    expect(parent.progress).toBeGreaterThan(0);
  });

  it('DELETE_GOAL 删除目标并清理关联', () => {
    state.goals = [makeGoal({ id: 'g1' })];
    state.tasks = [makeTask({ id: 't1', goalId: 'g1' })];
    const next = reducer(state, { type: 'DELETE_GOAL', payload: 'g1' });
    expect(next.goals).toHaveLength(0);
    expect(next.tasks[0].goalId).toBeNull();
  });

  it('DELETE_GOAL 子目标 parentId 置空', () => {
    state.goals = [makeGoal({ id: 'gp' }), makeGoal({ id: 'gc', parentId: 'gp' })];
    const next = reducer(state, { type: 'DELETE_GOAL', payload: 'gp' });
    const child = next.goals.find(g => g.id === 'gc')!;
    expect(child.parentId).toBeNull();
  });
});

describe('reducer — Task actions', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('ADD_TASK 添加任务并带默认值', () => {
    const next = reducer(state, { type: 'ADD_TASK', payload: { title: '新任务', leaderId: 'm1' } });
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].title).toBe('新任务');
    expect(next.tasks[0].subtasks).toEqual([]);
    expect(next.tasks[0].blockedBy).toEqual([]);
  });

  it('ADD_TASK 关联项目时增加 taskCount 并更新进度', () => {
    state.projects = [makeProject({ id: 'p1', taskCount: 0, progress: 0 })];
    const next = reducer(state, { type: 'ADD_TASK', payload: { title: '任务1', leaderId: 'm1', projectId: 'p1' } });
    expect(next.projects[0].taskCount).toBe(1);
  });

  it('UPDATE_TASK 状态改为 done 自动补 completedAt', () => {
    state.tasks = [makeTask({ id: 't1', status: 'in_progress' })];
    const next = reducer(state, { type: 'UPDATE_TASK', payload: { id: 't1', updates: { status: 'done' } } });
    expect(next.tasks[0].status).toBe('done');
    expect(next.tasks[0].completedAt).toBeTruthy();
  });

  it('UPDATE_TASK projectId 变更时双向更新 taskCount', () => {
    state.tasks = [makeTask({ id: 't1', projectId: 'p1' })];
    state.projects = [makeProject({ id: 'p1', taskCount: 1 }), makeProject({ id: 'p2', taskCount: 0 })];
    const next = reducer(state, { type: 'UPDATE_TASK', payload: { id: 't1', updates: { projectId: 'p2' } } });
    const oldP = next.projects.find(p => p.id === 'p1')!;
    const newP = next.projects.find(p => p.id === 'p2')!;
    expect(oldP.taskCount).toBe(0);
    expect(newP.taskCount).toBe(1);
  });

  it('DELETE_TASK 删除后更新项目 taskCount 和 progress', () => {
    state.tasks = [makeTask({ id: 't1', projectId: 'p1', status: 'todo' })];
    state.projects = [makeProject({ id: 'p1', taskCount: 1, progress: 0 })];
    const next = reducer(state, { type: 'DELETE_TASK', payload: 't1' });
    expect(next.tasks).toHaveLength(0);
    expect(next.projects[0].taskCount).toBe(0);
  });

  it('DELETE_TASK 依赖此任务的阻塞任务自动解除阻塞', () => {
    state.tasks = [
      makeTask({ id: 't1', status: 'done' }),
      makeTask({ id: 't2', status: 'blocked', blockedBy: ['t1'] }),
    ];
    const next = reducer(state, { type: 'DELETE_TASK', payload: 't1' });
    const unblocked = next.tasks.find(t => t.id === 't2')!;
    expect(unblocked.blockedBy).toEqual([]);
    expect(unblocked.status).toBe('todo');
  });

  it('TOGGLE_SUBTASK 切换子任务完成状态并更新项目进度', () => {
    state.tasks = [makeTask({ id: 't1', projectId: 'p1', subtasks: [{ id: 'st1', title: '子1', completed: false, priority: 'medium', dueDate: null, reminderDate: null, leaderId: '', supporterIds: [], tags: [], attachments: [], trackingRecords: [], repeatCycle: 'none', createdAt: '2026-01-01' }] })];
    state.projects = [makeProject({ id: 'p1', taskCount: 1, progress: 0 })];
    const next = reducer(state, { type: 'TOGGLE_SUBTASK', payload: { taskId: 't1', subtaskId: 'st1' } });
    expect(next.tasks[0].subtasks[0].completed).toBe(true);
  });

  it('ADD_SUBTASK 向已有任务添加子任务', () => {
    state.tasks = [makeTask({ id: 't1', subtasks: [] })];
    const next = reducer(state, { type: 'ADD_SUBTASK', payload: { taskId: 't1', subtask: { title: '新子任务' } } });
    expect(next.tasks[0].subtasks).toHaveLength(1);
    expect(next.tasks[0].subtasks[0].title).toBe('新子任务');
  });
});

describe('reducer — Project actions', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('ADD_PROJECT 添加项目并带默认值', () => {
    const next = reducer(state, { type: 'ADD_PROJECT', payload: { title: '新项目', leaderId: 'm1' } });
    expect(next.projects).toHaveLength(1);
    expect(next.projects[0].progress).toBe(0);
  });

  it('UPDATE_PROJECT 更新状态', () => {
    state.projects = [makeProject()];
    const next = reducer(state, { type: 'UPDATE_PROJECT', payload: { id: 'p1', updates: { status: 'done' } } });
    expect(next.projects[0].status).toBe('done');
  });

  it('DELETE_PROJECT 关联任务 projectId 置空', () => {
    state.projects = [makeProject({ id: 'p1' })];
    state.tasks = [makeTask({ id: 't1', projectId: 'p1' })];
    const next = reducer(state, { type: 'DELETE_PROJECT', payload: 'p1' });
    expect(next.projects).toHaveLength(0);
    expect(next.tasks[0].projectId).toBeNull();
  });
});

describe('reducer — Member actions', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('ADD_MEMBER 添加成员到列表', () => {
    const next = reducer(state, { type: 'ADD_MEMBER', payload: { name: '新成员', role: 'member' } });
    expect(next.members).toHaveLength(2);
    expect(next.members[1].name).toBe('新成员');
  });

  it('UPDATE_MEMBER 更新成员信息', () => {
    const next = reducer(state, { type: 'UPDATE_MEMBER', payload: { id: 'm1', updates: { name: '改名后' } } });
    expect(next.members[0].name).toBe('改名后');
  });

  it('DELETE_MEMBER 删除成员并清理关联', () => {
    state.goals = [makeGoal({ id: 'g1', leaderId: 'm1' })];
    state.tasks = [makeTask({ id: 't1', leaderId: 'm1' })];
    const next = reducer(state, { type: 'DELETE_MEMBER', payload: 'm1' });
    expect(next.members).toHaveLength(0);
    expect(next.goals[0].leaderId).toBe('');
    expect(next.tasks[0].leaderId).toBe('');
  });
});

describe('reducer — Notification actions', () => {
  let state: AppState;
  beforeEach(() => {
    state = makeState({
      notifications: [
        { id: 'n1', type: 'sync' as const, title: '通知1', message: '内容1', relatedId: '', relatedType: 'task' as const, memberId: 'm1', read: false, createdAt: '2026-01-01' },
        { id: 'n2', type: 'sync' as const, title: '通知2', message: '内容2', relatedId: '', relatedType: 'task' as const, memberId: 'm1', read: false, createdAt: '2026-01-01' },
      ],
    });
    vi.clearAllMocks();
  });

  it('MARK_NOTIFICATION_READ 标记单条已读', () => {
    const next = reducer(state, { type: 'MARK_NOTIFICATION_READ', payload: 'n1' });
    expect(next.notifications[0].read).toBe(true);
    expect(next.notifications[1].read).toBe(false);
  });

  it('MARK_ALL_NOTIFICATIONS_READ 标记全部已读', () => {
    const next = reducer(state, { type: 'MARK_ALL_NOTIFICATIONS_READ' });
    expect(next.notifications.every(n => n.read)).toBe(true);
  });

  it('ADD_NOTIFICATION 添加通知到开头', () => {
    const next = reducer(state, { type: 'ADD_NOTIFICATION', payload: { id: 'n3', type: 'assigned' as const, title: '新通知', message: '', relatedId: '', relatedType: 'task' as const, memberId: 'm1' } });
    expect(next.notifications).toHaveLength(3);
    expect(next.notifications[0].id).toBe('n3');
  });

  it('ADD_NOTIFICATION 去重（相同 id 跳过）', () => {
    const next = reducer(state, { type: 'ADD_NOTIFICATION', payload: { id: 'n1', type: 'assigned' as const, title: '重复', message: '', relatedId: '', relatedType: 'task' as const, memberId: 'm1' } });
    expect(next.notifications).toHaveLength(2);
  });
});

describe('reducer — Tag actions', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('ADD_TAG 添加标签', () => {
    const next = reducer(state, { type: 'ADD_TAG', payload: { name: '紧急', color: '#ef4444' } });
    expect(next.tags).toHaveLength(1);
    expect(next.tags[0].name).toBe('紧急');
  });

  it('DELETE_TAG 删除标签并从关联项中移除', () => {
    state.tags = [{ id: 'tag1', name: '红色', color: '#ff0000', createdAt: '2026-01-01' }];
    state.tasks = [makeTask({ id: 't1', tags: ['tag1'] })];
    const next = reducer(state, { type: 'DELETE_TAG', payload: 'tag1' });
    expect(next.tags).toHaveLength(0);
    expect(next.tasks[0].tags).toEqual([]);
  });
});

describe('reducer — Bookmark actions', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('ADD_BOOKMARK 添加书签', () => {
    const next = reducer(state, { type: 'ADD_BOOKMARK', payload: { title: '百度', url: 'https://baidu.com', category: '搜索引擎', icon: 'globe', order: 0 } });
    expect(next.bookmarks).toHaveLength(1);
  });

  it('DELETE_BOOKMARK 删除书签', () => {
    state.bookmarks = [{ id: 'bm1', title: '百度', url: 'https://baidu.com', category: '搜索引擎', icon: 'globe', order: 0, memberId: 'm1', createdAt: '2026-01-01' }];
    const next = reducer(state, { type: 'DELETE_BOOKMARK', payload: 'bm1' });
    expect(next.bookmarks).toHaveLength(0);
  });
});

describe('reducer — SET_CURRENT_USER / SET_VIEWING_MEMBER', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('SET_CURRENT_USER 设置当前用户', () => {
    const next = reducer(state, { type: 'SET_CURRENT_USER', payload: 'm1' });
    expect(next.currentUser).not.toBeNull();
    expect(next.currentUser!.id).toBe('m1');
  });

  it('SET_VIEWING_MEMBER 设置查看成员ID', () => {
    const next = reducer(state, { type: 'SET_VIEWING_MEMBER', payload: 'm1' });
    expect(next.viewingMemberId).toBe('m1');
  });

  it('SET_VIEWING_MEMBER 设为 null 清除', () => {
    state.viewingMemberId = 'm1';
    const next = reducer(state, { type: 'SET_VIEWING_MEMBER', payload: null });
    expect(next.viewingMemberId).toBeNull();
  });
});

describe('reducer — Comment actions', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('ADD_COMMENT 添加评论', () => {
    state.goals = [makeGoal({ id: 'g1' })];
    const next = reducer(state, { type: 'ADD_COMMENT', payload: { itemId: 'g1', itemType: 'goal', memberId: 'm1', memberName: '测试', content: '你好' } });
    expect(next.comments).toHaveLength(1);
    expect(next.comments[0].content).toBe('你好');
  });
});

describe('reducer — IMPORT_BACKUP', () => {
  let state: AppState;
  beforeEach(() => { state = makeState(); vi.clearAllMocks(); });

  it('IMPORT_BACKUP 导入有效备份', () => {
    const backup = {
      version: '1.0',
      exportedAt: '2026-01-01',
      members: [makeMember()],
      goals: [makeGoal()],
      projects: [makeProject()],
      tasks: [makeTask()],
      notifications: [],
      activities: [],
    };
    const next = reducer(state, { type: 'IMPORT_BACKUP', payload: backup as any });
    expect(next.goals).toHaveLength(1);
    expect(next.tasks).toHaveLength(1);
  });

  it('IMPORT_BACKUP 缺少必要字段返回原状态', () => {
    const backup = { version: '1.0', exportedAt: '2026-01-01', members: [], goals: [], projects: [] }; // missing tasks
    const next = reducer(state, { type: 'IMPORT_BACKUP', payload: backup as any });
    expect(next).toBe(state); // 未改变
  });
});
