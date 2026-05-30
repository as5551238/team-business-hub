import type { PlanTier, Subscription } from '@/types';
import { PLAN_LIMITS } from '@/types';

interface StripeInstance {
  redirectToCheckout: (opts: Record<string, unknown>) => Promise<unknown>;
}

export async function initializeStripe(publishableKey?: string): Promise<StripeInstance | null> {
  const pk = publishableKey ?? import.meta.env.VITE_STRIPE_PK;
  if (!pk) return null;
  // MVP: mocked Stripe instance — install @stripe/stripe-js and use loadStripe for production
  return { redirectToCheckout: async () => ({ error: null }) };
}

export async function createCheckoutSession(
  teamId: string,
  tier: 'pro' | 'enterprise',
  billing: 'monthly' | 'yearly',
): Promise<{ url: string } | null> {
  void teamId;
  void billing;
  return { url: 'https://billing.example.com/checkout?tier=' + tier };
}

export async function handleCheckoutSuccess(
  sessionId: string,
  teamId: string,
  dispatch: (action: { type: string; payload: { teamId: string; updates: Partial<Subscription> } }) => void,
): Promise<void> {
  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  dispatch({
    type: 'UPDATE_SUBSCRIPTION',
    payload: {
      teamId,
      updates: {
        tier: 'pro' as PlanTier,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        stripeSubscriptionId: sessionId,
      },
    },
  });
}

export async function cancelSubscription(
  teamId: string,
  dispatch: (action: { type: string; payload: { teamId: string; updates: Partial<Subscription> } }) => void,
): Promise<void> {
  dispatch({
    type: 'UPDATE_SUBSCRIPTION',
    payload: {
      teamId,
      updates: { status: 'canceled' },
    },
  });
}

export function getPricingDisplay(): Array<{
  tier: string;
  name: string;
  monthly: number;
  yearly: number;
  features: string[];
}> {
  return [
    {
      tier: 'free',
      name: '免费版',
      monthly: 0,
      yearly: 0,
      features: ['≤5人', 'Local AI免费', 'Cloud AI 10次/天', '5个自动化'],
    },
    {
      tier: 'pro',
      name: '专业版',
      monthly: 12,
      yearly: 115,
      features: ['≤50人', 'Cloud AI 1000次/天', 'Agent自动化', 'OKR审批流', '高级权限', '14天免费试用'],
    },
    {
      tier: 'enterprise',
      name: '企业版',
      monthly: 25,
      yearly: 240,
      features: ['不限人数', 'Cloud AI无限', 'Agent Marketplace', '专属支持', '自定义集成'],
    },
  ];
}

export function getUsageInfo(tier: PlanTier, membersCount: number, automationsCount: number, aiCallsToday: number) {
  const limits = PLAN_LIMITS[tier];
  return {
    members: { current: membersCount, max: limits.maxMembers },
    automations: { current: automationsCount, max: limits.maxAutomations },
    aiCalls: { current: aiCallsToday, max: limits.cloudAiPerDay },
  };
}
