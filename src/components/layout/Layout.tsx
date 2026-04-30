import React, { useState, useMemo } from 'react';
import { useStore, useViewingMember, useMemberLookup, useActiveMembers } from '@/store/useStore';
import { hasPermission } from '@/store/reducer';
import type { Permission } from '@/types';
import {
  LayoutDashboard, Target, FolderKanban, CheckSquare,
  BarChart3, Users, Bell, Search, Menu, X, ChevronDown,
  Settings, Cloud, CloudOff, Loader2, FileText, Eye, Users2,
  LogOut
} from 'lucide-react';
import { CURRENT_USER_KEY } from '@/store/types';

type Page = 'dashboard' | 'goals' | 'projects' | 'tasks' | 'insight' | 'admin';

interface LayoutProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  children: React.ReactNode;
  currentUser?: { id: string; role: string; name: string; avatar: string; department: string } | undefined;
}

const navItems: { page: Page; label: string; icon: React.ReactNode; requirePermission?: Permission }[] = [
  { page: 'dashboard', label: '工作台', icon: <LayoutDashboard size={20} /> },
  { page: 'goals', label: '目标管理', icon: <Target size={20} /> },
  { page: 'projects', label: '项目中心', icon: <FolderKanban size={20} /> },
  { page: 'tasks', label: '任务中心', icon: <CheckSquare size={20} /> },
  { page: 'insight', label: '数据洞察', icon: <BarChart3 size={20} /> },
  { page: 'admin', label: '管理中心', icon: <Settings size={20} />, requirePermission: 'manage_team' },
];

