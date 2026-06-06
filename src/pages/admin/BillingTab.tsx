import { useState, useMemo, useCallback } from 'react';
import { CreditCard, Crown, Check, Zap, Users, Bot, Shield, Calendar, AlertCircle, ExternalLink } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStore } from '@/store/useStore';
import { getTeamPlan, getPlanName } from '@/lib/featureGating';
import { getAITodayCount } from '@/hooks/useFeatureGate';
import { getPricingDisplay, getUsageInfo, createCheckoutSession, cancelSubscription } from '@/lib/stripeIntegration';
import type { PlanTier } from '@/types';

const TIER_ICON: Record<string, typeof CreditCard> = {
  free: Users,
  pro: Crown,
  enterprise: Shield,
};

const TIER_BORDER: Record<string, string> = {
  free: 'border-gray-200',
  pro: 'border-blue-400 ring-1 ring-blue-100',
  enterprise: 'border-purple-400 ring-1 ring-purple-100',
};

const TIER_BTN: Record<string, string> = {
  free: 'bg-gray-100 text-gray-500 cursor-default',
  pro: 'bg-blue-600 text-white hover:bg-blue-700',
  enterprise: 'bg-purple-600 text-white hover:bg-purple-700',
};

export function BillingTab() {
  const { state, dispatch } = useStore();
  const teamId = state.currentTeamId ?? '';
  const currentTier = useMemo(() => getTeamPlan(teamId, state.subscriptions), [teamId, state.subscriptions]);
  const currentName = getPlanName(currentTier);
  const pricing = getPricingDisplay();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  const membersCount = state.members.filter(m => m.status === 'active').length;
  const automationsCount = state.automationRules.length;
  const aiCallsToday = getAITodayCount();
  const usage = useMemo(() => getUsageInfo(currentTier, membersCount, automationsCount, aiCallsToday), [currentTier, membersCount, automationsCount, aiCallsToday]);

  const subscription = state.subscriptions?.find(s => s.teamId === teamId);

  const handleUpgrade = useCallback(async (tier: 'pro' | 'enterprise') => {
    setUpgrading(tier);
    try {
      const result = await createCheckoutSession(teamId, tier, billingCycle);
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    } catch {
      alert('创建支付链接失败，请稍后重试或联系客服。');
    } finally {
      setUpgrading(null);
    }
  }, [teamId, billingCycle]);

  const handleCancel = useCallback(async () => {
    if (!confirm('确定要取消订阅？取消后将在当前计费周期结束时降级为免费版。')) return;
    setCanceling(true);
    try {
      await cancelSubscription(teamId, dispatch);
    } finally {
      setCanceling(false);
    }
  }, [teamId, dispatch]);

  const UsageMeter = ({ label, current, max, icon: Icon }: { label: string; current: number; max: number; icon: typeof Users }) => {
    const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
    const isNear = pct >= 80;
    const displayMax = max >= 99999 ? '∞' : max >= 9999 ? '∞' : max;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
          <span className={isNear ? 'text-orange-600 font-medium' : ''}>{current}/{displayMax}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isNear ? 'bg-orange-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">订阅与计费</h2>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-muted-foreground">当前方案</span>
            <p className="text-base font-semibold flex items-center gap-1.5">
              <Crown className="h-4 w-4 text-yellow-500" />{currentName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {subscription?.status === 'active' && currentTier !== 'free' && (
              <>
                {subscription.currentPeriodEnd && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    到期: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={handleCancel}
                  disabled={canceling}
                  className="text-sm text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {canceling ? '取消中...' : '取消订阅'}
                </button>
              </>
            )}
            {subscription?.status === 'trialing' && subscription.trialEndsAt && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                试用到期: {new Date(subscription.trialEndsAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2.5">
          <UsageMeter label="团队成员" current={usage.members.current} max={usage.members.max} icon={Users} />
          <UsageMeter label="自动化规则" current={usage.automations.current} max={usage.automations.max} icon={Bot} />
          <UsageMeter label="AI调用(今日)" current={usage.aiCalls.current} max={usage.aiCalls.max} icon={Zap} />
        </div>
        {(usage.members.current / usage.members.max >= 0.8 || usage.automations.current / usage.automations.max >= 0.8) && currentTier === 'free' && (
          <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>即将达到免费版上限，升级专业版可获得更多配额</span>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">升级方案</h3>
          <div className="flex items-center gap-2 bg-muted rounded-lg p-0.5">
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${billingCycle === 'monthly' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
              onClick={() => setBillingCycle('monthly')}
            >月付</button>
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${billingCycle === 'yearly' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}
              onClick={() => setBillingCycle('yearly')}
            >年付(省20%)</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pricing.map(p => {
            const isCurrent = p.tier === currentTier;
            const Icon = TIER_ICON[p.tier] ?? CreditCard;
            const price = billingCycle === 'yearly' ? Math.round(p.yearly / 12) : p.monthly;
            const isLoading = upgrading === p.tier;
            return (
              <div key={p.tier} className={`rounded-lg border p-4 space-y-3 relative ${TIER_BORDER[p.tier]}`}>
                {p.popular && (
                  <div className="absolute -top-2.5 right-3 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">推荐</div>
                )}
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  <span className="font-semibold">{p.name}</span>
                </div>
                <div>
                  <span className="text-2xl font-bold">¥{price}</span>
                  <span className="text-sm text-muted-foreground">/月</span>
                  {billingCycle === 'yearly' && p.yearly > 0 && (
                    <p className="text-xs text-green-600 mt-0.5">年付 ¥{p.yearly}/年 (省 ¥{p.monthly * 12 - p.yearly})</p>
                  )}
                </div>
                <ul className="space-y-1.5 text-sm">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  disabled={isCurrent || isLoading}
                  onClick={() => { if (p.tier === 'pro' || p.tier === 'enterprise') handleUpgrade(p.tier); }}
                  className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${isCurrent ? TIER_BTN.free : (TIER_BTN[p.tier] ?? TIER_BTN.pro)}`}
                >
                  {isLoading ? '跳转中...' : isCurrent ? '当前方案' : (
                    <>
                      {p.tier === 'pro' ? '开始试用' : '立即升级'}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">账单历史</h3>
        {subscription && subscription.status !== 'free' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm py-2 border-b border-border">
              <span>{getPlanName(subscription.tier)} - {billingCycle === 'yearly' ? '年付' : '月付'}</span>
              <span className="text-muted-foreground">
                {subscription.currentPeriodStart && new Date(subscription.currentPeriodStart).toLocaleDateString()} - {subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${subscription.status === 'active' ? 'bg-green-100 text-green-700' : subscription.status === 'trialing' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {subscription.status === 'active' ? '活跃' : subscription.status === 'trialing' ? '试用中' : subscription.status === 'canceled' ? '已取消' : subscription.status}
              </span>
            </div>
          </div>
        ) : (
          <EmptyState title="暂无账单记录" compact />
        )}
      </div>
    </div>
  );
}
