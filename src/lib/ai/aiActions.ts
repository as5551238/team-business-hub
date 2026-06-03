/**
 * AI Action API — 20+ core operations that AI can invoke
 * Each action is a pure function that takes state + params → returns dispatch action
 * This is the "AI hands" layer: AI decides, these actions execute
 */

import type { AppState, TaskStatus, TaskPriority, GoalStatus, ItemType } from '@/types';
import type { Action } from '@/store/types';

export interface AiAnalysisAction {
  type: '__AI_ANALYSIS__';
  payload: { analysisType: string; [key: string]: unknown };
}

// ==================== Action Definitions ====================

export interface AiActionDef {
  id: string;
  name: string;
  description: string;
  category: 'create' | 'update' | 'delete' | 'analyze' | 'workflow';
  params: { key: string; type: 'string' | 'number' | 'boolean' | 'enum'; required: boolean; enum?: string[]; description: string }[];
  /** Returns dispatch payload if valid, or error string if invalid */
  execute: (state: AppState, params: Record<string, string | undefined>) => Action | AiAnalysisAction | { error: string };
}

// ==================== Create Actions ====================

const createTask: AiActionDef = {
  id: 'create_task',
  name: '创建任务',
  description: 'Create a new task, optionally linking to goal/project',
  category: 'create',
  params: [
    { key: 'title', type: 'string', required: true, description: 'Task title' },
    { key: 'goalId', type: 'string', required: false, description: 'Parent goal ID' },
    { key: 'projectId', type: 'string', required: false, description: 'Parent project ID' },
    { key: 'priority', type: 'enum', required: false, enum: ['S', 'A', 'B', 'C'], description: 'Priority' },
    { key: 'leaderId', type: 'string', required: false, description: 'Assignee member ID' },
    { key: 'dueDate', type: 'string', required: false, description: 'Due date ISO string' },
    { key: 'tags', type: 'string', required: false, description: 'Comma-separated tag names' },
  ],
  execute: (state, p) => {
    if (!p.title || p.title.trim().length < 2) return { error: '标题至少2个字符' };
    return { type: 'ADD_TASK', payload: { title: p.title.trim(), goalId: p.goalId || null, projectId: p.projectId || null, priority: p.priority || 'medium', leaderId: p.leaderId || '', supporterIds: [], tags: p.tags ? p.tags.split(',').map((t: string) => t.trim()) : [], status: 'todo', category: '', startDate: null, dueDate: p.dueDate || null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', blockedBy: [], sprintId: null, parentId: null, discussionThreadId: null, summary: '', teamId: state.currentTeamId || '' } };
  },
};

const createGoal: AiActionDef = {
  id: 'create_goal',
  name: '创建目标',
  description: 'Create a new goal with optional KRs',
  category: 'create',
  params: [
    { key: 'title', type: 'string', required: true, description: 'Goal title' },
    { key: 'type', type: 'enum', required: false, enum: ['strategic', 'operational', 'personal'], description: 'Goal type' },
    { key: 'priority', type: 'enum', required: false, enum: ['S', 'A', 'B', 'C'], description: 'Priority' },
    { key: 'leaderId', type: 'string', required: false, description: 'Goal owner ID' },
    { key: 'startDate', type: 'string', required: false, description: 'Start date' },
    { key: 'endDate', type: 'string', required: false, description: 'End date' },
  ],
  execute: (state, p) => {
    if (!p.title || p.title.trim().length < 2) return { error: '标题至少2个字符' };
    return { type: 'ADD_GOAL', payload: { title: p.title.trim(), type: p.type || 'operational', priority: p.priority || 'medium', leaderId: p.leaderId || '', supporterIds: [], status: 'todo', category: '', startDate: p.startDate || new Date().toISOString().slice(0, 10), endDate: p.endDate || '', parentId: null, level: 0, tags: [], keyResults: [], selectedKRIds: [], attachments: [], trackingRecords: [], repeatCycle: 'none', discussionThreadId: null, summary: '', teamId: state.currentTeamId || '' } };
  },
};

const createComment: AiActionDef = {
  id: 'create_comment',
  name: '添加评论',
  description: 'Add a comment to any item (goal/project/task)',
  category: 'create',
  params: [
    { key: 'itemId', type: 'string', required: true, description: 'Target item ID' },
    { key: 'itemType', type: 'enum', required: true, enum: ['goal', 'project', 'task'], description: 'Item type' },
    { key: 'content', type: 'string', required: true, description: 'Comment text' },
  ],
  execute: (state, p) => {
    if (!p.content || p.content.trim().length < 1) return { error: '评论内容不能为空' };
    return { type: 'ADD_COMMENT', payload: { itemId: p.itemId, itemType: p.itemType, content: p.content.trim(), mentionedMemberIds: [] } };
  },
};

// ==================== Update Actions ====================

const updateTaskStatus: AiActionDef = {
  id: 'update_task_status',
  name: '更新任务状态',
  description: 'Change task status (todo/in_progress/done/blocked)',
  category: 'update',
  params: [
    { key: 'taskId', type: 'string', required: true, description: 'Task ID' },
    { key: 'status', type: 'enum', required: true, enum: ['todo', 'in_progress', 'done', 'blocked', 'cancelled'], description: 'New status' },
  ],
  execute: (state, p) => {
    const task = state.tasks.find(t => t.id === p.taskId);
    if (!task) return { error: `任务 ${p.taskId} 不存在` };
    return { type: 'UPDATE_TASK', payload: { id: p.taskId, updates: { status: p.status } } };
  },
};

const updateTaskPriority: AiActionDef = {
  id: 'update_task_priority',
  name: '更新任务优先级',
  description: 'Change task priority',
  category: 'update',
  params: [
    { key: 'taskId', type: 'string', required: true, description: 'Task ID' },
    { key: 'priority', type: 'enum', required: true, enum: ['S', 'A', 'B', 'C'], description: 'New priority' },
  ],
  execute: (state, p) => {
    return { type: 'UPDATE_TASK', payload: { id: p.taskId, updates: { priority: p.priority } } };
  },
};

const updateTaskAssignee: AiActionDef = {
  id: 'update_task_assignee',
  name: '更新任务负责人',
  description: 'Reassign task to a different member',
  category: 'update',
  params: [
    { key: 'taskId', type: 'string', required: true, description: 'Task ID' },
    { key: 'leaderId', type: 'string', required: true, description: 'New assignee ID' },
  ],
  execute: (state, p) => {
    return { type: 'UPDATE_TASK', payload: { id: p.taskId, updates: { leaderId: p.leaderId } } };
  },
};

const updateTaskDueDate: AiActionDef = {
  id: 'update_task_due_date',
  name: '更新截止日期',
  description: 'Change task due date',
  category: 'update',
  params: [
    { key: 'taskId', type: 'string', required: true, description: 'Task ID' },
    { key: 'dueDate', type: 'string', required: true, description: 'New due date (ISO)' },
  ],
  execute: (state, p) => {
    return { type: 'UPDATE_TASK', payload: { id: p.taskId, updates: { dueDate: p.dueDate } } };
  },
};

const updateGoalStatus: AiActionDef = {
  id: 'update_goal_status',
  name: '更新目标状态',
  description: 'Change goal status',
  category: 'update',
  params: [
    { key: 'goalId', type: 'string', required: true, description: 'Goal ID' },
    { key: 'status', type: 'enum', required: true, enum: ['todo', 'in_progress', 'done', 'blocked', 'cancelled'], description: 'New status' },
  ],
  execute: (state, p) => {
    return { type: 'UPDATE_GOAL', payload: { id: p.goalId, updates: { status: p.status } } };
  },
};

const updateKRValue: AiActionDef = {
  id: 'update_kr_value',
  name: '更新KR当前值',
  description: 'Update KR currentValue',
  category: 'update',
  params: [
    { key: 'goalId', type: 'string', required: true, description: 'Goal ID' },
    { key: 'krId', type: 'string', required: true, description: 'KR ID' },
    { key: 'value', type: 'number', required: true, description: 'New currentValue' },
  ],
  execute: (state, p) => {
    return { type: 'UPDATE_KR', payload: { goalId: p.goalId, krId: p.krId, value: p.value } };
  },
};

const batchUpdateTaskStatus: AiActionDef = {
  id: 'batch_update_task_status',
  name: '批量更新任务状态',
  description: 'Update status for multiple tasks at once',
  category: 'update',
  params: [
    { key: 'taskIds', type: 'string', required: true, description: 'Comma-separated task IDs' },
    { key: 'status', type: 'enum', required: true, enum: ['todo', 'in_progress', 'done', 'blocked'], description: 'New status' },
  ],
  execute: (state, p) => {
    const ids = (p.taskIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (ids.length === 0) return { error: '至少选择一个任务' };
    return { type: 'BATCH_UPDATE', payload: { itemType: 'task', ids, updates: { status: p.status } } };
  },
};

// ==================== Delete Actions ====================

const deleteTask: AiActionDef = {
  id: 'delete_task',
  name: '删除任务',
  description: 'Soft-delete a task',
  category: 'delete',
  params: [
    { key: 'taskId', type: 'string', required: true, description: 'Task ID' },
  ],
  execute: (state, p) => {
    return { type: 'DELETE_TASK', payload: { id: p.taskId } };
  },
};

const deleteComment: AiActionDef = {
  id: 'delete_comment',
  name: '删除评论',
  description: 'Delete a comment',
  category: 'delete',
  params: [
    { key: 'commentId', type: 'string', required: true, description: 'Comment ID' },
  ],
  execute: (state, p) => {
    return { type: 'DELETE_COMMENT', payload: { id: p.commentId } };
  },
};

// ==================== Analyze Actions (read-only, return data) ====================

const getOverdueTasks: AiActionDef = {
  id: 'get_overdue_tasks',
  name: '查询逾期任务',
  description: 'Find all overdue tasks for current user or team',
  category: 'analyze',
  params: [
    { key: 'memberId', type: 'string', required: false, description: 'Filter by member (default: all)' },
  ],
  execute: (state, p) => {
    const now = new Date().toISOString();
    const overdue = state.tasks.filter(t => !t.deletedAt && t.status !== 'done' && t.dueDate && t.dueDate < now);
    const filtered = p.memberId ? overdue.filter(t => t.leaderId === p.memberId) : overdue;
    return { type: '__AI_ANALYSIS__', payload: { analysisType: 'overdue_tasks', count: filtered.length, items: filtered.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status })) } };
  },
};

