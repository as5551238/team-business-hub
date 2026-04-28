import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
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

  const btnText = selected.size === 0 ? label : `${label}(${selected.size})`;

  return (
    <div ref={ref} className="relative">
      <button
        className={cn('text-sm border border-input rounded-lg px-3 py-1.5 bg-white min-w-[100px] flex items-center gap-1 hover:bg-muted/50 transition-colors whitespace-nowrap', selected.size > 0 && 'ring-2 ring-primary/20 border-primary/40', className)}
        onClick={() => setOpen(!open)}
      >
        {btnText}<ChevronDown className="w-3 h-3 ml-1" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-30 py-1 min-w-[140px] max-h-[300px] overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent text-sm">
            <input type="checkbox" checked={selected.size === 0} onChange={() => { onClear(); setOpen(false); }} />
            <span>全部</span>
          </label>
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent text-sm">
              <input type="checkbox" checked={selected.has(opt.value)} onChange={() => onToggle(opt.value)} />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
