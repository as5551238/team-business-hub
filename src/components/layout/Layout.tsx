import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useViewingMember, useMemberLookup, useActiveMembers } from '@/store/hooks';
import { hasPermission } from '@/store/reducer';
import type { Permission, ItemType } from '@/types';
import { QuickCreateModal } from '@/components/QuickCreateModal';
import { CommandPalette } from '@/components/CommandPalette';
import { ShortcutHelpPanel } from '@/components/ShortcutHelpPanel';
import { OnboardingWizard, shouldShowOnboarding } from '@/components/OnboardingWizard';
import { useTheme } from '@/hooks/useTheme';
import { handleError } from '@/lib/errorHandler';
import { PageTransition } from '@/components/ui/motion';
import { computeUserLevel, isFeatureVisible, getLevelDescription, setUserLevel, recordAction } from '@/lib/progressiveDisclosure';
import { pushTaskEvent } from '@/lib/pushEventEngine';
import { useCollabPresence } from '@/lib/collab';
import { CollabPresenceBar } from '@/components/CollabPresenceBar';
import { H5Layout } from '@/components/H5Layout';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { OperationToast } from '@/components/OperationToast';
import { requestNotificationPermission, sendBrowserNotification, isNotificationSupported } from '@/lib/browserNotify';
import { isWeChatEnabled, sendWeChatMessage } from '@/supabase/wechat';
import { setWeChatNotify, fireAutomationRules } from '@/store/shared';
import { getPageFromPathname, PAGE_TO_PATH, useAppNavigate, usePageInfo } from '@/lib/routes';
import { Breadcrumb } from '@/components/Breadcrumb';
import { FloatingAIPanel } from '@/components/FloatingAIPanel';

// Detect H5 embedded mode (WeChat/Feishu in-app browser or ?h5=1 param)
function isH5Mode(): boolean {
  try {
    const ua = navigator.userAgent.toLowerCase();
    const isWechat = ua.includes('micromessenger');
    const isFeishu = ua.includes('lark') || ua.includes('feishu');
    const hasParam = new URLSearchParams(window.location.search).get('h5') === '1';
    return isWechat || isFeishu || hasParam;
  } catch (e) { handleError(e, { module: 'Layout', operation: 'H5_MODE_DETECT', severity: 'debug' }); return false; }
}
import {
  LayoutDashboard, Target, FolderKanban, CheckSquare,
  BarChart3, Users, Bell, Search, Menu, X, ChevronDown,
  Settings, Cloud, CloudOff, Loader2, Eye, Users2,
  BookOpen, Building2, Shield, PanelLeftClose, PanelLeft,
  ChevronsLeft, ChevronsRight, Plus, Minus, Maximize2, Edit2, Trash2, Check,
  Moon, Sun, Monitor
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CURRENT_USER_KEY } from '@/store/types';

// Density mode context — accessible by any child page
export type DensityMode = 'comfortable' | 'compact';
export const DensityContext = React.createContext<DensityMode>('comfortable');

export type Page = 'dashboard' | 'goals' | 'projects' | 'tasks' | 'insight' | 'knowledge' | 'admin' | 'privacy';

interface LayoutProps {
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
];

import { MemberFilterDropdown, NotificationDropdown, UserMenuDropdown, MobileContextMenu } from './LayoutDropdowns';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import type { ContextMenuItem } from './LayoutDropdowns';

// --- Main Layout ---

