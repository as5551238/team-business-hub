/**
 * Dashboard 共享模块 — 常量 + 组件 + Hook + 类型
 */
import React, { useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { useViewingMember, useMemberLookup, useItemLookupMaps } from '@/store/hooks';
import { resolveToken } from '@/lib/resolveToken';
// ── 图表颜色 — 基于 Design Token，自动响应深色模式 ──
export const CHART_COLORS = [
  resolveToken('primary'),       // 蓝
  resolveToken('success'),       // 绿
  resolveToken('warning'),       // 琥珀
  resolveToken('destructive'),   // 红
  resolveToken('chart-purple'),  // 紫
  resolveToken('chart-pink'),    // 粉
];

// ── 优先级样式 & 标签 ──
export const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};
export const priorityLabels: Record<string, string> = {
  urgent: '紧急', high: '高', medium: '中', low: '低',
};

// ── 状态标签 ──
export const statusLabels: Record<string, string> = {
  todo: '待处理', in_progress: '进行中', done: '已完成', blocked: '已阻塞',
};

// ── 活动动作标签 ──
export const actionLabels: Record<string, string> = {
  completed: '完成了', created: '创建了', updated: '更新了',
};

// ── Tab Props 接口 ──
export interface DashboardTabProps {
  onOpenDetail: (id: string, type: 'goal' | 'project' | 'task') => void;
  onOpenGantt: () => void;
  onPageChange: (page: string) => void;
}

// ── 数据卡片组件 ──
export const StatCard = React.memo(function StatCard({ icon, label, value, sub, color, onClick, trend }: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string; color: string; onClick?: () => void; trend?: React.ReactNode;
}) {
  return (
    <div className={`bg-card rounded-xl p-5 border border-border shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/30 transition-all' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          <div className="flex items-center gap-2 mt-1">
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            {trend}
          </div>
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
});

// ── 共享数据 Hook（每 Tab 独立调用，内部 useMemo 防重复计算） ──
export function useFilteredData() {
  const { state, dispatch } = useStore();
  const { isTeamView, viewingMember } = useViewingMember();
  const { nameMap: memberNameMap, getAvatar } = useMemberLookup();
  const { getProjectTitle } = useItemLookupMaps();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const weekLaterStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; }, []);
  const nowDisplay = useMemo(() => new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }), []);

  const memberGoals = useMemo(() => {
    if (!isTeamView && viewingMember) {
      return state.goals.filter(g => g.leaderId === viewingMember.id || (g.supporterIds ?? []).includes(viewingMember.id));
    }
    return state.goals;
  }, [state.goals, isTeamView, viewingMember]);

  const memberTasks = useMemo(() => {
    if (!isTeamView && viewingMember) {
      return state.tasks.filter(t => t.leaderId === viewingMember.id || (t.supporterIds ?? []).includes(viewingMember.id));
    }
    return state.tasks;
  }, [state.tasks, isTeamView, viewingMember]);

  const memberProjects = useMemo(() => {
    if (!isTeamView && viewingMember) {
      return state.projects.filter(p => p.leaderId === viewingMember.id || (p.supporterIds ?? []).includes(viewingMember.id));
    }
    return state.projects;
  }, [state.projects, isTeamView, viewingMember]);

  const getMemberName = useCallback((id: string) => memberNameMap.get(id) ?? '未知', [memberNameMap]);

  const commentCountMap = useMemo(() => {
    const m: Record<string, number> = {};
    (state.comments ?? []).forEach(c => { m[c.itemId] = (m[c.itemId] || 0) + 1; });
    return m;
  }, [state.comments]);

  return {
    state, dispatch, isTeamView, viewingMember,
    memberGoals, memberTasks, memberProjects,
    memberNameMap, getAvatar, getProjectTitle, getMemberName,
    todayStr, weekLaterStr, nowDisplay, commentCountMap,
  };
}
