import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { DSTEPhase, ReviewKnowledge, OKRScore, CapacityPlan, BusinessValueEntry } from '@/types';
import { GitBranch, CheckCircle, Clock, Sparkles, Plus, X, BarChart3, AlertTriangle, Network, Target, Zap } from 'lucide-react';
import { inputCls, primaryBtnCls, btnCls } from './constants';

const PHASE_LABELS: Record<DSTEPhase['phase'], { label: string; icon: string; color: string }> = {
  strategy: { label: '战略制定', icon: '🎯', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  decode: { label: '战略解码', icon: '🔑', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  execute: { label: '执行落地', icon: '⚡', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  evaluate: { label: '评估复盘', icon: '🔍', color: 'bg-amber-100 text-amber-700 border-amber-300' },
};

export function DSTETab() {
  const { state, dispatch } = useStore();
  const [showInitDSTE, setShowInitDSTE] = useState(false);
  const [dsteSeasonId, setDsteSeasonId] = useState('');
  const [showBV, setShowBV] = useState(false);
  const [bvGoalId, setBvGoalId] = useState('');
  const [bvCost, setBvCost] = useState('');
  const [bvValue, setBvValue] = useState('');
  const [bvStream, setBvStream] = useState('');

  const phases = state.dstePhases;
  const knowledge = state.reviewKnowledge;
  const okrScores = state.okrScores;
  const capacityPlans = state.capacityPlans;
  const businessValues = state.businessValues;

  // DSTE Progress
  const phasesBySeason = useMemo(() => {
    const map: Record<string, DSTEPhase[]> = {};
    for (const p of phases) {
      if (!map[p.seasonId]) map[p.seasonId] = [];
      map[p.seasonId].push(p);
    }
    return map;
  }, [phases]);

  // OKR scoring summary
  const scoringSummary = useMemo(() => {
    const bySeason: Record<string, { scores: OKRScore[]; avgScore: number; avgConfidence: number }> = {};
    for (const s of okrScores) {
      if (!bySeason[s.seasonId]) bySeason[s.seasonId] = { scores: [], avgScore: 0, avgConfidence: 0 };
      bySeason[s.seasonId].scores.push(s);
    }
    for (const [sid, data] of Object.entries(bySeason)) {
      data.avgScore = data.scores.length > 0 ? data.scores.reduce((s, o) => s + o.score, 0) / data.scores.length : 0;
      data.avgConfidence = data.scores.length > 0 ? data.scores.reduce((s, o) => s + o.confidence, 0) / data.scores.length : 0;
    }
    return bySeason;
  }, [okrScores]);

  // Business value ROI
  const totalROI = businessValues.length > 0
    ? businessValues.reduce((s, b) => s + b.roi, 0) / businessValues.length
    : 0;

  function handleInitDSTE() {
    if (!dsteSeasonId) return;
    const seasonPhases: DSTEPhase['phase'][] = ['strategy', 'decode', 'execute', 'evaluate'];
    for (const phase of seasonPhases) {
      dispatch({
        type: 'ADD_DSTE_PHASE',
        payload: {
          seasonId: dsteSeasonId, phase, status: phase === 'strategy' ? 'in_progress' : 'not_started',
          aiAutoProgress: true, completedAt: null,
          checklist: getDefaultChecklist(phase),
          teamId: state.currentTeamId || '__default__',
        },
      });
    }
    setShowInitDSTE(false); setDsteSeasonId('');
  }

  function getDefaultChecklist(phase: DSTEPhase['phase']): { item: string; done: boolean }[] {
    const items: Record<DSTEPhase['phase'], string[]> = {
      strategy: ['3年愿景确认', '年度战略方向确定', '核心目标识别', '资源配置方案'],
      decode: ['OKR季度拆解', '关键结果定义', '责任人分配', '里程碑确认'],
      execute: ['项目启动', '任务分配', '进度跟踪', '偏差修正'],
      evaluate: ['OKR评分', '复盘分析', '经验沉淀', '下轮规划'],
    };
    return items[phase].map(item => ({ item, done: false }));
  }

  function handleToggleChecklist(phaseId: string, checkIdx: number) {
    const phase = phases.find(p => p.id === phaseId);
    if (!phase) return;
    const checklist = phase.checklist.map((c, i) => i === checkIdx ? { ...c, done: !c.done } : c);
    const allDone = checklist.every(c => c.done);
    dispatch({
      type: 'UPDATE_DSTE_PHASE',
      payload: { id: phaseId, updates: { checklist, status: allDone ? 'completed' : 'in_progress', completedAt: allDone ? new Date().toISOString() : null } },
    });
  }

  function handleNextPhase(currentPhaseId: string) {
    const phase = phases.find(p => p.id === currentPhaseId);
    if (!phase) return;
    const order: DSTEPhase['phase'][] = ['strategy', 'decode', 'execute', 'evaluate'];
    const currentIdx = order.indexOf(phase.phase);
    if (currentIdx >= 3) return;
    const nextPhase = order[currentIdx + 1];
    const nextPhaseObj = phases.find(p => p.seasonId === phase.seasonId && p.phase === nextPhase);
    if (nextPhaseObj) {
      dispatch({ type: 'UPDATE_DSTE_PHASE', payload: { id: currentPhaseId, updates: { status: 'completed', completedAt: new Date().toISOString() } } });
      dispatch({ type: 'UPDATE_DSTE_PHASE', payload: { id: nextPhaseObj.id, updates: { status: 'in_progress' } } });
    }
  }

  function handleAddBV() {
    if (!bvGoalId) return;
    const cost = Number(bvCost) || 0;
    const value = Number(bvValue) || 0;
    const roi = cost > 0 ? (value - cost) / cost : 0;
    dispatch({ type: 'ADD_BUSINESS_VALUE', payload: { goalId: bvGoalId, inputCost: cost, outputValue: value, roi, valueStream: bvStream || '', measuredAt: new Date().toISOString(), teamId: state.currentTeamId || '__default__' } });
    setBvGoalId(''); setBvCost(''); setBvValue(''); setBvStream(''); setShowBV(false);
  }

  return (
    <div className="space-y-4">
      {/* DSTE Pipeline */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2"><GitBranch size={14} /> DSTE闭环</h3>
        <button onClick={() => setShowInitDSTE(true)} className={primaryBtnCls}><Plus size={12} /> 启动DSTE</button>
      </div>

      {phases.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-xs">暂无DSTE闭环，点击"启动DSTE"选择OKR周期</div>
      )}

      {/* DSTE Phases by Season */}
      {Object.entries(phasesBySeason).map(([seasonId, seasonPhases]) => {
        const season = state.seasons.find(s => s.id === seasonId);
        const sorted = seasonPhases.sort((a, b) => {
          const order: DSTEPhase['phase'][] = ['strategy', 'decode', 'execute', 'evaluate'];
          return order.indexOf(a.phase) - order.indexOf(b.phase);
        });
        return (
          <div key={seasonId} className="border rounded-lg p-3 space-y-2">
            <div className="text-xs font-semibold">{season?.name || seasonId}</div>
            <div className="flex items-center gap-1">
              {sorted.map((p, i) => {
                const config = PHASE_LABELS[p.phase];
                return (
                  <div key={p.id} className="flex-1">
                    <div className={`rounded-lg border-2 p-2 ${config.color} ${p.status === 'in_progress' ? 'ring-2 ring-primary/40' : ''}`}>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-sm">{config.icon}</span>
                        <span className="text-[10px] font-bold">{config.label}</span>
                        {p.status === 'completed' && <CheckCircle size={10} className="ml-auto" />}
                        {p.status === 'in_progress' && <Clock size={10} className="ml-auto animate-pulse" />}
                      </div>
                      {/* Checklist */}
                      <div className="space-y-0.5">
                        {p.checklist.map((c, ci) => (
                          <label key={ci} className="flex items-center gap-1 text-[9px] cursor-pointer">
                            <input type="checkbox" checked={c.done} onChange={() => handleToggleChecklist(p.id, ci)} className="w-2.5 h-2.5" />
                            <span className={c.done ? 'line-through opacity-60' : ''}>{c.item}</span>
                          </label>
                        ))}
                      </div>
                      {p.status === 'in_progress' && p.checklist.some(c => c.done) && (
                        <button onClick={() => handleNextPhase(p.id)} className="mt-1 px-1.5 py-0.5 text-[8px] font-medium bg-white/60 rounded hover:bg-white/80">
                          推进下一阶段 →
                        </button>
                      )}
                    </div>
                    {i < 3 && <div className="w-2 h-px bg-gray-300 mx-auto mt-1" />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* OKR Scoring (R4-2) */}
      {okrScores.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2"><Target size={14} className="text-primary" /><span className="text-xs font-semibold">OKR评分</span></div>
          <div className="space-y-1">
            {Object.entries(scoringSummary).map(([sid, data]) => {
              const season = state.seasons.find(s => s.id === sid);
              return (
                <div key={sid} className="flex items-center gap-3 text-[11px]">
                  <span className="font-medium">{season?.name || sid}</span>
                  <span>平均评分: <span className="font-bold text-primary">{data.avgScore.toFixed(2)}</span></span>
                  <span>信心度: <span className="font-bold text-blue-600">{data.avgConfidence.toFixed(0)}%</span></span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Capacity Planning (R4-3) */}
      {capacityPlans.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2"><BarChart3 size={14} className="text-primary" /><span className="text-xs font-semibold">产能规划</span></div>
          <div className="space-y-1">
            {capacityPlans.map(cp => (
              <div key={cp.id} className="flex items-center gap-2 text-[11px]">
                <span className="font-medium w-16">{cp.period}</span>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-[10px]">可用:{cp.availableHours}h</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cp.plannedHours > cp.availableHours ? 'bg-red-400' : 'bg-emerald-400'}`}
                      style={{ width: `${Math.min(100, cp.plannedHours / Math.max(1, cp.availableHours) * 100)}%` }} />
                  </div>
                  <span className="text-[10px]">计划:{cp.plannedHours}h</span>
                  {cp.gap < 0 && <AlertTriangle size={10} className="text-red-500" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Business Value (R4-5) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Zap size={14} className="text-primary" /><span className="text-xs font-semibold">商业价值</span>
          {businessValues.length > 0 && <span className="text-[10px] text-muted-foreground">平均ROI: {totalROI.toFixed(2)}</span>}
        </div>
        <button onClick={() => setShowBV(true)} className={btnCls}><Plus size={10} /> 录入</button>
      </div>
      {businessValues.length > 0 && (
        <div className="space-y-1">
          {businessValues.map(bv => {
            const goal = state.goals.find(g => g.id === bv.goalId);
            return (
              <div key={bv.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-[11px]">
                <span className="font-medium flex-1 truncate">{goal?.title || bv.goalId}</span>
                <span>投入:¥{bv.inputCost.toLocaleString()}</span>
                <span>产出:¥{bv.outputValue.toLocaleString()}</span>
                <span className={`font-bold ${bv.roi > 0 ? 'text-emerald-600' : 'text-red-600'}`}>ROI:{(bv.roi * 100).toFixed(0)}%</span>
                {bv.valueStream && <span className="text-[9px] text-muted-foreground">{bv.valueStream}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Review Knowledge (R4-1) */}
      {knowledge.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2"><Network size={14} className="text-primary" /><span className="text-xs font-semibold">复盘知识图谱</span></div>
          <div className="space-y-1">
            {knowledge.slice(0, 10).map(k => (
              <div key={k.id} className="px-2 py-1.5 rounded bg-primary/5 text-[11px]">
                <div className="font-medium">{k.pattern}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{k.context}</div>
                {k.aiExtracted && <span className="text-[8px] text-primary"><Sparkles size={8} className="inline" /> AI提取</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Init DSTE Dialog */}
      {showInitDSTE && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowInitDSTE(false)} />
          <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-xs animate-slide-up p-4 space-y-3">
            <h3 className="font-semibold text-sm">启动DSTE闭环</h3>
            <select className={inputCls} value={dsteSeasonId} onChange={e => setDsteSeasonId(e.target.value)}>
              <option value="">选择OKR周期</option>
              {state.seasons.filter(s => s.status !== 'closed').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInitDSTE(false)} className={btnCls}>取消</button>
              <button onClick={handleInitDSTE} disabled={!dsteSeasonId} className={primaryBtnCls}>启动</button>
            </div>
          </div>
        </div>
      )}

      {/* Business Value Dialog */}
      {showBV && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowBV(false)} />
          <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-md animate-slide-up">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">录入商业价值</h3>
              <button onClick={() => setShowBV(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <select className={inputCls} value={bvGoalId} onChange={e => setBvGoalId(e.target.value)}>
                <option value="">选择目标</option>
                {state.goals.filter(g => !g.deletedAt).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium block mb-1">投入成本 (¥)</label>
                  <input type="number" className={inputCls} value={bvCost} onChange={e => setBvCost(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-medium block mb-1">产出价值 (¥)</label>
                  <input type="number" className={inputCls} value={bvValue} onChange={e => setBvValue(e.target.value)} />
                </div>
              </div>
              <input className={inputCls} placeholder="价值流名称" value={bvStream} onChange={e => setBvStream(e.target.value)} />
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setShowBV(false)} className={btnCls}>取消</button>
              <button onClick={handleAddBV} disabled={!bvGoalId} className={primaryBtnCls}>录入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
