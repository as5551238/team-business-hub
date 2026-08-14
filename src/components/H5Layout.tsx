/**
 * H5Layout — 微信/飞书/鸿蒙内嵌 H5 页面的完整布局
 * 特性：底部导航栏、FAB快速创建、通知权限引导、编辑能力、safe-area适配
 * 完全对齐主 Layout 功能，移动端专用
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getRoleLabel } from '@/lib/roleUtils';
import { useStore } from '@/store/useStore';
import { QuickCreateModal } from '@/components/QuickCreateModal';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { requestNotificationPermission, isNotificationSupported } from '@/lib/browserNotify';
import { useTheme } from '@/hooks/useTheme';
import { Sun, CheckSquare, Target, User, Plus, Bell, BellOff, Settings, Moon, Sparkles } from 'lucide-react';

interface H5LayoutProps {
  children?: React.ReactNode;
}

type H5Tab = 'today' | 'tasks' | 'goals' | 'me';

export function H5Layout({ children }: H5LayoutProps) {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState<H5Tab>('today');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<'task' | 'goal' | 'project'>('task');
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | 'default'>('default');
  const { theme, toggleTheme } = useTheme();

  const userId = state.currentUser?.id;
  const today = new Date().toISOString().slice(0, 10);
  const myTasks = userId ? state.tasks.filter(t =>
    (t.leaderId === userId || (t.supporterIds ?? []).includes(userId)) &&
    t.status !== 'done' && t.status !== 'cancelled'
  ) : [];
  const dueToday = myTasks.filter(t => t.dueDate === today);
  const overdue = myTasks.filter(t => t.dueDate && t.dueDate < today);

  useEffect(() => {
    if ('Notification' in window) {
      setNotifyPermission(Notification.permission);
    }
  }, []);

  const handleRequestNotify = useCallback(async () => {
    const result = await requestNotificationPermission();
    setNotifyPermission(result);
  }, []);

  const handleToggleTask = useCallback((taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'in_progress' : 'done';
    dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: { status: newStatus } } });
  }, [dispatch]);

  const tabs: { key: H5Tab; label: string; icon: typeof Sun; badge?: number }[] = [
    { key: 'today', label: '今日', icon: Sun, badge: dueToday.length + overdue.length },
    { key: 'tasks', label: '任务', icon: CheckSquare, badge: myTasks.length },
    { key: 'goals', label: '目标', icon: Target },
    { key: 'me', label: '我的', icon: User },
  ];

  return (
    <div className="h-dvh h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-border safe-area-top">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">
            {activeTab === 'today' && '我的今日'}
            {activeTab === 'tasks' && '我的任务'}
            {activeTab === 'goals' && '我的目标'}
            {activeTab === 'me' && '个人中心'}
          </h1>
          <div className="flex items-center gap-2">
            {activeTab === 'me' && (
              <>
                <button onClick={toggleTheme} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="切换主题">
                  {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                </button>
                {isNotificationSupported() && (
                  <button onClick={handleRequestNotify} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="通知设置">
                    {notifyPermission === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-20">
        {activeTab === 'today' && (
          <H5TodayView tasks={myTasks} dueToday={dueToday} overdue={overdue} onToggleTask={handleToggleTask} />
        )}
        {activeTab === 'tasks' && (
          <H5TaskList tasks={myTasks} onToggleTask={handleToggleTask} />
        )}
        {activeTab === 'goals' && (
          <H5GoalList goals={userId ? state.goals.filter(g =>
            g.leaderId === userId || (g.supporterIds ?? []).includes(userId)
          ) : []} />
        )}
        {activeTab === 'me' && (
          <H5MeView notifyPermission={notifyPermission} onRequestNotify={handleRequestNotify} />
        )}
      </div>

      {/* FAB — Quick create */}
      <button
        onClick={() => { setQuickCreateType('task'); setQuickCreateOpen(true); }}
        className="fixed right-4 z-50 w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
        aria-label="快速创建"
      >
        <Plus size={22} />
      </button>

      {/* Bottom Tab Bar */}
      <div className="flex-shrink-0 bg-card border-t border-border flex items-center justify-around" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex flex-col items-center px-4 py-2 text-xs transition-colors ${
              activeTab === t.key ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <div className="relative">
              <t.icon size={20} />
              {t.badge ? (
                <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full px-0.5">
                  {t.badge > 9 ? '9+' : t.badge}
                </span>
              ) : null}
            </div>
            <span className="mt-0.5">{t.label}</span>
          </button>
        ))}
      </div>

      <QuickCreateModal open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} initialType={quickCreateType} />
      <PWAInstallPrompt />
    </div>
  );
}

