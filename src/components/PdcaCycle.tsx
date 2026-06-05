import { useState } from 'react';
import { Sparkles, RotateCcw, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface Props {
  value: Record<string, string | string[]>;
  onChange: (inputs: Record<string, string | string[]>) => void;
  onAIFill: (stepKey: string) => void;
  isAIFilling: boolean;
}

const PDCA_STEPS = [
  { key: 'step_1', letter: 'P', label: 'Plan', cnLabel: '计划', color: 'bg-blue-500', lightColor: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700', icon: '📋' },
  { key: 'step_2', letter: 'D', label: 'Do', cnLabel: '执行', color: 'bg-emerald-500', lightColor: 'bg-emerald-50 border-emerald-200', textColor: 'text-emerald-700', icon: '⚡' },
  { key: 'step_3', letter: 'C', label: 'Check', cnLabel: '检查', color: 'bg-amber-500', lightColor: 'bg-amber-50 border-amber-200', textColor: 'text-amber-700', icon: '🔍' },
  { key: 'step_4', letter: 'A', label: 'Act', cnLabel: '行动', color: 'bg-purple-500', lightColor: 'bg-purple-50 border-purple-200', textColor: 'text-purple-700', icon: '🚀' },
] as const;

export function PdcaCycle({ value, onChange, onAIFill, isAIFilling }: Props) {
  const [activeStep, setActiveStep] = useState<string | null>(null);

  function getStepValue(stepKey: string): string {
    const v = value[stepKey];
    return typeof v === 'string' ? v : '';
  }

  function setStepValue(stepKey: string, val: string) {
    onChange({ ...value, [stepKey]: val });
  }

  const filledSteps = PDCA_STEPS.filter(s => getStepValue(s.key).trim().length > 0);
  const hasGapAnalysis = getStepValue('step_1').trim() && getStepValue('step_3').trim();

  return (
    <div className="space-y-4">
      {/* PDCA Circular Visual */}
      <div className="relative flex items-center justify-center py-4">
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {PDCA_STEPS.map((step, idx) => {
            const isActive = activeStep === step.key;
            const hasContent = getStepValue(step.key).trim().length > 0;
            return (
              <button
                key={step.key}
                onClick={() => setActiveStep(isActive ? null : step.key)}
                className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                  isActive ? `${step.lightColor} border-current ${step.textColor} shadow-md` : `${step.lightColor} border-transparent hover:border-current/30`
                } ${idx === 1 ? 'order-2' : idx === 3 ? 'order-3' : idx === 0 ? 'order-1' : 'order-4'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-8 h-8 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-bold shadow-sm`}>
                    {step.letter}
                  </span>
                  <div>
                    <div className="text-xs font-bold">{step.label}</div>
                    <div className="text-[10px] opacity-70">{step.cnLabel}</div>
                  </div>
                  {hasContent && <CheckCircle size={12} className="ml-auto opacity-60" />}
                </div>
                {hasContent && (
                  <p className="text-[10px] mt-1 line-clamp-2 opacity-80">
                    {getStepValue(step.key).slice(0, 60)}{getStepValue(step.key).length > 60 ? '...' : ''}
                  </p>
                )}
                {/* Cycle arrow indicator */}
                {idx < 3 && (
                  <div className="absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-muted-foreground">
                    <ArrowRight size={12} />
                  </div>
                )}
                {idx === 3 && (
                  <div className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 text-muted-foreground">
                    <RotateCcw size={10} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Step Editor */}
      {activeStep && (
        <div className="border rounded-lg p-4 space-y-2 animate-fade-in">
          {(() => {
            const step = PDCA_STEPS.find(s => s.key === activeStep)!;
            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full ${step.color} text-white flex items-center justify-center text-xs font-bold`}>
                      {step.letter}
                    </span>
                    <span className="text-sm font-semibold">{step.cnLabel} ({step.label})</span>
                  </div>
                  <button
                    onClick={() => onAIFill(activeStep)}
                    disabled={isAIFilling}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    <Sparkles size={10} /> {isAIFilling ? 'AI分析中...' : 'AI填充'}
                  </button>
                </div>
                <textarea
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={`请输入${step.cnLabel}阶段的内容...`}
                  value={getStepValue(activeStep)}
                  onChange={e => setStepValue(activeStep, e.target.value)}
                />
              </>
            );
          })()}
        </div>
      )}

      {/* Gap Analysis Banner */}
      {hasGapAnalysis && (
        <div className="border border-amber-200 rounded-lg p-3 bg-amber-50 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[11px] text-amber-800">
            <span className="font-semibold">偏差分析：</span>
            计划与检查结果已填写，请确认偏差并在"行动"步骤制定改进方案，形成PDCA闭环。
          </div>
        </div>
      )}

      {/* Cycle Completion Indicator */}
      {filledSteps.length === 4 && (
        <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50 flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-600" />
          <span className="text-[11px] text-emerald-800 font-medium">完整PDCA循环已填写，可进入下一步完成复盘</span>
        </div>
      )}
    </div>
  );
}
