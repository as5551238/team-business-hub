/**
 * Dashboard 高级 AI Widget — 驱动层：约束求解、资源再分配、愿景策略、能力缺口、方法论进化
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Shuffle, ArrowRightLeft, Eye, GraduationCap, Dna } from 'lucide-react';
import { optimizeAssignmentsLocal, optimizeAssignmentsDeep } from '@/lib/ai/aiConstraintSolver';
import type { OptimizationResult } from '@/lib/ai/aiConstraintSolver';
import { reallocateResourcesLocal, reallocateResourcesDeep } from '@/lib/ai/aiResourceReallocator';
import type { ReallocResult } from '@/lib/ai/aiResourceReallocator';
import { cascadeVisionLocal, cascadeVisionDeep } from '@/lib/ai/aiVisionStrategy';
import type { VisionCascade } from '@/lib/ai/aiVisionStrategy';
import { diagnoseCapabilityGapLocal, diagnoseCapabilityGapDeep } from '@/lib/ai/aiCapabilityGap';
import type { GapDiagnosisResult } from '@/lib/ai/aiCapabilityGap';
import { evolveMethodologyLocal, evolveMethodologyDeep } from '@/lib/ai/aiMethodologyEvolution';
import type { MethodologyEvolutionResult } from '@/lib/ai/aiMethodologyEvolution';
import type { AppState } from '@/types';

/** AI 约束求解 Widget — 智能任务分配优化 */
export function AIConstraintSolverWidget({ state }: { state: AppState }) {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [tab, setTab] = useState<'new' | 'reassign'>('new');

  useEffect(() => {
    const local = optimizeAssignmentsLocal(state);
    setResult(local);
  }, [state]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try { const deep = await optimizeAssignmentsDeep(state); setResult(deep); } finally { setDeepLoading(false); }
  }, [state, deepLoading]);

  const items = tab === 'new' ? result?.newAssignments ?? [] : result?.reassignments ?? [];
  const emptyMsg = tab === 'new' ? '所有任务已分配' : '当前分配无优化空间';

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <Shuffle size={18} className="text-violet-500" />
        <h2 className="font-semibold text-sm md:text-base">约束求解</h2>
        {result && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">均衡 {result.metrics.currentBalance}%</span>}
        <span className="text-xs text-muted-foreground ml-auto">{result?.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '求解中...' : '深度求解'}</button>
      </div>
      {result && (
        <div className="p-4 md:px-5 space-y-3">
          <div className="flex gap-1.5">
            <button className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${tab === 'new' ? 'bg-violet-50 border-violet-300 text-violet-700 font-medium' : 'border-border hover:bg-muted/50'}`} onClick={() => setTab('new')}>新分配 ({result.newAssignments.length})</button>
            <button className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${tab === 'reassign' ? 'bg-violet-50 border-violet-300 text-violet-700 font-medium' : 'border-border hover:bg-muted/50'}`} onClick={() => setTab('reassign')}>优化调整 ({result.reassignments.length})</button>
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">{emptyMsg}</p>
          ) : items.slice(0, 5).map((a, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-violet-50 text-violet-700">{a.fitnessScore}%</span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{a.taskTitle}</p>
                <p className="text-xs text-muted-foreground truncate">{a.isReassignment ? `${a.currentLeaderName} → ${a.suggestedLeaderName}` : `→ ${a.suggestedLeaderName}`}</p>
                <p className="text-xs text-muted-foreground">{a.reason}</p>
              </div>
            </div>
          ))}
          {result.globalSuggestions.length > 0 && (
            <div className="pt-2 border-t border-border"><p className="text-xs font-semibold text-violet-600 mb-1">全局建议</p>{result.globalSuggestions.slice(0, 3).map((s, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {s}</p>)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** AI 资源再分配 Widget — 负载均衡与资源流动 */
export function AIResourceReallocWidget({ state }: { state: AppState }) {
  const [result, setResult] = useState<ReallocResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);

  useEffect(() => {
    const local = reallocateResourcesLocal(state);
    setResult(local);
  }, [state]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try { const deep = await reallocateResourcesDeep(state); setResult(deep); } finally { setDeepLoading(false); }
  }, [state, deepLoading]);

  const URGENCY_LABELS: Record<string, string> = { immediate: '紧急', soon: '近期', optional: '可选' };
  const URGENCY_COLORS: Record<string, string> = { immediate: 'bg-red-50 text-red-700', soon: 'bg-amber-50 text-amber-700', optional: 'bg-gray-50 text-gray-600' };
  const ACTION_LABELS: Record<string, string> = { move: '迁移', share: '共享', defer: '延缓', escalate: '升级', split: '拆分' };

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <ArrowRightLeft size={18} className="text-teal-500" />
        <h2 className="font-semibold text-sm md:text-base">资源再分配</h2>
        {result && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">均衡 {result.beforeMetrics.balanceScore}→{result.afterMetrics.balanceScore}</span>}
        <span className="text-xs text-muted-foreground ml-auto">{result?.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '分析中...' : '深度分析'}</button>
      </div>
      {result && (
        <div className="p-4 md:px-5 space-y-3">
          {result.imbalance.overloadedMembers.length > 0 && (
            <div><p className="text-xs font-semibold text-red-500 mb-1">过载成员</p>{result.imbalance.overloadedMembers.map((m, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {m.memberName}: 超载{m.overloadPct}%</p>)}</div>
          )}
          {result.imbalance.underloadedMembers.length > 0 && (
            <div><p className="text-xs font-semibold text-green-600 mb-1">闲置容量</p>{result.imbalance.underloadedMembers.map((m, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {m.memberName}: 余{m.capacityRemaining}%</p>)}</div>
          )}
          {result.suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">资源分配均衡，无需调整</p>
          ) : result.suggestions.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${URGENCY_COLORS[s.urgency] || 'bg-gray-50 text-gray-600'}`}>{URGENCY_LABELS[s.urgency] || s.urgency}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate"><span className="text-teal-600">[{ACTION_LABELS[s.action] || s.action}]</span> {s.taskTitle || s.reason}</p>
                {s.fromMemberId && <p className="text-xs text-muted-foreground truncate">{s.fromMemberName}{s.toMemberName ? ` → ${s.toMemberName}` : ''}</p>}
                <p className="text-xs text-muted-foreground">{s.expectedImprovement}</p>
              </div>
            </div>
          ))}
          {result.imbalance.scarceDimensions.length > 0 && (
            <div className="pt-2 border-t border-border"><p className="text-xs font-semibold text-amber-600 mb-1">紧缺能力</p>{result.imbalance.scarceDimensions.map((d, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 mr-1">{d}</span>)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** AI 愿景策略级联 Widget — 愿景→策略→目标对齐 */
export function AIVisionStrategyWidget({ state }: { state: AppState }) {
  const [result, setResult] = useState<VisionCascade | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);

  useEffect(() => {
    const local = cascadeVisionLocal(state);
    setResult(local);
  }, [state]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try { const deep = await cascadeVisionDeep(state); setResult(deep); } finally { setDeepLoading(false); }
  }, [state, deepLoading]);

  const SEVERITY_COLORS: Record<string, string> = { high: 'bg-red-50 text-red-700', medium: 'bg-amber-50 text-amber-700', low: 'bg-blue-50 text-blue-700' };

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <Eye size={18} className="text-sky-500" />
        <h2 className="font-semibold text-sm md:text-base">愿景策略级联</h2>
        {result && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">级联 {result.cascadeProgress.overall}%</span>}
        <span className="text-xs text-muted-foreground ml-auto">{result?.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '分析中...' : '深度级联'}</button>
      </div>
      {result && (
        <div className="p-4 md:px-5 space-y-3">
          <p className="text-sm font-medium">{result.visionStatement}</p>
          {result.strategies.length > 0 && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-muted/30"><div className="text-sm font-bold text-sky-600">{result.cascadeProgress.visionToStrategy}%</div><div className="text-[10px] text-muted-foreground">愿景→策略</div></div>
              <div className="p-2 rounded-lg bg-muted/30"><div className="text-sm font-bold text-indigo-600">{result.cascadeProgress.goalsToProjects}%</div><div className="text-[10px] text-muted-foreground">目标→项目</div></div>
              <div className="p-2 rounded-lg bg-muted/30"><div className="text-sm font-bold text-violet-600">{result.strategies.length}</div><div className="text-[10px] text-muted-foreground">策略方向</div></div>
            </div>
          )}
          {result.alignmentIssues.length > 0 && (
            <div><p className="text-xs font-semibold text-amber-600 mb-1">对齐问题</p>{result.alignmentIssues.slice(0, 3).map((a, i) => (
              <div key={i} className="flex items-start gap-2 py-1"><span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_COLORS[a.severity] || 'bg-gray-50'}`}>{a.severity}</span><div><p className="text-xs text-muted-foreground">{a.description}</p></div></div>
            ))}</div>
          )}
          {result.strategyGaps.length > 0 && (
            <div><p className="text-xs font-semibold text-red-500 mb-1">策略缺口</p>{result.strategyGaps.slice(0, 3).map((g, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {g}</p>)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** AI 能力缺口诊断 Widget — 团队能力差距分析 */
export function AICapabilityGapWidget({ state }: { state: AppState }) {
  const [result, setResult] = useState<GapDiagnosisResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);

  useEffect(() => {
    const local = diagnoseCapabilityGapLocal(state);
    setResult(local);
  }, [state]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try { const deep = await diagnoseCapabilityGapDeep(state); setResult(deep); } finally { setDeepLoading(false); }
  }, [state, deepLoading]);

  const SEVERITY_COLORS: Record<string, string> = { critical: 'bg-red-50 text-red-700', high: 'bg-orange-50 text-orange-700', medium: 'bg-amber-50 text-amber-700', low: 'bg-blue-50 text-blue-700' };
  const STRATEGY_LABELS: Record<string, string> = { training: '培训', hiring: '招聘', reassignment: '调配', outsourcing: '外协', tooling: '工具' };

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <GraduationCap size={18} className="text-orange-500" />
        <h2 className="font-semibold text-sm md:text-base">能力缺口诊断</h2>
        {result && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">充足度 {result.capabilitySufficiency}%</span>}
        <span className="text-xs text-muted-foreground ml-auto">{result?.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '诊断中...' : '深度诊断'}</button>
      </div>
      {result && (
        <div className="p-4 md:px-5 space-y-3">
          {result.gaps.length === 0 ? (
            <p className="text-xs text-muted-foreground">团队能力充足，无显著缺口</p>
          ) : result.gaps.slice(0, 4).map((g, i) => (
            <div key={i} className="py-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_COLORS[g.severity]}`}>{g.dimensionLabel}</span>
                <span className="text-xs text-muted-foreground">{g.currentLevel}/{g.requiredLevel} 差距{g.gap}</span>
              </div>
              <div className="flex gap-1 mt-1">{g.strategies.slice(0, 2).map((s, j) => <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">{STRATEGY_LABELS[s.type] || s.type}</span>)}</div>
            </div>
          ))}
          {result.priorityActions.length > 0 && (
            <div className="pt-2 border-t border-border"><p className="text-xs font-semibold text-orange-600 mb-1">优先行动</p>{result.priorityActions.map((a, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• <span className="font-medium">{a.action}</span> ({a.deadline})</p>)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** AI 方法论进化 Widget — 方法论效果追踪与自适应调整 */
export function AIMethodologyEvolutionWidget({ state }: { state: AppState }) {
  const [result, setResult] = useState<MethodologyEvolutionResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);

  useEffect(() => {
    const local = evolveMethodologyLocal(state);
    setResult(local);
  }, [state]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try { const deep = await evolveMethodologyDeep(state); setResult(deep); } finally { setDeepLoading(false); }
  }, [state, deepLoading]);

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <Dna size={18} className="text-pink-500" />
        <h2 className="font-semibold text-sm md:text-base">方法论进化</h2>
        {result?.topMethodology && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-50 text-pink-700">最优: {result.topMethodology.name}</span>}
        <span className="text-xs text-muted-foreground ml-auto">{result?.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '进化中...' : '深度进化'}</button>
      </div>
      {result && (
        <div className="p-4 md:px-5 space-y-3">
          {result.weightAdjustments.length === 0 ? (
            <p className="text-xs text-muted-foreground">方法论权重稳定，暂无调整</p>
          ) : result.weightAdjustments.map((w, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className={`text-xs px-1.5 py-0.5 rounded ${w.newWeight > w.oldWeight ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{w.newWeight > w.oldWeight ? '↑' : '↓'}</span>
              <p className="text-xs text-muted-foreground">{w.name} {w.oldWeight}→{w.newWeight}</p>
            </div>
          ))}
          {result.evolutionSuggestions.length > 0 && (
            <div className="pt-2 border-t border-border"><p className="text-xs font-semibold text-pink-600 mb-1">进化建议</p>{result.evolutionSuggestions.slice(0, 3).map((s, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {s}</p>)}</div>
          )}
        </div>
      )}
    </div>
  );
}
