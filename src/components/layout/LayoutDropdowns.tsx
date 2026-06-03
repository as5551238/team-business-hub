import React from 'react';
import type { Notification } from '@/types';
import { cn } from '@/lib/utils';
import { LogOut } from 'lucide-react';
import type { Page } from './Layout';

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
  onNavigate: (page: Page, itemId: string, itemType: string) => void;
}

export const NotificationDropdown = React.memo(function NotificationDropdown({ notifications, unreadCount, onMarkAllRead, onMarkRead, onNavigate }: NotificationDropdownProps) {
  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-card rounded-lg shadow-lg border border-border z-50 animate-slide-up">
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
                {!n.read && <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', (n.level === 'urgent') ? 'bg-red-500' : (n.level === 'important') ? 'bg-amber-500' : 'bg-primary')} />}
                <div className={!n.read ? '' : 'pl-3.5'}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{n.title}</span>
                    {n.level === 'urgent' && <span className="px-1 py-0.5 rounded text-[9px] bg-red-100 text-red-700 font-medium">紧急</span>}
                    {n.level === 'important' && <span className="px-1 py-0.5 rounded text-[9px] bg-amber-100 text-amber-700 font-medium">重要</span>}
                  </div>
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
