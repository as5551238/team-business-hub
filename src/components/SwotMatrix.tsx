import { useState } from 'react';
import { Plus, X, Sparkles, ArrowUpRight, ArrowRight, Lightbulb } from 'lucide-react';

interface SwotData {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

interface Props {
  value: Record<string, string | string[]>;
  onChange: (inputs: Record<string, string | string[]>) => void;
  onAIFill: (stepKey: string) => void;
  isAIFilling: boolean;
}

const QUADRANT_CONFIG = [
  { key: 'strengths', label: '优势 (S)', labelEn: 'Strengths', stepKey: 'step_1', color: 'bg-emerald-50 border-emerald-200', headerBg: 'bg-emerald-100 text-emerald-800', tagBg: 'bg-emerald-100 text-emerald-700', icon: ArrowUpRight },
  { key: 'weaknesses', label: '劣势 (W)', labelEn: 'Weaknesses', stepKey: 'step_2', color: 'bg-orange-50 border-orange-200', headerBg: 'bg-orange-100 text-orange-800', tagBg: 'bg-orange-100 text-orange-700', icon: X },
  { key: 'opportunities', label: '机会 (O)', labelEn: 'Opportunities', stepKey: 'step_3', color: 'bg-blue-50 border-blue-200', headerBg: 'bg-blue-100 text-blue-800', tagBg: 'bg-blue-100 text-blue-700', icon: ArrowRight },
  { key: 'threats', label: '威胁 (T)', labelEn: 'Threats', stepKey: 'step_4', color: 'bg-red-50 border-red-200', headerBg: 'bg-red-100 text-red-800', tagBg: 'bg-red-100 text-red-700', icon: X },
] as const;

type StrategyType = 'SO' | 'WO' | 'ST' | 'WT';

const STRATEGY_MATRIX: { type: StrategyType; label: string; desc: string; from: string; to: string; color: string }[] = [
  { type: 'SO', label: '增长策略', desc: '利用优势抓住机会', from: 'strengths', to: 'opportunities', color: 'bg-emerald-100 border-emerald-300 text-emerald-800' },
  { type: 'WO', label: '改进策略', desc: '克服劣势利用机会', from: 'weaknesses', to: 'opportunities', color: 'bg-blue-100 border-blue-300 text-blue-800' },
  { type: 'ST', label: '防御策略', desc: '利用优势应对威胁', from: 'strengths', to: 'threats', color: 'bg-amber-100 border-amber-300 text-amber-800' },
  { type: 'WT', label: '规避策略', desc: '减少劣势避免威胁', from: 'weaknesses', to: 'threats', color: 'bg-red-100 border-red-300 text-red-800' },
];

export function SwotMatrix({ value, onChange, onAIFill, isAIFilling }: Props) {
  const [inputStates, setInputStates] = useState<Record<string, string>>({});
  const [showStrategies, setShowStrategies] = useState(false);

  function getList(quadrantKey: string): string[] {
    const q = QUADRANT_CONFIG.find(c => c.key === quadrantKey);
    if (!q) return [];
    const v = value[q.stepKey];
    return Array.isArray(v) ? v : [];
  }

  function addItem(quadrantKey: string, item: string) {
    if (!item.trim()) return;
    const q = QUADRANT_CONFIG.find(c => c.key === quadrantKey);
    if (!q) return;
    const current = getList(quadrantKey);
    onChange({ ...value, [q.stepKey]: [...current, item.trim()] });
    setInputStates(prev => ({ ...prev, [quadrantKey]: '' }));
  }

  function removeItem(quadrantKey: string, idx: number) {
    const q = QUADRANT_CONFIG.find(c => c.key === quadrantKey);
    if (!q) return;
    const current = getList(quadrantKey);
    onChange({ ...value, [q.stepKey]: current.filter((_, i) => i !== idx) });
  }

  const hasData = QUADRANT_CONFIG.some(q => getList(q.key).length > 0);

  return (
    <div className="space-y-4">
      {/* SWOT 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2">
        {QUADRANT_CONFIG.map(q => {
          const Icon = q.icon;
          const items = getList(q.key);
          return (
            <div key={q.key} className={`rounded-lg border p-3 ${q.color} min-h-[160px]`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold ${q.headerBg}`}>
                  <Icon size={12} />
                  {q.label}
                </div>
                <button
                  onClick={() => onAIFill(q.stepKey)}
                  disabled={isAIFilling}
                  className="p-1 rounded hover:bg-white/50 disabled:opacity-30"
                  title="AI填充"
                >
                  <Sparkles size={12} className="text-primary" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {items.map((item, idx) => (
                  <span key={idx} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${q.tagBg}`}>
                    {item}
                    <button onClick={() => removeItem(q.key, idx)} className="hover:opacity-60">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  className="flex-1 min-w-0 border border-white/60 rounded px-2 py-1 text-[11px] bg-white/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="添加..."
                  value={inputStates[q.key] || ''}
                  onChange={e => setInputStates(prev => ({ ...prev, [q.key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { addItem(q.key, inputStates[q.key] || ''); } }}
                />
                <button
                  onClick={() => addItem(q.key, inputStates[q.key] || '')}
                  className="p-1 rounded bg-white/60 hover:bg-white/80"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Strategy Suggestions */}
      {hasData && (
        <div>
          <button
            onClick={() => setShowStrategies(!showStrategies)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20"
          >
            <Lightbulb size={12} />
            {showStrategies ? '收起战略建议' : '生成战略建议'}
          </button>
          {showStrategies && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {STRATEGY_MATRIX.map(s => {
                const fromItems = getList(s.from);
                const toItems = getList(s.to);
                return (
                  <div key={s.type} className={`rounded-lg border p-3 ${s.color}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold">{s.type}</span>
                      <span className="text-[11px] font-semibold">{s.label}</span>
                    </div>
                    <p className="text-[10px] opacity-70 mb-2">{s.desc}</p>
                    {fromItems.length > 0 && toItems.length > 0 ? (
                      <div className="space-y-1">
                        {fromItems.slice(0, 2).flatMap(f =>
                          toItems.slice(0, 2).map((t, ti) => (
                            <div key={`${f}-${t}-${ti}`} className="text-[10px] bg-white/50 rounded px-1.5 py-0.5">
                              {s.from === 'strengths' ? 'S' : 'W'}:{f.length > 8 ? f.slice(0, 8) + '...' : f} + {s.to === 'opportunities' ? 'O' : 'T'}:{t.length > 8 ? t.slice(0, 8) + '...' : t}
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] opacity-50 italic">需要填写相关象限数据</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
