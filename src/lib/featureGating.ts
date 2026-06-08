import { PLAN_LIMITS, type PlanTier, type PlanLimit } from '@/types';

/** PlanLimitKey — 功能限制键的联合类型，供组件使用 */
export type PlanLimitKey = keyof PlanLimit;

interface SubscriptionEntry {
  teamId: string;
  tier: PlanTier;
  status: string;
}

type NumericLimit = 'maxMembers' | 'maxAutomations' | 'cloudAiPerDay';
type BooleanLimit = 'agentAutomation' | 'approvalFlow' | 'advancedPermissions' | 'agentMarketplace';

const NUMERIC_LIMITS: ReadonlySet<string> = new Set<string>([
  'maxMembers',
  'maxAutomations',
  'cloudAiPerDay',
]);

export function getTeamPlan(teamId: string, subscriptions: SubscriptionEntry[]): PlanTier {
  const sub = subscriptions.find((s) => s.teamId === teamId && s.status === 'active');
  return sub?.tier ?? 'free';
}

export function checkLimit(
  limit: keyof PlanLimit,
  teamId: string,
  subscriptions: SubscriptionEntry[],
  currentValue?: number,
): { allowed: boolean; current: number; max: number; tier: PlanTier } {
  const tier = getTeamPlan(teamId, subscriptions);
  const limits = PLAN_LIMITS[tier];

  if (NUMERIC_LIMITS.has(limit)) {
    const max = limits[limit as NumericLimit] as number;
    const current = currentValue ?? 0;
    return { allowed: current < max, current, max, tier };
  }

  const enabled = limits[limit as BooleanLimit] as boolean;
  return { allowed: enabled, current: enabled ? 1 : 0, max: enabled ? 1 : 0, tier };
}

export function gatedAction(
  feature: keyof PlanLimit,
  teamId: string,
  subscriptions: SubscriptionEntry[],
  currentValue?: number,
): boolean {
  return checkLimit(feature, teamId, subscriptions, currentValue).allowed;
}

export function getPlanName(tier: PlanTier): string {
  const names: Record<PlanTier, string> = {
    free: '免费版',
    pro: '专业版',
    enterprise: '企业版',
  };
  return names[tier];
}

export function shouldShowUpgrade(
  feature: keyof PlanLimit,
  teamId: string,
  subscriptions: SubscriptionEntry[],
): boolean {
  const tier = getTeamPlan(teamId, subscriptions);
  const limits = PLAN_LIMITS[tier];

  if (NUMERIC_LIMITS.has(feature)) {
    const ownMax = limits[feature as NumericLimit] as number;
    const proMax = PLAN_LIMITS.pro[feature as NumericLimit] as number;
    return ownMax < proMax;
  }

  return !(limits[feature as BooleanLimit] as boolean);
}
