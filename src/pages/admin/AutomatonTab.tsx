/**
 * AutomatonTab — Manage autonomous AI agent rules
 * Users can enable/disable built-in automaton rules that
 * proactively scan data and execute actions without manual triggers.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { BUILTIN_AUTOMATON_RULES, runAutomatonOnce, toggleAutomatonRule } from '@/lib/ai/aiAutomaton';
import { Zap, Play, Bot, AlertTriangle, CheckCircle2, Target, ToggleLeft, ToggleRight } from 'lucide-react';

const ICONS: Record<string, React.ReactNode> = {
  'auto-overload-rebalance': <Bot size={16} className="text-violet-500" />,
  'auto-stalled-goal-nudge': <Target size={16} className="text-amber-500" />,
  'auto-risk-scan': <AlertTriangle size={16} className="text-rose-500" />,
};

export function AutomatonTab() {
  const { state, dispatch } = useStore();
  const [, forceUpdate] = useState(0);
  const [scanResults, setScanResults] = useState<Array<{ ruleName: string; found: boolean; actionTaken: boolean; summary?: string }> | null>(null);

  function handleToggle(ruleId: string, currentEnabled: boolean) {
    toggleAutomatonRule(ruleId, !currentEnabled);
    forceUpdate(c => c + 1);  // trigger re-render
  }

  function handleRunOnce() {
    const results = runAutomatonOnce(() => state, dispatch);
    setScanResults(results.map(r => ({
      ruleName: r.rule.name,
      found: r.result !== null,
      actionTaken: r.actionTaken,
      summary: r.result?.summary,
    })));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">AI 自主执行</h3>
        <button
          onClick={handleRunOnce}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Play size={14} /> 立即扫描
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        自主 Agent 会定期扫描数据，当检测到条件满足时自动执行操作（如重新分配过载成员、推进停滞目标），无需手动触发。
      </p>

      <div className="space-y-2">
        {BUILTIN_AUTOMATON_RULES.map(rule => (
          <div key={rule.id} className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-lg bg-card">
            <Zap size={16} className={rule.enabled ? 'text-amber-500' : 'text-muted-foreground/30'} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium flex items-center gap-2">
                {ICONS[rule.id]}
                {rule.name}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{rule.description}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">扫描间隔：{rule.scanIntervalMin}分钟</div>
            </div>
            <button onClick={() => handleToggle(rule.id, rule.enabled)} className="cursor-pointer">
              {rule.enabled ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} className="text-muted-foreground/40" />}
            </button>
          </div>
        ))}
      </div>

      {scanResults && (
        <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
          <h4 className="text-xs font-semibold">扫描结果</h4>
          {scanResults.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.found ? (
                <CheckCircle2 size={14} className={r.actionTaken ? 'text-emerald-500' : 'text-amber-500'} />
              ) : (
                <CheckCircle2 size={14} className="text-muted-foreground/30" />
              )}
              <span className="font-medium">{r.ruleName}</span>
              <span className="text-muted-foreground">
                {r.found ? (r.actionTaken ? `已执行：${r.summary}` : `检测到：${r.summary}（规则未启用）`) : '无异常'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
