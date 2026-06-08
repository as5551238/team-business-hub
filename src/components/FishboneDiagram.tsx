import { useState } from 'react';

interface Props {
  value: Record<string, string | string[]>;
  onChange: (inputs: Record<string, string | string[]>) => void;
}

const FISHBONE_CATEGORIES = [
  { key: 'step_1', label: '人员', labelEn: 'People', color: 'bg-rose-50 border-rose-300 text-rose-700' },
  { key: 'step_2', label: '设备/工具', labelEn: 'Machine', color: 'bg-sky-50 border-sky-300 text-sky-700' },
  { key: 'step_3', label: '材料/数据', labelEn: 'Material', color: 'bg-amber-50 border-amber-300 text-amber-700' },
  { key: 'step_4', label: '方法', labelEn: 'Method', color: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
  { key: 'step_5', label: '环境', labelEn: 'Environment', color: 'bg-violet-50 border-violet-300 text-violet-700' },
  { key: 'step_6', label: '测量', labelEn: 'Measurement', color: 'bg-indigo-50 border-indigo-300 text-indigo-700' },
] as const;

export function FishboneDiagram({ value, onChange }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  function getValue(stepKey: string): string {
    const v = value[stepKey];
    return typeof v === 'string' ? v : '';
  }

  function setValue(stepKey: string, val: string) {
    onChange({ ...value, [stepKey]: val });
  }

  const filledCount = FISHBONE_CATEGORIES.filter(c => getValue(c.key).trim()).length;

  return (
    <div className="space-y-4">
      {/* Fishbone SVG Visual */}
      <div className="relative border border-border rounded-lg p-4 bg-muted/20 overflow-x-auto">
        <svg viewBox="0 0 600 320" className="w-full max-w-lg mx-auto" style={{ minHeight: 200 }}>
          {/* Main spine */}
          <line x1="80" y1="160" x2="540" y2="160" stroke="currentColor" strokeWidth="3" className="text-gray-400" />
          {/* Problem head */}
          <rect x="500" y="130" width="90" height="60" rx="8" fill="currentColor" className="text-red-500" />
          <text x="545" y="158" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">问题</text>
          <text x="545" y="174" textAnchor="middle" fill="white" fontSize="8">Problem</text>
          {/* Top branches (steps 1-3) */}
          {[
            { step: 'step_1', x: 180, top: true },
            { step: 'step_2', x: 300, top: true },
            { step: 'step_3', x: 420, top: true },
          ].map(b => {
            const cat = FISHBONE_CATEGORIES.find(c => c.key === b.step);
            const hasVal = getValue(b.step).trim().length > 0;
            return (
              <g key={b.step}>
                <line x1={b.x} y1={160} x2={b.x - 40} y2="50" stroke="currentColor" strokeWidth="2" className={hasVal ? 'text-rose-400' : 'text-gray-300'} />
                <rect x={b.x - 65} y="30" width="50" height="24" rx="4" fill="currentColor" className={hasVal ? 'text-rose-500' : 'text-gray-300'} />
                <text x={b.x - 40} y="46" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">{cat?.label}</text>
              </g>
            );
          })}
          {/* Bottom branches (steps 4-6) */}
          {[
            { step: 'step_4', x: 180, top: false },
            { step: 'step_5', x: 300, top: false },
            { step: 'step_6', x: 420, top: false },
          ].map(b => {
            const cat = FISHBONE_CATEGORIES.find(c => c.key === b.step);
            const hasVal = getValue(b.step).trim().length > 0;
            return (
              <g key={b.step}>
                <line x1={b.x} y1={160} x2={b.x - 40} y2="270" stroke="currentColor" strokeWidth="2" className={hasVal ? 'text-emerald-400' : 'text-gray-300'} />
                <rect x={b.x - 65} y="266" width="50" height="24" rx="4" fill="currentColor" className={hasVal ? 'text-emerald-500' : 'text-gray-300'} />
                <text x={b.x - 40} y="282" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">{cat?.label}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Category Detail Editors */}
      <div className="grid grid-cols-2 gap-2">
        {FISHBONE_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
            className={`rounded-lg border p-2.5 text-left transition-all ${cat.color} ${activeCategory === cat.key ? 'ring-2 ring-primary/30 shadow-sm' : 'hover:shadow-sm'}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold">{cat.label}</span>
              <span className="text-[9px] opacity-60">{cat.labelEn}</span>
              {getValue(cat.key).trim() && (
                <span className="ml-auto w-2 h-2 rounded-full bg-current opacity-60" />
              )}
            </div>
          </button>
        ))}
      </div>

      {activeCategory && (
        <div className="border rounded-lg p-3 animate-fade-in">
          {(() => {
            const cat = FISHBONE_CATEGORIES.find(c => c.key === activeCategory);
            if (!cat) return null;
            return (
              <>
                <label className="text-xs font-semibold mb-1 block">{cat.label} ({cat.labelEn}) 分析</label>
                <textarea
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={`从${cat.label}维度分析问题原因...`}
                  value={getValue(activeCategory)}
                  onChange={e => setValue(activeCategory, e.target.value)}
                />
              </>
            );
          })()}
        </div>
      )}

      {filledCount === 6 && (
        <div className="border border-emerald-200 rounded-lg p-2 bg-emerald-50 text-center text-[11px] text-emerald-700 font-medium">
          六维度分析完成，可在总结中提炼根因
        </div>
      )}
    </div>
  );
}
