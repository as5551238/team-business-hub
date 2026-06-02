/**
 * Dashboard AI Widget 组件 — 基础层
 * 包含：智能摘要、风险预测、方法论推荐
 * 高级 Widget（约束求解/资源再分配/愿景策略/能力缺口/方法论进化）见 AIWidgetsAdvanced.tsx
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Zap, AlertTriangle, Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { generateLocalSummary, generateDeepSummary } from '@/lib/ai/aiSummaryGenerator';
import type { ProgressSummary } from '@/lib/ai/aiSummaryGenerator';
import { predictRisksLocal, predictRisksDeep } from '@/lib/ai/aiRiskPredictor';
import type { RiskPredictionResult } from '@/lib/ai/aiRiskPredictor';
import { recommendMethodologyLocal, recommendMethodologyDeep } from '@/lib/ai/aiMethodology';
import type { MethodologyResult } from '@/lib/ai/aiMethodology';
import type { AppState } from '@/types';

const RISK_PROB_COLORS: Record<string, string> = { critical: 'text-red-700 bg-red-100', high: 'text-orange-700 bg-orange-100', medium: 'text-amber-700 bg-amber-100', low: 'text-blue-700 bg-blue-100' };
const RISK_PROB_LABELS: Record<string, string> = { critical: '极高', high: '高', medium: '中', low: '低' };
const RISK_IMPACT_LABELS: Record<string, string> = { severe: '严重', major: '重大', moderate: '中等', minor: '轻微' };
const RISK_CAT_LABELS: Record<string, string> = { schedule: '调度', resource: '资源', cascade: '级联', quality: '质量', dependency: '依赖' };

/** AI 智能摘要 Widget */
export function AISummaryWidget({ state }: { state: AppState }) {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);

  useEffect(() => {
    const local = generateLocalSummary(state, 'daily');
    setSummary(local);
  }, [state]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try {
      const deep = await generateDeepSummary(state, 'daily');
      setSummary(deep);
    } finally {
      setDeepLoading(false);
    }
  }, [state, deepLoading]);

  if (!summary) return null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <Zap size={18} className="text-indigo-500" />
        <h2 className="font-semibold text-sm md:text-base">智能摘要</h2>
        <span className="text-xs text-muted-foreground ml-auto">{summary.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '分析中...' : '深度分析'}</button>
      </div>
      <div className="p-4 md:px-5 space-y-3">
        <p className="text-sm font-medium">{summary.headline}</p>
        {summary.deepSummary && <p className="text-sm text-muted-foreground leading-relaxed bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">{summary.deepSummary}</p>}
        {summary.keyChanges.length > 0 && (
          <div><EmptyState title="关键变化" compact />{summary.keyChanges.map((c, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {c}</p>)}</div>
        )}
        {summary.focusItems.length > 0 && (
          <div><EmptyState title="关注焦点" compact />{summary.focusItems.slice(0, 3).map((f, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• <span className="text-indigo-600">[{f.type === 'goal' ? '目标' : f.type === 'project' ? '项目' : '任务'}]</span> {f.title} — {f.reason}</p>)}</div>
        )}
        {summary.riskAlerts.length > 0 && (
          <div><p className="text-xs font-semibold text-red-500 mb-1">风险预警</p>{summary.riskAlerts.map((r, i) => <p key={i} className="text-xs text-red-600 pl-2">• {r}</p>)}</div>
        )}
      </div>
    </div>
  );
}

