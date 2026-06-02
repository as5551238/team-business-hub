// P1: AI团队诊断面板 — 5维健康仪表盘 + 风险预警 + AI建议
import React, { useEffect, useState, useCallback } from 'react';
import { Activity, AlertTriangle, Lightbulb, Users, TrendingUp, Shield, RefreshCw } from 'lucide-react';

interface DiagnosticsData {
  healthScore: number;
  memberCount: number;
  activeMembers: number;
  activeRate: number;
  completionRate: number;
  overdueRate: number;
  avgScores: {
    efficiency: number;
    collaboration: number;
    proactivity: number;
    stability: number;
    goalAlignment: number;
    aiAdoption: number;
  };
  risks: string[];
  suggestions: string[];
}

const HEALTH_DIMS = [
  { key: 'efficiency', label: '效率', icon: '⚡', color: '#3B82F6' },
  { key: 'collaboration', label: '协作', icon: '🤝', color: '#10B981' },
  { key: 'stability', label: '稳定性', icon: '🛡', color: '#8B5CF6' },
  { key: 'goalAlignment', label: '目标聚焦', icon: '🎯', color: '#EC4899' },
  { key: 'aiAdoption', label: 'AI采纳', icon: '🤖', color: '#06B6D4' },
] as const;

function HealthGauge({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, score / 100));
  const color = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : score >= 25 ? '#F97316' : '#EF4444';
  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg width="100%" height="100%" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${circ}`} strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round" transform="rotate(-90 40 40)"
          className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[9px] text-muted-foreground">健康分</span>
      </div>
    </div>
  );
}

function MetricBar({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </div>
      <span className="w-12 text-right font-medium" style={{ color }}>{value}{suffix}</span>
    </div>
  );
}

export default function TeamDiagnosticsPanel() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchData = useCallback(async () => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb) return;
    setLoading(true);
    try {
      const { data: result, error } = await sb.rpc('team_diagnostics', { p_days: 30 });
      if (!error && result) setData(result as DiagnosticsData);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data && !loading) return null;

  const levelLabel = data ? (data.healthScore >= 75 ? '健康' : data.healthScore >= 50 ? '一般' : data.healthScore >= 25 ? '需关注' : '高风险') : '';
  const levelColor = data ? (data.healthScore >= 75 ? 'text-emerald-600' : data.healthScore >= 50 ? 'text-amber-600' : data.healthScore >= 25 ? 'text-orange-600' : 'text-red-600') : '';

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold">AI 团队诊断</span>
          {data && <span className={`text-xs font-medium ${levelColor}`}>{levelLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
          <button onClick={e => { e.stopPropagation(); fetchData(); }} className="p-1 rounded hover:bg-muted/50">
            <RefreshCw size={12} className="text-muted-foreground" />
          </button>
          <svg width="12" height="12" viewBox="0 0 12 12" className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}>
            <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      {expanded && data && (
        <div className="p-4 space-y-4">
          {/* 健康仪表盘 */}
          <div className="flex gap-4 items-start">
            <HealthGauge score={data.healthScore} />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                <span className="flex items-center gap-1"><Users size={12} />{data.activeMembers}/{data.memberCount} 活跃</span>
                <span className="flex items-center gap-1"><TrendingUp size={12} />完成 {data.completionRate}%</span>
                <span className="flex items-center gap-1"><Shield size={12} />逾期 {data.overdueRate}%</span>
              </div>
              {HEALTH_DIMS.map(d => (
                <MetricBar key={d.key} label={d.label} value={data.avgScores[d.key]} suffix="%" color={d.color} />
              ))}
            </div>
          </div>

          {/* 风险预警 */}
          {data.risks.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                <AlertTriangle size={12} />风险识别
              </div>
              {data.risks.map((r, i) => (
                <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">{r}</div>
              ))}
            </div>
          )}

          {/* AI建议 */}
          {data.suggestions.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                <Lightbulb size={12} />改进建议
              </div>
              {data.suggestions.map((s, i) => (
                <div key={i} className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">{s}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {expanded && !data && loading && (
        <div className="p-4 text-center text-xs text-muted-foreground">诊断分析中...</div>
      )}
    </div>
  );
}
