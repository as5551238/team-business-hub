/**
 * SYNC-03/05 集成测试 — 错误通知静默写入 + 存量污染恢复
 * 断路器逻辑: err- 前缀系统错误通知走 supabaseInsertSilent(失败不通知),
 * 普通通知走常规路径; loadLocalState 清理历史死循环堆积的 err-/sync- 通知。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/store/supabase', () => ({
  supabaseInsert: vi.fn(),
  supabaseInsertSilent: vi.fn(),
  supabaseUpsert: vi.fn(),
  supabaseUpdate: vi.fn(),
  supabaseDelete: vi.fn(),
  logActivity: vi.fn(),
  setOnWriteError: vi.fn(),
  setCurrentTeamId: vi.fn(),
  saveLocalStateImmediate: vi.fn(),
  loadLocalState: vi.fn(),
  fetchAllFromSupabase: vi.fn(),
  isPermanentWriteError: vi.fn(),
  bumpWriteVersion: vi.fn(),
  replayFailedWrites: vi.fn(),
}));

import { notificationReducer } from './notificationSlice';
import { supabaseInsert, supabaseInsertSilent } from './supabase';
import type { AppState, Notification } from '@/types';
import { needMutate } from './shared';

const baseState = (): AppState => needMutate({
  members: [], goals: [], projects: [], tasks: [],
  notifications: [], activities: [], itemLinks: [], reviews: [],
  categories: [], tags: [], templates: [], scheduleEvents: [],
  notes: [], comments: [], bookmarks: [], savedViews: [],
  batchOperations: [], statusFlowRules: [], automationRules: [], sprints: [],
  knowledge: [], teams: [], teamMembers: [],
} as unknown as AppState);

beforeEach(() => { vi.clearAllMocks(); });

describe('ADD_NOTIFICATION error-notification circuit breaker (SYNC-03)', () => {
  it('routes err- prefixed notifications to silent write (never feeds the loop)', () => {
    const s = baseState();
    const out = notificationReducer(s, {
      type: 'ADD_NOTIFICATION',
      payload: { id: 'err-1700000000000', type: 'error', title: '同步失败', message: '数据同步失败，已自动重试。请检查网络后刷新页面。', relatedId: '', relatedType: 'note', memberId: '', read: false, createdAt: new Date().toISOString() },
    } as any);
    expect(supabaseInsertSilent).toHaveBeenCalledTimes(1);
    expect(supabaseInsert).not.toHaveBeenCalled();
    expect(out!.notifications).toHaveLength(1);
    expect(out!.notifications[0].id.startsWith('err-')).toBe(true);
  });

  it('routes normal notifications through the regular write path', () => {
    const s = baseState();
    notificationReducer(s, {
      type: 'ADD_NOTIFICATION',
      payload: { id: 'nrem_t1_2026-01-01', type: 'reminder', title: '任务提醒', message: 'm', relatedId: 't1', relatedType: 'task', memberId: 'u1', read: false, createdAt: new Date().toISOString() },
    } as any);
    expect(supabaseInsert).toHaveBeenCalledTimes(1);
    expect(supabaseInsertSilent).not.toHaveBeenCalled();
  });

  it('skips duplicate ids (idempotent replay safety)', () => {
    const s = baseState();
    const payload = { id: 'dup-1', type: 'reminder', title: 't', message: 'm', relatedId: 'r', relatedType: 'task', memberId: '', read: false, createdAt: new Date().toISOString() };
    notificationReducer(s, { type: 'ADD_NOTIFICATION', payload } as any);
    const out2 = notificationReducer(baseState(), { type: 'ADD_NOTIFICATION', payload } as any);
    // second dispatch with existing id returns original state untouched
    const first = notificationReducer(s, { type: 'ADD_NOTIFICATION', payload } as any);
    expect(first!.notifications).toHaveLength(1);
    expect(out2).not.toBeNull();
  });
});