/** AI 风险预测 Widget */
export function AIRiskPredictionWidget({ state }: { state: AppState }) {
  const [result, setResult] = useState<RiskPredictionResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const local = predictRisksLocal(state);
    setResult(local);
  }, [state]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try { const deep = await predictRisksDeep(state); setResult(deep); setExpanded(true); } finally { setDeepLoading(false); }
  }, [state, deepLoading]);

  if (!result || result.risks.length === 0) {
    return (<div className="bg-card rounded-xl border border-border shadow-sm"><div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border"><AlertTriangle size={18} className="text-green-500" /><h2 className="font-semibold text-sm md:text-base">风险预测</h2><span className="text-xs text-green-600 ml-auto">暂无风险</span></div></div>);
  }

  const topRisks = expanded ? result.risks.slice(0, 8) : result.risks.slice(0, 3);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <AlertTriangle size={18} className={result.overallRiskScore > 50 ? 'text-red-500' : result.overallRiskScore > 25 ? 'text-amber-500' : 'text-green-500'} />
        <h2 className="font-semibold text-sm md:text-base">风险预测</h2>
        <span className={`text-xs px-1.5 py-0.5 rounded ${result.overallRiskScore > 50 ? 'text-red-700 bg-red-100' : result.overallRiskScore > 25 ? 'text-amber-700 bg-amber-100' : 'text-green-700 bg-green-100'}`}>风险指数 {result.overallRiskScore}</span>
        <span className="text-xs text-muted-foreground ml-auto">{result.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '分析中...' : '深度预测'}</button>
      </div>
      <div className="p-4 md:px-5 space-y-2">
        {topRisks.map((r) => (
          <div key={r.id} className="flex items-start gap-2 py-1.5">
            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${RISK_PROB_COLORS[r.probability] || 'bg-gray-100 text-gray-600'}`}>{RISK_PROB_LABELS[r.probability] || r.probability}</span>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{r.title}</p>
              {!expanded && <p className="text-xs text-muted-foreground truncate">{r.description.slice(0, 60)}{r.description.length > 60 ? '...' : ''}</p>}
              {expanded && (<div className="mt-1 space-y-1"><p className="text-xs text-muted-foreground">{r.description}</p><div className="flex gap-2 text-xs"><span className="text-muted-foreground">类别:{RISK_CAT_LABELS[r.category] || r.category}</span><span className="text-muted-foreground">影响:{RISK_IMPACT_LABELS[r.impact] || r.impact}</span>{r.estimatedDays > 0 && <span className="text-muted-foreground">{r.estimatedDays}天内</span>}</div>{r.mitigations.length > 0 && (<div className="mt-1 pl-2 border-l-2 border-indigo-200">{r.mitigations.slice(0, 2).map((m, j) => <p key={j} className="text-xs text-indigo-600">→ {m.action}</p>)}</div>)}</div>)}
            </div>
          </div>
        ))}
        {result.risks.length > 3 && (<button className="text-xs text-indigo-600 hover:underline" onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : `查看全部${result.risks.length}项`}</button>)}
        {result.resourceBottlenecks.length > 0 && (<div className="mt-3 pt-3 border-t border-border"><p className="text-xs font-semibold text-amber-600 mb-1">资源瓶颈</p>{result.resourceBottlenecks.slice(0, 3).map((b, i) => (<p key={i} className="text-xs text-muted-foreground pl-2">• {b.memberName}: {b.activeTasks}项活跃（{b.overloadMultiplier}倍均值），预计{b.predictedOverdue}项逾期</p>))}</div>)}
      </div>
    </div>
  );
}

/** AI 方法论推荐 Widget */
export function AIMethodologyWidget({ state }: { state: AppState }) {
  const [result, setResult] = useState<MethodologyResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    const local = recommendMethodologyLocal(state);
    setResult(local);
  }, [state]);

  // Reset selectedIdx when result changes to avoid OOB
  useEffect(() => {
    setSelectedIdx(0);
  }, [result]);

  const handleDeep = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    try { const deep = await recommendMethodologyDeep(state); setResult(deep); } finally { setDeepLoading(false); }
  }, [state, deepLoading]);

  if (!result || result.recommendations.length === 0) {
    return (<div className="bg-card rounded-xl border border-border shadow-sm"><div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border"><Target size={18} className="text-indigo-500" /><h2 className="font-semibold text-sm md:text-base">方法论推荐</h2><span className="text-xs text-muted-foreground ml-auto">暂无推荐</span></div></div>);
  }

  const selected = result.recommendations[selectedIdx];

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
        <Target size={18} className="text-indigo-500" />
        <h2 className="font-semibold text-sm md:text-base">方法论推荐</h2>
        <span className="text-xs text-muted-foreground ml-auto">{result.fromLLM ? 'AI 深度' : '自动'}</span>
        <button className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50" onClick={handleDeep} disabled={deepLoading}>{deepLoading ? '分析中...' : '深度推荐'}</button>
      </div>
      <div className="p-4 md:px-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">{result.teamPattern.diagnosisTags.map((tag, i) => (<span key={i} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">{tag}</span>))}</div>
        {result.painPoints.length > 0 && result.painPoints[0] !== '整体运行良好' && (<div><p className="text-xs font-semibold text-red-500 mb-1">核心痛点</p>{result.painPoints.slice(0, 2).map((p, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {p}</p>)}</div>)}
        <div className="flex gap-1.5 overflow-x-auto pb-1">{result.recommendations.slice(0, 4).map((r, i) => (<button key={r.id} className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 transition-colors ${i === selectedIdx ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium' : 'border-border hover:bg-muted/50'}`} onClick={() => setSelectedIdx(i)}>{r.name} <span className="text-muted-foreground">{r.fitnessScore}%</span></button>))}</div>
        {selected && (<div className="space-y-2"><p className="text-xs text-muted-foreground">{selected.reason}</p><div><p className="text-xs font-semibold text-green-600 mb-1">预期收益</p>{selected.expectedBenefits.slice(0, 3).map((b, i) => <p key={i} className="text-xs text-muted-foreground pl-2">• {b}</p>)}</div>{selected.steps.length > 0 && (<div><EmptyState title="执行路径" compact />{selected.steps.slice(0, 4).map((s, i) => (<div key={i} className="flex items-start gap-2 py-0.5"><span className="text-xs w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 font-medium">{s.step}</span><div><p className="text-xs font-medium">{s.title}{s.estimatedDays > 0 ? ` (${s.estimatedDays}天)` : ''}</p><p className="text-xs text-muted-foreground">{s.description}</p></div></div>))}</div>)}</div>)}
      </div>
    </div>
  );
}
