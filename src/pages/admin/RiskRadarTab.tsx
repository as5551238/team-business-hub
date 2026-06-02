/**
 * 风险雷达 Tab — 四维预测可视化面板 + 回测分析
 *
 * Round 5-9 — 预测性智能持续增强
 * - 延期预测 / 资源预测 / OKR达成 / 综合风险雷达
 * - 告警列表 + 建议操作
 * - 预测回测 + 偏差趋势 + 置信度校准
 */
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  generateRiskRadarV2,
  predictDelayV2,
  predictCascadeDelay,
  predictDelayEnhanced,
  predictResourceBottleneck,
  predictOKRAchievement,
  type RiskRadar,
  type PredictionResult,
  type PredictionType,
} from '@/lib/predictionEngine';
import {
  AlertTriangle,
  Clock,
  Users,
  Target,
  Shield,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Activity,
  LineChart,
  GitBranch,
} from 'lucide-react';
import { runBacktest, type BacktestResult } from '@/lib/predictionBacktest';

// ===== 辅助函数 =====

const LEVEL_COLORS: Record<string, string> = {
  none: 'bg-gray-100 text-gray-500',
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const LEVEL_BG: Record<string, string> = {
  none: 'bg-gray-400',
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

const TYPE_ICON: Record<PredictionType, typeof Clock> = {
  delay: Clock,
  resource: Users,
  okr: Target,
  risk: GitBranch,
};

const TYPE_LABEL: Record<PredictionType, string> = {
  delay: '延期风险',
  resource: '资源瓶颈',
  okr: 'OKR达成',
  risk: '级联传播',
};

function ScoreBar({ score, level }: { score: number; level: string }) {
  const safeScore = Number.isFinite(score) ? score : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${LEVEL_BG[level] || 'bg-gray-300'}`}
          style={{ width: `${Math.min(100, safeScore)}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold min-w-[2rem] text-right ${safeScore >= 70 ? 'text-red-600' : safeScore >= 40 ? 'text-yellow-600' : 'text-green-600'}`}>
        {safeScore}
      </span>
    </div>
  );
}

function PredictionCard({ pred, expanded, onToggle }: { pred: PredictionResult; expanded: boolean; onToggle: () => void }) {
  const Icon = TYPE_ICON[pred.type];
  return (
    <div className={`border rounded-lg overflow-hidden ${expanded ? 'ring-1 ring-primary/30' : ''}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium flex-1 truncate">{pred.targetName || pred.targetId}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${LEVEL_COLORS[pred.level]}`}>
          {pred.level === 'critical' ? '严重' : pred.level === 'high' ? '高' : pred.level === 'medium' ? '中' : pred.level === 'low' ? '低' : '无'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 bg-muted/5">
          <p className="text-xs text-muted-foreground">{pred.summary}</p>
          <ScoreBar score={pred.score} level={pred.level} />
          {/* 级联依赖链可视化 */}
          {pred.type === 'risk' && pred.details?.cascadeChain && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 space-y-1">
              <div className="text-[10px] font-semibold text-orange-700 flex items-center gap-1"><GitBranch size={10} />依赖传播链</div>
              <div className="flex flex-wrap items-center gap-1">
                {((pred.details.cascadeChain as string[]) || []).map((id, idx) => {
                  const taskName = id === pred.targetId ? pred.targetName : id.slice(0, 6);
                  return (
                    <span key={id} className="flex items-center gap-1">
                      {idx > 0 && <span className="text-orange-400 text-[10px]">→</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${idx === 0 ? 'bg-orange-200 text-orange-800 font-semibold' : 'bg-orange-100 text-orange-600'}`}>
                        {taskName}
                      </span>
                    </span>
                  );
                })}
              </div>
              {pred.details.totalImpact != null && (
                <div className="text-[10px] text-orange-600">累计影响约 {pred.details.totalImpact} 天</div>
              )}
            </div>
          )}
          {/* 进度感知信息 */}
          {pred.type === 'delay' && pred.details?.progress != null && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>当前进度: {pred.details.progress}%</span>
              {pred.details.progressDiscount > 0 && <span className="text-green-600">进度领先 (-{pred.details.progressDiscount}分)</span>}
              {pred.details.progressDiscount < 0 && <span className="text-red-600">进度滞后 (+{Math.abs(pred.details.progressDiscount)}分)</span>}
            </div>
          )}
          {pred.suggestions.length > 0 && (
            <div className="space-y-1">
              {pred.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <TrendingUp size={12} className="text-primary mt-0.5 shrink-0" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>置信度: {pred.confidence === 'high' ? '高' : pred.confidence === 'medium' ? '中' : '低'}</span>
            <span>{new Date(pred.timestamp).toLocaleString('zh-CN')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 主组件 =====

export function RiskRadarTab() {
  const { state } = useStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'radar' | 'backtest'>('radar');

  const radar: RiskRadar = useMemo(() => {
    try {
      return generateRiskRadarV2(
        state.tasks,
        state.members,
        state.goals,
      );
    } catch {
      return {
        overall: 0,
        dimensions: { delay: 0, resource: 0, okr: 0, risk: 0 },
        alerts: [],
        predictions: [],
      };
    }
  }, [state.tasks, state.members, state.goals]);

  const safeOverall = Number.isFinite(radar.overall) ? radar.overall : 0;
  const overallLevel = safeOverall >= 70 ? 'critical' : safeOverall >= 50 ? 'high' : safeOverall >= 30 ? 'medium' : safeOverall >= 15 ? 'low' : 'none';

  const dims = [
    { key: 'delay' as const, label: '延期风险', icon: Clock, score: Number.isFinite(radar.dimensions.delay) ? radar.dimensions.delay : 0, desc: 'V2 进度感知 + CPM关键路径 + 自学习历史' },
    { key: 'resource' as const, label: '资源瓶颈', icon: Users, score: Number.isFinite(radar.dimensions.resource) ? radar.dimensions.resource : 0, desc: '团队负载均衡分析（权重25%）' },
    { key: 'okr' as const, label: 'OKR达成', icon: Target, score: Number.isFinite(radar.dimensions.okr) ? radar.dimensions.okr : 0, desc: '进度趋势vs时间进度（权重25%）' },
    { key: 'risk' as const, label: '综合风险', icon: Shield, score: Number.isFinite(radar.dimensions.risk) ? radar.dimensions.risk : 0, desc: 'V2加权(延期30%+级联20%+资源25%+OKR25%)' },
  ];

  const groupedPredictions = useMemo(() => {
    const groups: Record<PredictionType, PredictionResult[]> = { delay: [], resource: [], okr: [], risk: [] };
    for (const p of radar.predictions) {
      groups[p.type].push(p);
    }
    return groups;
  }, [radar.predictions]);

  const backtest: BacktestResult = useMemo(() => runBacktest(state.tasks), [state.tasks]);

  return (
    <div className="space-y-5">
      {/* Sub-tab 切换 */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
        <button onClick={() => setSubTab('radar')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'radar' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Shield size={14} /> 风险雷达
        </button>
        <button onClick={() => setSubTab('backtest')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'backtest' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <LineChart size={14} /> 回测分析
        </button>
      </div>

      {subTab === 'backtest' ? (
        /* ===== 回测分析面板 ===== */
        <div className="space-y-4">
          {/* 概览统计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Activity size={12} />样本量</div>
              <div className="text-xl font-bold">{backtest.totalRecords}</div>
            </div>
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Target size={12} />预测准确率</div>
              <div className="text-xl font-bold text-green-600">{backtest.predictionAccuracy}%</div>
            </div>
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingUp size={12} />平均偏差</div>
              <div className={`text-xl font-bold ${backtest.avgDeviation > 0.2 ? 'text-red-600' : backtest.avgDeviation > 0 ? 'text-amber-600' : 'text-green-600'}`}>{backtest.avgDeviation > 0 ? '+' : ''}{Math.round(backtest.avgDeviation * 100)}%</div>
            </div>
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingDown size={12} />低估率</div>
              <div className="text-xl font-bold text-orange-600">{backtest.underestimateRate}%</div>
            </div>
          </div>

          {/* 置信度校准 */}
          <div className="bg-card rounded-xl border p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Target size={14} />置信度校准</h3>
            <p className="text-xs text-muted-foreground">高置信度预测的实际准确率应更高，否则需调整模型</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: '高置信度', value: backtest.confidenceCalibration.highAccuracy, color: 'text-green-600', bg: 'bg-green-100' },
                { label: '中置信度', value: backtest.confidenceCalibration.mediumAccuracy, color: 'text-amber-600', bg: 'bg-amber-100' },
                { label: '低置信度', value: backtest.confidenceCalibration.lowAccuracy, color: 'text-red-600', bg: 'bg-red-100' },
              ]).map(item => (
                <div key={item.label} className="text-center space-y-1">
                  <div className={`text-2xl font-bold ${item.color}`}>{item.value}%</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.bg}`} style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 月度偏差趋势 */}
          {backtest.trend.length > 0 && (
            <div className="bg-card rounded-xl border p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2"><LineChart size={14} />月度偏差趋势</h3>
              <div className="space-y-1.5">
                {backtest.trend.map((t) => {
                  const barWidth = Math.min(100, Math.abs(t.avgDeviation) * 200);
                  const barColor = t.avgDeviation > 0.2 ? 'bg-red-400' : t.avgDeviation > 0.1 ? 'bg-amber-400' : t.avgDeviation > 0 ? 'bg-green-400' : 'bg-blue-400';
                  const improving = t.improvementRate > 0;
                  return (
                    <div key={t.month} className="flex items-center gap-2">
                      <span className="text-xs font-mono w-16 text-muted-foreground">{t.month}</span>
                      <div className="flex-1 h-4 bg-gray-50 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className={`text-xs w-12 text-right ${t.avgDeviation > 0.2 ? 'text-red-600' : 'text-amber-600'}`}>
                        {t.avgDeviation > 0 ? '+' : ''}{Math.round(t.avgDeviation * 100)}%
                      </span>
                      <span className="text-[10px] w-8">{t.sampleCount}条</span>
                      {improving && <TrendingDown size={12} className="text-green-500" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 按优先级偏差 */}
          {Object.keys(backtest.byPriority).length > 0 && (
            <div className="bg-card rounded-xl border p-4 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 size={14} />按优先级偏差</h3>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(backtest.byPriority).map(([p, d]) => (
                  <div key={p} className="text-center border rounded-lg p-2">
                    <div className="text-lg font-bold">{Math.round(d.avgDeviation * 100)}%</div>
                    <div className="text-[10px] text-muted-foreground">{p} · {d.count}条</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 按负责人偏差 */}
          {backtest.byLeader.length > 0 && (
            <div className="bg-card rounded-xl border p-4 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Users size={14} />按负责人偏差 Top5</h3>
              {backtest.byLeader.slice(0, 5).map(l => {
                const memberName = state.members.find(m => m.id === l.leaderId)?.name || l.leaderId.slice(0, 8);
                return (
                  <div key={l.leaderId} className="flex items-center gap-2">
                    <span className="text-xs w-20 truncate">{memberName}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.min(100, Math.abs(l.deviation) * 200)}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">{Math.round(l.deviation * 100)}% · {l.count}条</span>
                  </div>
                );
              })}
            </div>
          )}

          {backtest.totalRecords === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-[11px] text-blue-700">回测分析需要至少 1 条完成任务的记录。随着更多任务完成，预测准确率将持续提升。</p>
            </div>
          )}
        </div>
      ) : (
      /* ===== 原有风险雷达面板 ===== */
      <>
      {/* 总览卡片 */}
      <div className="flex items-center gap-3">
        <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${LEVEL_BG[overallLevel]}`}>
          <span className="text-2xl font-bold text-white">{safeOverall}</span>
        </div>
        <div>
          <h3 className="font-semibold text-sm">综合风险指数</h3>
          <p className="text-xs text-muted-foreground">
            {safeOverall >= 70 ? '项目整体风险严重，需立即干预' :
             safeOverall >= 50 ? '存在较高风险，建议及时调整' :
             safeOverall >= 30 ? '风险可控，持续关注即可' :
             '项目运行平稳，风险较低'}
          </p>
        </div>
      </div>

      {/* 四维分数 */}
      <div className="grid grid-cols-2 gap-3">
        {dims.map(d => {
          const DimIcon = d.icon;
          const dimLevel = d.score >= 70 ? 'critical' : d.score >= 50 ? 'high' : d.score >= 30 ? 'medium' : d.score >= 15 ? 'low' : 'none';
          return (
            <div key={d.key} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <DimIcon size={14} className="text-muted-foreground" />
                <span className="text-xs font-semibold">{d.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ml-auto ${LEVEL_COLORS[dimLevel]}`}>
                  {dimLevel === 'critical' ? '严重' : dimLevel === 'high' ? '高' : dimLevel === 'medium' ? '中' : dimLevel === 'low' ? '低' : '安全'}
                </span>
              </div>
              <ScoreBar score={d.score} level={dimLevel} />
              <p className="text-[10px] text-muted-foreground">{d.desc}</p>
            </div>
          );
        })}
      </div>

      {/* 告警列表 */}
      {radar.alerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={16} className="text-amber-500" />
            活跃告警
          </div>
          {radar.alerts.map((a, i) => (
            <div key={i} className={`border rounded-lg p-3 space-y-1 ${a.level === 'critical' ? 'border-red-200 bg-red-50/50' : a.level === 'high' ? 'border-orange-200 bg-orange-50/50' : 'border-yellow-200 bg-yellow-50/50'}`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${a.level === 'critical' ? 'text-red-700' : a.level === 'high' ? 'text-orange-700' : 'text-yellow-700'}`}>
                  {a.message}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">建议操作: {a.action}</p>
            </div>
          ))}
        </div>
      )}

      {/* 预测详情 */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">预测详情</div>
        {(['delay', 'risk', 'resource', 'okr'] as PredictionType[]).map(type => {
          const preds = groupedPredictions[type];
          if (!preds || preds.length === 0) return null;
          const TypeIcon = TYPE_ICON[type];
          return (
            <div key={type} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mt-2">
                <TypeIcon size={12} />
                {TYPE_LABEL[type]} ({preds.length})
              </div>
              {preds.slice(0, 10).map(p => (
                <PredictionCard
                  key={p.targetId}
                  pred={p}
                  expanded={expandedId === `${p.type}-${p.targetId}`}
                  onToggle={() => setExpandedId(expandedId === `${p.type}-${p.targetId}` ? null : `${p.type}-${p.targetId}`)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* 数据来源说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-[11px] text-blue-700">
          <strong>V2 引擎数据说明</strong>：风险雷达 V2 采用进度感知延期预测（结合当前进度与时间进度），新增级联传播预测（上游延期向下游依赖传播），加权综合延期30%+级联20%+资源25%+OKR25%。置信度随历史数据积累逐步提升。
        </p>
      </div>
      </>
      )}
    </div>
  );
}
