/**
 * TopBar — 顶部栏
 * 从 Layout.tsx 抽出：面包屑、搜索、通知、用户菜单、团队切换、视图切换、密度/主题
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useViewingMember, useMemberLookup, useActiveMembers } from '@/store/hooks';
import { useTheme } from '@/hooks/useTheme';
import { handleError } from '@/lib/errorHandler';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Breadcrumb } from '@/components/Breadcrumb';
import { MemberFilterDropdown, NotificationDropdown, UserMenuDropdown } from './LayoutDropdowns';
import type { Page } from './Layout';
import type { DensityMode } from './Layout';
import {
  Search, Menu, Bell, ChevronDown, PanelLeft,
  Building2, Eye, Users2,
} from 'lucide-react';

interface TopBarProps {
  currentPage: Page;
  itemId: string | null;
  sidebarMode: string;
  cycleSidebarMode: () => void;
  setSidebarOpen: (v: boolean) => void;
  user: { id: string; role: string; name: string; avatar: string; department: string } | undefined;
  notifications: Array<{ id: string; type: string; title: string; message: string; relatedId: string; relatedType: string; memberId: string; read: boolean; createdAt: string }>;
  unreadCount: number;
  onlineUsers: Array<{ id: string; name: string; color: string; cursor?: { entity: string } }>;
  density: DensityMode;
  toggleDensity: () => void;
  goToPage: (page: Page) => void;
  goToItem: (itemType: 'goal' | 'project' | 'task', itemId: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
}

export default function TopBar({
  currentPage, itemId, sidebarMode, cycleSidebarMode, setSidebarOpen,
  user, notifications, unreadCount, onlineUsers,
  density, toggleDensity, goToPage, goToItem, searchInputRef,
}: TopBarProps) {
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const { viewingMemberId, setViewingMember, isTeamView, viewingMember } = useViewingMember();
  const memberLookup = useMemberLookup();
  const { activeMembers } = useActiveMembers();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = user?.role === 'admin';
  const visibleMembers = isAdmin ? activeMembers : activeMembers.filter(m => m.id === user?.id);
  const visibleMembersMemo = useMemo(() => visibleMembers, [isAdmin, activeMembers, user?.id]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMemberFilter, setShowMemberFilter] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);

  const closeAllDropdowns = useCallback(() => { setShowNotifications(false); setShowUserMenu(false); setShowMemberFilter(false); setShowTeamSelector(false); }, []);

  // Team switcher
  const userTeams = useMemo(() => {
    if (!user) return [];
    const teamIds = state.teamMembers.filter(tm => tm.memberId === user.id).map(tm => tm.teamId);
    return state.teams.filter(t => teamIds.includes(t.id));
  }, [state.teams, state.teamMembers, user?.id]);
  const currentTeam = useMemo(() => state.teams.find(t => t.id === state.currentTeamId), [state.teams, state.currentTeamId]);
  const handleSwitchTeam = useCallback((teamId: string) => { dispatch({ type: 'SET_CURRENT_TEAM', payload: teamId }); setShowTeamSelector(false); window.location.reload(); }, [dispatch]);
  const handleMarkAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' }), [dispatch]);
  const handleMarkRead = useCallback((id: string) => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id }), [dispatch]);
  const handleNotificationNavigate = useCallback((page: Page, itemId: string, itemType: string, notificationId?: string) => {
    if (notificationId) dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notificationId });
    goToItem(itemType as 'goal' | 'project' | 'task', itemId);
    setShowNotifications(false);
  }, [goToItem, dispatch]);
  const handleSwitchUser = useCallback((id: string) => { dispatch({ type: 'SET_CURRENT_USER', payload: id }); setShowUserMenu(false); }, [dispatch]);
  const handleLogout = useCallback(() => {
    try { localStorage.removeItem('tbh-current-user'); } catch (e) { handleError(e, { module: 'TopBar', operation: 'LOGOUT', severity: 'debug' }); }
    dispatch({ type: 'SET_CURRENT_USER', payload: null });
    setShowUserMenu(false);
    import('@/lib/sentry').then(m => m.clearSentryUser()).catch(() => {});
  }, [dispatch]);
  const handleGlobalSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = (e.target as HTMLInputElement).value.trim();
    if (!q) return;
    const matched = state.members.filter(m => m.status === 'active' && (m.name === q || m.nickname === q));
    if (matched.length > 0) {
      navigate(`/tasks?persons=${matched.map(m => m.id).join(',')}`);
    } else {
      navigate('/tasks');
      setTimeout(() => { const el = document.querySelector<HTMLInputElement>('input[data-search-input]'); if (el) { el.value = q; el.focus(); el.dispatchEvent(new Event('input', { bubbles: true })); } }, 600);
    }
  }, [state.members, navigate]);

  const notificationsMemo = useMemo(() => notifications.filter(n => !n.memberId || n.memberId === user?.id), [notifications, user?.id]);

  return (
    <header className="h-14 bg-background border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
      <button className="md:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted" onClick={() => setSidebarOpen(true)} aria-label="打开侧边栏"><Menu size={20} /></button>
      {sidebarMode === 'hidden' && <button className="hidden md:flex p-1.5 -ml-1.5 rounded-md hover:bg-muted" onClick={cycleSidebarMode} aria-label="展开侧边栏"><PanelLeft size={20} /></button>}
      <Breadcrumb currentPage={currentPage} itemId={itemId} />

      {userTeams.length > 1 && (
        <div className="relative">
          <button onClick={() => { setShowTeamSelector(!showTeamSelector); closeAllDropdowns(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors">
            <Building2 size={14} /><span className="hidden sm:inline max-w-[100px] truncate">{currentTeam?.name || '选择团队'}</span><ChevronDown size={12} />
          </button>
          {showTeamSelector && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-card rounded-lg shadow-lg border border-border z-50 animate-slide-up">
              <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground">切换团队</div>
              {userTeams.map(t => (
                <button key={t.id} onClick={() => handleSwitchTeam(t.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left transition-colors ${t.id === state.currentTeamId ? 'bg-primary/5 text-primary font-medium' : ''}`}>
                  <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{(t.name || '?').slice(0, 2)}</div>
                  <span className="truncate">{t.name}</span>
                  {t.id === state.currentTeamId && <span className="ml-auto text-[10px] text-primary">当前</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <button onClick={() => { setShowMemberFilter(!showMemberFilter); setShowUserMenu(false); setShowNotifications(false); }} aria-label="切换视图" aria-expanded={showMemberFilter} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!isTeamView ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{isTeamView ? <><Eye size={14} /> <span className="hidden sm:inline">团队视图</span></> : <><Users2 size={14} /> <span className="hidden sm:inline">{viewingMember?.name || '个人'}</span></>}<ChevronDown size={12} className="text-muted-foreground" /></button>
        {showMemberFilter && <MemberFilterDropdown isTeamView={isTeamView} viewingMemberId={viewingMemberId} viewingMember={viewingMember} visibleMembers={visibleMembersMemo} setViewingMember={setViewingMember} onClose={closeAllDropdowns} />}
      </div>

      <div className="flex-1" />
      <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm w-64">
        <Search size={16} /><input ref={searchInputRef} type="text" placeholder="搜索... (⌘K)" aria-label="全局搜索" className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground" onKeyDown={handleGlobalSearch} />
      </div>



      <div className="relative">
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors" aria-label={`通知${unreadCount > 0 ? ` (${unreadCount}条未读)` : ''}`}
          onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); setShowMemberFilter(false); }}>
          <Bell size={18} />{unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />}
        </button>
        {showNotifications && <NotificationDropdown notifications={notificationsMemo} unreadCount={unreadCount} onMarkAllRead={handleMarkAllRead} onMarkRead={handleMarkRead} onNavigate={handleNotificationNavigate} />}
        <div aria-live="polite" aria-atomic="true" className="sr-only">{unreadCount > 0 ? `${unreadCount}条未读通知` : '没有未读通知'}</div>
      </div>
      <div className="relative">
        <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="用户菜单" aria-expanded={showUserMenu}
          onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); setShowMemberFilter(false); }}>
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">{user?.avatar || '?'}</div>
          <ChevronDown size={14} className="hidden sm:block text-muted-foreground" />
        </button>
        {showUserMenu && <UserMenuDropdown user={user} visibleMembers={visibleMembersMemo} onSwitchUser={handleSwitchUser} onLogout={handleLogout} density={density} toggleDensity={toggleDensity} theme={theme} toggleTheme={toggleTheme} onlineUsers={onlineUsers} currentPage={currentPage} />}
      </div>
    </header>
  );
}
