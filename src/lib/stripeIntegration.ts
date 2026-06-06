/**
 * Stripe 集成 — Checkout Link 模式
 *
 * 使用 Stripe Payment Links（在 Stripe Dashboard 预配置），
 * 无需后端 Checkout Session，纯前端跳转即可完成支付。
 *
 * 环境变量配置:
 *   VITE_STRIPE_PK                  — Stripe Publishable Key
 *   VITE_STRIPE_PRO_MONTHLY_LINK    — Pro 月付 Payment Link URL
 *   VITE_STRIPE_PRO_YEARLY_LINK     — Pro 年付 Payment Link URL
 *   VITE_STRIPE_ENTERPRISE_MONTHLY_LINK — Enterprise 月付 Payment Link URL
 *   VITE_STRIPE_ENTERPRISE_YEARLY_LINK  — Enterprise 年付 Payment Link URL
 *
 * 流程:
 *   1. 用户点击"升级" → 调用 createCheckoutSession() 获取 Payment Link URL
 *   2. 跳转到 Stripe 托管支付页
 *   3. 支付成功 → Stripe webhook 通知后端 → 后端写入 subscriptions 表
 *   4. 前端通过 Supabase Realtime 收到订阅变更 → UI 自动刷新
 */
import type { PlanTier, Subscription } from '@/types';
import { PLAN_LIMITS } from '@/types';
import { getSupabaseClient } from '@/supabase/client';

// ==================== 价格配置 ====================

const STRIPE_LINKS: Record<string, Record<string, string>> = {
  pro: {
    monthly: import.meta.env.VITE_STRIPE_PRO_MONTHLY_LINK || '',
    yearly: import.meta.env.VITE_STRIPE_PRO_YEARLY_LINK || '',
  },
  enterprise: {
    monthly: import.meta.env.VITE_STRIPE_ENTERPRISE_MONTHLY_LINK || '',
    yearly: import.meta.env.VITE_STRIPE_ENTERPRISE_YEARLY_LINK || '',
  },
};

export interface PricingTier {
  tier: string;
  name: string;
  monthly: number;
  yearly: number;
  features: string[];
  popular?: boolean;
}

// ==================== Checkout Link 创建 ====================

/**
 * 获取对应套餐和计费周期的 Stripe Payment Link URL
 * 如果未配置环境变量，返回一个带 query param 的通用 fallback URL
 */
export async function createCheckoutSession(
  teamId: string,
  tier: 'pro' | 'enterprise',
  billing: 'monthly' | 'yearly',
): Promise<{ url: string } | null> {
  const link = STRIPE_LINKS[tier]?.[billing];

  if (link) {
    // Stripe Payment Link 支持 client_reference_id 传 teamId
    // 支付成功后 webhook 可据此关联到团队
    const separator = link.includes('?') ? '&' : '?';
    return { url: `${link}${separator}client_reference_id=${encodeURIComponent(teamId)}` };
  }

  // Fallback: 如果没有配置 Stripe Link, 尝试通过 Supabase RPC 创建 Checkout Session
  // 这需要后端部署了 stripe-webhook Edge Function
  try {
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.rpc('create_checkout_session', {
        p_team_id: teamId,
        p_tier: tier,
        p_billing: billing,
      });
      if (!error && data?.url) {
        return { url: data.url };
      }
    }
  } catch {
    // RPC not available — fall through to demo URL
  }

  // 最终 fallback: 返回演示 URL（开发/测试环境）
  return { url: `https://billing.example.com/checkout?tier=${tier}&billing=${billing}&team_id=${teamId}` };
}

// ==================== 订阅管理 ====================

/**
 * 处理支付成功回调（前端侧）
 * 注意: 真正的订阅激活由 Stripe webhook 后端完成
 * 此函数仅作为 Realtime 不可用时的补充
 */
export async function handleCheckoutSuccess(
  sessionId: string,
  teamId: string,
  dispatch: (action: { type: string; payload: { teamId: string; updates: Partial<Subscription> } }) => void,
): Promise<void> {
  void sessionId;
  // 查询后端确认订阅状态
  try {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb
        .from('subscriptions')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        const now = new Date().toISOString();
        const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
        dispatch({
          type: 'UPDATE_SUBSCRIPTION',
          payload: {
            teamId,
            updates: {
              tier: (data.tier as PlanTier) || 'pro',
              status: 'active',
              currentPeriodStart: data.current_period_start || now,
              currentPeriodEnd: data.current_period_end || periodEnd,
              stripeSubscriptionId: data.stripe_subscription_id || sessionId,
            },
          },
        });
        return;
      }
    }
  } catch {
    // Backend query failed — use optimistic local update
  }

  // 乐观更新（离线/后端不可用时的兜底）
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

/**
 * 取消订阅 — 调用后端 RPC 标记取消
 */
export async function cancelSubscription(
  teamId: string,
  dispatch: (action: { type: string; payload: { teamId: string; updates: Partial<Subscription> } }) => void,
): Promise<void> {
  // 尝试后端取消
  try {
    const sb = getSupabaseClient();
    if (sb) {
      const { error } = await sb.rpc('cancel_subscription', { p_team_id: teamId });
      if (!error) {
        dispatch({
          type: 'UPDATE_SUBSCRIPTION',
          payload: { teamId, updates: { status: 'canceled' } },
        });
        return;
      }
    }
  } catch {
    // RPC unavailable — local update only
  }

  dispatch({
    type: 'UPDATE_SUBSCRIPTION',
    payload: { teamId, updates: { status: 'canceled' } },
  });
}

// ==================== 展示数据 ====================

export function getPricingDisplay(): PricingTier[] {
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
      popular: true,
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
