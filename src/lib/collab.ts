/**
 * CRDT 协作基座 — 轻量级实时协作框架
 * Phase 3-4: CRDT Collaboration
 *
 * 设计原则：
 * - 无需外部服务器（基于 Supabase Realtime Broadcast）
 * - 字段级 Last-Writer-Wins (LWW) + 向量时钟冲突解决
 * - 协作感知：在线状态、光标位置、编辑锁
 * - 与现有 Zustand store 无缝集成
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/supabase/client';
import { handleError } from '@/lib/errorHandler';

// collabDispatch bridge: injected by StoreProvider at runtime to avoid circular dependency.
// Uses the same late-injection pattern as shared.ts _asyncDispatch.
let _collabDispatch: ((action: { type: string; payload?: unknown }) => void) | null = null;
export function setCollabDispatch(fn: (action: { type: string; payload?: unknown }) => void) { _collabDispatch = fn; }
function getCollabDispatch(): ((action: { type: string; payload?: unknown }) => void) | null { return _collabDispatch; }

// ===== 类型定义 =====

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { entity: string; entityId: string; field?: string };
  typingOn?: { itemId: string; itemType: string } | null;
  editingOn?: { itemId: string; itemType: string; field?: string } | null;
  lastActive: number;
}

export interface CollabOperation {
  type: 'update' | 'create' | 'delete';
  entity: 'goal' | 'project' | 'task' | 'member';
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  userId: string;
  timestamp: number;
  vectorClock: Record<string, number>;
}

export interface ConflictResolution {
  strategy: 'lww' | 'merge' | 'manual';
  winner: CollabOperation;
  loser?: CollabOperation;
  reason: string;
}

// ===== 常量 =====

const PRESENCE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f97316', '#8b5cf6',
  '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#06b6d4',
];

const HEARTBEAT_INTERVAL = 5000; // 5秒心跳
const PRESENCE_TIMEOUT = 15000; // 15秒无心跳视为离线

// ===== 向量时钟 =====

export class VectorClock {
  private clock: Record<string, number> = {};

  increment(userId: string): Record<string, number> {
    this.clock[userId] = (this.clock[userId] || 0) + 1;
    return { ...this.clock };
  }

  merge(other: Record<string, number>): Record<string, number> {
    for (const [key, value] of Object.entries(other)) {
      this.clock[key] = Math.max(this.clock[key] || 0, value);
    }
    return { ...this.clock };
  }

  happensBefore(other: Record<string, number>): boolean {
    let atLeastOneLess = false;
    const allKeys = new Set([...Object.keys(this.clock), ...Object.keys(other)]);
    for (const key of allKeys) {
      const a = this.clock[key] || 0;
      const b = other[key] || 0;
      if (a > b) return false;
      if (a < b) atLeastOneLess = true;
    }
    return atLeastOneLess;
  }

  isConcurrent(other: Record<string, number>): boolean {
    return !this.happensBefore(other) && !((): boolean => {
      let atLeastOneLess = false;
      const allKeys = new Set([...Object.keys(other), ...Object.keys(this.clock)]);
      for (const key of allKeys) {
        const a = other[key] || 0;
        const b = this.clock[key] || 0;
        if (a > b) return false;
        if (a < b) atLeastOneLess = true;
      }
      return atLeastOneLess;
    })();
  }

  getClock(): Record<string, number> {
    return { ...this.clock };
  }
}

// ===== LWW 寄存器 =====

export class LWWRegister<T> {
  private value: T;
  private timestamp: number;
  private userId: string;

  constructor(initialValue: T, userId: string) {
    this.value = initialValue;
    this.timestamp = Date.now();
    this.userId = userId;
  }

  set(value: T, userId: string, timestamp?: number): boolean {
    const ts = timestamp || Date.now();
    // P3#21 fix: use > instead of >= for timestamp comparison; add userId as secondary tiebreaker for equal timestamps
    if (ts > this.timestamp || (ts === this.timestamp && userId > this.userId)) {
      this.value = value;
      this.timestamp = ts;
      this.userId = userId;
      return true;
    }
    return false;
  }

  get(): { value: T; timestamp: number; userId: string } {
    return { value: this.value, timestamp: this.timestamp, userId: this.userId };
  }
}

// ===== 冲突解决器 =====

export function resolveConflict(local: CollabOperation, remote: CollabOperation): ConflictResolution {
  // 字符串/数字字段用 LWW
  if (typeof remote.newValue === 'string' || typeof remote.newValue === 'number') {
    if (remote.timestamp > local.timestamp) {
      return { strategy: 'lww', winner: remote, loser: local, reason: '远程操作时间戳更新' };
    }
    return { strategy: 'lww', winner: local, loser: remote, reason: '本地操作时间戳更新' };
  }

  // 数组字段用 merge（合并去重）
  if (Array.isArray(local.newValue) && Array.isArray(remote.newValue)) {
    const merged = [...new Set([...local.newValue, ...remote.newValue])];
    const mergedOp: CollabOperation = {
      ...remote,
      newValue: merged,
      timestamp: Math.max(local.timestamp, remote.timestamp),
    };
    return { strategy: 'merge', winner: mergedOp, reason: '数组字段合并去重' };
  }

  // 对象字段用深度合并
  if (typeof local.newValue === 'object' && typeof remote.newValue === 'object' && local.newValue !== null && remote.newValue !== null) {
    const merged = { ...local.newValue, ...remote.newValue };
    const mergedOp: CollabOperation = {
      ...remote,
      newValue: merged,
      timestamp: Math.max(local.timestamp, remote.timestamp),
    };
    return { strategy: 'merge', winner: mergedOp, reason: '对象字段深度合并' };
  }

  // 其他情况 LWW
  return { strategy: 'lww', winner: remote.timestamp >= local.timestamp ? remote : local, reason: '默认Last-Writer-Wins' };
}

// ===== 协作感知 Hook =====

export function useCollabPresence(userId: string, userName: string) {
  const [onlineUsers, setOnlineUsers] = useState<CollabUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const colorRef = useRef(PRESENCE_COLORS[Math.abs(hashCode(userId)) % PRESENCE_COLORS.length]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null); // P3#19 fix: track heartbeat interval

  useEffect(() => {
    let mounted = true;

    const setupPresence = async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb || !mounted) return;

        const channel = sb.channel('collab-presence', {
          config: { presence: { key: userId } },
        });

        channel.on('presence', { event: 'sync' }, () => {
          if (!mounted) return;
          const state = channel.presenceState();
          const users: CollabUser[] = [];
          for (const [id, presences] of Object.entries(state)) {
            const p = presences[0] as Record<string, unknown>;
            if (p && Date.now() - (p.lastActive as number) < PRESENCE_TIMEOUT) {
              users.push({
                id,
                name: (p.name as string) || id.slice(0, 8),
                color: (p.color as string) || '#6b7280',
                cursor: p.cursor as CollabUser['cursor'],
                lastActive: p.lastActive as number,
              });
            }
          }
          setOnlineUsers(users);
        });

        const self: Omit<CollabUser, 'lastActive'> & { lastActive: number } = {
          id: userId,
          name: userName,
          color: colorRef.current,
          lastActive: Date.now(),
        };

        channel.subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await channel.track(self);
          }
        });

        channelRef.current = channel;

        // 心跳
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (mounted) {
            channel.track({ ...self, lastActive: Date.now() });
          }
        }, HEARTBEAT_INTERVAL);
      } catch (e) { handleError(e, { module: 'collab', operation: 'SETUP_PRESENCE', severity: 'debug' }); }
    };

    setupPresence();

    return () => {
      mounted = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (channelRef.current) {
        try { channelRef.current.unsubscribe(); } catch (e) { handleError(e, { module: 'collab', operation: 'UNSUBSCRIBE_PRESENCE', severity: 'debug' }); }
      }
    };
  }, [userId, userName]);

  const updateCursor = useCallback((cursor: CollabUser['cursor']) => {
    if (channelRef.current) {
      channelRef.current.track({
        id: userId,
        name: userName,
        color: colorRef.current,
        cursor,
        lastActive: Date.now(),
      });
    }
  }, [userId, userName]);

  const trackTyping = useCallback((typingOn: CollabUser['typingOn']) => {
    if (channelRef.current) {
      channelRef.current.track({
        id: userId,
        name: userName,
        color: colorRef.current,
        cursor: undefined,
        typingOn,
        lastActive: Date.now(),
      });
    }
  }, [userId, userName]);

  const trackEditing = useCallback((editingOn: CollabUser['editingOn']) => {
    if (channelRef.current) {
      channelRef.current.track({
        id: userId,
        name: userName,
        color: colorRef.current,
        cursor: undefined,
        editingOn,
        lastActive: Date.now(),
      });
    }
  }, [userId, userName]);

  return { onlineUsers, updateCursor, trackTyping, trackEditing, myColor: colorRef.current };
}

// ===== 操作广播 Hook =====

export function useCollabBroadcast(userId: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const vectorClockRef = useRef(new VectorClock());

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb || !mounted) return;

        const channel = sb.channel('collab-ops', { config: { broadcast: { self: false } } });

        // Listen for remote collab operations
        channel.on('broadcast', { event: 'collab-op' }, (payload: { payload: CollabOperation }) => {
          const op = payload.payload;
          if (!op || op.userId === userId) return;
          // Apply remote collab operation via the store dispatch bridge
          try {
            const dispatch = getCollabDispatch();
            if (!dispatch) return;
            const tableName = op.entity === 'goal' ? 'goals' : op.entity === 'project' ? 'projects' : op.entity === 'task' ? 'tasks' : null;
            if (!tableName) return;
            if (op.type === 'update' && op.field && op.newValue !== undefined) {
              dispatch({ type: 'REALTIME_UPSERT', payload: { table: tableName, item: { id: op.entityId, [op.field]: op.newValue, updatedAt: new Date(op.timestamp).toISOString() } } });
            } else if (op.type === 'delete') {
              dispatch({ type: 'REALTIME_DELETE', payload: { table: tableName, id: op.entityId } });
            }
          } catch (e) { handleError(e, { module: 'collab', operation: 'HANDLE_BROADCAST_OP', severity: 'debug' }); }
        });

        channelRef.current = channel;
        channel.subscribe();
      } catch (e) { handleError(e, { module: 'collab', operation: 'SETUP_BROADCAST', severity: 'debug' }); }
    };

    setup();
    return () => {
      mounted = false;
      if (channelRef.current) {
        try { channelRef.current.unsubscribe(); } catch (e) { handleError(e, { module: 'collab', operation: 'UNSUBSCRIBE_BROADCAST', severity: 'debug' }); }
        channelRef.current = null;
      }
    };
  }, [userId]);

  const broadcastOp = useCallback((op: Omit<CollabOperation, 'userId' | 'timestamp' | 'vectorClock'>) => {
    const fullOp: CollabOperation = {
      ...op,
      userId,
      timestamp: Date.now(),
      vectorClock: vectorClockRef.current.increment(userId),
    };

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'collab-op',
        payload: fullOp,
      });
    }

    return fullOp;
  }, [userId]);

  return { broadcastOp, vectorClock: vectorClockRef.current };
}

// ===== 字段级编辑锁 Hook =====

export interface FieldLock {
  itemId: string;
  itemType: string;
  field: string;
  userId: string;
  userName: string;
  color: string;
  acquiredAt: number;
}

const FIELD_LOCK_TIMEOUT = 30000; // 30s自动释放

export function useFieldEditLock(userId: string, userName: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const colorRef = useRef(PRESENCE_COLORS[Math.abs(hashCode(userId)) % PRESENCE_COLORS.length]);
  const [fieldLocks, setFieldLocks] = useState<FieldLock[]>([]);
  const myLocksRef = useRef<Set<string>>(new Set()); // track which locks I hold

  useEffect(() => {
    let mounted = true;
    const setup = async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb || !mounted) return;
        const channel = sb.channel('collab-field-locks', { config: { broadcast: { self: true } } });
        channel.on('broadcast', { event: 'field-lock' }, (payload: { payload: FieldLock & { action: 'acquire' | 'release' } }) => {
          if (!mounted) return;
          const data = payload.payload;
          const key = `${data.itemId}:${data.field}`;
          if (data.action === 'acquire' && data.userId !== userId) {
            setFieldLocks(prev => {
              const filtered = prev.filter(l => !(l.itemId === data.itemId && l.field === data.field));
              return [...filtered, { itemId: data.itemId, itemType: data.itemType, field: data.field, userId: data.userId, userName: data.userName, color: data.color, acquiredAt: data.acquiredAt }];
            });
          } else if (data.action === 'release') {
            setFieldLocks(prev => prev.filter(l => !(l.itemId === data.itemId && l.field === data.field)));
          }
        });
        channelRef.current = channel;
        channel.subscribe();
      } catch (e) { handleError(e, { module: 'collab', operation: 'SETUP_FIELD_LOCKS', severity: 'debug' }); }
    };
    setup();
    // Auto-release my locks on unmount
    return () => {
      mounted = false;
      myLocksRef.current.forEach(key => {
        const [itemId, field] = key.split(':');
        try { channelRef.current?.send({ type: 'broadcast', event: 'field-lock', payload: { itemId, itemType: '', field, userId, userName, color: colorRef.current, acquiredAt: Date.now(), action: 'release' as const } }); } catch (_) { /* noop */ }
      });
      myLocksRef.current.clear();
      try { channelRef.current?.unsubscribe(); } catch (_) { /* noop */ }
    };
  }, [userId, userName]);

  const acquireLock = useCallback((itemId: string, itemType: string, field: string) => {
    const lock: FieldLock & { action: 'acquire' } = { itemId, itemType, field, userId, userName, color: colorRef.current, acquiredAt: Date.now(), action: 'acquire' };
    channelRef.current?.send({ type: 'broadcast', event: 'field-lock', payload: lock });
    myLocksRef.current.add(`${itemId}:${field}`);
  }, [userId, userName]);

  const releaseLock = useCallback((itemId: string, field: string) => {
    channelRef.current?.send({ type: 'broadcast', event: 'field-lock', payload: { itemId, itemType: '', field, userId, userName, color: colorRef.current, acquiredAt: Date.now(), action: 'release' as const } });
    myLocksRef.current.delete(`${itemId}:${field}`);
  }, [userId, userName]);

  const getFieldLock = useCallback((itemId: string, field: string): FieldLock | undefined => {
    return fieldLocks.find(l => l.itemId === itemId && l.field === field && (Date.now() - l.acquiredAt < FIELD_LOCK_TIMEOUT));
  }, [fieldLocks]);

  const isFieldLockedByOther = useCallback((itemId: string, field: string): boolean => {
    const lock = getFieldLock(itemId, field);
    return lock !== undefined && lock.userId !== userId;
  }, [getFieldLock, userId]);

  return { fieldLocks, acquireLock, releaseLock, getFieldLock, isFieldLockedByOther };
}

// ===== 冲突历史管理 =====

export interface ConflictRecord {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  localValue: string;
  remoteValue: string;
  resolvedValue: string;
  strategy: 'lww' | 'merge' | 'manual';
  remoteUser: string;
  remoteUserId: string;
  timestamp: number;
}

const MAX_CONFLICT_HISTORY = 100;
let _conflictHistory: ConflictRecord[] = [];
let _conflictListeners: Set<() => void> = new Set();

export function recordConflict(record: Omit<ConflictRecord, 'id'>) {
  const entry: ConflictRecord = { ...record, id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  _conflictHistory = [entry, ..._conflictHistory].slice(0, MAX_CONFLICT_HISTORY);
  _conflictListeners.forEach(l => l());
}

export function getConflictHistory(): ConflictRecord[] { return _conflictHistory; }

export function subscribeConflicts(listener: () => void): () => void {
  _conflictListeners.add(listener);
  return () => { _conflictListeners.delete(listener); };
}

// ===== 辅助函数 =====

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