export default function Layout({ currentPage, onPageChange, children, currentUser }: LayoutProps) {
  const { state, dispatch, connectionMode } = useStore();
  const { viewingMemberId, setViewingMember, isTeamView, viewingMember } = useViewingMember();
  const memberLookup = useMemberLookup();
  const { activeMembers } = useActiveMembers();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMemberFilter, setShowMemberFilter] = useState(false);
  const user = state.currentUser;
  const isAdmin = user?.role === 'admin';
  const unreadCount = useMemo(() => state.notifications.filter(n => !n.read).length, [state.notifications]);
  const myTaskCount = useMemo(() => state.tasks.filter(t => t.leaderId === currentUser?.id && t.status !== 'done').length, [state.tasks, currentUser?.id]);
  // Non-admins: only show themselves and team view in member filter
  const visibleMembers = isAdmin ? activeMembers : activeMembers.filter(m => m.id === currentUser?.id);


  const handlePageClick = (page: Page) => {
    onPageChange(page);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && <div className="sidebar-overlay md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-sm">TB</div>
          <div>
            <div className="font-semibold text-sm">团队业务中台</div>
            <div className="text-xs text-sidebar-foreground/50">Team Business Hub</div>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.filter(item => !item.requirePermission || (user && hasPermission(state, user.id, item.requirePermission))).map(item => (
            <button key={item.page} onClick={() => handlePageClick(item.page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 text-left ${currentPage === item.page ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'}`}>
              {item.icon}
              {item.label}
              {item.page === 'tasks' && myTaskCount > 0 && (
                <span className="ml-auto bg-destructive text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{myTaskCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-white/10 space-y-1">
          <div className="flex items-center gap-2 px-3 py-1.5">
            {connectionMode === 'supabase' ? (
              <Cloud size={14} className="text-green-400" />
            ) : connectionMode === 'loading' ? (
              <Loader2 size={14} className="animate-spin text-amber-400" />
            ) : connectionMode === 'offline' ? (
              <CloudOff size={14} className="text-red-400" />
            ) : (
              <CloudOff size={14} className="text-white/40" />
            )}
            <span className={`text-xs ${connectionMode === 'supabase' ? 'text-green-400' : connectionMode === 'loading' ? 'text-amber-400' : connectionMode === 'offline' ? 'text-red-400' : 'text-white/40'}`}>
              {connectionMode === 'supabase' ? '云端同步' : connectionMode === 'loading' ? '连接中...' : connectionMode === 'offline' ? '网络离线' : '本地模式'}
            </span>
          </div>
        </div>

        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">{user?.avatar || '?'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-sidebar-foreground/50 truncate">{user?.department}</div>
              {user?.role && <div className="text-xs text-sidebar-foreground/40 truncate">{user.role === 'admin' ? '管理员' : user.role === 'manager' ? '经理' : user.role === 'leader' ? '负责人' : '成员'}</div>}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
          <button className="md:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <h1 className="text-base font-semibold">
            {(currentPage === 'settings' ? '系统设置' : navItems.find(n => n.page === currentPage)?.label)}
          </h1>

          <div className="relative">
            <button onClick={() => { setShowMemberFilter(!showMemberFilter); setShowUserMenu(false); setShowNotifications(false); }} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!isTeamView ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{isTeamView ? <><Eye size={14} /> <span className="hidden sm:inline">团队视图</span></> : <><Users2 size={14} /> <span className="hidden sm:inline">{viewingMember?.name || '个人'}</span></>}<ChevronDown size={12} className="text-muted-foreground" /></button>
            {showMemberFilter && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-border z-50 animate-slide-up max-h-64 overflow-y-auto">
                <div className="px-3 py-2 border-b border-border">
                  <button onClick={() => { setViewingMember(null); setShowMemberFilter(false); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium ${isTeamView ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                    团队整体视图
                  </button>
                </div>
                {visibleMembers.map(m => (
                  <button key={m.id} onClick={() => { setViewingMember(m.id); setShowMemberFilter(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left ${viewingMemberId === m.id ? 'bg-primary/10 text-primary' : ''}`}>
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">{m.avatar}</div>
                    {m.name}
                    <span className="text-muted-foreground ml-auto">{m.department}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm w-64">
            <Search size={16} /><input type="text" placeholder="搜索目标、项目、任务..." className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground" onKeyDown={e => { if (e.key === 'Enter') { const q = (e.target as HTMLInputElement).value.trim(); if (q) { onPageChange('tasks'); setTimeout(() => { const el = document.querySelector<HTMLInputElement>('input[data-search-input]'); if (el) { el.value = q; el.focus(); el.dispatchEvent(new Event('input', { bubbles: true })); } }, 600); } } }} />
          </div>
          <div className="relative">
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); setShowMemberFilter(false); }}>
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-border z-50 animate-slide-up">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="font-semibold text-sm">通知</span>
                  {unreadCount > 0 && <button className="text-xs text-primary hover:underline" onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })}>全部已读</button>}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {state.notifications.slice(0, 8).map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                      onClick={() => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id })}>
                      <div className="flex items-start gap-2">
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                        <div className={!n.read ? '' : 'pl-3.5'}>
                          <div className="text-sm font-medium">{n.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                          <div className="text-xs text-muted-foreground/60 mt-1">{new Date(n.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {state.notifications.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无通知</div>}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors"
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); setShowMemberFilter(false); }}>
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">{user?.avatar || '?'}</div>
              <ChevronDown size={14} className="hidden sm:block text-muted-foreground" />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-border z-50 animate-slide-up">
                <div className="px-4 py-3 border-b border-border">
                  <div className="font-medium text-sm">{user?.name}</div>
                  <div className="text-xs text-muted-foreground">{user?.email}</div>
                </div>
              <div className="py-1 max-h-64 overflow-y-auto">
                 {visibleMembers.map(m => (
                    <button key={m.id}
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_CURRENT_USER', payload: m.id }); setShowUserMenu(false); }}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors text-left ${m.id === user?.id ? 'bg-primary/5 text-primary' : ''}`}>
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">{m.avatar}</div>
                      <div className="flex flex-col"><span>{m.name}</span><span className="text-xs text-muted-foreground">{m.role === 'admin' ? '管理员' : m.role === 'manager' ? '经理' : m.role === 'leader' ? '负责人' : '成员'}</span></div>
                      <span className="text-xs text-muted-foreground ml-auto">{m.department}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-border px-4 py-2">
                  <button onClick={(e) => { e.stopPropagation(); try { localStorage.removeItem(CURRENT_USER_KEY); } catch {} dispatch({ type: 'SET_CURRENT_USER', payload: null }); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors">
                    <LogOut size={14} />
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
      </div>
      {(showNotifications || showUserMenu || showMemberFilter) && <div className="fixed inset-0 z-40" onClick={() => { setShowNotifications(false); setShowUserMenu(false); setShowMemberFilter(false); }} />}
    </div>
  );
}
