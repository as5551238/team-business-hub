import { motion } from 'framer-motion';
import React from 'react';
import type { LucideIcon } from 'lucide-react';

type EmptyVariant = 'default' | 'positive' | 'drag';

interface EmptyStateProps {
  /** Icon component from lucide-react */
  icon?: LucideIcon;
  /** Primary message */
  title: string;
  /** Optional subtitle / description */
  description?: string;
  /** Call-to-action button label */
  actionLabel?: string;
  /** Call-to-action callback */
  onAction?: () => void;
  /** Visual variant: default (neutral), positive (celebration), drag (drop placeholder) */
  variant?: EmptyVariant;
  /** Additional CSS class */
  className?: string;
  /** Compact mode — less padding, smaller text */
  compact?: boolean;
}

const variantStyles: Record<EmptyVariant, { iconBg: string; iconColor: string; iconFloat: string }> = {
  default: {
    iconBg: 'bg-primary/8 dark:bg-primary/12',
    iconColor: 'text-primary/60',
    iconFloat: 'hover:-translate-y-0.5',
  },
  positive: {
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/15',
    iconColor: 'text-emerald-500 dark:text-emerald-400',
    iconFloat: 'hover:scale-110',
  },
  drag: {
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    iconFloat: '',
  },
};

/**
 * Unified empty-state component with brand-consistent styling,
 * gentle micro-animation, and semantic variants.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  variant = 'default',
  className = '',
  compact = false,
}) => {
  const vs = variantStyles[variant];
  const pad = compact ? 'p-6 py-8' : 'p-10 py-14';
  const iconSize = compact ? 28 : 36;
  const titleSize = compact ? 'text-xs' : 'text-sm';
  const descSize = compact ? 'text-[11px]' : 'text-xs';
  const iconPad = compact ? 'p-2' : 'p-3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex flex-col items-center justify-center text-center ${pad} ${className}`}
    >
      {Icon && (
        <div className={`mb-3 rounded-xl ${iconPad} ${vs.iconBg} transition-transform duration-200 ${vs.iconFloat}`}>
          <Icon size={iconSize} className={vs.iconColor} strokeWidth={1.5} />
        </div>
      )}
      <p className={`font-medium text-foreground/70 ${titleSize}`}>{title}</p>
      {description && (
        <p className={`mt-1 text-muted-foreground max-w-xs ${descSize}`}>{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {actionLabel}
        </button>
      )}
      {variant === 'drag' && (
        <div className="mt-2 border-2 border-dashed border-border/60 rounded-lg px-4 py-2 text-[11px] text-muted-foreground/60">
          {title}
        </div>
      )}
    </motion.div>
  );
};