export default function Layout({ children, currentUser }: LayoutProps) {
  // H5 embedded mode: render mobile-optimized layout instead
  if (isH5Mode()) {
    return <H5Layout>{children}</H5Layout>;
  }

  const location = useLocation();
  const navigate = useNavigate();
  const { goToPage, goToItem } = useAppNavigate();

  // Derive currentPage from URL pathname (not from prop)
  const currentPage = useMemo(() => getPageFromPathname(location.pathname), [location.pathname]);
  // Extract itemId from URL for breadcrumb (e.g. /tasks/glb_xxx)
  const itemId = useMemo(() => {
    const parts = location.pathname.split('/');
    return parts[2] || null;
  }, [location.pathname]);
  const onPageChange = useCallback((page: Page) => { goToPage(page); }, [goToPage]);

  const { state, dispatch, connectionMode } = useStore();
  const { viewingMemberId, setViewingMember, isTeamView, viewingMember } = useViewingMember();
  const memberLookup = useMemberLookup();
  const { activeMembers } = useActiveMembers();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'wide' | 'narrow' | 'hidden'>(() => {
    try { const s = localStorage.getItem('tbh-sidebar-mode'); if (s === 'wide' || s === 'narrow' || s === 'hidden') return s; } catch (e) { handleError(e, { module: 'Layout', operation: 'LOAD_SIDEBAR_MODE', severity: 'debug' }); }
    // S5-4: 小屏隐藏，平板窄栏，桌面宽栏
    return window.innerWidth < 768 ? 'hidden' : window.innerWidth <= 1024 ? 'narrow' : 'wide';
  });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMemberFilter, setShowMemberFilter] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [offlineWrites, setOfflineWrites] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<'task' | 'goal' | 'project'>('task');
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShowOnboarding());
  const [density, setDensity] = useState<DensityMode>(() => {
    try { const d = localStorage.getItem('tbh-density'); if (d === 'comfortable' || d === 'compact') return d; } catch (e) { handleError(e, { module: 'Layout', operation: 'LOAD_DENSITY', severity: 'debug' }); } return 'comfortable';
  });
  const { theme, toggleTheme } = useTheme();
  // Mobile long-press context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string; targetType: string } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const user = state.currentUser;
  const isAdmin = user?.role === 'admin';
  const unreadCount = useMemo(() => state.notifications.filter(n => !n.read && (!n.memberId || n.memberId === user?.id)).length, [state.notifications, user?.id]);
  const overdueCount = useMemo(() => { const today = new Date().toISOString().split('T')[0]; return state.tasks.filter(t => (t.leaderId === user?.id || (t.supporterIds ?? []).includes(user?.id || '')) && t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < today).length; }, [state.tasks, user?.id]);
  const inProgressGoalsCount = useMemo(() => state.goals.filter(g => g.status === 'in_progress').length, [state.goals]);
  const visibleMembers = isAdmin ? activeMembers : activeMembers.filter(m => m.id === currentUser?.id);
  // Memoize visibleMembers for React.memo props comparison
  const visibleMembersMemo = useMemo(() => visibleMembers, [isAdmin, activeMembers, currentUser?.id]);
  const toggleDensity = useCallback(() => {
    setDensity(prev => {
      const next = prev === 'comfortable' ? 'compact' : 'comfortable';
      try { localStorage.setItem('tbh-density', next); } catch (e) { handleError(e, { module: 'Layout', operation: 'SAVE_DENSITY', severity: 'debug' }); }
      return next;
    });
  }, []);

  // Real-time presence — show online collaborators
  const { onlineUsers, updateCursor } = useCollabPresence(user?.id || '', user?.name || '');

  // Update cursor to show which page the user is viewing
  useEffect(() => {
    updateCursor({ entity: currentPage, entityId: currentPage });
  }, [currentPage, updateCursor]);

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
    const check = () => { try { const c = parseInt(localStorage.getItem('tbh-offline-writes') || '0'); setOfflineWrites(c); } catch (e) { handleError(e, { module: 'Layout', operation: 'CHECK_OFFLINE_WRITES', severity: 'debug' }); } };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [connectionMode]);

  // Reminder checker: every 60s, check tasks with reminderDate <= today
  // P3#32 fix: use refs to avoid recreating interval on every notification change
  const tasksRef = useRef(state.tasks);
  tasksRef.current = state.tasks;
  const notifsRef = useRef(state.notifications);
  notifsRef.current = state.notifications;
  useEffect(() => {
    const checkReminders = () => {
      const today = new Date().toISOString().split('T')[0];
      const existingKeys = new Set(notifsRef.current.map(n => n.relatedId + ':' + n.type));
      for (const t of tasksRef.current) {
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
  }, [dispatch, currentUser?.id]);

  // Auto-rule 2: Overdue + approaching deadline detection — P3#32 fix: use refs
  useEffect(() => {
    const checkDeadlines = () => {
      const today = new Date().toISOString().split('T')[0];
      const threeDaysLater = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      const existingKeys = new Set(notifsRef.current.map(n => n.relatedId + ':' + n.type));
      for (const t of tasksRef.current) {
        if (t.status === 'done' || t.status === 'cancelled') continue;
        if (!t.dueDate) continue;
        if (t.leaderId !== user?.id && !(t.supporterIds ?? []).includes(user?.id || '')) continue;
        // Overdue check
        if (t.dueDate < today) {
          const key = t.id + ':overdue';
          if (existingKeys.has(key)) continue;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'novd_' + t.id + '_' + t.dueDate, type: 'overdue' as const, title: '任务已逾期', message: `"${t.title}" 已逾期 (截止 ${t.dueDate})`, relatedId: t.id, relatedType: 'task' as const, memberId: currentUser?.id || '', read: false, createdAt: new Date().toISOString() } });
          pushTaskEvent('overdue', t, memberLookup.getName);
          try { fireAutomationRules(state, t.id, 'task', t.title, 'due_arrive', { dueDate: t.dueDate }, t as Record<string, unknown>); } catch (e) { handleError(e, { module: 'Layout', operation: 'FIRE_AUTOMATION_DUE_ARRIVE', severity: 'warn' }); }
          try { fireAutomationRules(state, t.id, 'task', t.title, 'overdue', { dueDate: t.dueDate, status: t.status }, t as Record<string, unknown>); } catch (e) { handleError(e, { module: 'Layout', operation: 'FIRE_AUTOMATION_OVERDUE', severity: 'warn' }); }
        }
        // Approaching deadline check (1-3 days)
        else if (t.dueDate <= threeDaysLater) {
          const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - new Date(today).getTime()) / 86400000);
          const key = t.id + ':approaching';
          if (existingKeys.has(key)) continue;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'napr_' + t.id + '_' + t.dueDate, type: 'sync' as const, title: '任务即将到期', message: `"${t.title}" 将于 ${t.dueDate} 到期（还有${daysLeft}天）`, relatedId: t.id, relatedType: 'task' as const, memberId: currentUser?.id || '', read: false, createdAt: new Date().toISOString() } });
          // Also send WeChat/browser push for approaching deadlines
          try { sendBrowserNotification('任务即将到期', { body: `"${t.title}" 将于${t.dueDate}到期（还有${daysLeft}天）`, tag: 'approaching-' + t.id }); } catch (e) { handleError(e, { module: 'Layout', operation: 'SEND_BROWSER_NOTIFY', severity: 'debug' }); }
          pushTaskEvent('reminder', t, memberLookup.getName);
        }
      }
    };
    checkDeadlines();
    const id = setInterval(checkDeadlines, 60000);
    return () => clearInterval(id);
  }, [dispatch, currentUser?.id]);

  // Request browser notification permission on mount
  useEffect(() => {
    if (isNotificationSupported()) requestNotificationPermission();
    // Register WeChat bridge for automation engine
    setWeChatNotify((title, message) => {
      if (isWeChatEnabled()) sendWeChatMessage(`**${title}**\n${message}`).catch(() => {});
      // D7: Also fire browser push with deep link URL for notificationclick
      if (isNotificationSupported()) {
        const urlMatch = message.match(/(任务|目标|项目)[「""]([^""」]+)[」""]/);
        sendBrowserNotification(title, { body: message, tag: `auto-${Date.now()}`, data: { url: '/' } });
      }
    });
    return () => setWeChatNotify(() => {});
  }, []);

  // S3-2a: Esc closes detail panel (navigate to base page path)
  useEffect(() => {
    const handler = () => {
      const loc = window.location.pathname;
      const baseMap: Record<string, string> = { '/goals': '/goals', '/projects': '/projects', '/tasks': '/tasks', '/insight': '/insight', '/knowledge': '/knowledge' };
      for (const [prefix, base] of Object.entries(baseMap)) {
        if (loc.startsWith(prefix + '/') && loc !== prefix) {
          navigate(base);
          return;
        }
      }
    };
    window.addEventListener('tbh-close-detail-panel', handler);
    return () => window.removeEventListener('tbh-close-detail-panel', handler);
  }, [navigate]);

  // AI chat button handled by FloatingAIPanel (tbh-open-ai-chat event)

  // When new notifications arrive while page is hidden, show browser notification
  const prevNotificationCountRef = useRef(state.notifications.length);
  useEffect(() => {
    const prevCount = prevNotificationCountRef.current;
    const currCount = state.notifications.length;
    if (currCount > prevCount && document.visibilityState !== 'visible') {
      // P3#16 fix: find the newest unread notification (notifications are newest-first via unshift)
      const newest = state.notifications.find(n => !n.read) || state.notifications.filter(n => !n.read).at(-1);
      if (newest) {
        // D7: Build deep link URL for notification click
        const relatedPage = newest.relatedType === 'goal' ? 'goals' : newest.relatedType === 'project' ? 'projects' : newest.relatedType === 'task' ? 'tasks' : null;
        const deepUrl = relatedPage && newest.relatedId ? `/${newest.relatedType}/${newest.relatedId}` : '/';
        sendBrowserNotification(newest.title, { body: newest.message, tag: newest.id, data: { url: deepUrl } });
      }
    }
    prevNotificationCountRef.current = currCount;
  }, [state.notifications]);

  const closeAllDropdowns = useCallback(() => { setShowNotifications(false); setShowUserMenu(false); setShowMemberFilter(false); setShowTeamSelector(false); }, []);

  // Sidebar mode cycling: wide → narrow → hidden → wide
  const cycleSidebarMode = useCallback(() => {
    setSidebarMode(prev => {
      const next = prev === 'wide' ? 'narrow' : prev === 'narrow' ? 'hidden' : 'wide';
      try { localStorage.setItem('tbh-sidebar-mode', next); } catch (e) { handleError(e, { module: 'Layout', operation: 'SAVE_SIDEBAR_MODE', severity: 'debug' }); }
      return next;
    });
  }, []);

  // S5-4: Auto-downgrade sidebar to narrow on tablet resize (≤1024px)
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setSidebarMode(prev => {
        if (w < 768 && prev !== 'hidden') return 'hidden';
        if (w >= 768 && w <= 1024 && prev === 'wide') return 'narrow';
        return prev;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ x: touch.clientX, y: touch.clientY, targetId: itemId, targetType: itemType });
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  }, []);
  const handleMainTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    longPressStartRef.current = null;
  }, []);
  const handleMainTouchMove = useCallback((e: React.TouchEvent) => {
    if (longPressTimerRef.current && longPressStartRef.current) {
      const touch = e.changedTouches[0];
      const dx = Math.abs(touch.clientX - longPressStartRef.current.x);
      const dy = Math.abs(touch.clientY - longPressStartRef.current.y);
      // Only cancel long-press if finger moved >10px — prevents jittery cancellation
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
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
    if (action === 'open' || action === 'edit') {
      const basePath = targetType === 'goal' ? '/goals' : targetType === 'project' ? '/projects' : '/tasks';
      navigate(`${basePath}/${targetId}`);
    }
    else if (action === 'toggle') { if (targetId) window.dispatchEvent(new CustomEvent('tbh-complete-selected', { detail: { itemId: targetId, itemType: targetType } })); }
    else if (action === 'delete') { if (targetId) window.dispatchEvent(new CustomEvent('tbh-delete-selected', { detail: { itemId: targetId, itemType: targetType } })); }
    setContextMenu(null);
  }, [contextMenu, navigate]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcuts({
    goToPage,
    closeAllDropdowns,
    dispatch,
    cycleSidebarMode,
    setCommandPaletteOpen,
    setQuickCreateOpen,
    setQuickCreateType,
    setShortcutHelpOpen,
    searchInputRef,
  });

  const handlePageClick = useCallback((page: Page) => {
    goToPage(page);
    setSidebarOpen(false);
    recordAction();
  }, [goToPage]);

  const handleMarkAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' }), [dispatch]);
  const handleMarkRead = useCallback((id: string) => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id }), [dispatch]);
  const handleNotificationNavigate = useCallback((page: Page, itemId: string, itemType: string, notificationId?: string) => {
    if (notificationId) dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notificationId });
    goToItem(itemType as 'goal' | 'project' | 'task', itemId);
    setShowNotifications(false);
  }, [goToItem, dispatch]);
  const handleSwitchUser = useCallback((id: string) => { dispatch({ type: 'SET_CURRENT_USER', payload: id }); setShowUserMenu(false); }, [dispatch]);
  const handleLogout = useCallback(() => {
    try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) { handleError(e, { module: 'Layout', operation: 'LOGOUT_REMOVE_KEY', severity: 'debug' }); }
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
    if (matched.length > 0) {
      // Navigate to tasks with person filter via URL search params
      navigate(`/tasks?persons=${matched.map(m => m.id).join(',')}`);
    } else {
      // Navigate to tasks and set search query
      navigate('/tasks');
      setTimeout(() => { const el = document.querySelector<HTMLInputElement>('input[data-search-input]'); if (el) { el.value = q; el.focus(); el.dispatchEvent(new Event('input', { bubbles: true })); } }, 600);
    }
  }, [state.members, navigate]);

  // Memoize notification slice to prevent re-render when other state changes
  const notificationsMemo = useMemo(() => state.notifications.filter(n => !n.memberId || n.memberId === user?.id), [state.notifications, user?.id]);

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Skip-to-content for keyboard users */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium">跳到主内容</a>
      {sidebarOpen && <div className="sidebar-overlay md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={[
        'fixed inset-y-0 left-0 z-50 bg-sidebar text-sidebar-foreground glass-sidebar transform transition-all duration-200 ease-in-out flex flex-col',
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="ml-auto p-1 rounded hover:bg-sidebar-accent transition-colors" onClick={cycleSidebarMode} aria-label={sidebarMode === 'wide' ? '收窄侧边栏' : sidebarMode === 'narrow' ? '隐藏侧边栏' : '展开侧边栏'}>
                {sidebarMode === 'wide' ? <PanelLeftClose size={16} /> : sidebarMode === 'narrow' ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{sidebarMode === 'wide' ? '收窄侧边栏' : sidebarMode === 'narrow' ? '隐藏侧边栏' : '展开侧边栏'}</TooltipContent>
          </Tooltip>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)} aria-label="关闭侧边栏"><X size={18} /></button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto" aria-label="主导航">
          {navItems.filter(item => {
            if (item.requirePermission && (!user || (user.role !== 'admin' && !hasPermission(state, user.id, item.requirePermission)))) return false;
            // Progressive disclosure: filter nav items by user level
            const featureMap: Record<string, string> = { dashboard: 'dashboard', goals: 'goals_basic', projects: 'projects', tasks: 'tasks', insight: 'insight', knowledge: 'knowledge', admin: 'dashboard', privacy: 'dashboard' };
            return isFeatureVisible(featureMap[item.page] || item.page);
          }).map((item, idx) => (
            sidebarNarrow ? (
              <Tooltip key={item.page}><TooltipTrigger asChild><button onClick={() => handlePageClick(item.page)}
                aria-label={item.label}
                aria-current={currentPage === item.page ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left relative active:scale-[0.97] ${currentPage === item.page ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'} ${sidebarNarrow ? 'justify-center px-0' : ''}`}>
                {item.icon}
                {!sidebarNarrow && !sidebarCollapsed && item.label}
                {!sidebarNarrow && !sidebarCollapsed && item.page === 'tasks' && overdueCount > 0 && (
                  <span className="ml-auto bg-destructive text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{overdueCount}</span>
                )}
                {!sidebarNarrow && !sidebarCollapsed && item.page === 'goals' && inProgressGoalsCount > 0 && (
                  <span className="ml-auto bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{inProgressGoalsCount}</span>
                )}
                {!sidebarNarrow && !sidebarCollapsed && item.page === 'dashboard' && unreadCount > 0 && (
                  <span className="ml-auto bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unreadCount}</span>
                )}
                {sidebarNarrow && item.page === 'tasks' && overdueCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
                )}
                {sidebarNarrow && item.page === 'dashboard' && unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                )}
                {!sidebarNarrow && !sidebarCollapsed && <span className="ml-auto text-[10px] text-sidebar-foreground/30 hidden lg:inline">{idx + 1}</span>}
              </button></TooltipTrigger><TooltipContent>{item.label}</TooltipContent></Tooltip>
            ) : (
              <button key={item.page} onClick={() => handlePageClick(item.page)}
                aria-label={item.label}
                aria-current={currentPage === item.page ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left relative active:scale-[0.97] ${currentPage === item.page ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'} ${sidebarNarrow ? 'justify-center px-0' : ''}`}>
                {item.icon}
                {!sidebarNarrow && !sidebarCollapsed && item.label}
                {!sidebarNarrow && !sidebarCollapsed && item.page === 'tasks' && overdueCount > 0 && (
                  <span className="ml-auto bg-destructive text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{overdueCount}</span>
                )}
                {!sidebarNarrow && !sidebarCollapsed && item.page === 'goals' && inProgressGoalsCount > 0 && (
                  <span className="ml-auto bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{inProgressGoalsCount}</span>
                )}
                {!sidebarNarrow && !sidebarCollapsed && item.page === 'dashboard' && unreadCount > 0 && (
                  <span className="ml-auto bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unreadCount}</span>
                )}
                {sidebarNarrow && item.page === 'tasks' && overdueCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
                )}
                {sidebarNarrow && item.page === 'dashboard' && unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                )}
                {!sidebarNarrow && !sidebarCollapsed && <span className="ml-auto text-[10px] text-sidebar-foreground/30 hidden lg:inline">{idx + 1}</span>}
              </button>
            )
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
<Tooltip><TooltipTrigger asChild><button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors cursor-pointer rounded hover:bg-sidebar-accent" onClick={() => {
                     const next: Record<string, string> = { beginner: 'intermediate', intermediate: 'advanced', advanced: 'beginner' };
                     setUserLevel(next[level]);
                     window.location.reload();
                   }}>
                    <span className="text-[10px]">{level === 'beginner' ? '🌱' : level === 'intermediate' ? '🌿' : '🌳'}</span>
                    <span>{desc.title}</span>
                    <span className="ml-auto text-[10px]">切换</span>
                  </button></TooltipTrigger><TooltipContent>{`点击切换体验等级（当前: ${desc.title}）`}</TooltipContent></Tooltip>
                );
              })()}
            </>
          ) : (
            <button className="p-2 rounded hover:bg-sidebar-accent transition-colors" onClick={cycleSidebarMode} aria-label="展开侧边栏">
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
        <header className="h-14 bg-background border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
          <button className="md:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted" onClick={() => setSidebarOpen(true)} aria-label="打开侧边栏">
            <Menu size={20} />
          </button>
          {sidebarMode === 'hidden' && (
            <button className="hidden md:flex p-1.5 -ml-1.5 rounded-md hover:bg-muted" onClick={cycleSidebarMode} aria-label="展开侧边栏">
              <PanelLeft size={20} />
            </button>
          )}
          <Breadcrumb currentPage={currentPage} itemId={itemId} />

          {userTeams.length > 1 && (
            <div className="relative">
              <button onClick={() => { setShowTeamSelector(!showTeamSelector); setShowMemberFilter(false); setShowUserMenu(false); setShowNotifications(false); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors">
                <Building2 size={14} />
                <span className="hidden sm:inline max-w-[100px] truncate">{currentTeam?.name || '选择团队'}</span>
                <ChevronDown size={12} />
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
            {showMemberFilter && (
              <MemberFilterDropdown isTeamView={isTeamView} viewingMemberId={viewingMemberId} viewingMember={viewingMember} visibleMembers={visibleMembersMemo} setViewingMember={setViewingMember} onClose={closeAllDropdowns} />
            )}
          </div>

          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm w-64">
            <Search size={16} /><input ref={searchInputRef} type="text" placeholder="搜索... (⌘K)" aria-label="全局搜索" className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground" onKeyDown={handleGlobalSearch} />
          </div>
          {/* Density toggle: comfortable ↔ compact */}
          <button className="hidden md:flex p-1.5 rounded-md hover:bg-muted transition-colors" onClick={toggleDensity} aria-label={density === 'comfortable' ? '切换紧凑模式' : '切换舒适模式'}>
            {density === 'comfortable' ? <Maximize2 size={16} className="text-muted-foreground" /> : <Minus size={16} className="text-primary" />}
          </button>
          {/* Theme toggle: light ↔ dark ↔ system */}
          <button className="hidden md:flex p-1.5 rounded-md hover:bg-muted transition-colors" onClick={toggleTheme} aria-label={`当前: ${theme === 'system' ? '跟随系统' : theme === 'dark' ? '暗色模式' : '亮色模式'} (点击切换)`}>
            {theme === 'dark' ? <Moon size={16} className="text-primary" /> : theme === 'light' ? <Sun size={16} className="text-muted-foreground" /> : <Monitor size={16} className="text-muted-foreground" />}
          </button>
          {/* Online collaborators indicator with page-awareness */}
          {onlineUsers.length > 1 && (
            <Tooltip><TooltipTrigger asChild><div className="hidden md:flex items-center gap-1">
              <div className="flex -space-x-1.5">
                {onlineUsers.slice(0, 4).map(u => {
                  const isViewingSamePage = u.cursor?.entity === currentPage;
                  return (
                    <div key={u.id} className={`w-6 h-6 rounded-full border-2 ${isViewingSamePage ? 'border-primary' : 'border-card'} flex items-center justify-center text-[9px] font-bold text-white transition-all ${isViewingSamePage ? 'ring-1 ring-primary/40' : ''}`} style={{ backgroundColor: u.color }}>
                      {(u.name || '?')[0]}
                    </div>
                  );
                })}
              </div>
              {onlineUsers.length > 4 && (
                <div className="w-6 h-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px] text-muted-foreground">+{onlineUsers.length - 4}</div>
              )}
              <span className="text-[10px] text-muted-foreground ml-0.5">在线</span>
            </div></TooltipTrigger><TooltipContent>{`${onlineUsers.length} 人在线协作`}</TooltipContent></Tooltip>
          )}
           <CollabPresenceBar userId={user?.id || ''} userName={user?.name || ''} currentPage={currentPage} />
           <div className="relative">
              <button className="relative p-2 rounded-lg hover:bg-muted transition-colors" aria-label={`通知${unreadCount > 0 ? ` (${unreadCount}条未读)` : ''}`}
                onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); setShowMemberFilter(false); }}>
                <Bell size={18} />
               {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />}
             </button>
             {showNotifications && (
               <NotificationDropdown notifications={notificationsMemo} unreadCount={unreadCount} onMarkAllRead={handleMarkAllRead} onMarkRead={handleMarkRead} onNavigate={handleNotificationNavigate} />
             )}
             {/* Screen reader live region for notification count changes */}
             <div aria-live="polite" aria-atomic="true" className="sr-only">
               {unreadCount > 0 ? `${unreadCount}条未读通知` : '没有未读通知'}
             </div>
           </div>
          <div className="relative">
            <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="用户菜单" aria-expanded={showUserMenu}
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); setShowMemberFilter(false); }}>
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">{user?.avatar || '?'}</div>
              <ChevronDown size={14} className="hidden sm:block text-muted-foreground" />
            </button>
            {showUserMenu && (
              <UserMenuDropdown user={user} visibleMembers={visibleMembersMemo} onSwitchUser={handleSwitchUser} onLogout={handleLogout} />
            )}
          </div>
        </header>
        <main id="main-content" className={`flex-1 overflow-y-auto bg-muted/30 pb-20 md:pb-0 ${density === 'compact' ? 'text-sm' : ''}`} tabIndex={-1} onTouchStart={handleMainTouchStart} onTouchEnd={handleMainTouchEnd} onTouchMove={handleMainTouchMove}><DensityContext.Provider value={density}><PageTransition keyProp={currentPage}>{children}</PageTransition></DensityContext.Provider></main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex items-center justify-around h-14 px-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
          className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white shadow-lg -mt-4" aria-label="快速创建">
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
        currentPage={currentPage}
        onNavigateItem={(id, type) => { goToItem(type as 'goal' | 'project' | 'task', id); }}
        onCreateItem={(type) => {
          if (type === 'task') { navigate('/tasks'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'task' } })), 200); }
          else if (type === 'project') { navigate('/projects'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'project' } })), 200); }
          else { navigate('/goals'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'goal' } })), 200); }
        }}
      />
      <QuickCreateModal open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} initialType={quickCreateType} />
      <ShortcutHelpPanel isOpen={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
      {/* Mobile long-press context menu */}
      {contextMenu && <MobileContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} onAction={handleContextAction} />}
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
      <PWAInstallPrompt />
      <OperationToast />
      <FloatingAIPanel />
    </div>
    </TooltipProvider>
  );
}