const getTeamLoad: AiActionDef = {
  id: 'get_team_load',
  name: '查询团队负载',
  description: 'Get workload distribution across team members',
  category: 'analyze',
  params: [],
  execute: (state, p) => {
    const active = state.members.filter(m => !m.deletedAt);
    const loads = active.map(m => {
      const todo = state.tasks.filter(t => !t.deletedAt && t.leaderId === m.id && t.status !== 'done').length;
      const inProgress = state.tasks.filter(t => !t.deletedAt && t.leaderId === m.id && t.status === 'in_progress').length;
      return { id: m.id, name: m.name, todo, inProgress, total: todo + inProgress };
    });
    return { type: '__AI_ANALYSIS__', payload: { analysisType: 'team_load', members: loads } };
  },
};

const getGoalProgress: AiActionDef = {
  id: 'get_goal_progress',
  name: '查询目标进度',
  description: 'Get progress summary for all active goals',
  category: 'analyze',
  params: [
    { key: 'goalId', type: 'string', required: false, description: 'Specific goal ID (default: all active)' },
  ],
  execute: (state, p) => {
    const goals = p.goalId ? state.goals.filter(g => g.id === p.goalId) : state.goals.filter(g => !g.deletedAt && g.status !== 'done');
    return { type: '__AI_ANALYSIS__', payload: { analysisType: 'goal_progress', goals: goals.map(g => ({ id: g.id, title: g.title, progress: g.progress, status: g.status, krCount: g.keyResults.length })) } };
  },
};

