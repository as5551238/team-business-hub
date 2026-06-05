import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
  color?: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: Option[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  className?: string;
}

export function MultiSelectFilter({ label, options, selected, onToggle, onClear, className }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const hasSelection = selected.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer',
          hasSelection
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border',
          className
        )}
        onClick={() => setOpen(!open)}
      >
        {hasSelection ? (
          <>
            <span>{label}</span>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-[10px] font-bold leading-none">{selected.size}</span>
            <span
              className="ml-0.5 hover:bg-white/25 rounded-full p-0.5"
              onClick={e => { e.stopPropagation(); onClear(); }}
            >
              <X className="w-3 h-3" />
            </span>
          </>
        ) : (
          <>
            <span>{label}</span>
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-30 py-1 min-w-[140px] max-h-[300px] overflow-y-auto">
          {hasSelection && (
            <button className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-primary/5 flex items-center gap-1" onClick={() => { onClear(); setOpen(false); }}>
              <X className="w-3 h-3" /> 清除筛选
            </button>
          )}
          {options.map(opt => {
            const isSelected = selected.has(opt.value);
            return (
              <label key={opt.value} onClick={() => onToggle(opt.value)} className={cn('flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent text-xs transition-colors', isSelected && 'bg-primary/5 text-primary font-medium')}>
                <span className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors', isSelected ? 'bg-primary border-primary' : 'border-border')}>
                  {isSelected && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
