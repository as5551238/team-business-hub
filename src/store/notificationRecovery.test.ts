/**
 * SYNC-05 恢复逻辑测试 — 使用真实 supabase.ts 模块(不 mock)验证
 * loadLocalState 对历史死循环堆积的 err-/sync- 系统通知做一次性清理。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadLocalState } from './supabase';
import { STORAGE_KEY } from './types';
import type { Notification } from '@/types';

beforeEach(() => { localStorage.clear(); });

describe('loadLocalState polluted-notification recovery (SYNC-05)', () => {
  it('keeps only recent err-/sync- system notifications when thousands accumulated', () => {
    const notifs: Notification[] = [];
    for (let i = 0; i < 3000; i++) {
      notifs.push({ id: `err-${i}`, type: 'error', title: '同步失败', message: '数据同步失败，已自动重试。', relatedId: '', relatedType: 'note', memberId: '', read: false, createdAt: '2026-10-01T00:00:00Z' } as Notification);
    }
    notifs.push({ id: 'biz-1', type: 'reminder', title: '正常业务通知', message: 'm', relatedId: 't1', relatedType: 'task', memberId: 'u1', read: false, createdAt: '2026-10-20T00:00:00Z' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      members: [], goals: [], projects: [], tasks: [],
      notifications: notifs, activities: [], itemLinks: [], reviews: [],
      categories: [], tags: [], templates: [], scheduleEvents: [],
      notes: [], comments: [], bookmarks: [], savedViews: [],
    }));
    const state = loadLocalState();
    const errCount = state.notifications.filter(n => String(n.id).startsWith('err-')).length;
    const bizKept = state.notifications.some(n => n.id === 'biz-1');
    expect(errCount).toBeLessThanOrEqual(10);  // system errors capped
    expect(bizKept).toBe(true);                // business notifications preserved
  });

  it('leaves clean states untouched', () => {
    const few: Notification[] = Array.from({ length: 5 }, (_, i) =>
      ({ id: `err-${i}`, type: 'error', title: 't', message: 'm', relatedId: '', relatedType: 'note', memberId: '', read: false, createdAt: '2026-10-01T00:00:00Z' } as Notification));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      members: [], goals: [], projects: [], tasks: [],
      notifications: few, activities: [], itemLinks: [], reviews: [],
      categories: [], tags: [], templates: [], scheduleEvents: [],
      notes: [], comments: [], bookmarks: [], savedViews: [],
    }));
    const state = loadLocalState();
    expect(state.notifications.filter(n => String(n.id).startsWith('err-')).length).toBe(5);
  });

  it('round-trips persisted state after recovery (load does not corrupt data)', () => {
    const notifs: Notification[] = [
      { id: 'biz-1', type: 'overdue', title: '逾期', message: 'm', relatedId: 't1', relatedType: 'task', memberId: 'u1', read: false, createdAt: '2026-10-20T00:00:00Z' } as Notification,
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      members: [], goals: [], projects: [], tasks: [],
      notifications: notifs, activities: [], itemLinks: [], reviews: [],
      categories: [], tags: [], templates: [], scheduleEvents: [],
      notes: [], comments: [], bookmarks: [], savedViews: [],
    }));
    const state = loadLocalState();
    expect(state.notifications[0].title).toBe('逾期');
    expect(Array.isArray(state.members)).toBe(true);
  });
});
