import React, { useState, useMemo } from 'react';
import type { Notification } from '@/types';
import { cn } from '@/lib/utils';
import { LogOut, Bell, AlertTriangle, UserPlus, AtSign, RefreshCw, AlertCircle, Shield, Info, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import type { Page } from './Layout';

/** Icon mapping for notification types */
const TYPE_ICON: Record<Notification['type'], React.ReactNode> = {
  reminder: <Bell className="w-3.5 h-3.5 text-blue-500" />,
  overdue: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
  assigned: <UserPlus className="w-3.5 h-3.5 text-emerald-500" />,
  mentioned: <AtSign className="w-3.5 h-3.5 text-violet-500" />,
  sync: <RefreshCw className="w-3.5 h-3.5 text-sky-500" />,
  error: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
  risk_alert: <Shield className="w-3.5 h-3.5 text-amber-500" />,
  system: <Info className="w-3.5 h-3.5 text-slate-500" />,
};

/** Tab filter options */
type NotifTab = 'all' | 'mentioned' | 'task' | 'system';
const NOTIF_TABS: { key: NotifTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'mentioned', label: '@提及' },
  { key: 'task', label: '任务' },
  { key: 'system', label: '系统' },
];

/** Grouped notification structure */
interface GroupedNotification {
  key: string;
  items: Notification[];
  collapsed: boolean;
}

/** Filter notifications by tab */
function filterByTab(notifications: Notification[], tab: NotifTab): Notification[] {
  if (tab === 'all') return notifications;
  if (tab === 'mentioned') return notifications.filter(n => n.type === 'mentioned');
  if (tab === 'task') return notifications.filter(n => n.type === 'reminder' || n.type === 'overdue' || n.type === 'assigned');
  if (tab === 'system') return notifications.filter(n => n.type === 'sync' || n.type === 'error' || n.type === 'risk_alert' || n.type === 'system');
  return notifications;
}

/** Group consecutive notifications of same type + same relatedId within 30 minutes */
function groupNotifications(notifications: Notification[]): GroupedNotification[] {
  const THIRTY_MIN = 30 * 60 * 1000;
  const groups: GroupedNotification[] = [];
  for (const n of notifications) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.items[0].type === n.type && lastGroup.items[0].relatedId === n.relatedId) {
      const newestInGroup = new Date(lastGroup.items[0].createdAt).getTime();
      const current = new Date(n.createdAt).getTime();
      if (Math.abs(newestInGroup - current) < THIRTY_MIN) {
        lastGroup.items.push(n);
        continue;
      }
    }
    groups.push({ key: n.id, items: [n], collapsed: true });
  }
  return groups;
}

interface MemberFilterDropdownProps {
  isTeamView: boolean;
  viewingMemberId: string | null;
  viewingMember: { id: string; name: string; avatar: string; department: string } | null;
  visibleMembers: { id: string; name: string; avatar: string; department: string; role: string }[];
  setViewingMember: (id: string | null) => void;
  onClose: () => void;
}

