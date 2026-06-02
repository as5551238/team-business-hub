import { useMemo } from 'react';
import { CreditCard, Crown, Check, Zap, Users, Bot, Shield } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStore } from '@/store/useStore';
import { getTeamPlan, getPlanName } from '@/lib/featureGating';
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

  const membersCount = state.members.length;
  const automationsCount = state.automationRules.length;
  const aiCallsToday = 0;
  const usage = useMemo(() => getUsageInfo(currentTier, membersCount, automationsCount, aiCallsToday), [currentTier, membersCount, automationsCount]);

  const subscription = state.subscriptions.find(s => s.teamId === teamId);

  function handleUpgrade(tier: 'pro' | 'enterprise') {
    createCheckoutSession(teamId, tier, 'monthly').then(result => {
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    });
  }

  function handleCancel() {
    cancelSubscription(teamId, dispatch);
  }

  const UsageMeter = ({ label, current, max, icon: Icon }: { label: string; current: number; max: number; icon: typeof Users }) => {
    const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
    const isNear = pct >= 80;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
          <span className={isNear ? 'text-orange-600 font-medium' : ''}>{current}/{max === 99999 ? '∞' : max === 9999 ? '∞' : max}</span>
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
          {subscription?.status === 'active' && currentTier !== 'free' && (
            <button onClick={handleCancel} className="text-sm text-muted-foreground hover:text-red-600 transition-colors">取消订阅</button>
          )}
        </div>
        <div className="space-y-2.5">
          <UsageMeter label="团队成员" current={usage.members.current} max={usage.members.max} icon={Users} />
          <UsageMeter label="自动化规则" current={usage.automations.current} max={usage.automations.max} icon={Bot} />
          <UsageMeter label="AI调用(今日)" current={usage.aiCalls.current} max={usage.aiCalls.max} icon={Zap} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">升级方案</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pricing.map(p => {
            const isCurrent = p.tier === currentTier;
            const Icon = TIER_ICON[p.tier] ?? CreditCard;
            return (
              <div key={p.tier} className={`rounded-lg border p-4 space-y-3 ${TIER_BORDER[p.tier]}`}>
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  <span className="font-semibold">{p.name}</span>
                </div>
                <div>
                  <span className="text-2xl font-bold">¥{p.monthly}</span>
                  <span className="text-sm text-muted-foreground">/月</span>
                  {p.yearly > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">年付 ¥{p.yearly}/年</p>
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
                  disabled={isCurrent}
                  onClick={() => { if (p.tier === 'pro' || p.tier === 'enterprise') handleUpgrade(p.tier); }}
                  className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isCurrent ? TIER_BTN.free : (TIER_BTN[p.tier] ?? TIER_BTN.pro)}`}
                >
                  {isCurrent ? '当前方案' : p.tier === 'pro' ? '开始试用' : '立即升级'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">账单历史</h3>
        <EmptyState title="暂无账单记录" compact />
      </div>
    </div>
  );
}
