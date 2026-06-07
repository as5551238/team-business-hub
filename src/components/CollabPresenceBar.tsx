/**
 * CollabPresenceBar — Shows avatars of who's currently viewing the same page
 *
 * Displays overlapping avatar circles in the page header area.
 * Uses the Supabase Presence channel from collab.ts.
 */
import React from 'react';
import { useCollabPresence } from '@/lib/collab';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface CollabPresenceBarProps {
  userId: string;
  userName: string;
  currentPage?: string;
}

const PRESENCE_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];

export const CollabPresenceBar: React.FC<CollabPresenceBarProps> = ({ userId, userName, currentPage }) => {
  const { onlineUsers } = useCollabPresence(userId, userName);

  // Filter to users actually on a page (presence tracks all, we show ones with cursors or same page)
  const visibleUsers = onlineUsers.filter(u => u.id !== userId).slice(0, 5);
  const extraCount = Math.max(0, onlineUsers.filter(u => u.id !== userId).length - 5);

  if (visibleUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2">
        {visibleUsers.map((user, i) => (
          <Tooltip key={user.id}><TooltipTrigger asChild><div
            className={`w-6 h-6 rounded-full ${PRESENCE_COLORS[i % PRESENCE_COLORS.length]} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-card`}
          >
            {user.name.charAt(0)}
          </div></TooltipTrigger><TooltipContent>{`${user.name}${user.cursor?.entity ? ` - 正在查看${user.cursor.entity}` : ''}`}</TooltipContent></Tooltip>
        ))}
      </div>
      {extraCount > 0 && (
        <span className="text-[10px] text-muted-foreground">+{extraCount}</span>
      )}
      <span className="text-[10px] text-muted-foreground hidden sm:inline">
        在线协作中
      </span>
    </div>
  );
};
