import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStore, useViewingMember, useMemberLookup, useActiveMembers } from '@/store/useStore';
import { hasPermission } from '@/store/reducer';
import type { Permission, ItemType } from '@/types';
import type { Notification } from '@/types';
import { QuickCreateModal } from '@/components/QuickCreateModal';
import { CommandPalette } from '@/components/CommandPalette';
import { OnboardingWizard, shouldShowOnboarding } from '@/components/OnboardingWizard';
import { computeUserLevel, isFeatureVisible, getLevelDescription, setUserLevel, recordAction } from '@/lib/progressiveDisclosure';
import { pushTaskEvent, pushGoalEvent, pushRiskAlert } from '@/lib/pushEventEngine';
import { useCollabPresence } from '@/lib/collab';
import { requestNotificationPermission, sendBrowserNotification, isNotificationSupported } from '@/lib/browserNotify';
import { isWeChatEnabled, sendWeChatMessage } from '@/supabase/wechat';
import { setWeChatNotify, fireAutomationRules } from '@/store/shared';
import {
  LayoutDashboard, Target, FolderKanban, CheckSquare, StickyNote,
  BarChart3, Users, Bell, Search, Menu, X, ChevronDown,
  Settings, Cloud, CloudOff, Loader2, FileText, Eye, Users2,
  LogOut, BookOpen, Building2, Shield, PanelLeftClose, PanelLeft,
  ChevronsLeft, ChevronsRight, Plus, Minus, Maximize2, Edit2, Trash2, Check
} from 'lucide-react';
import { CURRENT_USER_KEY } from '@/store/types';

// Density mode context — accessible by any child page
export type DensityMode = 'comfortable' | 'compact';
export const DensityContext = React.createContext<DensityMode>('comfortable');

type Page = 'dashboard' | 'goals' | 'projects' | 'tasks' | 'insight' | 'knowledge' | 'admin' | 'privacy';

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
  { page: 'knowledge', label: '知识库', icon: <BookOpen size={20} /> },
  { page: 'admin', label: '管理中心', icon: <Settings size={20} />, requirePermission: 'settings_manage' },
  { page: 'privacy', label: '隐私政策', icon: <Shield size={20} /> },
];

// --- Extracted React.memo sub-components ---

interface MemberFilterDropdownProps {
  isTeamView: boolean;
  viewingMemberId: string | null;
  viewingMember: { id: string; name: string; avatar: string; department: string } | null;
  visibleMembers: { id: string; name: string; avatar: string; department: string; role: string }[];
  setViewingMember: (id: string | null) => void;
  onClose: () => void;
}

