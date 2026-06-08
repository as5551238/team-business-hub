import React from 'react';
import { cn } from '@/lib/utils';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<LogoSize, { container: string; text: string; rounded: string }> = {
  sm: { container: 'w-6 h-6', text: 'text-[10px]', rounded: 'rounded-md' },
  md: { container: 'w-8 h-8', text: 'text-sm', rounded: 'rounded-lg' },
  lg: { container: 'w-12 h-12', text: 'text-lg', rounded: 'rounded-xl' },
  xl: { container: 'w-16 h-16', text: 'text-2xl', rounded: 'rounded-2xl' },
};

interface AppLogoProps {
  size?: LogoSize;
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'gradient';
}

export const AppLogo = React.memo(function AppLogo({ size = 'md', className, showText = false, variant = 'default' }: AppLogoProps) {
  const s = SIZE_MAP[size];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center justify-center font-bold flex-shrink-0',
          s.container,
          s.rounded,
          s.text,
          variant === 'gradient'
            ? 'brand-gradient text-white shadow-md'
            : 'bg-primary text-primary-foreground'
        )}
      >
        TB
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-sm">团队业务中台</span>
          <span className="text-xs text-muted-foreground">Team Business Hub</span>
        </div>
      )}
    </div>
  );
});

export const APP_NAME_CN = '团队业务中台';
export const APP_NAME_EN = 'Team Business Hub';
