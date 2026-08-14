/**
 * 晨间聚焦面板 — 展示 AI 生成的晨间简报
 *
 * 两种模式：
 * - 实时生成：从当前 store 数据生成本地简报
 * - 推送模式：从 push_notifications 读取服务端推送的简报
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { generateMorningBriefingLocal, generateMorningBriefingDeep } from '@/lib/ai/aiMorningBriefing';
import type { MorningBriefing, FocusItem, RiskAlert } from '@/lib/ai/aiMorningBriefing';
import { trackAIReportGeneration } from '@/store/behaviorTracking';
import { Sparkles, Clock, Target, AlertTriangle, Users, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MorningBriefingPanelProps {
  className?: string;
}

export function MorningBriefingPanel({ className }: MorningBriefingPanelProps) {
  const { state } = useStore();
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useLLM, setUseLLM] = useState(false);

  const generateBriefing = useCallback(async (withLLM: boolean) => {
    setIsLoading(true);
    setUseLLM(withLLM);
    try {
      if (withLLM) {
        const result = await generateMorningBriefingDeep(state);
        setBriefing(result);
        trackAIReportGeneration('morning_briefing', true, true);
      } else {
        const result = generateMorningBriefingLocal(state);
        setBriefing(result);
        trackAIReportGeneration('morning_briefing', false, true);
      }
    } catch {
      trackAIReportGeneration('morning_briefing', withLLM, false);
    } finally {
      setIsLoading(false);
    }
  }, [state]);

  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-red-500 bg-red-50 dark:bg-red-900/20';
      case 'high': return 'text-orange-500 bg-orange-50 dark:bg-orange-900/20';
      case 'medium': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const reasonLabel = (r: string) => {
    switch (r) {
      case 'overdue': return '逾期';
      case 'due-today': return '今日到期';
      case 'high-priority': return '高优先级';
      case 'stalled': return '停滞';
      default: return r;
    }
  };

  const trendIcon = (t: string) => {
    switch (t) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'text-red-600 bg-red-50 dark:bg-red-900/30';
      case 'high': return 'text-orange-600 bg-orange-50 dark:bg-orange-900/30';
      default: return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30';
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">晨间聚焦</h2>
          {briefing && (
            <span className="text-[10px] text-muted-foreground">{briefing.date}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => generateBriefing(false)}
            disabled={isLoading}
          >
            {isLoading && !useLLM ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            刷新
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => generateBriefing(true)}
            disabled={isLoading}
          >
            {isLoading && useLLM ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            AI增强
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {!briefing && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">点击刷新生成晨间聚焦</p>
            <p className="text-xs opacity-60 mt-1">或使用 AI增强 获取更智能的建议</p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">正在生成...</span>
          </div>
        )}

        {briefing && !isLoading && (
          <>
            {/* Greeting */}
            <div className="text-sm font-medium">{briefing.greeting}</div>

            {/* Focus Items */}
            {briefing.focusItems.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">今日聚焦</h3>
                <div className="space-y-2">
                  {briefing.focusItems.map(item => (
                    <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border">
                      <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', priorityColor(item.priority))}>
                        {reasonLabel(item.reason)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        {item.assignee && <p className="text-[10px] text-muted-foreground">负责人：{item.assignee}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Goal Snapshot */}
            {briefing.goalSnapshot.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">目标快照</h3>
                <div className="space-y-1.5">
                  {briefing.goalSnapshot.map(g => (
                    <div key={g.id} className="flex items-center gap-2 text-xs">
                      <span>{trendIcon(g.trend)}</span>
                      <span className="flex-1 truncate">{g.title}</span>
                      <span className="text-muted-foreground">{g.progress}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team Activity */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">团队动态</h3>
              <div className="flex gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{briefing.teamActivity.completedToday} 今日完成</span>
                </div>
                <div className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  <span>{briefing.teamActivity.completedThisWeek} 本周完成</span>
                </div>
              </div>
            </div>

            {/* Risk Alerts */}
            {briefing.riskAlerts.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">风险预警</h3>
                <div className="space-y-1.5">
                  {briefing.riskAlerts.map((r, i) => (
                    <div key={`risk-${i}`} className={cn('p-2 rounded text-xs', severityColor(r.severity))}>
                      <div className="font-medium">{r.itemTitle}</div>
                      <div className="text-[10px] opacity-80">{r.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Suggestion */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-xs font-medium text-primary">AI 建议</span>
              </div>
              <p className="text-xs leading-relaxed">{briefing.aiSuggestion}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