const MemberFilterDropdown = React.memo(function MemberFilterDropdown({ isTeamView, viewingMemberId, viewingMember, visibleMembers, setViewingMember, onClose }: MemberFilterDropdownProps) {
  return (
    <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-border z-50 animate-slide-up max-h-64 overflow-y-auto">
      <div className="px-3 py-2 border-b border-border">
        <button onClick={() => { setViewingMember(null); onClose(); }}
          className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium ${isTeamView ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
          团队整体视图
        </button>
      </div>
      {visibleMembers.map(m => (
        <button key={m.id} onClick={() => { setViewingMember(m.id); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left ${viewingMemberId === m.id ? 'bg-primary/10 text-primary' : ''}`}>
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">{m.avatar}</div>
          {m.name}
          <span className="text-muted-foreground ml-auto">{m.department}</span>
        </button>
      ))}
    </div>
  );
});

interface NotificationDropdownProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onNavigate: (page: Page, itemId: string, itemType: string) => void;
}

const NotificationDropdown = React.memo(function NotificationDropdown({ notifications, unreadCount, onMarkAllRead, onMarkRead, onNavigate }: NotificationDropdownProps) {
  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-border z-50 animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-semibold text-sm">通知</span>
        {unreadCount > 0 && <button className="text-xs text-primary hover:underline" onClick={onMarkAllRead}>全部已读</button>}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.slice(0, 8).map(n => {
          const targetPage = n.relatedType === 'goal' ? 'goals' : n.relatedType === 'project' ? 'projects' : n.relatedType === 'task' ? 'tasks' : null;
          return (
            <div key={n.id} className={`px-4 py-3 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
              onClick={() => { onMarkRead(n.id); if (targetPage) onNavigate(targetPage, n.relatedId, n.relatedType); }}>
              <div className="flex items-start gap-2">
                {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                <div className={!n.read ? '' : 'pl-3.5'}>
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                  <div className="text-xs text-muted-foreground/60 mt-1">{new Date(n.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            </div>
          );
        })}
        {notifications.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无通知</div>}
      </div>
    </div>
  );
});

interface UserMenuDropdownProps {
  user: { id: string; name: string; avatar: string; email?: string; role: string; department: string } | null;
  visibleMembers: { id: string; name: string; avatar: string; role: string; department: string }[];
  onSwitchUser: (id: string) => void;
  onLogout: () => void;
}

const UserMenuDropdown = React.memo(function UserMenuDropdown({ user, visibleMembers, onSwitchUser, onLogout }: UserMenuDropdownProps) {
  return (
    <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-border z-50 animate-slide-up">
      <div className="px-4 py-3 border-b border-border">
        <div className="font-medium text-sm">{user?.name}</div>
        <div className="text-xs text-muted-foreground">{user?.role === 'admin' ? user?.email : user?.email?.replace(/(.{2}).*(.@.*)/, '$1***$2')}</div>
      </div>
      <div className="py-1 max-h-64 overflow-y-auto">
        {visibleMembers.map(m => (
          <button key={m.id}
            onClick={(e) => { e.stopPropagation(); onSwitchUser(m.id); }}
            className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors text-left ${m.id === user?.id ? 'bg-primary/5 text-primary' : ''}`}>
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">{m.avatar}</div>
            <div className="flex flex-col"><span>{m.name}</span><span className="text-xs text-muted-foreground">{m.role === 'admin' ? '管理员' : m.role === 'manager' ? '经理' : m.role === 'leader' ? '负责人' : '成员'}</span></div>
            <span className="text-xs text-muted-foreground ml-auto">{m.department}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-border px-4 py-2">
        <button onClick={(e) => { e.stopPropagation(); onLogout(); }}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors">
          <LogOut size={14} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );
});

// --- Mobile Long-Press Context Menu ---
interface ContextMenuItem { label: string; action: string; icon?: React.ReactNode }
const MobileContextMenu: React.FC<{ x: number; y: number; items: ContextMenuItem[]; onClose: () => void; onAction: (action: string) => void }> = React.memo(({ x, y, items, onClose, onAction }) => (
  <>
    <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
    <div className="fixed z-[61] bg-white border border-border rounded-lg shadow-xl py-1 min-w-[140px] animate-slide-up" style={{ left: Math.min(x, window.innerWidth - 160), top: Math.min(y, window.innerHeight - items.length * 40 - 20) }}>
      {items.map(item => (
        <button key={item.action} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors" onClick={() => { onAction(item.action); onClose(); }}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </div>
  </>
));

// --- Main Layout ---

export default function Layout({ currentPage, onPageChange, children, currentUser }: LayoutProps) {
  const { state, dispatch, connectionMode } = useStore();
  const { viewingMemberId, setViewingMember, isTeamView, viewingMember } = useViewingMember();
  const memberLookup = useMemberLookup();
  const { activeMembers } = useActiveMembers();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'wide' | 'narrow' | 'hidden'>(() => {
    try { const s = localStorage.getItem('tbh-sidebar-mode'); if (s === 'wide' || s === 'narrow' || s === 'hidden') return s; } catch {}
    // 小屏默认收起，大屏默认展开
    return window.innerWidth < 768 ? 'hidden' : 'wide';
  });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMemberFilter, setShowMemberFilter] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [offlineWrites, setOfflineWrites] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<'task' | 'goal' | 'project'>('task');
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShowOnboarding());
  const [density, setDensity] = useState<DensityMode>(() => {
    try { const d = localStorage.getItem('tbh-density'); if (d === 'comfortable' || d === 'compact') return d; } catch {} return 'comfortable';
  });
  // Mobile long-press context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string; targetType: string } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const user = state.currentUser;
  const isAdmin = user?.role === 'admin';
  const unreadCount = useMemo(() => state.notifications.filter(n => !n.read).length, [state.notifications]);
  const overdueCount = useMemo(() => { const today = new Date().toISOString().split('T')[0]; return state.tasks.filter(t => (t.leaderId === user?.id || (t.supporterIds ?? []).includes(user?.id || '')) && t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < today).length; }, [state.tasks, user?.id]);
  const visibleMembers = isAdmin ? activeMembers : activeMembers.filter(m => m.id === currentUser?.id);
  // Memoize visibleMembers for React.memo props comparison
  const visibleMembersMemo = useMemo(() => visibleMembers, [isAdmin, activeMembers, currentUser?.id]);
  const toggleDensity = useCallback(() => {
    setDensity(prev => {
      const next = prev === 'comfortable' ? 'compact' : 'comfortable';
      try { localStorage.setItem('tbh-density', next); } catch {}
      return next;
    });
  }, []);

  // Real-time presence — show online collaborators
  const { onlineUsers } = useCollabPresence(user?.id || '', user?.name || '');

  // Team switcher: compute user's teams
  const userTeams = useMemo(() => {
    if (!user) return [];
    const teamIds = state.teamMembers.filter(tm => tm.memberId === user.id).map(tm => tm.teamId);
    return state.teams.filter(t => teamIds.includes(t.id));
  }, [state.teams, state.teamMembers, user?.id]);
  const currentTeam = useMemo(() => state.teams.find(t => t.id === state.currentTeamId), [state.teams, state.currentTeamId]);
  const handleSwitchTeam = useCallback((teamId: string) => {
    dispatch({ type: 'SET_CURRENT_TEAM', payload: teamId });
    setShowTeamSelector(false);
    // Reload data for the new team
    window.location.reload();
  }, [dispatch]);

  // Track offline write count from localStorage (COL: offline indicator)
  useEffect(() => {
    if (connectionMode !== 'offline') { setOfflineWrites(0); return; }
    const check = () => { try { const c = parseInt(localStorage.getItem('tbh-offline-writes') || '0'); setOfflineWrites(c); } catch {} };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [connectionMode]);

  // Reminder checker: every 60s, check tasks with reminderDate <= today
  useEffect(() => {
    const checkReminders = () => {
      const today = new Date().toISOString().split('T')[0];
      const existingKeys = new Set(state.notifications.map(n => n.relatedId + ':' + n.type));
      for (const t of state.tasks) {
        if (!t.reminderDate || t.status === 'done' || t.status === 'cancelled') continue;
        if (t.leaderId !== user?.id && !(t.supporterIds ?? []).includes(user?.id || '')) continue;
        if (t.reminderDate <= today) {
          const key = t.id + ':reminder';
          if (existingKeys.has(key)) continue;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'nrem_' + t.id + '_' + t.reminderDate, type: 'reminder' as const, title: '任务提醒', message: `"${t.title}" 的提醒时间已到 (${t.reminderDate})`, relatedId: t.id, relatedType: 'task' as const, memberId: currentUser?.id || '', read: false, createdAt: new Date().toISOString() } });
          pushTaskEvent('reminder', t, memberLookup.getName);
        }
      }
    };
    checkReminders();
    const id = setInterval(checkReminders, 60000);
    return () => clearInterval(id);
  }, [state.tasks, state.notifications, dispatch, currentUser?.id]);

  // Auto-rule 2: Overdue + approaching deadline detection — notify responsible users
  useEffect(() => {
    const checkDeadlines = () => {
      const today = new Date().toISOString().split('T')[0];
      const threeDaysLater = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      const existingKeys = new Set(state.notifications.map(n => n.relatedId + ':' + n.type));
      for (const t of state.tasks) {
        if (t.status === 'done' || t.status === 'cancelled') continue;
        if (!t.dueDate) continue;
        if (t.leaderId !== user?.id && !(t.supporterIds ?? []).includes(user?.id || '')) continue;
        // Overdue check
        if (t.dueDate < today) {
          const key = t.id + ':overdue';
          if (existingKeys.has(key)) continue;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'novd_' + t.id + '_' + t.dueDate, type: 'overdue' as const, title: '任务已逾期', message: `"${t.title}" 已逾期 (截止 ${t.dueDate})`, relatedId: t.id, relatedType: 'task' as const, memberId: currentUser?.id || '', read: false, createdAt: new Date().toISOString() } });
          pushTaskEvent('overdue', t, memberLookup.getName);
          try { fireAutomationRules(state, t.id, 'task', t.title, 'due_arrive', { dueDate: t.dueDate }, t as any); } catch {}
        }
        // Approaching deadline check (1-3 days)
        else if (t.dueDate <= threeDaysLater) {
          const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - new Date(today).getTime()) / 86400000);
          const key = t.id + ':approaching';
          if (existingKeys.has(key)) continue;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'napr_' + t.id + '_' + t.dueDate, type: 'sync' as const, title: '任务即将到期', message: `"${t.title}" 将于 ${t.dueDate} 到期（还有${daysLeft}天）`, relatedId: t.id, relatedType: 'task' as const, memberId: currentUser?.id || '', read: false, createdAt: new Date().toISOString() } });
          // Also send WeChat/browser push for approaching deadlines
          try { sendBrowserNotification('任务即将到期', `"${t.title}" 将于${t.dueDate}到期（还有${daysLeft}天）`); } catch {}
          pushTaskEvent('reminder', t, memberLookup.getName);
        }
      }
    };
    checkDeadlines();
    const id = setInterval(checkDeadlines, 60000);
    return () => clearInterval(id);
  }, [state.tasks, state.notifications, dispatch, currentUser?.id]);

  // Request browser notification permission on mount
  useEffect(() => {
    if (isNotificationSupported()) requestNotificationPermission();
    // Register WeChat bridge for automation engine
    setWeChatNotify((title, message) => {
      if (isWeChatEnabled()) sendWeChatMessage(`**${title}**\n${message}`).catch(() => {});
    });
  }, []);

  // When new notifications arrive while page is hidden, show browser notification
  const prevNotificationCountRef = useRef(state.notifications.length);
  useEffect(() => {
    const prevCount = prevNotificationCountRef.current;
    const currCount = state.notifications.length;
    if (currCount > prevCount && document.visibilityState !== 'visible') {
      // Find the newest unread notification
      const newest = state.notifications.find(n => !n.read);
      if (newest) {
        sendBrowserNotification(newest.title, { body: newest.message, tag: newest.id });
      }
    }
    prevNotificationCountRef.current = currCount;
  }, [state.notifications]);

  const closeAllDropdowns = useCallback(() => { setShowNotifications(false); setShowUserMenu(false); setShowMemberFilter(false); setShowTeamSelector(false); }, []);

  // Sidebar mode cycling: wide → narrow → hidden → wide
  const cycleSidebarMode = useCallback(() => {
    setSidebarMode(prev => {
      const next = prev === 'wide' ? 'narrow' : prev === 'narrow' ? 'hidden' : 'wide';
      try { localStorage.setItem('tbh-sidebar-mode', next); } catch {}
      return next;
    });
  }, []);

  const sidebarWidthClass = sidebarMode === 'wide' ? 'w-64' : sidebarMode === 'narrow' ? 'w-16' : 'w-0';
  const sidebarCollapsed = sidebarMode === 'hidden';
  const sidebarNarrow = sidebarMode === 'narrow';

  // Touch swipe gestures for mobile sidebar
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    // Only handle horizontal swipes (>50px, >2x vertical)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
      if (dx > 0 && !sidebarOpen) {
        // Swipe right → open sidebar
        setSidebarOpen(true);
      } else if (dx < 0 && sidebarOpen) {
        // Swipe left → close sidebar
        setSidebarOpen(false);
      }
    }
    touchStartRef.current = null;
  }, [sidebarOpen]);

  // Mobile long-press context menu handler on main content area
  const handleMainTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.innerWidth >= 768) return; // desktop: no long-press
    const touch = e.touches[0];
    // Find the closest card/row element with a data-item-id
    const target = (touch.target as HTMLElement).closest('[data-item-id]');
    if (!target) return;
    const itemId = (target as HTMLElement).dataset.itemId || '';
    const itemType = (target as HTMLElement).dataset.itemType || 'task';
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ x: touch.clientX, y: touch.clientY, targetId: itemId, targetType: itemType });
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  }, []);
  const handleMainTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);
  const handleMainTouchMove = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);
  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    return [
      { label: '打开详情', action: 'open', icon: <Eye size={14} /> },
      { label: '编辑', action: 'edit', icon: <Edit2 size={14} /> },
      { label: '切换完成', action: 'toggle', icon: <Check size={14} /> },
      { label: '删除', action: 'delete', icon: <Trash2 size={14} /> },
    ];
  }, [contextMenu]);
  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const { targetId, targetType } = contextMenu;
    if (action === 'open' || action === 'edit') { window.dispatchEvent(new CustomEvent('tbh-open-detail', { detail: { itemId: targetId, itemType: targetType } })); }
    else if (action === 'toggle') { window.dispatchEvent(new CustomEvent('tbh-complete-selected')); }
    else if (action === 'delete') { window.dispatchEvent(new CustomEvent('tbh-delete-selected')); }
    setContextMenu(null);
  }, [contextMenu]);

  // Global keyboard shortcuts (30+ bindings)
  const searchInputRef = useRef<HTMLInputElement>(null);
  const keyBufferRef = useRef('');
  const keyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;

      // --- Always-active shortcuts (even in inputs) ---
      if (isInput) {
        if (e.key === 'Escape') { (e.target as HTMLElement).blur(); closeAllDropdowns(); }
        return;
      }

      // --- Modifier shortcuts (Cmd/Ctrl) ---
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
      if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
      if (mod && e.key === 'k') { e.preventDefault(); setCommandPaletteOpen(true); return; }
      if (mod && !e.shiftKey && e.key === 'n') { e.preventDefault(); setQuickCreateType('task'); setQuickCreateOpen(true); return; }
      if (mod && e.shiftKey && e.key === 'N') { e.preventDefault(); setQuickCreateType('goal'); setQuickCreateOpen(true); return; }
      if (mod && e.shiftKey && e.key === 'P') { e.preventDefault(); setQuickCreateType('project'); setQuickCreateOpen(true); return; }
      if (mod && e.key === 'g') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-open-gantt')); return; }
      if (mod && e.key === 'f') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-focus-filter')); return; }
      if (mod && e.key === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-save-current')); return; }
      if (mod && e.key === ',') { e.preventDefault(); onPageChange('admin'); return; } // Settings

      // --- Single key shortcuts ---
      // Escape: close dropdowns / command palette
      if (e.key === 'Escape') { closeAllDropdowns(); setCommandPaletteOpen(false); return; }

      // / : focus search
      if (e.key === '/') { e.preventDefault(); searchInputRef.current?.focus(); return; }

      // ? : show keyboard help (via command palette with shortcut filter)
      if (e.key === '?') { e.preventDefault(); setCommandPaletteOpen(true); return; }

      // [ / ] : sidebar toggle
      if (e.key === '[') { e.preventDefault(); cycleSidebarMode(); return; }
      if (e.key === ']') { e.preventDefault(); cycleSidebarMode(); return; }

      // 1-7: quick navigation
      const navMap: Record<string, Page> = { '1': 'dashboard', '2': 'goals', '3': 'projects', '4': 'tasks', '5': 'insight', '6': 'knowledge', '7': 'admin' };
      if (navMap[e.key]) { onPageChange(navMap[e.key]); return; }

      // c: quick create (task by default)
      if (e.key === 'c') { e.preventDefault(); setQuickCreateType('task'); setQuickCreateOpen(true); return; }

      // e: edit selected item
      if (e.key === 'e') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-edit-selected')); return; }

      // d: delete selected item
      if (e.key === 'd') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-delete-selected')); return; }

      // x: toggle complete for selected task
      if (e.key === 'x') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-complete-selected')); return; }

      // j/k: navigate up/down in list
      if (e.key === 'j') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-nav-down')); return; }
      if (e.key === 'k') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-nav-up')); return; }

      // Enter: open selected item
      if (e.key === 'Enter') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-open-selected')); return; }

      // f: focus filter
      if (e.key === 'f') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-focus-filter')); return; }

      // t/v/l: switch view modes (table/board/list)
      if (e.key === 't') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-switch-view', { detail: 'table' })); return; }
      if (e.key === 'v') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-switch-view', { detail: 'board' })); return; }
      if (e.key === 'l') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-switch-view', { detail: 'list' })); return; }

      // b: toggle batch mode
      if (e.key === 'b') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-toggle-batch')); return; }

      // --- g-prefix (Vim-style navigation) ---
      if (e.key === 'g') {
        keyBufferRef.current = 'g';
        if (keyTimerRef.current) clearTimeout(keyTimerRef.current);
        keyTimerRef.current = setTimeout(() => { keyBufferRef.current = ''; }, 500);
        return;
      }
      if (keyBufferRef.current === 'g') {
        keyBufferRef.current = '';
        if (keyTimerRef.current) { clearTimeout(keyTimerRef.current); keyTimerRef.current = null; }
        const gNav: Record<string, Page> = { d: 'dashboard', o: 'goals', p: 'projects', t: 'tasks', i: 'insight', a: 'admin', k: 'knowledge' };
        if (gNav[e.key]) { onPageChange(gNav[e.key]); return; }
        // gg: scroll to top
        if (e.key === 'g') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPageChange, closeAllDropdowns, dispatch, cycleSidebarMode]);

  const handlePageClick = useCallback((page: Page) => {
    onPageChange(page);
    setSidebarOpen(false);
    recordAction();
  }, [onPageChange]);

  const handleMarkAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' }), [dispatch]);
  const handleMarkRead = useCallback((id: string) => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id }), [dispatch]);
  const handleNotificationNavigate = useCallback((page: Page, itemId: string, itemType: string) => {
    onPageChange(page);
    setShowNotifications(false);
    setTimeout(() => { window.dispatchEvent(new CustomEvent('tbh-open-detail', { detail: { itemId, itemType } })); }, 600);
  }, [onPageChange]);
  const handleSwitchUser = useCallback((id: string) => { dispatch({ type: 'SET_CURRENT_USER', payload: id }); setShowUserMenu(false); }, [dispatch]);
  const handleLogout = useCallback(() => {
    try { localStorage.removeItem(CURRENT_USER_KEY); } catch {}
    dispatch({ type: 'SET_CURRENT_USER', payload: null });
    setShowUserMenu(false);
    // Clear Sentry user context on logout
    import('@/lib/sentry').then(m => m.clearSentryUser()).catch(() => {});
  }, [dispatch]);
  const handleGlobalSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = (e.target as HTMLInputElement).value.trim();
    if (!q) return;
    const matched = state.members.filter(m => m.status === 'active' && (m.name === q || m.nickname === q));
    onPageChange('tasks');
    if (matched.length > 0) {
      setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-nav-filter', { detail: { page: 'tasks', persons: matched.map(m => m.id) } })), 100);
    } else {
      setTimeout(() => { const el = document.querySelector<HTMLInputElement>('input[data-search-input]'); if (el) { el.value = q; el.focus(); el.dispatchEvent(new Event('input', { bubbles: true })); } }, 600);
    }
  }, [state.members, onPageChange]);

  // Memoize notification slice to prevent re-render when other state changes
  const notificationsMemo = useMemo(() => state.notifications, [state.notifications]);

  return (
    <div className="flex h-screen overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {sidebarOpen && <div className="sidebar-overlay md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={[
        'fixed inset-y-0 left-0 z-50 bg-sidebar text-sidebar-foreground transform transition-all duration-200 ease-in-out flex flex-col',
        // 移动端: sidebarOpen 控制 overlay 显示/隐藏
        sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full',
        // 桌面端: sidebarMode 控制宽度，始终可见（hidden 除外）
        'md:relative md:translate-x-0',
        sidebarMode === 'wide' ? 'md:w-64' : sidebarMode === 'narrow' ? 'md:w-16' : 'md:w-0 md:overflow-hidden md:border-none',
        sidebarMode === 'hidden' ? '' : 'border-r border-white/10',
      ].join(' ')}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-sm flex-shrink-0">TB</div>
          {!sidebarNarrow && !sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">团队业务中台</div>
              <div className="text-xs text-sidebar-foreground/50">Team Business Hub</div>
            </div>
          )}
          <button className="ml-auto p-1 rounded hover:bg-sidebar-accent transition-colors" onClick={cycleSidebarMode} title={sidebarMode === 'wide' ? '收窄侧边栏' : sidebarMode === 'narrow' ? '隐藏侧边栏' : '展开侧边栏'}>
            {sidebarMode === 'wide' ? <PanelLeftClose size={16} /> : sidebarMode === 'narrow' ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
          </button>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.filter(item => {
            if (item.requirePermission && (!user || (user.role !== 'admin' && !hasPermission(state, user.id, item.requirePermission)))) return false;
            // Progressive disclosure: filter nav items by user level
            const featureMap: Record<string, string> = { dashboard: 'dashboard', goals: 'goals_basic', projects: 'projects', tasks: 'tasks', insight: 'insight', knowledge: 'knowledge', admin: 'dashboard', privacy: 'dashboard' };
            return isFeatureVisible(featureMap[item.page] || item.page);
          }).map((item, idx) => (
            <button key={item.page} onClick={() => handlePageClick(item.page)}
              title={sidebarNarrow ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 text-left ${currentPage === item.page ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'} ${sidebarNarrow ? 'justify-center px-0' : ''}`}>
              {item.icon}
              {!sidebarNarrow && !sidebarCollapsed && item.label}
              {!sidebarNarrow && !sidebarCollapsed && item.page === 'tasks' && overdueCount > 0 && (
                <span className="ml-auto bg-destructive text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{overdueCount}</span>
              )}
              {!sidebarNarrow && !sidebarCollapsed && <span className="ml-auto text-[10px] text-sidebar-foreground/30 hidden lg:inline">{idx + 1}</span>}
            </button>
          ))}
        </nav>

        <div className={`px-3 py-3 border-t border-white/10 space-y-1 ${sidebarNarrow ? 'flex flex-col items-center' : ''}`}>
          {!sidebarNarrow && !sidebarCollapsed ? (
            <>
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
                  {connectionMode === 'supabase' ? '云端同步' : connectionMode === 'loading' ? '连接中...' : connectionMode === 'offline' ? `网络离线${offlineWrites > 0 ? ` · ${offlineWrites}项待同步` : ''}` : '本地模式'}
                </span>
              </div>
              {(() => {
                const level = computeUserLevel();
                const desc = getLevelDescription(level);
                return (
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors cursor-pointer rounded hover:bg-sidebar-accent" onClick={() => {
                    const next: Record<string, any> = { beginner: 'intermediate', intermediate: 'advanced', advanced: 'beginner' };
                    setUserLevel(next[level]);
                    window.location.reload();
                  }} title={`点击切换体验等级（当前: ${desc.title}）`}>
                    <span className="text-[10px]">{level === 'beginner' ? '🌱' : level === 'intermediate' ? '🌿' : '🌳'}</span>
                    <span>{desc.title}</span>
                    <span className="ml-auto text-[10px]">切换</span>
                  </button>
                );
              })()}
            </>
          ) : (
            <button className="p-2 rounded hover:bg-sidebar-accent transition-colors" onClick={cycleSidebarMode} title="展开侧边栏">
              <ChevronsRight size={16} className="text-sidebar-foreground/50" />
            </button>
          )}
        </div>

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

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
          <button className="md:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          {sidebarMode === 'hidden' && (
            <button className="hidden md:flex p-1.5 -ml-1.5 rounded-md hover:bg-muted" onClick={cycleSidebarMode} title="展开侧边栏">
              <PanelLeft size={20} />
            </button>
          )}
          <h1 className="text-base font-semibold">
            {(currentPage === 'settings' ? '系统设置' : navItems.find(n => n.page === currentPage)?.label)}
          </h1>

          {userTeams.length > 1 && (
            <div className="relative">
              <button onClick={() => { setShowTeamSelector(!showTeamSelector); setShowMemberFilter(false); setShowUserMenu(false); setShowNotifications(false); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors">
                <Building2 size={14} />
                <span className="hidden sm:inline max-w-[100px] truncate">{currentTeam?.name || '选择团队'}</span>
                <ChevronDown size={12} />
              </button>
              {showTeamSelector && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-border z-50 animate-slide-up">
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
            <button onClick={() => { setShowMemberFilter(!showMemberFilter); setShowUserMenu(false); setShowNotifications(false); }} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!isTeamView ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{isTeamView ? <><Eye size={14} /> <span className="hidden sm:inline">团队视图</span></> : <><Users2 size={14} /> <span className="hidden sm:inline">{viewingMember?.name || '个人'}</span></>}<ChevronDown size={12} className="text-muted-foreground" /></button>
            {showMemberFilter && (
              <MemberFilterDropdown isTeamView={isTeamView} viewingMemberId={viewingMemberId} viewingMember={viewingMember} visibleMembers={visibleMembersMemo} setViewingMember={setViewingMember} onClose={closeAllDropdowns} />
            )}
          </div>

          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm w-64">
            <Search size={16} /><input ref={searchInputRef} type="text" placeholder="搜索... (⌘K)" className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground" onKeyDown={handleGlobalSearch} />
          </div>
          {/* Density toggle: comfortable ↔ compact */}
          <button className="hidden md:flex p-1.5 rounded-md hover:bg-muted transition-colors" onClick={toggleDensity} title={density === 'comfortable' ? '切换紧凑模式' : '切换舒适模式'}>
            {density === 'comfortable' ? <Maximize2 size={16} className="text-muted-foreground" /> : <Minus size={16} className="text-primary" />}
          </button>
          {/* Online collaborators indicator */}
          {onlineUsers.length > 1 && (
            <div className="hidden md:flex items-center -space-x-1.5" title={`${onlineUsers.length} 人在线`}>
              {onlineUsers.slice(0, 4).map(u => (
                <div key={u.id} className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: u.color }}>
                  {(u.name || '?')[0]}
                </div>
              ))}
              {onlineUsers.length > 4 && (
                <div className="w-6 h-6 rounded-full border-2 border-white bg-muted flex items-center justify-center text-[9px] text-muted-foreground">+{onlineUsers.length - 4}</div>
              )}
            </div>
          )}
          <div className="relative">
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); setShowMemberFilter(false); }}>
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />}
            </button>
            {showNotifications && (
              <NotificationDropdown notifications={notificationsMemo} unreadCount={unreadCount} onMarkAllRead={handleMarkAllRead} onMarkRead={handleMarkRead} onNavigate={handleNotificationNavigate} />
            )}
          </div>
          <div className="relative">
            <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors"
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); setShowMemberFilter(false); }}>
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">{user?.avatar || '?'}</div>
              <ChevronDown size={14} className="hidden sm:block text-muted-foreground" />
            </button>
            {showUserMenu && (
              <UserMenuDropdown user={user} visibleMembers={visibleMembersMemo} onSwitchUser={handleSwitchUser} onLogout={handleLogout} />
            )}
          </div>
        </header>
        <main className={`flex-1 overflow-y-auto bg-muted/30 pb-16 md:pb-0 ${density === 'compact' ? 'text-sm' : ''}`} onTouchStart={handleMainTouchStart} onTouchEnd={handleMainTouchEnd} onTouchMove={handleMainTouchMove}><DensityContext.Provider value={density}>{children}</DensityContext.Provider></main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border flex items-center justify-around h-14 px-1">
        {navItems.filter(item => {
          if (item.requirePermission && (!user || (user.role !== 'admin' && !hasPermission(state, user.id, item.requirePermission)))) return false;
          const featureMap: Record<string, string> = { dashboard: 'dashboard', goals: 'goals_basic', projects: 'projects', tasks: 'tasks', insight: 'insight', knowledge: 'knowledge', admin: 'dashboard', privacy: 'dashboard' };
          return isFeatureVisible(featureMap[item.page] || item.page);
        }).filter(item => ['dashboard', 'goals', 'projects', 'tasks'].includes(item.page)).map(item => (
          <button key={item.page} onClick={() => handlePageClick(item.page)}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${currentPage === item.page ? 'text-primary' : 'text-muted-foreground'}`}>
            {item.icon}
            <span className="text-[10px] mt-0.5">{item.label.slice(0, 2)}</span>
          </button>
        ))}
        {/* Quick create button */}
        <button onClick={() => { setQuickCreateType('task'); setQuickCreateOpen(true); }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white shadow-lg -mt-4">
          <Plus size={20} />
        </button>
        <button onClick={() => handlePageClick('insight')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${currentPage === 'insight' ? 'text-primary' : 'text-muted-foreground'}`}>
          <BarChart3 size={20} />
          <span className="text-[10px] mt-0.5">洞察</span>
        </button>
        {/* More button: opens sidebar overlay for admin/privacy */}
        <button onClick={() => setSidebarOpen(true)}
          className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground">
          <Menu size={20} />
          <span className="text-[10px] mt-0.5">更多</span>
        </button>
      </nav>

      {(showNotifications || showUserMenu || showMemberFilter) && <div className="fixed inset-0 z-40" onClick={closeAllDropdowns} />}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onPageChange={onPageChange}
        onNavigateItem={(id, type) => { window.dispatchEvent(new CustomEvent('tbh-nav-item', { detail: { id, type } })); }}
        onCreateItem={(type) => {
          if (type === 'task') { onPageChange('tasks'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'task' } })), 200); }
          else if (type === 'project') { onPageChange('projects'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'project' } })), 200); }
          else { onPageChange('goals'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'goal' } })), 200); }
        }}
      />
      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} onPageChange={onPageChange} />
      <QuickCreateModal open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} initialType={quickCreateType} />
      {/* Mobile long-press context menu */}
      {contextMenu && <MobileContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} onAction={handleContextAction} />}
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
}
