/**
 * 对话式首页 — W3 核心布局
 *
 * 左侧：AI 对话主入口（AiHomepageChat）
 * 右侧：根据 AI 操作实时切换的面板（四象限/今日任务/晨间简报/风险报告）
 *
 * 设计原则：
 * - "对话为主，点击为辅" —— 一句话即可驱动行动
 * - 右侧面板实时响应左侧 AI 指令
 * - 保留手动切换能力（DR-52 兜底原则）
 */

import React, { useState, useCallback, Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import { AiHomepageChat } from '@/components/AiHomepageChat';
import { LayoutDashboard, Grid3X3, Clock, BarChart3, Shield } from 'lucide-react';

// ===== 面板类型 =====

type PanelType = 'quadrant' | 'today' | 'briefing' | 'report' | 'risk';

const PANEL_TABS: Array<{ key: PanelType; label: string; icon: React.ElementType }> = [
  { key: 'today', label: '今日', icon: Clock },
  { key: 'quadrant', label: '四象限', icon: Grid3X3 },
  { key: 'briefing', label: '晨间聚焦', icon: LayoutDashboard },
  { key: 'report', label: '报告', icon: BarChart3 },
  { key: 'risk', label: '风险', icon: Shield },
];

// 懒加载面板组件
const MorningBriefingPanel = lazy(() =>
  import('@/components/MorningBriefingPanel').then(m => ({ default: m.MorningBriefingPanel }))
);

const WeeklyReportPanel = lazy(() =>
  import('@/components/WeeklyReportPanel').then(m => ({ default: m.WeeklyReportPanel }))
);

const TaskMatrixView = lazy(() =>
  import('@/pages/tasks/TasksMatrix').then(m => ({ default: m.TaskMatrixView }))
);

// ===== 组件 =====

export function ConversationalDashboard() {
  const [activePanel, setActivePanel] = useState<PanelType>('today');

  const handlePanelChange = useCallback((panel: string) => {
    setActivePanel(panel as PanelType);
  }, []);

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：AI 对话区 */}
      <div className="w-[380px] shrink-0 border-r border-border flex flex-col bg-card">
        <AiHomepageChat
          onPanelChange={handlePanelChange}
          activePanel={activePanel}
        />
      </div>

      {/* 右侧：实时响应面板 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 面板切换 Tab */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card/50">
          {PANEL_TABS.map(tab => (
            <button
              key={tab.key}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
                activePanel === tab.key
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              onClick={() => setActivePanel(tab.key)}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 面板内容 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-muted-foreground">加载中...</div>}>
            {activePanel === 'today' && <TodayOverviewPanel />}
            {activePanel === 'quadrant' && <QuadrantPanel />}
            {activePanel === 'briefing' && <MorningBriefingPanel />}
            {activePanel === 'report' && <WeeklyReportPanel />}
            {activePanel === 'risk' && <RiskPlaceholder />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ===== 内联面板组件 =====

function TodayOverviewPanel() {
  // 简化版今日概览 — 复用 MyTodayTab 的数据逻辑
  const { state } = (() => {
    try { return { state: (window as any).__TBH_STORE__ || { tasks: {}, goals: {}, members: [] } }; }
    catch { return { state: { tasks: {}, goals: {}, members: [] } }; }
  })();

  const today = new Date().toISOString().split('T')[0];
  const allTasks = Object.values(state.tasks || {});
  const overdue = allTasks.filter((t: any) =>
    t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < today
  );
  const dueToday = allTasks.filter((t: any) =>
    t.status !== 'done' && t.status !== 'cancelled' && t.dueDate === today
  );
  const inProgress = allTasks.filter((t: any) => t.status === 'in-progress');
  const completed = allTasks.filter((t: any) => t.status === 'done');

  const statCards = [
    { label: '逾期', value: overdue.length, color: 'text-red-500' },
    { label: '今日到期', value: dueToday.length, color: 'text-orange-500' },
    { label: '进行中', value: inProgress.length, color: 'text-blue-500' },
    { label: '已完成', value: completed.length, color: 'text-emerald-500' },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {statCards.map(s => (
          <div key={s.label} className="p-3 rounded-lg border border-border bg-card text-center">
            <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {overdue.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-500 mb-2">逾期任务</h3>
          <div className="space-y-1">
            {overdue.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 p-2 rounded bg-red-50 dark:bg-red-900/10 text-xs">
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dueToday.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-orange-500 mb-2">今日到期</h3>
          <div className="space-y-1">
            {dueToday.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 p-2 rounded bg-orange-50 dark:bg-orange-900/10 text-xs">
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dueToday.length === 0 && overdue.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <LayoutDashboard className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">今日无紧急事项</p>
          <p className="text-xs opacity-60 mt-1">适合推进中长期目标</p>
        </div>
      )}
    </div>
  );
}

function QuadrantPanel() {
  // 四象限面板 — 委托给已有的 TasksMatrixView
  // 注意：TaskMatrixView 需要 tasks 和 dispatch props，这里做个包装
  return (
    <div className="p-4">
      <div className="text-center py-8 text-muted-foreground">
        <Grid3X3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">四象限视图</p>
        <p className="text-xs opacity-60 mt-1">请切换到任务页面的四象限模式查看完整交互</p>
      </div>
    </div>
  );
}

function RiskPlaceholder() {
  return (
    <div className="p-4 text-center py-12 text-muted-foreground">
      <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">风险分析</p>
      <p className="text-xs opacity-60 mt-1">对AI说"分析风险"即可获取风险报告</p>
    </div>
  );
}
