/**
 * UpgradeGate — 付费墙包装组件
 *
 * 用法：
 *   <UpgradeGate feature="agentAutomation">
 *     <ExpensiveFeature />
 *   </UpgradeGate>
 *
 * Free 用户看到锁定卡片 + 升级CTA，付费用户看到正常内容。
 */
import { useState } from 'react';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import type { PlanLimitKey } from '@/lib/featureGating';
import type { PlanTier } from '@/types';
import { Lock, Crown, Sparkles } from 'lucide-react';
import Paywall from '@/components/Paywall';
import { getPlanName } from '@/lib/featureGating';

const FEATURE_LABELS: Record<string, string> = {
  maxMembers: '团队成员',
  maxAutomations: '自动化规则',
  cloudAiPerDay: 'AI 调用次数',
  agentAutomation: 'AI 智能体自动化',
  approvalFlow: '审批流',
  advancedPermissions: '高级权限',
  agentMarketplace: 'AI 智能体市场',
};

interface UpgradeGateProps {
  feature: PlanLimitKey;
  children: React.ReactNode;
  /** 自定义锁定文案 */
  lockedMessage?: string;
  /** 最小显示尺寸：inline（行内锁定标签）| card（卡片式） */
  variant?: 'card' | 'inline';
  className?: string;
}

export function UpgradeGate({ feature, children, lockedMessage, variant = 'card', className }: UpgradeGateProps) {
  const gate = useFeatureGate(feature);
  const [showPaywall, setShowPaywall] = useState(false);

  if (gate.allowed) {
    return <>{children}</>;
  }

  const label = FEATURE_LABELS[feature] || feature;

  if (variant === 'inline') {
    return (
      <>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer ${className || ''}`}
          onClick={() => setShowPaywall(true)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') setShowPaywall(true); }}
        >
          <Lock size={10} />
          {lockedMessage || `${label}需要升级`}
        </span>
        {showPaywall && (
          <Paywall
            feature={label}
            currentTier={gate.tier}
            onClose={() => setShowPaywall(false)}
            onUpgrade={() => {
              setShowPaywall(false);
              window.dispatchEvent(new CustomEvent('tbh-open-billing'));
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className={`flex flex-col items-center justify-center py-8 px-6 border-2 border-dashed border-muted-foreground/20 rounded-xl bg-muted/30 ${className || ''}`}>
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
          <Crown size={20} className="text-amber-600" />
        </div>
        <p className="font-semibold text-sm mb-1">
          {lockedMessage || `${label}需要升级到${getPlanName(gate.tier === 'free' ? 'pro' : 'enterprise')}`}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          当前套餐: {getPlanName(gate.tier)}
          {typeof gate.max === 'number' && ` | 上限: ${gate.max}`}
        </p>
        <button
          onClick={() => setShowPaywall(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Sparkles size={14} />
          免费试用 14 天
        </button>
      </div>
      {showPaywall && (
        <Paywall
          feature={label}
          currentTier={gate.tier}
          onClose={() => setShowPaywall(false)}
          onUpgrade={() => {
            setShowPaywall(false);
            window.dispatchEvent(new CustomEvent('tbh-open-billing'));
          }}
        />
      )}
    </>
  );
}

/** 成员达到上限时的行内提示（不遮挡内容，只提示接近上限） */
export function NearLimitBadge({ feature }: { feature: PlanLimitKey }) {
  const gate = useFeatureGate(feature);
  if (!gate.nearLimit || gate.allowed) return null;
  const label = FEATURE_LABELS[feature] || feature;
  const maxLabel = typeof gate.max === 'number' ? `/${gate.max}` : '';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
      {label} {gate.current}{maxLabel} (接近上限)
    </span>
  );
}