const getRiskItems: AiActionDef = {
  id: 'get_risk_items',
  name: '查询风险项',
  description: 'Find high-risk/overdue/blocked items',
  category: 'analyze',
  params: [],
  execute: (state, p) => {
    const now = new Date().toISOString();
    const blocked = state.tasks.filter(t => !t.deletedAt && t.status === 'blocked');
    const overdue = state.tasks.filter(t => !t.deletedAt && t.status !== 'done' && t.dueDate && t.dueDate < now);
    const stalled = state.goals.filter(g => !g.deletedAt && g.status === 'in_progress' && g.progress < 20);
    return { type: '__AI_ANALYSIS__', payload: { analysisType: 'risk_items', blocked: blocked.length, overdue: overdue.length, stalledGoals: stalled.length } };
  },
};

// ==================== Workflow Actions ====================

const smartAssign: AiActionDef = {
  id: 'smart_assign',
  name: '智能指派',
  description: 'Auto-assign task to member with lowest workload',
  category: 'workflow',
  params: [
    { key: 'taskId', type: 'string', required: true, description: 'Task ID to assign' },
  ],
  execute: (state, p) => {
    const active = state.members.filter(m => !m.deletedAt);
    if (active.length === 0) return { error: '团队无活跃成员' };
    const loads = active.map(m => ({ id: m.id, count: state.tasks.filter(t => !t.deletedAt && t.leaderId === m.id && t.status !== 'done').length }));
    loads.sort((a, b) => a.count - b.count);
    return { type: 'UPDATE_TASK', payload: { id: p.taskId, updates: { leaderId: loads[0].id } } };
  },
};

const completeGoalIfAllDone: AiActionDef = {
  id: 'auto_complete_goal',
  name: '目标自动完成',
  description: 'Mark goal as done if all KR targets met',
  category: 'workflow',
  params: [
    { key: 'goalId', type: 'string', required: true, description: 'Goal ID' },
  ],
  execute: (state, p) => {
    const goal = state.goals.find(g => g.id === p.goalId);
    if (!goal) return { error: '目标不存在' };
    const allMet = goal.keyResults.length > 0 && goal.keyResults.every(kr => kr.currentValue >= kr.targetValue);
    if (!allMet) return { error: 'KR尚未全部达成，无法自动完成' };
    return { type: 'UPDATE_GOAL', payload: { id: p.goalId, updates: { status: 'done' } } };
  },
};

// ==================== Registry ====================

export const AI_ACTIONS: AiActionDef[] = [
  createTask, createGoal, createComment,
  updateTaskStatus, updateTaskPriority, updateTaskAssignee, updateTaskDueDate,
  updateGoalStatus, updateKRValue, batchUpdateTaskStatus,
  deleteTask, deleteComment,
  getOverdueTasks, getTeamLoad, getGoalProgress, getRiskItems,
  smartAssign, completeGoalIfAllDone,
];

export const AI_ACTION_MAP = new Map(AI_ACTIONS.map(a => [a.id, a]));

/** Get action summary for AI prompt injection */
export function getAiActionSummary(): string {
  return AI_ACTIONS.map(a => `${a.id}: ${a.name}(${a.params.filter(p => p.required).map(p => p.key).join(', ')})`).join('\n');
}