export const MemberFilterDropdown = React.memo(function MemberFilterDropdown({ isTeamView, viewingMemberId, viewingMember, visibleMembers, setViewingMember, onClose }: MemberFilterDropdownProps) {
  return (
    <div className="absolute left-0 top-full mt-1 w-56 bg-card rounded-lg shadow-lg border border-border z-50 animate-slide-up max-h-64 overflow-y-auto">
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
  onNavigate: (page: Page, itemId: string, itemType: string, notificationId?: string) => void;
}

export const NotificationDropdown = React.memo(function NotificationDropdown({ notifications, unreadCount, onMarkAllRead, onMarkRead, onNavigate }: NotificationDropdownProps) {
  const [activeTab, setActiveTab] = useState<NotifTab>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => filterByTab(notifications, activeTab), [notifications, activeTab]);
  const groups = useMemo(() => groupNotifications(filtered.slice(0, 20)), [filtered]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleGroupClick = (group: GroupedNotification) => {
    // Mark all in group as read
    group.items.forEach(n => { if (!n.read) onMarkRead(n.id); });
    // Navigate to the first (newest) item
    const n = group.items[0];
    const targetPage = n.relatedType === 'goal' ? 'goals' : n.relatedType === 'project' ? 'projects' : n.relatedType === 'task' ? 'tasks' : null;
    if (targetPage) onNavigate(targetPage, n.relatedId, n.relatedType, n.id);
  };

  const tabCounts = useMemo(() => ({
    all: notifications.filter(n => !n.read).length,
    mentioned: notifications.filter(n => !n.read && n.type === 'mentioned').length,
    task: notifications.filter(n => !n.read && (n.type === 'reminder' || n.type === 'overdue' || n.type === 'assigned')).length,
    system: notifications.filter(n => !n.read && (n.type === 'sync' || n.type === 'error' || n.type === 'risk_alert' || n.type === 'system')).length,
  }), [notifications]);

  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-card rounded-lg shadow-lg border border-border z-50 animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-semibold text-sm">通知</span>
        {unreadCount > 0 && <button className="text-xs text-primary hover:underline" onClick={onMarkAllRead}>全部已读</button>}
      </div>
      {/* Filter tabs */}
      <div className="flex border-b border-border">
        {NOTIF_TABS.map(tab => (
          <button key={tab.key}
            className={cn('flex-1 py-1.5 text-xs text-center transition-colors relative', activeTab === tab.key ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => setActiveTab(tab.key)}>
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span className={cn('ml-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[9px] px-0.5', activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{tabCounts[tab.key]}</span>
            )}
            {activeTab === tab.key && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t" />}
          </button>
        ))}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {groups.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无通知</div>}
        {groups.map(group => {
          const first = group.items[0];
          const isGrouped = group.items.length > 1;
          const isExpanded = expandedGroups.has(group.key);
          const hasUnread = group.items.some(n => !n.read);
          const unreadInGroup = group.items.filter(n => !n.read).length;

          if (isGrouped && !isExpanded) {
            // Collapsed group: show summary
            return (
              <div key={group.key} className={cn('px-4 py-2.5 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors', hasUnread && 'bg-primary/5')}>
                <div className="flex items-start gap-2" onClick={() => handleGroupClick(group)}>
                  <div className="mt-0.5 flex-shrink-0">{TYPE_ICON[first.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{first.title}</span>
                      {first.level === 'urgent' && <span className="px-1 py-0.5 rounded text-[9px] bg-red-100 text-red-700 font-medium flex-shrink-0">紧急</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{first.message}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-primary font-medium">{unreadInGroup > 0 ? `${unreadInGroup}条未读` : `${group.items.length}条`}</span>
                      <span className="text-[10px] text-muted-foreground/60">{new Date(first.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <button className="p-0.5 hover:bg-accent rounded flex-shrink-0 mt-0.5" onClick={(e) => { e.stopPropagation(); toggleGroup(group.key); }} title="展开详情" aria-label="展开通知详情">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={group.key}>
              {isGrouped && (
                <button className="w-full flex items-center gap-1 px-4 pt-2 pb-0.5 text-[10px] text-muted-foreground hover:text-primary" onClick={() => toggleGroup(group.key)}>
                  <ChevronDown className="w-3 h-3" />
                  <span>{group.items.length}条相似通知</span>
                </button>
              )}
              {group.items.map(n => {
                const targetPage = n.relatedType === 'goal' ? 'goals' : n.relatedType === 'project' ? 'projects' : n.relatedType === 'task' ? 'tasks' : null;
                const isExpanded = expandedIds.has(n.id);
                return (
                  <div key={n.id} className={cn('px-4 py-2.5 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors', !n.read && 'bg-primary/5')}
                    onClick={() => { onMarkRead(n.id); if (targetPage) onNavigate(targetPage, n.relatedId, n.relatedType, n.id); }}>
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex-shrink-0">{TYPE_ICON[n.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{n.title}</span>
                          {n.level === 'urgent' && <span className="px-1 py-0.5 rounded text-[9px] bg-red-100 text-red-700 font-medium flex-shrink-0">紧急</span>}
                          {n.level === 'important' && <span className="px-1 py-0.5 rounded text-[9px] bg-amber-100 text-amber-700 font-medium flex-shrink-0">重要</span>}
                        </div>
                        <div className={cn('text-xs text-muted-foreground mt-0.5', isExpanded ? '' : 'truncate')}>{n.message}</div>
                        {n.message && n.message.length > 40 && !isExpanded && <button className="text-[10px] text-primary hover:underline mt-0.5" onClick={e => { e.stopPropagation(); setExpandedIds(prev => new Set(prev).add(n.id)); }}>展开</button>}
                        {isExpanded && <button className="text-[10px] text-primary hover:underline mt-0.5" onClick={e => { e.stopPropagation(); setExpandedIds(prev => { const next = new Set(prev); next.delete(n.id); return next; }); }}>收起</button>}
                        <div className="text-[10px] text-muted-foreground/60 mt-1">{new Date(n.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      {!n.read && <div className={cn('w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0', n.level === 'urgent' ? 'bg-red-500' : n.level === 'important' ? 'bg-amber-500' : 'bg-primary')} />}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
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

export const UserMenuDropdown = React.memo(function UserMenuDropdown({ user, visibleMembers, onSwitchUser, onLogout }: UserMenuDropdownProps) {
  return (
    <div className="absolute right-0 top-full mt-1 w-56 bg-card rounded-lg shadow-lg border border-border z-50 animate-slide-up">
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

export interface ContextMenuItem { label: string; action: string; icon?: React.ReactNode }
export const MobileContextMenu: React.FC<{ x: number; y: number; items: ContextMenuItem[]; onClose: () => void; onAction: (action: string) => void }> = React.memo(({ x, y, items, onClose, onAction }) => (
  <>
    <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
    <div className="fixed z-[61] bg-card border border-border rounded-lg shadow-xl py-1 min-w-[140px] animate-slide-up" style={{ left: Math.min(x, window.innerWidth - 160), top: Math.min(y, window.innerHeight - items.length * 40 - 20) }}>
      {items.map(item => (
        <button key={item.action} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors" onClick={() => { onAction(item.action); onClose(); }}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </div>
  </>
));
