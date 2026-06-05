/**
 * 我的今日 Tab — 执行者视角首屏（L2 改造）
 * 5个区域：问候语+今日概览 / 到期今日 / 逾期未完 / @我的未读 / 快捷操作
 */
import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useViewingMember } from '@/store/hooks';
import { activeGoals, activeTasks, activeProjects } from '@/store/shared';
import {
  Clock, AlertTriangle, AtSign, CheckCircle2, Target, FolderKanban,
  CheckSquare, ChevronRight, Plus, Sparkles, Calendar, ArrowRight,
  Users2,
} from 'lucide-react';
import { priorityColors, priorityLabels } from './shared';
import { OutlookMailPanel } from './OutlookMailPanel';

interface MyTodayTabProps {
  onOpenDetail: (id: string, type: 'goal' | 'project' | 'task') => void;
  onPageChange: (page: string) => void;
}

export default function MyTodayTab({ onOpenDetail, onPageChange }: MyTodayTabProps) {
  const { state, dispatch } = useStore();
  const { isTeamView, viewingMember } = useViewingMember();

  const userId = state.currentUser?.id;
  const userName = state.currentUser?.name || viewingMember?.name || '用户';
  const memberTasks = isTeamView
    ? state.tasks
    : state.tasks.filter(t => t.leaderId === viewingMember?.id || (t.supporterIds ?? []).includes(viewingMember?.id));
  const tasks = activeTasks(memberTasks);
  const goals = activeGoals(state.goals);
  const projects = activeProjects(state.projects);

  const today = new Date().toISOString().slice(0, 10);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 12) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }, []);

  // ── 4组数据 ──
  const dueToday = useMemo(() =>
    tasks.filter(t =>
      (t.leaderId === userId || (t.supporterIds ?? []).includes(userId || '')) &&
      t.status !== 'done' && t.status !== 'cancelled' &&
      t.dueDate === today
    ), [tasks, userId, today]);

  const overdue = useMemo(() =>
    tasks.filter(t =>
      (t.leaderId === userId || (t.supporterIds ?? []).includes(userId || '')) &&
      t.status !== 'done' && t.status !== 'cancelled' &&
      t.dueDate && t.dueDate < today
    ), [tasks, userId, today]);

  const unreadMentions = useMemo(() => {
    const comments = state.comments || [];
    return comments.filter(c =>
      c.mentionedMemberIds?.includes(userId || '') &&
      !c.isRead
    ).slice(0, 8);
  }, [state.comments, userId]);

  const myInProgress = useMemo(() =>
    tasks.filter(t =>
      t.leaderId === userId &&
      t.status === 'in_progress'
    ).slice(0, 5),
    [tasks, userId]);

  // ── 今日完成统计 ──
  const completedToday = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return tasks.filter(t =>
      t.status === 'done' && t.completedAt &&
      new Date(t.completedAt) >= start
    ).length;
  }, [tasks]);

  const totalDueThisWeek = useMemo(() => {
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    return tasks.filter(t =>
      t.status !== 'done' && t.status !== 'cancelled' &&
      t.dueDate && new Date(t.dueDate) <= weekEnd
    ).length;
  }, [tasks]);

  // ── Quick actions ──
  const quickActions = [
    { label: '新建任务', icon: <Plus size={14} />, page: 'tasks' as const, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { label: '查看目标', icon: <Target size={14} />, page: 'goals' as const, color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
    { label: '查看项目', icon: <FolderKanban size={14} />, page: 'projects' as const, color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { label: 'AI助手', icon: <Sparkles size={14} />, page: 'dashboard' as const, color: 'bg-purple-50 text-purple-700 hover:bg-purple-100', action: 'ai-chat' as const },
  ];

  const typeIcon = (type: string) => {
    if (type === 'goal') return <Target size={12} className="text-indigo-500" />;
    if (type === 'project') return <FolderKanban size={12} className="text-blue-500" />;
    return <CheckSquare size={12} className="text-green-500" />;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      todo: 'bg-gray-100 text-gray-600',
      in_progress: 'bg-blue-100 text-blue-700',
      blocked: 'bg-amber-100 text-amber-700',
    };
    const labels: Record<string, string> = {
      todo: '待处理', in_progress: '进行中', blocked: '阻塞',
    };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── 问候 + 今日概览 ── */}
      <div className="bg-gradient-to-br from-primary/5 via-card to-primary/10 rounded-2xl border border-primary/15 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{greeting}，{userName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              今日待办 {dueToday.length} 项 · 逾期 {overdue.length} 项 · 本周截止 {totalDueThisWeek} 项
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-medium">
            <CheckCircle2 size={14} />
            今日已完成 {completedToday}
          </div>
        </div>

        {/* Quick actions — 仅在有任务时显示(减少新手噪音) */}
        {(dueToday.length > 0 || myInProgress.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {quickActions.map(a => (
              <button
                key={a.label}
                onClick={() => { if (a.action === 'ai-chat') { window.dispatchEvent(new CustomEvent('tbh-open-ai-chat')); } else { onPageChange(a.page); } }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${a.color}`}
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        )}

        {/* 快捷键提示(D2操作直觉度) */}
        <p className="text-[11px] text-muted-foreground/60 mt-3">
          <kbd className="px-1 py-0.5 text-[10px] bg-muted rounded border border-border">Ctrl+K</kbd> 命令面板 &nbsp;
          <kbd className="px-1 py-0.5 text-[10px] bg-muted rounded border border-border">Ctrl+N</kbd> 快速创建
        </p>
      </div>

      {/* ── 到期今日 ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-blue-600" />
            <h3 className="text-sm font-semibold">到期今日</h3>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{dueToday.length}</span>
          </div>
          {dueToday.length > 0 && (
            <button onClick={() => onPageChange('tasks')} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors">
              查看全部 <ArrowRight size={10} />
            </button>
          )}
        </div>
        {dueToday.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2 size={14} /> 今日无到期任务
          </div>
        ) : (
          <div className="space-y-1.5">
            {dueToday.slice(0, 6).map(t => (
              <div
                key={t.id}
                onClick={() => onOpenDetail(t.id, 'task')}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border hover:border-primary/30 cursor-pointer transition-colors"
              >
                {typeIcon('task')}
                <span className="flex-1 min-w-0 text-sm truncate">{t.title}</span>
                {statusBadge(t.status)}
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColors[t.priority] || ''}`}>
                  {priorityLabels[t.priority] || t.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 逾期未完 ── */}
      {overdue.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">逾期未完</h3>
              <span className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">{overdue.length}</span>
            </div>
            <button onClick={() => onPageChange('tasks')} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors">
              查看全部 <ArrowRight size={10} />
            </button>
          </div>
          <div className="space-y-1.5">
            {overdue.slice(0, 4).map(t => (
              <div
                key={t.id}
                onClick={() => onOpenDetail(t.id, 'task')}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30 hover:border-red-300 cursor-pointer transition-colors"
              >
                {typeIcon('task')}
                <span className="flex-1 min-w-0 text-sm truncate">{t.title}</span>
                <span className="text-[10px] text-red-500">逾期 {Math.ceil((Date.now() - new Date(t.dueDate!).getTime()) / 86400000)}天</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── @我的未读 ── */}
      {unreadMentions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <AtSign size={16} className="text-purple-600" />
            <h3 className="text-sm font-semibold">@我的未读</h3>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{unreadMentions.length}</span>
          </div>
          <div className="space-y-1.5">
            {unreadMentions.map(c => (
              <div
                key={c.id}
                onClick={() => onOpenDetail(c.itemId, (c.itemType as 'task' | 'goal' | 'project') || 'task')}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200/50 dark:border-purple-800/30 cursor-pointer hover:border-purple-300 transition-colors"
              >
                {typeIcon(c.itemType || 'task')}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{c.content?.slice(0, 60) || '(内容)'}</p>
                  <p className="text-[10px] text-muted-foreground">{c.memberName}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 进行中的任务 ── */}
      {myInProgress.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className="text-blue-600" />
            <h3 className="text-sm font-semibold">进行中</h3>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{myInProgress.length}</span>
          </div>
          <div className="space-y-1.5">
            {myInProgress.map(t => (
              <div
                key={t.id}
                onClick={() => onOpenDetail(t.id, 'task')}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border hover:border-primary/30 cursor-pointer transition-colors"
              >
                {typeIcon('task')}
                <span className="flex-1 min-w-0 text-sm truncate">{t.title}</span>
                {t.dueDate && <span className="text-[10px] text-muted-foreground">截止 {t.dueDate}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 最近动态 (D1+D5 信息流畅度+协作透明度) ── */}
      {(() => {
        const recentActivity = state.activities
          .filter(a => a.memberId !== userId)
          .slice(0, 6);
        const unreadNotifs = state.notifications.filter(n => !n.read).slice(0, 4);
        return (recentActivity.length > 0 || unreadNotifs.length > 0) ? (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Users2 size={16} className="text-emerald-600" />
              <h3 className="text-sm font-semibold">团队动态</h3>
            </div>
            <div className="space-y-1.5">
              {unreadNotifs.map(n => (
                <div key={n.id} onClick={() => { dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id }); if (n.relatedId && n.relatedType) onOpenDetail(n.relatedId, (n.relatedType as 'task' | 'goal' | 'project') || 'task'); }} className="flex items-center gap-3 p-2.5 rounded-lg bg-primary/5 border border-primary/10 cursor-pointer hover:border-primary/30 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-sm truncate flex-1">{n.title || n.message}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{n.createdAt ? new Date(n.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
              {recentActivity.map(a => (
                <div key={a.id} onClick={() => { if (a.targetId && a.targetType) onOpenDetail(a.targetId, (a.targetType as 'task' | 'goal' | 'project') || 'task'); }} className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border cursor-pointer hover:border-primary/30 transition-colors">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                    {a.targetTitle?.charAt(0) || '?'}
                  </div>
                  <span className="text-sm truncate flex-1">{a.details || a.action}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{a.createdAt ? new Date(a.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null;
      })()}

      {/* ── Outlook 邮件面板 ── */}
      <OutlookMailPanel />

      {/* ── 空状态 ── */}
      {dueToday.length === 0 && overdue.length === 0 && unreadMentions.length === 0 && myInProgress.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <CheckCircle2 size={32} className="text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-1">暂无待办</h3>
          <p className="text-sm text-muted-foreground mb-4">当前没有任何待处理的事项</p>
          <button
            onClick={() => onPageChange('tasks')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> 新建任务
          </button>
        </div>
      )}
    </div>
  );
}
