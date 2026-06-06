/**
 * useFeatureGate — 付费门禁 Hook
 *
 * 一行代码即可在任何组件中实施功能门禁：
 *   const gate = useFeatureGate('cloudAiPerDay');
 *   if (!gate.allowed) return <UpgradeGate .../>;
 *
 * 自动从 store 读取当前套餐和用量，返回结构化结果。
 */
import { useMemo, useCallback, useState } from 'react';
import { useStore } from '@/store/useStore';
import { checkLimit, shouldShowUpgrade, getTeamPlan, type PlanLimitKey } from '@/lib/featureGating';
import type { PlanTier } from '@/types';

export interface GateResult {
  allowed: boolean;
  current: number;
  max: number | boolean;
  tier: PlanTier;
  showUpgrade: boolean;
  /** 针对数值型门禁：当前用量是否接近上限(>=80%) */
  nearLimit: boolean;
}

export function useFeatureGate(feature: PlanLimitKey, currentValue?: number): GateResult {
  const { state } = useStore();
  const teamId = state.currentUser?.teamId || state.currentUser?.id || '';
  const subs = state.subscriptions || [];

  return useMemo(() => {
    const limit = checkLimit(feature, teamId, subs, currentValue);
    const nearLimit = typeof limit.max === 'number'
      ? limit.current >= limit.max * 0.8
      : false;
    return {
      allowed: limit.allowed,
      current: limit.current,
      max: limit.max,
      tier: limit.tier,
      showUpgrade: shouldShowUpgrade(feature, teamId, subs),
      nearLimit,
    };
  }, [feature, teamId, subs, currentValue]);
}

/** AI 日调用计数（localStorage 存储，当日有效） */
const AI_CALL_KEY = 'tbh-ai-call-count';

export function getAITodayCount(): number {
  try {
    const raw = localStorage.getItem(AI_CALL_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    const today = new Date().toISOString().split('T')[0];
    if (data.date !== today) return 0;
    return data.count || 0;
  } catch { return 0; }
}

export function incrementAICallCount(): number {
  const today = new Date().toISOString().split('T')[0];
  const count = getAITodayCount() + 1;
  try { localStorage.setItem(AI_CALL_KEY, JSON.stringify({ date: today, count })); } catch { /* quota */ }
  return count;
}

/** Hook: 检查 AI 调用是否允许 */
export function useAICallGate(): { allowed: boolean; count: number; max: number; tier: PlanTier } {
  const { state } = useStore();
  const teamId = state.currentUser?.teamId || state.currentUser?.id || '';
  const subs = state.subscriptions || [];
  const count = getAITodayCount();

  return useMemo(() => {
    const limit = checkLimit('cloudAiPerDay', teamId, subs, count);
    return { allowed: limit.allowed, count, max: typeof limit.max === 'number' ? limit.max : 999999, tier: limit.tier };
  }, [teamId, subs, count]);
}
