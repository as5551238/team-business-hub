import type { ComponentType } from 'react';

export interface ViewModeItem {
  value: string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
}

interface ViewModeSwitchProps {
  items: ViewModeItem[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'default';
}

export default function ViewModeSwitch({ items, value, onChange, size = 'default' }: ViewModeSwitchProps) {
  const isSm = size === 'sm';
  return (
    <div className="relative">
      <div className={`flex items-center ${isSm ? 'gap-0.5' : 'gap-1'} bg-muted/50 rounded-lg p-0.5 overflow-x-auto scrollbar-none`}>
        {items.map(item => {
          const Icon = item.icon;
          const active = value === item.value;
          return (
            <button key={item.value} onClick={() => onChange(item.value)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${active ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {Icon && <Icon size={14} />}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {/* Scroll hint: fade edges on small screens to indicate more tabs */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-white/80 to-transparent rounded-l-lg md:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-white/80 to-transparent rounded-r-lg md:hidden" />
    </div>
  );
}