// --- Sub-components ---

function H5TodayView({ tasks, dueToday, overdue, onToggleTask }: { tasks: any[]; dueToday: any[]; overdue: any[]; onToggleTask: (id: string, status: string) => void }) {
  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-red-600 mb-2">逾期 ({overdue.length})</h3>
          {overdue.slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100" onClick={() => onToggleTask(t.id, t.status)}>
              <CheckSquare size={14} className="text-red-500 shrink-0" />
              <span className="text-sm truncate flex-1">{t.title}</span>
              <span className="text-[10px] text-red-400">{t.dueDate?.slice(5)}</span>
            </div>
          ))}
        </section>
      )}
      <section>
        <h3 className="text-sm font-semibold mb-2">今日到期 ({dueToday.length})</h3>
        {dueToday.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">今日无到期任务</p>
        ) : (
          dueToday.slice(0, 8).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-card border border-border" onClick={() => onToggleTask(t.id, t.status)}>
              <CheckSquare size={14} className="text-blue-500 shrink-0" />
              <span className="text-sm truncate flex-1">{t.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{t.priority === 'urgent' ? '紧急' : t.priority === 'high' ? '高' : ''}</span>
            </div>
          ))
        )}
      </section>
      {tasks.filter(t => t.status === 'in_progress').length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">进行中</h3>
          {tasks.filter(t => t.status === 'in_progress').slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-card border border-border" onClick={() => onToggleTask(t.id, t.status)}>
              <CheckSquare size={14} className="text-green-500 shrink-0" />
              <span className="text-sm truncate">{t.title}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function H5TaskList({ tasks, onToggleTask }: { tasks: any[]; onToggleTask: (id: string, status: string) => void }) {
  const groups: Record<string, any[]> = { todo: [], in_progress: [], blocked: [] };
  tasks.forEach(t => { if (groups[t.status]) groups[t.status].push(t); });
  const labels: Record<string, string> = { todo: '待处理', in_progress: '进行中', blocked: '阻塞' };

  return (
    <div className="space-y-4">
      {Object.entries(groups).filter(([, v]) => v.length > 0).map(([status, items]) => (
        <section key={status}>
          <h3 className="text-sm font-semibold mb-2">{labels[status]} ({items.length})</h3>
          {items.slice(0, 10).map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 mb-1 rounded-lg bg-card border border-border" onClick={() => onToggleTask(t.id, t.status)}>
              <CheckSquare size={14} className="shrink-0 text-muted-foreground" />
              <span className="text-sm truncate flex-1">{t.title}</span>
              {t.dueDate && <span className="text-[10px] text-muted-foreground shrink-0">{t.dueDate.slice(5)}</span>}
            </div>
          ))}
        </section>
      ))}
      {tasks.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">暂无任务</p>}
    </div>
  );
}

function H5GoalList({ goals }: { goals: any[] }) {
  const active = goals.filter(g => g.status === 'in_progress');
  const done = goals.filter(g => g.status === 'done');

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-semibold mb-2">进行中 ({active.length})</h3>
        {active.slice(0, 8).map(g => (
          <div key={g.id} className="p-3 mb-2 rounded-lg bg-card border border-border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate">{g.title}</span>
              <span className="text-xs text-primary font-medium">{g.progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${g.progress}%` }} />
            </div>
          </div>
        ))}
      </section>
      {done.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">已完成 ({done.length})</h3>
          {done.slice(0, 5).map(g => (
            <div key={g.id} className="p-3 mb-2 rounded-lg bg-muted/30 border border-border">
              <span className="text-sm text-muted-foreground truncate">{g.title}</span>
            </div>
          ))}
        </section>
      )}
      {goals.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">暂无目标</p>}
    </div>
  );
}

function H5MeView({ notifyPermission, onRequestNotify }: { notifyPermission: string; onRequestNotify: () => void }) {
  const { state } = useStore();
  const user = state.currentUser;
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
        <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
          {user.avatar || user.name.charAt(0)}
        </div>
        <div>
          <p className="text-base font-semibold">{user.name}</p>
          <p className="text-xs text-muted-foreground">{getRoleLabel(user.role)}</p>
        </div>
      </div>

      {/* Notification permission prompt */}
      {isNotificationSupported() && notifyPermission !== 'granted' && (
        <div className="p-4 rounded-xl bg-card border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={16} className="text-primary" />
            <span className="text-sm font-medium">开启消息通知</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">接收任务到期、风险预警等提醒</p>
          <button
            onClick={onRequestNotify}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {notifyPermission === 'denied' ? '通知已被禁止，请在系统设置中开启' : '开启通知'}
          </button>
        </div>
      )}
    </div>
  );
}
