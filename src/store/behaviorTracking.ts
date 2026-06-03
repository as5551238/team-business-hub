// P0-W1: 行为事件采集模块 — fire-and-forget，不阻塞主流程
// 注入点: useStore.tsx trackedDispatch 内
// 存储: Supabase behavior_events 表

import { getSupabaseClient } from '@/supabase/client';
import type { Action } from './types';

// 当前用户ID缓存（由 useStore 设置）
let _currentUserId: string | null = null;
export function setBehaviorUserId(userId: string | null) { _currentUserId = userId; }

// 防抖写入队列（100ms 窗口批量写入）
let _queue: Array<{
  userId: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  metadata: Record<string, unknown>;
}> = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushQueue() {
  if (_queue.length === 0) return;
  const items = [..._queue];
  _queue = [];
  const sb = getSupabaseClient();
  if (!sb) return;
  sb.from('behavior_events')
    .insert(items.map(i => ({
      user_id: i.userId,
      event_type: i.eventType,
      entity_type: i.entityType || null,
      entity_id: i.entityId || null,
      metadata: i.metadata,
    })))
    .then(() => {})  // fire-and-forget
    .catch(() => {}); // 静默失败，不影响用户体验
}

function enqueue(event: typeof _queue[0]) {
  _queue.push(event);
  if (!_flushTimer) {
    _flushTimer = setTimeout(() => { _flushTimer = null; flushQueue(); }, 100);
  }
}

// Action → 行为事件映射
const ACTION_BEHAVIOR_MAP: Record<string, (action: Action) => {
  eventType: string;
  entityType?: string;
  entityId?: string;
  metadata: Record<string, unknown>;
} | null> = {
  // 任务行为
  ADD_TASK: (a) => ({
    eventType: 'task.created',
    entityType: 'task',
    entityId: a.payload?.id,
    metadata: { priority: a.payload?.priority, hasGoal: !!a.payload?.goalId },
  }),
  UPDATE_TASK: (a) => {
    const p = a.payload;
    if (!p) return null;
    // 任务完成
    if (p.status === 'done' || p.changes?.status === 'done') {
      return {
        eventType: 'task.completed',
        entityType: 'task',
        entityId: p.id || p.changes?.id,
        metadata: { wasOverdue: p.changes?.overdue || false },
      };
    }
    // 任务逾期标记
    if (p.changes?.overdue === true) {
      return {
        eventType: 'task.overdue',
        entityType: 'task',
        entityId: p.id,
        metadata: { overdueDays: p.changes?.overdueDays || 0 },
      };
    }
    // 任务转让
    if (p.changes?.leaderId && p.id) {
      return {
        eventType: 'task.reassigned',
        entityType: 'task',
        entityId: p.id,
        metadata: { toLeaderId: p.changes.leaderId },
      };
    }
    // 其他任务更新（忽略，避免噪音）
    return null;
  },
  DELETE_TASK: (a) => ({
    eventType: 'task.deleted',
    entityType: 'task',
    entityId: a.payload,
    metadata: {},
  }),

  // 目标行为
  ADD_GOAL: (a) => ({
    eventType: 'goal.created',
    entityType: 'goal',
    entityId: a.payload?.id,
    metadata: {},
  }),
  UPDATE_GOAL: (a) => {
    const p = a.payload;
    if (!p) return null;
    if (p.changes?.status === 'done' || p.changes?.status === 'completed') {
      return {
        eventType: 'goal.completed',
        entityType: 'goal',
        entityId: p.id,
        metadata: {},
      };
    }
    // 进度更新
    if (typeof p.changes?.progress === 'number') {
      return {
        eventType: 'goal.progress_updated',
        entityType: 'goal',
        entityId: p.id,
        metadata: { newProgress: p.changes.progress },
      };
    }
    return null;
  },

  // KR更新
  UPDATE_KEY_RESULT: (a) => ({
    eventType: 'kr.score_updated',
    entityType: 'kr',
    entityId: a.payload?.id,
    metadata: {
      oldValue: a.payload?.changes?.currentValue,
      newValue: a.payload?.currentValue,
    },
  }),

  // 协作行为
  ADD_COMMENT: (a) => ({
    eventType: 'comment.created',
    entityType: a.payload?.targetType || 'task',
    entityId: a.payload?.targetId,
    metadata: { hasMention: !!a.payload?.content?.includes('@') },
  }),

  // 子任务
  TOGGLE_SUBTASK: (a) => ({
    eventType: 'subtask.toggled',
    entityType: 'task',
    entityId: a.payload?.taskId,
    metadata: { subtaskDone: a.payload?.done },
  }),

  // P1: 通知/提醒交互
  MARK_NOTIFICATION_READ: (a) => ({
    eventType: 'notification.read',
    entityType: 'notification',
    entityId: a.payload,
    metadata: {},
  }),

  // P1: 成员加入/退出
  ADD_MEMBER: (a) => ({
    eventType: 'member.joined',
    entityType: 'member',
    entityId: a.payload?.id,
    metadata: { role: a.payload?.role },
  }),

  // P2: 行业选择
  INDUSTRY_SELECTED: (a) => ({
    eventType: 'industry.selected',
    entityType: 'industry',
    entityId: a.payload?.industryKey,
    metadata: {},
  }),

  // P3: 预测查看
  VIEW_PREDICTION: (a) => ({
    eventType: 'prediction.viewed',
    entityType: 'prediction',
    entityId: a.payload?.predictionType,
    metadata: {},
  }),
};

// 核心入口：在 trackedDispatch 的 dispatch(action) 之后调用
export function trackBehavior(action: Action) {
  if (!_currentUserId) return;
  const mapper = ACTION_BEHAVIOR_MAP[action.type];
  if (!mapper) return;
  const event = mapper(action);
  if (!event) return;
  enqueue({
    userId: _currentUserId,
    ...event,
  });
}

// AI建议追踪（直接调用，不经过dispatch）
export function trackAISuggestion(suggestionId: string, accepted: boolean) {
  if (!_currentUserId) return;
  enqueue({
    userId: _currentUserId,
    eventType: accepted ? 'ai.suggestion.accepted' : 'ai.suggestion.rejected',
    entityType: 'ai_suggestion',
    entityId: suggestionId,
    metadata: {},
  });
}
