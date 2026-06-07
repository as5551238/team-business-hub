import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { EffectivenessMetric, AISuggestion } from '@/types';
import { Target, TrendingUp, Sparkles, CheckCircle, XCircle, Plus, X } from 'lucide-react';
import { inputCls, primaryBtnCls, btnCls } from './constants';

export function EffectivenessTab() {
  const { state, dispatch } = useStore();
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [mGoalId, setMGoalId] = useState('');
  const [mBusinessValue, setMBusinessValue] = useState('');
  const [mEffortHours, setMEffortHours] = useState('');
  const [mImpactScore, setMImpactScore] = useState('');

  const metrics = state.effectivenessMetrics;
  const suggestions = state.aiSuggestions;

  // Stats
  const avgBusinessValue = metrics.length > 0 ? metrics.reduce((s, m) => s + m.businessValue, 0) / metrics.length : 0;
  const avgEffort = metrics.length > 0 ? metrics.reduce((s, m) => s + m.effortHours, 0) / metrics.length : 0;
  const avgImpact = metrics.length > 0 ? metrics.reduce((s, m) => s + m.impactScore, 0) / metrics.length : 0;
  const totalEfficiency = avgEffort > 0 ? (avgImpact / avgEffort * 10).toFixed(1) : '-';

  // AI Suggestion stats
  const adoptRate = suggestions.length > 0
    ? (suggestions.filter(s => s.status === 'adopted' || s.status === 'partially_adopted').length / suggestions.length * 100).toFixed(0)
    : '0';
  const avgOutcome = suggestions.filter(s => s.outcomeRating != null).length > 0
    ? (suggestions.filter(s => s.outcomeRating != null).reduce((s, a) => s + (a.outcomeRating || 0), 0) / suggestions.filter(s => s.outcomeRating != null).length).toFixed(1)
    : '-';

  // Effectiveness vs Efficiency quadrant
  const quadrant = useMemo(() => {
    return metrics.map(m => {
      const goal = state.goals.find(g => g.id === m.goalId);
      return { id: m.id, name: goal?.title || m.goalId, bv: m.businessValue, effort: m.effortHours, impact: m.impactScore };
    });
  }, [metrics, state.goals]);

  function handleAddMetric() {
    if (!mGoalId) return;
    const bv = Number(mBusinessValue) || 0;
    const effort = Number(mEffortHours) || 0;
    const impact = Number(mImpactScore) || 0;
    const roi = effort > 0 ? (bv * impact) / effort : null;
    dispatch({ type: 'ADD_EFFECTIVENESS_METRIC', payload: { goalId: mGoalId, businessValue: bv, effortHours: effort, impactScore: impact, roi, teamId: state.currentTeamId || '__default__' } });
    setMGoalId(''); setMBusinessValue(''); setMEffortHours(''); setMImpactScore('');
    setShowAddMetric(false);
  }

  function handleAdoptSuggestion(id: string) {
    dispatch({ type: 'UPDATE_AI_SUGGESTION', payload: { id, updates: { status: 'adopted', adoptedAt: new Date().toISOString() } } });
  }

  function handleDismissSuggestion(id: string) {
    dispatch({ type: 'UPDATE_AI_SUGGESTION', payload: { id, updates: { status: 'dismissed' } } });
  }

  function handleRateOutcome(id: string, rating: number) {
    dispatch({ type: 'UPDATE_AI_SUGGESTION', payload: { id, updates: { outcomeRating: rating } } });
  }

  return (
    <div className="space-y-4">
      {/* Effectiveness Dashboard */}
      <div className="grid grid-cols-4 gap-2">
        <div className="border rounded-lg p-2">
          <div className="text-[9px] text-muted-foreground">平均商业价值</div>
          <div className="text-base font-bold">{avgBusinessValue.toFixed(1)}</div>
        </div>
        <div className="border rounded-lg p-2">
          <div className="text-[9px] text-muted-foreground">平均投入</div>
          <div className="text-base font-bold">{avgEffort.toFixed(1)}h</div>
        </div>
        <div className="border rounded-lg p-2">
          <div className="text-[9px] text-muted-foreground">平均影响力</div>
          <div className="text-base font-bold">{avgImpact.toFixed(1)}</div>
        </div>
        <div className="border rounded-lg p-2">
          <div className="text-[9px] text-muted-foreground">效率指数</div>
          <div className="text-base font-bold text-primary">{totalEfficiency}</div>
        </div>
      </div>

      {/* Effectiveness vs Efficiency Quadrant */}
      {quadrant.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="text-[11px] font-semibold mb-2">有效性 vs 效率 矩阵</div>
          <div className="relative w-full h-48 border border-dashed">
            {/* Axes */}
            <div className="absolute left-0 top-0 w-px h-full bg-gray-300" />
            <div className="absolute bottom-0 left-0 w-full h-px bg-gray-300" />
            <div className="absolute top-1 left-1 text-[8px] text-muted-foreground">高价值</div>
            <div className="absolute bottom-1 right-1 text-[8px] text-muted-foreground">高效率 →</div>
            {/* Mid line */}
            <div className="absolute left-1/2 top-0 w-px h-full border-l border-dashed border-gray-200" />
            <div className="absolute top-1/2 left-0 w-full h-px border-t border-dashed border-gray-200" />
            {/* Quadrant labels */}
            <div className="absolute top-2 left-1/4 text-[8px] text-red-400">明星项目</div>
            <div className="absolute top-2 right-1/4 text-[8px] text-amber-400">高优低效</div>
            <div className="absolute bottom-4 left-1/4 text-[8px] text-blue-400">低优高效</div>
            <div className="absolute bottom-4 right-1/4 text-[8px] text-gray-400">低优低效</div>
            {/* Dots */}
            {quadrant.map(q => {
              const x = Math.min(95, Math.max(5, (q.effort > 0 ? (q.impact / q.effort) : 0) * 15));
              const y = Math.min(90, Math.max(10, 100 - q.bv * 10));
              return (
                <Tooltip><TooltipTrigger asChild><div key={q.id} className="absolute w-2 h-2 rounded-full bg-primary" style={{ left: `${x}%`, bottom: `${100 - y}%` }} /></TooltipTrigger><TooltipContent>{`${q.name}: 价值${q.bv} 投入${q.effort}h 影响力${q.impact}`}</TooltipContent></Tooltip>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => setShowAddMetric(true)} className={primaryBtnCls}><Plus size={12} /> 度量目标</button>
      </div>

      {/* Metrics list */}
      {metrics.length > 0 && (
        <div className="space-y-1">
          {metrics.map(m => {
            const goal = state.goals.find(g => g.id === m.goalId);
            return (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-[11px]">
                <Target size={10} className="text-primary" />
                <span className="font-medium flex-1 truncate">{goal?.title || m.goalId}</span>
                <span>价值:{m.businessValue}</span>
                <span>投入:{m.effortHours}h</span>
                <span>影响力:{m.impactScore}</span>
                {m.roi != null && <span className="font-medium text-primary">ROI:{m.roi.toFixed(2)}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* AI Suggestion Dashboard (R3-4) */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-primary" />
          <span className="text-sm font-semibold">AI建议采纳仪表盘</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="border rounded p-2">
            <div className="text-[9px] text-muted-foreground">总建议</div>
            <div className="text-base font-bold">{suggestions.length}</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-[9px] text-muted-foreground">采纳率</div>
            <div className="text-base font-bold text-emerald-600">{adoptRate}%</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-[9px] text-muted-foreground">转化效果</div>
            <div className="text-base font-bold text-primary">{avgOutcome}/5</div>
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="space-y-1">
            {suggestions.slice(0, 10).map(s => (
              <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-[11px]">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  s.status === 'adopted' ? 'bg-emerald-100 text-emerald-700' :
                  s.status === 'dismissed' ? 'bg-red-100 text-red-700' :
                  s.status === 'partially_adopted' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {s.status === 'adopted' ? '已采纳' : s.status === 'dismissed' ? '已忽略' : s.status === 'partially_adopted' ? '部分采纳' : '待定'}
                </span>
                <span className="flex-1 truncate">{s.content}</span>
                {s.status === 'suggested' && (
                  <>
                    <button onClick={() => handleAdoptSuggestion(s.id)} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"><CheckCircle size={12} /></button>
                    <button onClick={() => handleDismissSuggestion(s.id)} className="p-0.5 text-red-500 hover:bg-red-50 rounded"><XCircle size={12} /></button>
                  </>
                )}
                {s.status === 'adopted' && s.outcomeRating == null && (
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(r => (
                      <button key={r} onClick={() => handleRateOutcome(s.id, r)} className="text-[8px] text-amber-500 hover:text-amber-600">{r}</button>
                    ))}
                  </div>
                )}
                {s.outcomeRating != null && <span className="text-[9px] text-amber-600">效果:{s.outcomeRating}/5</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Metric Dialog */}
      {showAddMetric && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddMetric(false)} />
          <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-md animate-slide-up">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">度量目标有效性</h3>
              <button onClick={() => setShowAddMetric(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium block mb-1">关联目标 *</label>
                <select className={inputCls} value={mGoalId} onChange={e => setMGoalId(e.target.value)}>
                  <option value="">选择目标</option>
                  {state.goals.filter(g => !g.deletedAt).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-medium block mb-1">商业价值 (1-10)</label>
                  <input type="number" min="1" max="10" className={inputCls} value={mBusinessValue} onChange={e => setMBusinessValue(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-medium block mb-1">投入工时</label>
                  <input type="number" className={inputCls} value={mEffortHours} onChange={e => setMEffortHours(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-medium block mb-1">影响力 (1-10)</label>
                  <input type="number" min="1" max="10" className={inputCls} value={mImpactScore} onChange={e => setMImpactScore(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setShowAddMetric(false)} className={btnCls}>取消</button>
              <button onClick={handleAddMetric} disabled={!mGoalId} className={primaryBtnCls}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
