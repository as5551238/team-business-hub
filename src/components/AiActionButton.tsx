/**
 * AiActionButton — 统一AI操作按钮
 *
 * 全局一致的紫色/靛蓝风格 + Sparkles图标。
 * 所有页面的AI操作入口统一使用此组件，避免5种不同风格。
 */
import { Sparkles, Loader2 } from 'lucide-react';

interface AiActionButtonProps {
  /** 按钮文字 */
  label: string;
  /** 点击回调 */
  onClick: () => void;
  /** 是否加载中 */
  loading?: boolean;
  /** 按钮大小: sm=紧凑（表格行内）, md=默认（页面顶部操作区）, lg=醒目（空状态CTA） */
  size?: 'sm' | 'md' | 'lg';
  /** 额外 className */
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-1.5',
  lg: 'px-4 py-2 text-sm gap-2',
};

const iconSizes: Record<string, number> = { sm: 12, md: 14, lg: 16 };

export function AiActionButton({
  label,
  onClick,
  loading = false,
  size = 'md',
  className = '',
}: AiActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center font-medium border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors ${sizeClasses[size]} ${className}`}
    >
      {loading ? (
        <Loader2 size={iconSizes[size]} className="animate-spin" />
      ) : (
        <Sparkles size={iconSizes[size]} />
      )}
      <span>{label}</span>
    </button>
  );
}
