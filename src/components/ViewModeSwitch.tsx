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
    <div className={`flex items-center ${isSm ? 'gap-0.5' : 'gap-1'} bg-muted/50 rounded-lg p-0.5 overflow-x-auto scrollbar-none`}>
      {items.map(item => {
        const Icon = item.icon;
        const active = value === item.value;
        return (
          <button key={item.value} onClick={() => onChange(item.value)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${active ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {Icon && <Icon size={14} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
