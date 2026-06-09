/**
 * Layout — 纯组合层
 * 从767行巨石组件重构为：SidebarContainer + TopBar + NotificationSystem + MobileNav + PageShell
 * 所有业务逻辑已拆分到子组件，本文件只负责组合 + 共享状态
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useActiveMembers } from '@/store/hooks';
import { QuickCreateModal } from '@/components/QuickCreateModal';
import { CommandPalette } from '@/components/CommandPalette';
import { ShortcutHelpPanel } from '@/components/ShortcutHelpPanel';
import { OnboardingWizard, shouldShowOnboarding } from '@/components/OnboardingWizard';
import { useTheme } from '@/hooks/useTheme';
import { handleError } from '@/lib/errorHandler';
import { PageTransition } from '@/components/ui/motion';
import { useCollabPresence } from '@/lib/collab';
import { H5Layout } from '@/components/H5Layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { OperationToast } from '@/components/OperationToast';
import { FloatingAIPanel } from '@/components/FloatingAIPanel';
import { getPageFromPathname, useAppNavigate } from '@/lib/routes';
import { sendBrowserNotification } from '@/lib/browserNotify';
import SidebarContainer, { type SidebarMode } from './SidebarContainer';
import TopBar from './TopBar';
import NotificationSystem from './NotificationSystem';
import MobileNav from './MobileNav';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import type { ContextMenuItem } from './LayoutDropdowns';
import { MobileContextMenu } from './LayoutDropdowns';

export type Page = 'dashboard' | 'goals' | 'projects' | 'tasks' | 'insight' | 'knowledge' | 'admin' | 'privacy';
export type DensityMode = 'comfortable' | 'compact';
export const DensityContext = React.createContext<DensityMode>('comfortable');

interface LayoutProps {
  children: React.ReactNode;
  currentUser?: { id: string; role: string; name: string; avatar: string; department: string } | undefined;
}

function isH5Mode(): boolean {
  try {
    const ua = navigator.userAgent.toLowerCase();
    const isWechat = ua.includes('micromessenger');
    const isFeishu = ua.includes('lark') || ua.includes('feishu');
    const hasParam = new URLSearchParams(window.location.search).get('h5') === '1';
    return isWechat || isFeishu || hasParam;
  } catch (e) { return false; }
}

export default function Layout({ children, currentUser }: LayoutProps) {
  // All hooks must be called unconditionally (React rules of hooks)
  const location = useLocation();
  const navigate = useNavigate();
  const { goToPage, goToItem } = useAppNavigate();
  const currentPage = useMemo(() => getPageFromPathname(location.pathname), [location.pathname]);
  const itemId = useMemo(() => { const parts = location.pathname.split('/'); return parts[2] || null; }, [location.pathname]);
  const onPageChange = useCallback((page: Page) => { goToPage(page); }, [goToPage]);

  const { state, dispatch, connectionMode } = useStore();
  const user = state.currentUser;
  const { activeMembers } = useActiveMembers();
  const isAdmin = user?.role === 'admin';
  const unreadCount = useMemo(() => state.notifications.filter(n => !n.read && (!n.memberId || n.memberId === user?.id)).length, [state.notifications, user?.id]);
  const overdueCount = useMemo(() => { const today = new Date().toISOString().split('T')[0]; return state.tasks.filter(t => (t.leaderId === user?.id || (t.supporterIds ?? []).includes(user?.id || '')) && t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < today).length; }, [state.tasks, user?.id]);
  const inProgressGoalsCount = useMemo(() => state.goals.filter(g => g.status === 'in_progress').length, [state.goals]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    try { const s = localStorage.getItem('tbh-sidebar-mode'); if (s === 'wide' || s === 'narrow' || s === 'hidden') return s; } catch (e) {}
    return window.innerWidth < 768 ? 'hidden' : window.innerWidth <= 1024 ? 'narrow' : 'wide';
  });
  const [density, setDensity] = useState<DensityMode>(() => {
    try { const d = localStorage.getItem('tbh-density'); if (d === 'comfortable' || d === 'compact') return d; } catch (e) {} return 'comfortable';
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<'task' | 'goal' | 'project'>('task');
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShowOnboarding());
  const [offlineWrites, setOfflineWrites] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string; targetType: string } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  const { theme } = useTheme();
  const { onlineUsers, updateCursor } = useCollabPresence(user?.id || '', user?.name || '');
  const cycleSidebarMode = useCallback(() => {
    setSidebarMode(prev => {
      const next = prev === 'wide' ? 'narrow' : prev === 'narrow' ? 'hidden' : 'wide';
      try { localStorage.setItem('tbh-sidebar-mode', next); } catch (e) {}
      return next;
    });
  }, []);
  const toggleDensity = useCallback(() => {
    setDensity(prev => { const next = prev === 'comfortable' ? 'compact' : 'comfortable'; try { localStorage.setItem('tbh-density', next); } catch (e) {} return next; });
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcuts({ goToPage, closeAllDropdowns: () => {}, dispatch, cycleSidebarMode, setCommandPaletteOpen, setQuickCreateOpen, setQuickCreateType, setShortcutHelpOpen, searchInputRef });

  // Collab cursor
  useEffect(() => { updateCursor({ entity: currentPage, entityId: currentPage }); }, [currentPage, updateCursor]);

  // Offline writes tracking
  useEffect(() => {
    if (connectionMode !== 'offline') { setOfflineWrites(0); return; }
    const check = () => { try { setOfflineWrites(parseInt(localStorage.getItem('tbh-offline-writes') || '0')); } catch (e) {} };
    check(); const id = setInterval(check, 2000); return () => clearInterval(id);
  }, [connectionMode]);

  // Auto-downgrade sidebar on resize
  useEffect(() => {
    const onResize = () => { const w = window.innerWidth; setSidebarMode(prev => { if (w < 768 && prev !== 'hidden') return 'hidden'; if (w >= 768 && w <= 1024 && prev === 'wide') return 'narrow'; return prev; }); };
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);

  // Esc closes detail panel
  useEffect(() => {
    const handler = () => { const loc = window.location.pathname; const baseMap: Record<string, string> = { '/goals': '/goals', '/projects': '/projects', '/tasks': '/tasks' }; for (const [prefix, base] of Object.entries(baseMap)) { if (loc.startsWith(prefix + '/') && loc !== base) { navigate(base); return; } } };
    window.addEventListener('tbh-close-detail-panel', handler); return () => window.removeEventListener('tbh-close-detail-panel', handler);
  }, [navigate]);

  // New notification while page hidden -> browser push
  const prevNotificationCountRef = useRef(state.notifications.length);
  useEffect(() => {
    const prevCount = prevNotificationCountRef.current; const currCount = state.notifications.length;
    if (currCount > prevCount && document.visibilityState !== 'visible') {
      const newest = state.notifications.find(n => !n.read) || state.notifications.filter(n => !n.read).at(-1);
      if (newest) {
        const relatedPage = newest.relatedType === 'goal' ? 'goals' : newest.relatedType === 'project' ? 'projects' : newest.relatedType === 'task' ? 'tasks' : null;
        const deepUrl = relatedPage && newest.relatedId ? `/${newest.relatedType}/${newest.relatedId}` : '/';
        try { sendBrowserNotification(newest.title, { body: newest.message, tag: newest.id, data: { url: deepUrl } }); } catch (e) {}
      }
    }
    prevNotificationCountRef.current = currCount;
  }, [state.notifications]);

  // Context menu handlers
  const handleMainContextMenu = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-item-id]'); if (!target) return; e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: (target as HTMLElement).dataset.itemId || '', targetType: (target as HTMLElement).dataset.itemType || 'task' });
  }, []);
  const handleMainTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]; const target = (touch.target as HTMLElement).closest('[data-item-id]'); if (!target) return;
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = setTimeout(() => { setContextMenu({ x: touch.clientX, y: touch.clientY, targetId: (target as HTMLElement).dataset.itemId || '', targetType: (target as HTMLElement).dataset.itemType || 'task' }); if (navigator.vibrate) navigator.vibrate(30); }, 500);
  }, []);
  const handleMainTouchEnd = useCallback(() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } longPressStartRef.current = null; }, []);
  const handleMainTouchMove = useCallback((e: React.TouchEvent) => {
    if (longPressTimerRef.current && longPressStartRef.current) { const touch = e.changedTouches[0]; const dx = Math.abs(touch.clientX - longPressStartRef.current.x); const dy = Math.abs(touch.clientY - longPressStartRef.current.y); if (dx > 10 || dy > 10) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }
  }, []);
  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    const items: ContextMenuItem[] = [{ label: '打开详情', action: 'open', icon: <React.Fragment /> }, { label: '编辑', action: 'edit', icon: <React.Fragment /> }];
    if (contextMenu.targetType === 'task') items.push({ label: '切换完成', action: 'toggle', icon: <React.Fragment /> });
    items.push({ label: '删除', action: 'delete', icon: <React.Fragment /> });
    return items;
  }, [contextMenu]);
  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    if (action === 'open' || action === 'edit') { const basePath = contextMenu.targetType === 'goal' ? '/goals' : contextMenu.targetType === 'project' ? '/projects' : '/tasks'; navigate(`${basePath}/${contextMenu.targetId}`); }
    else if (action === 'toggle') { window.dispatchEvent(new CustomEvent('tbh-complete-selected', { detail: { itemId: contextMenu.targetId, itemType: contextMenu.targetType } })); }
    else if (action === 'delete') { window.dispatchEvent(new CustomEvent('tbh-delete-selected', { detail: { itemId: contextMenu.targetId, itemType: contextMenu.targetType } })); }
    setContextMenu(null);
  }, [contextMenu, navigate]);

  // Touch swipe for mobile sidebar
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x; const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) { if (dx > 0 && !sidebarOpen) setSidebarOpen(true); else if (dx < 0 && sidebarOpen) setSidebarOpen(false); }
    touchStartRef.current = null;
  }, [sidebarOpen]);

  const handlePageClick = useCallback((page: Page) => { goToPage(page); setSidebarOpen(false); }, [goToPage]);

  // H5 mode: early render after all hooks
  const h5 = useMemo(() => isH5Mode(), []);

  if (h5) return <H5Layout>{children}</H5Layout>;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium">跳到主内容</a>
      {sidebarOpen && <div className="sidebar-overlay md:hidden" onClick={() => setSidebarOpen(false)} />}

      <NotificationSystem userId={user?.id} />

      <SidebarContainer
        currentPage={currentPage} onPageClick={handlePageClick}
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        sidebarMode={sidebarMode} setSidebarMode={setSidebarMode}
        unreadCount={unreadCount} overdueCount={overdueCount}
        inProgressGoalsCount={inProgressGoalsCount}
        connectionMode={connectionMode} offlineWrites={offlineWrites}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          currentPage={currentPage} itemId={itemId}
          sidebarMode={sidebarMode} cycleSidebarMode={cycleSidebarMode}
          setSidebarOpen={setSidebarOpen} user={user}
          notifications={state.notifications} unreadCount={unreadCount}
          onlineUsers={onlineUsers} density={density}
          toggleDensity={toggleDensity} goToPage={onPageChange}
          goToItem={goToItem} searchInputRef={searchInputRef}
        />
        <main id="main-content" className={`flex-1 overflow-y-auto bg-muted/30 pb-20 md:pb-0 ${density === 'compact' ? 'text-sm' : ''}`} tabIndex={-1} onContextMenu={handleMainContextMenu} onTouchStart={handleMainTouchStart} onTouchEnd={handleMainTouchEnd} onTouchMove={handleMainTouchMove}>
          <DensityContext.Provider value={density}>
            <PageTransition keyProp={currentPage}>{children}</PageTransition>
          </DensityContext.Provider>
        </main>
      </div>

      <MobileNav
        currentPage={currentPage} onPageClick={handlePageClick}
        setSidebarOpen={setSidebarOpen}
        setQuickCreateType={setQuickCreateType} setQuickCreateOpen={setQuickCreateOpen}
      />

      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} onPageChange={onPageChange} currentPage={currentPage}
        onNavigateItem={(id, type) => { goToItem(type as 'goal' | 'project' | 'task', id); }}
        onCreateItem={(type) => { if (type === 'task') { navigate('/tasks'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'task' } })), 200); } else if (type === 'project') { navigate('/projects'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'project' } })), 200); } else { navigate('/goals'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-create-item', { detail: { type: 'goal' } })), 200); } }}
      />
      <QuickCreateModal open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} initialType={quickCreateType} />
      <ShortcutHelpPanel isOpen={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
      {contextMenu && <MobileContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} onAction={handleContextAction} />}
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
      <PWAInstallPrompt />
      <OperationToast />
      <FloatingAIPanel />
    </div>
    </TooltipProvider>
  );
}
