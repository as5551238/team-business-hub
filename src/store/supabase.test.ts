/**
 * SYNC-01/02 单元测试 — 通知云端写入规范化 + 确定性错误分类
 * 背景: 线上 DB notifications 表 check 约束 type∈5值 / related_type∈{task,goal,project},
 * 前端存在 error/sync/mentioned/note/knowledge 等扩展值, 未规范化导致 400 → 自激通知死循环。
 */
import { describe, it, expect } from 'vitest';
import { normalizeNotificationForDb, isPermanentWriteError } from './supabase';

describe('normalizeNotificationForDb (SYNC-01)', () => {
  it('keeps DB-legal values untouched (idempotent)', () => {
    const out = normalizeNotificationForDb({ id: 'n1', type: 'reminder', relatedType: 'task' });
    expect(out.type).toBe('reminder');
    expect(out.relatedType).toBe('task');
    // NOT NULL backfills are additive only — they do not alter provided values
    const full = { id: 'n2', type: 'goal_update', relatedType: 'project', relatedId: 'r1', teamId: 't-team', read: true, createdAt: '2026-01-01T00:00:00Z' };
    expect(normalizeNotificationForDb(full)).toEqual(full);
    // idempotent on second pass
    expect(normalizeNotificationForDb(out)).toEqual(out);
  });

  it('maps illegal types used by the app to DB-legal types', () => {
    expect(normalizeNotificationForDb({ type: 'error' }).type).toBe('goal_update');
    expect(normalizeNotificationForDb({ type: 'sync' }).type).toBe('reminder');
    expect(normalizeNotificationForDb({ type: 'mentioned' }).type).toBe('assigned');
    expect(normalizeNotificationForDb({ type: 'mention' }).type).toBe('assigned');
    expect(normalizeNotificationForDb({ type: 'system' }).type).toBe('goal_update');
    expect(normalizeNotificationForDb({ type: 'risk_alert' }).type).toBe('overdue');
    expect(normalizeNotificationForDb({ type: 'info' }).type).toBe('goal_update');
    expect(normalizeNotificationForDb({ type: 'approval' }).type).toBe('assigned');
    expect(normalizeNotificationForDb({ type: 'comment' }).type).toBe('assigned');
  });

  it('maps illegal relatedType values to DB-legal ones', () => {
    expect(normalizeNotificationForDb({ type: 'reminder', relatedType: 'note' }).relatedType).toBe('task');
    expect(normalizeNotificationForDb({ type: 'reminder', relatedType: 'knowledge' }).relatedType).toBe('goal');
    expect(normalizeNotificationForDb({ type: 'reminder', relatedType: 'member' }).relatedType).toBe('task');
    expect(normalizeNotificationForDb({ type: 'reminder', relatedType: 'sprint' }).relatedType).toBe('goal');
  });

  it('falls back to safe defaults for unknown/missing values', () => {
    const out = normalizeNotificationForDb({ id: 'x', type: 'whatever-new-type', relatedType: 'whatever' });
    expect(out.type).toBe('goal_update');
    expect(out.relatedType).toBe('task');
    const missing = normalizeNotificationForDb({ id: 'y' });
    expect(missing.type).toBe('goal_update');
    expect(missing.relatedType).toBe('task');
  });

  it('supports snake_case input (serialized replay path)', () => {
    const out = normalizeNotificationForDb({ type: 'error', related_type: 'knowledge' });
    expect(out.type).toBe('goal_update');
    expect(out.relatedType).toBe('goal');
  });

  it('backfills NOT NULL columns for automaton payloads that omit them (SYNC-08)', () => {
    // Exact shape dispatched by aiAutomaton (no relatedId/teamId/read/createdAt)
    const out = normalizeNotificationForDb({
      id: 'automaton-risk-123', type: 'risk_alert', title: '自动风险扫描',
      message: '发现 31 个风险项', read: false,
    });
    expect(out.type).toBe('overdue');
    expect(out.relatedType).toBe('task');
    expect(out.relatedId).toBe('');                    // related_id NOT NULL — must exist
    expect(out.teamId).toBe('__default__');             // team_id NOT NULL — falls back
    expect(out.read).toBe(false);
    expect(typeof out.createdAt).toBe('string');
  });

  it('preserves all other notification fields', () => {
    const out = normalizeNotificationForDb({
      id: 'n9', type: 'sync', title: 't', message: 'm', relatedId: 'r1',
      relatedType: 'note', memberId: 'm1', read: false, createdAt: '2026-01-01',
    });
    expect(out.id).toBe('n9');
    expect(out.title).toBe('t');
    expect(out.relatedId).toBe('r1');
    expect(out.read).toBe(false);
  });
});

describe('isPermanentWriteError (SYNC-02)', () => {
  it('treats PostgREST 4xx statuses as permanent (no retry/queue)', () => {
    expect(isPermanentWriteError({ status: 400, code: '23514', message: 'violates check constraint' })).toBe(true);
    expect(isPermanentWriteError({ status: 403, code: '42501', message: 'rls' })).toBe(true);
    expect(isPermanentWriteError({ status: 404, code: 'PGRST205', message: 'not found' })).toBe(true);
    expect(isPermanentWriteError({ status: 409, message: 'conflict' })).toBe(true);
    expect(isPermanentWriteError({ status: 422, message: 'unprocessable' })).toBe(true);
  });

  it('treats PG constraint/schema error codes as permanent even without status', () => {
    expect(isPermanentWriteError({ code: '23514', message: 'check constraint' })).toBe(true); // check_violation
    expect(isPermanentWriteError({ code: '23503', message: 'fk violation' })).toBe(true);      // foreign_key_violation
    expect(isPermanentWriteError({ code: 'PGRST204', message: 'column not found' })).toBe(true);
  });

  it('treats network/5xx/timeout errors as retryable', () => {
    expect(isPermanentWriteError({ status: 500, message: 'server error' })).toBe(false);
    expect(isPermanentWriteError({ status: 502, message: 'bad gateway' })).toBe(false);
    expect(isPermanentWriteError(new TypeError('fetch failed'))).toBe(false);
    expect(isPermanentWriteError(new Error('network timeout'))).toBe(false);
    expect(isPermanentWriteError(null)).toBe(false);
  });
});
