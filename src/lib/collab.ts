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

// ===== 类型定义 =====

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { entity: string; entityId: string; field?: string };
  lastActive: number;
}

export interface CollabOperation {
  type: 'update' | 'create' | 'delete';
  entity: 'goal' | 'project' | 'task' | 'member';
  entityId: string;
  field: string;
  oldValue: any;
  newValue: any;
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
    if (ts >= this.timestamp) {
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
  const channelRef = useRef<any>(null);
  const colorRef = useRef(PRESENCE_COLORS[Math.abs(hashCode(userId)) % PRESENCE_COLORS.length]);

  useEffect(() => {
    let mounted = true;

    const setupPresence = async () => {
      try {
        const { getSupabaseClient } = await import('@/supabase/client');
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
            const p = presences[0] as any;
            if (p && Date.now() - p.lastActive < PRESENCE_TIMEOUT) {
              users.push({
                id,
                name: p.name || id.slice(0, 8),
                color: p.color || '#6b7280',
                cursor: p.cursor,
                lastActive: p.lastActive,
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
        const heartbeat = setInterval(() => {
          if (mounted) {
            channel.track({ ...self, lastActive: Date.now() });
          }
        }, HEARTBEAT_INTERVAL);

        return () => {
          clearInterval(heartbeat);
          channel.unsubscribe();
        };
      } catch {}
    };

    setupPresence();

    return () => {
      mounted = false;
      if (channelRef.current) {
        try { channelRef.current.unsubscribe(); } catch {}
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

  return { onlineUsers, updateCursor, myColor: colorRef.current };
}

// ===== 操作广播 Hook =====

export function useCollabBroadcast(userId: string) {
  const channelRef = useRef<any>(null);
  const vectorClockRef = useRef(new VectorClock());

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        const { getSupabaseClient } = await import('@/supabase/client');
        const sb = getSupabaseClient();
        if (!sb || !mounted) return;

        const channel = sb.channel('collab-ops');
        channelRef.current = channel;
        channel.subscribe();
      } catch {}
    };

    setup();
    return () => { mounted = false; };
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
