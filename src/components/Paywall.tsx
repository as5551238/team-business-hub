import { PLAN_LIMITS, type PlanTier, type PlanLimit } from '@/types';
import { Lock, Check, X, Crown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaywallProps {
  feature: string;
  currentTier: PlanTier;
  onClose: () => void;
  onUpgrade: () => void;
}

const TIER_ORDER: PlanTier[] = ['free', 'pro', 'enterprise'];

function getUpgradeTier(current: PlanTier): PlanTier {
  const idx = TIER_ORDER.indexOf(current);
  return TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
}

const FEATURE_LABELS: Record<keyof PlanLimit, string> = {
  maxMembers: '团队成员上限',
  maxAutomations: '自动化规则上限',
  cloudAiPerDay: '每日 AI 调用次数',
  agentAutomation: 'AI 智能体自动化',
  approvalFlow: '审批流',
  advancedPermissions: '高级权限',
  agentMarketplace: 'AI 智能体市场',
};

const TIER_NAMES: Record<PlanTier, string> = {
  free: '免费版',
  pro: '专业版',
  enterprise: '企业版',
};

function ComparisonTable({ currentTier, upgradeTier }: { currentTier: PlanTier; upgradeTier: PlanTier }) {
  const currentLimits = PLAN_LIMITS[currentTier];
  const upgradeLimits = PLAN_LIMITS[upgradeTier];

  return (
    <div className="mt-6 rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">功能</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">{TIER_NAMES[currentTier]}</th>
            <th className="px-4 py-3 text-center font-medium text-indigo-600 bg-indigo-50">{TIER_NAMES[upgradeTier]}</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(FEATURE_LABELS) as Array<keyof PlanLimit>).map((key) => (
            <tr key={key} className="border-t border-gray-100">
              <td className="px-4 py-2.5 text-gray-700">{FEATURE_LABELS[key]}</td>
              <td className="px-4 py-2.5 text-center text-gray-400">
                {typeof currentLimits[key] === 'boolean'
                  ? currentLimits[key] ? <Check className="inline h-4 w-4 text-green-500" /> : '—'
                  : String(currentLimits[key])}
              </td>
              <td className="px-4 py-2.5 text-center bg-indigo-50/50 font-medium text-indigo-700">
                {typeof upgradeLimits[key] === 'boolean'
                  ? upgradeLimits[key] ? <Check className="inline h-4 w-4 text-green-500" /> : '—'
                  : String(upgradeLimits[key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Paywall({ feature, currentTier, onClose, onUpgrade }: PaywallProps) {
  const upgradeTier = getUpgradeTier(currentTier);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-full max-w-lg mx-4 bg-card rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="升级提示"
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-indigo-100">
            <Crown className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">升级到{TIER_NAMES[upgradeTier]}</h2>
            <p className="text-sm text-gray-500">解锁更多强大功能</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
          <Lock className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            <strong>{feature}</strong> 在当前{TIER_NAMES[currentTier]}中不可用
          </span>
        </div>

        <ComparisonTable currentTier={currentTier} upgradeTier={upgradeTier} />

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            className={cn(
              'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-white font-semibold',
              'bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200',
            )}
            onClick={onUpgrade}
            type="button"
          >
            <Sparkles className="h-4 w-4" />
            免费试用 14 天
          </button>
          <button
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            onClick={onClose}
            type="button"
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>
  );
}
