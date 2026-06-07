/**
 * AI 周报摘要面板 — 显示本周进展概览 + AI 深度分析
 * 对标 Linear/Notion 的 AI Digest 功能
 */
import { useState, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { generateLocalSummary, generateDeepSummary, type ProgressSummary } from '@/lib/ai/aiSummaryGenerator';
import { Sparkles, TrendingUp, AlertTriangle, Target, Users, ChevronDown, ChevronUp, RefreshCw, CheckCircle2, Clock, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WeeklyDigestPanel() {
  const { state } = useStore();
  const [deepSummary, setDeepSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const summary = useMemo(() => generateLocalSummary(state, 'weekly'), [state]);

  const handleDeepSummary = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await generateDeepSummary(state, 'weekly');
      if (result.deepSummary) setDeepSummary(result.deepSummary);
    } finally {
      setLoading(false);
    }
  }, [state, loading]);

  const completedCount = summary.keyChanges.find(c => c.includes('完成'))?.match(/(\d+)/)?.[1] || '0';
  const hasRisk = summary.riskAlerts.length > 0;

  return (
    <div className={cn('bg-card rounded-xl border border-border shadow-sm overflow-hidden', hasRisk && 'border-amber-200')}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', hasRisk ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
            {hasRisk ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold">本周摘要</h3>
            <p className="text-xs text-muted-foreground">{summary.headline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {summary.keyChanges.length > 0 && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{completedCount} 完成</span>
          )}
          {hasRisk && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{summary.riskAlerts.length} 风险</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Key Changes */}
          {summary.keyChanges.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" />关键变化</h4>
              {summary.keyChanges.map((c, i) => (
                <div key={i} className="text-xs text-foreground pl-4 py-0.5">{c}</div>
              ))}
            </div>
          )}

          {/* Focus Items */}
          {summary.focusItems.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" />关注焦点</h4>
              {summary.focusItems.slice(0, 4).map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs pl-4">
                  <span className={cn('px-1 py-0.5 rounded text-[10px] font-medium', f.type === 'goal' ? 'bg-blue-100 text-blue-700' : f.type === 'project' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700')}>
                    {f.type === 'goal' ? '目标' : f.type === 'project' ? '项目' : '任务'}
                  </span>
                  <div><span className="font-medium">{f.title}</span><span className="text-muted-foreground ml-1">{f.reason}</span></div>
                </div>
              ))}
            </div>
          )}

          {/* Risk Alerts */}
          {summary.riskAlerts.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />风险预警</h4>
              {summary.riskAlerts.map((r, i) => (
                <div key={i} className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">{r}</div>
              ))}
            </div>
          )}

          {/* Member Highlights */}
          {summary.memberHighlights.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />人员状态</h4>
              {summary.memberHighlights.slice(0, 3).map((m, i) => (
                <div key={i} className="text-xs text-foreground pl-4 py-0.5">{m}</div>
              ))}
            </div>
          )}

          {/* AI Deep Summary */}
          <div className="pt-2 border-t border-border/50">
            {deepSummary ? (
              <div className="bg-primary/5 rounded-lg p-3 space-y-1">
                <h4 className="text-xs font-medium text-primary flex items-center gap-1"><Sparkles className="w-3 h-3" />AI 深度分析</h4>
                <p className="text-xs text-foreground leading-relaxed">{deepSummary}</p>
                <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={handleDeepSummary} disabled={loading}>
                  <RefreshCw className={cn('w-2.5 h-2.5', loading && 'animate-spin')} />重新生成
                </button>
              </div>
            ) : (
              <button type="button" className={cn('w-full text-xs py-2 rounded-lg border border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5', loading && 'opacity-50')} onClick={handleDeepSummary} disabled={loading}>
                <Sparkles className="w-3.5 h-3.5" />{loading ? 'AI 分析中...' : '生成 AI 深度分析'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
