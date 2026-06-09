/**
 * SidebarContainer — 侧边栏容器
 * 从 Layout.tsx 抽出的独立组件，管理导航、用户信息、同步状态
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { hasPermission } from '@/store/reducer';
import type { Permission } from '@/types';
import { computeUserLevel, getLevelDescription, setUserLevel, isFeatureVisible, recordAction } from '@/lib/progressiveDisclosure';
import { handleError } from '@/lib/errorHandler';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AppLogo } from '@/components/AppLogo';
import type { Page } from './Layout';
import {
  LayoutDashboard, Target, FolderKanban, CheckSquare,
  BarChart3, Settings, BookOpen,
  PanelLeftClose, PanelLeft, ChevronsLeft, ChevronsRight,
  Cloud, CloudOff, Loader2, X,
} from 'lucide-react';

const navItems: { page: Page; label: string; icon: React.ReactNode; requirePermission?: Permission }[] = [
  { page: 'dashboard', label: '工作台', icon: <LayoutDashboard size={20} /> },
  { page: 'goals', label: '目标管理', icon: <Target size={20} /> },
  { page: 'projects', label: '项目中心', icon: <FolderKanban size={20} /> },
  { page: 'tasks', label: '任务中心', icon: <CheckSquare size={20} /> },
  { page: 'insight', label: '数据洞察', icon: <BarChart3 size={20} /> },
  { page: 'knowledge', label: '知识库', icon: <BookOpen size={20} /> },
  { page: 'admin', label: '管理中心', icon: <Settings size={20} />, requirePermission: 'settings_manage' },
];

export type SidebarMode = 'wide' | 'narrow' | 'hidden';

interface SidebarContainerProps {
  currentPage: Page;
  onPageClick: (page: Page) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  sidebarMode: SidebarMode;
  setSidebarMode: (v: SidebarMode | ((prev: SidebarMode) => SidebarMode)) => void;
  unreadCount: number;
  overdueCount: number;
  inProgressGoalsCount: number;
  connectionMode: string;
  offlineWrites: number;
}

export default function SidebarContainer({
  currentPage, onPageClick, sidebarOpen, setSidebarOpen,
  sidebarMode, setSidebarMode, unreadCount, overdueCount,
  inProgressGoalsCount, connectionMode, offlineWrites,
}: SidebarContainerProps) {
  const { state } = useStore();
  const user = state.currentUser;
  const sidebarCollapsed = sidebarMode === 'hidden';
  const sidebarNarrow = sidebarMode === 'narrow';

  const cycleSidebarMode = useCallback(() => {
    setSidebarMode(prev => {
      const next = prev === 'wide' ? 'narrow' : prev === 'narrow' ? 'hidden' : 'wide';
      try { localStorage.setItem('tbh-sidebar-mode', next); } catch (e) { handleError(e, { module: 'Sidebar', operation: 'SAVE_MODE', severity: 'debug' }); }
      return next;
    });
  }, [setSidebarMode]);

  const visibleNavItems = useMemo(() => navItems.filter(item => {
    if (item.requirePermission && (!user || (user.role !== 'admin' && !hasPermission(state, user.id, item.requirePermission)))) return false;
    const featureMap: Record<string, string> = { dashboard: 'dashboard', goals: 'goals_basic', projects: 'projects', tasks: 'tasks', insight: 'insight', knowledge: 'knowledge', admin: 'dashboard' };
    return isFeatureVisible(featureMap[item.page] || item.page);
  }), [user, state]);

  return (
    <aside className={[
      'fixed inset-y-0 left-0 z-50 bg-sidebar text-sidebar-foreground glass-sidebar transform transition-all duration-200 ease-in-out flex flex-col',
      sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full',
      'md:relative md:translate-x-0',
      sidebarMode === 'wide' ? 'md:w-64' : sidebarMode === 'narrow' ? 'md:w-16' : 'md:w-0 md:overflow-hidden md:border-none',
      sidebarMode === 'hidden' ? '' : 'border-r border-border',
    ].join(' ')}>
      {/* Logo + toggle */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <AppLogo size="md" />
        {!sidebarNarrow && !sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">团队业务中台</div>
            <div className="text-xs text-sidebar-foreground/50">Team Business Hub</div>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild><button className="ml-auto p-1 rounded hover:bg-sidebar-accent transition-colors" onClick={cycleSidebarMode} aria-label={sidebarMode === 'wide' ? '收窄侧边栏' : sidebarMode === 'narrow' ? '隐藏侧边栏' : '展开侧边栏'}>
            {sidebarMode === 'wide' ? <PanelLeftClose size={16} /> : sidebarMode === 'narrow' ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
          </button></TooltipTrigger>
          <TooltipContent side="right">{sidebarMode === 'wide' ? '收窄侧边栏' : sidebarMode === 'narrow' ? '隐藏侧边栏' : '展开侧边栏'}</TooltipContent>
        </Tooltip>
        <button className="md:hidden" onClick={() => setSidebarOpen(false)} aria-label="关闭侧边栏"><X size={18} /></button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto" aria-label="主导航">
        {visibleNavItems.map((item, idx) => {
          const isActive = currentPage === item.page;
          const btnCls = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left relative active:scale-[0.97] ${isActive ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'} ${sidebarNarrow ? 'justify-center px-0' : ''}`;
          const badge = !sidebarNarrow && !sidebarCollapsed && item.page === 'tasks' && overdueCount > 0 ? <span className="ml-auto bg-destructive text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{overdueCount}</span>
            : !sidebarNarrow && !sidebarCollapsed && item.page === 'goals' && inProgressGoalsCount > 0 ? <span className="ml-auto bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{inProgressGoalsCount}</span>
            : !sidebarNarrow && !sidebarCollapsed && item.page === 'dashboard' && unreadCount > 0 ? <span className="ml-auto bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unreadCount}</span> : null;
          const narrowDot = sidebarNarrow && item.page === 'tasks' && overdueCount > 0 ? <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
            : sidebarNarrow && item.page === 'dashboard' && unreadCount > 0 ? <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" /> : null;
          const shortcutNum = !sidebarNarrow && !sidebarCollapsed ? <span className="ml-auto text-[10px] text-sidebar-foreground/30 hidden lg:inline">{idx + 1}</span> : null;
          const content = <>{item.icon}{!sidebarNarrow && !sidebarCollapsed && item.label}{badge}{narrowDot}{shortcutNum}</>;

          if (sidebarNarrow) {
            return <Tooltip key={item.page}><TooltipTrigger asChild><button onClick={() => { onPageClick(item.page); recordAction(); }} aria-label={item.label} aria-current={isActive ? 'page' : undefined} className={btnCls}>{content}</button></TooltipTrigger><TooltipContent>{item.label}</TooltipContent></Tooltip>;
          }
          return <button key={item.page} onClick={() => { onPageClick(item.page); recordAction(); }} aria-label={item.label} aria-current={isActive ? 'page' : undefined} className={btnCls}>{content}</button>;
        })}
      </nav>

      {/* Footer: sync status + user level */}
      <div className={`px-3 py-3 border-t border-white/10 space-y-1 ${sidebarNarrow ? 'flex flex-col items-center' : ''}`}>
        {!sidebarNarrow && !sidebarCollapsed ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5">
              {connectionMode === 'supabase' ? <Cloud size={14} className="text-green-400" /> : connectionMode === 'loading' ? <Loader2 size={14} className="animate-spin text-amber-400" /> : connectionMode === 'offline' ? <CloudOff size={14} className="text-red-400" /> : <CloudOff size={14} className="text-white/40" />}
              <span className={`text-xs ${connectionMode === 'supabase' ? 'text-green-400' : connectionMode === 'loading' ? 'text-amber-400' : connectionMode === 'offline' ? 'text-red-400' : 'text-white/40'}`}>
                {connectionMode === 'supabase' ? '云端同步' : connectionMode === 'loading' ? '连接中...' : connectionMode === 'offline' ? `网络离线${offlineWrites > 0 ? ` · ${offlineWrites}项待同步` : ''}` : '本地模式'}
              </span>
            </div>
            {(() => {
              const level = computeUserLevel();
              const desc = getLevelDescription(level);
              return <Tooltip><TooltipTrigger asChild><button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors cursor-pointer rounded hover:bg-sidebar-accent" onClick={() => { const next: Record<string, string> = { beginner: 'intermediate', intermediate: 'advanced', advanced: 'beginner' }; setUserLevel(next[level]); window.location.reload(); }}>
                <span className="text-[10px]">{level === 'beginner' ? '🌱' : level === 'intermediate' ? '🌿' : '🌳'}</span><span>{desc.title}</span><span className="ml-auto text-[10px]">切换</span>
              </button></TooltipTrigger><TooltipContent>{`点击切换体验等级（当前: ${desc.title}）`}</TooltipContent></Tooltip>;
            })()}
          </>
        ) : (
          <button className="p-2 rounded hover:bg-sidebar-accent transition-colors" onClick={cycleSidebarMode} aria-label="展开侧边栏">
            <ChevronsRight size={16} className="text-sidebar-foreground/50" />
          </button>
        )}
      </div>

      {/* User info */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className={`flex items-center gap-3 ${sidebarNarrow ? 'justify-center px-0' : 'px-3'} py-2`}>
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0">{user?.avatar || '?'}</div>
          {!sidebarNarrow && !sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-sidebar-foreground/50 truncate">{user?.department}</div>
              {user?.role && <div className="text-xs text-sidebar-foreground/40 truncate">{user.role === 'admin' ? '管理员' : user.role === 'manager' ? '经理' : user.role === 'leader' ? '负责人' : '成员'}</div>}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
