import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  value: Record<string, string | string[]>;
  onChange: (inputs: Record<string, string | string[]>) => void;
}

const WHY_STEPS = [
  { key: 'step_1', level: 1, label: '表面现象', color: 'border-red-300 bg-red-50' },
  { key: 'step_2', level: 2, label: '直接原因', color: 'border-orange-300 bg-orange-50' },
  { key: 'step_3', level: 3, label: '中层原因', color: 'border-amber-300 bg-amber-50' },
  { key: 'step_4', level: 4, label: '深层原因', color: 'border-yellow-300 bg-yellow-50' },
  { key: 'step_5', level: 5, label: '根本原因', color: 'border-emerald-300 bg-emerald-50' },
] as const;

export function FiveWhysChain({ value, onChange }: Props) {
  const [expandedStep, setExpandedStep] = useState<string | null>('step_1');

  function getValue(stepKey: string): string {
    const v = value[stepKey];
    return typeof v === 'string' ? v : '';
  }

  function setValue(stepKey: string, val: string) {
    onChange({ ...value, [stepKey]: val });
  }

  const deepestFilled = WHY_STEPS.reduce((deepest, step) =>
    getValue(step.key).trim() ? step.level : deepest, 0
  );

  return (
    <div className="space-y-2">
      {/* Visual Chain */}
      <div className="space-y-0">
        {WHY_STEPS.map((step, idx) => {
          const isOpen = expandedStep === step.key;
          const val = getValue(step.key);
          const hasValue = val.trim().length > 0;
          const isReachable = idx === 0 || getValue(WHY_STEPS[idx - 1].key).trim().length > 0;

          return (
            <div key={step.key}>
              {/* Connector line */}
              {idx > 0 && (
                <div className="flex items-center justify-center">
                  <div className="w-0.5 h-4 bg-gray-300" />
                </div>
              )}
              {/* Step node */}
              <button
                onClick={() => isReachable && setExpandedStep(isOpen ? null : step.key)}
                disabled={!isReachable}
                className={`w-full rounded-lg border-2 p-3 text-left transition-all ${step.color} ${
                  !isReachable ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-sm'
                } ${isOpen ? 'ring-2 ring-primary/30' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center text-xs font-bold border">
                    {step.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">为什么? — 第{step.level}层</span>
                      <span className="text-[9px] opacity-60">{step.label}</span>
                    </div>
                    {hasValue && !isOpen && (
                      <p className="text-[10px] truncate opacity-80 mt-0.5">{val}</p>
                    )}
                  </div>
                  {isReachable && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                  {hasValue && (
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  )}
                </div>
              </button>
              {/* Expanded editor */}
              {isOpen && isReachable && (
                <div className="mx-4 mt-1 mb-1 animate-fade-in">
                  <textarea
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder={`第${step.level}层追问：为什么会发生${idx > 0 ? '上一层的原因' : '这个问题'}？`}
                    value={val}
                    onChange={e => setValue(step.key, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Root Cause Summary */}
      {deepestFilled >= 3 && (
        <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50 mt-3">
          <div className="text-[11px] font-semibold text-emerald-800 mb-1">根因定位</div>
          <p className="text-[11px] text-emerald-700">
            已追溯至第{deepestFilled}层原因：{getValue(WHY_STEPS[deepestFilled - 1].key).slice(0, 80)}
            {getValue(WHY_STEPS[deepestFilled - 1].key).length > 80 ? '...' : ''}
          </p>
          {deepestFilled < 5 && (
            <p className="text-[10px] text-emerald-600 mt-1 italic">建议继续追问至第5层以找到根本原因</p>
          )}
        </div>
      )}
    </div>
  );
}
