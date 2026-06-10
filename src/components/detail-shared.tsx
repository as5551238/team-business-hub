import React from 'react';
import type { RepeatCycle } from '@/types';

export function Section({ title, icon, action, badge, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; badge?: number; children: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-3">
        {icon}
        <span>{title}</span>
        {badge && badge > 0 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-bold min-w-[18px] text-center">{badge}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  todo: { label: '待办', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '进行中', color: 'bg-yellow-100 text-yellow-700' },
  done: { label: '已完成', color: 'bg-green-100 text-green-700' },
  blocked: { label: '已阻塞', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-500' },
};

export const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'bg-slate-100 text-slate-600' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700' },
  high: { label: '高', color: 'bg-orange-100 text-orange-700' },
  urgent: { label: '紧急', color: 'bg-red-100 text-red-700' },
};

export const REPEAT_LABELS: Record<RepeatCycle, string> = {
  none: '不重复', daily: '每天', weekly: '每周', biweekly: '每两周', monthly: '每月', quarterly: '每季度', yearly: '每年',
};

export function collectDescendantIds(items: { id: string; parentId: string | null }[], rootId: string): Set<string> {
  const descendants = new Set<string>();
  const children = items.filter(i => i.parentId === rootId);
  for (const child of children) {
    descendants.add(child.id);
    const sub = collectDescendantIds(items, child.id);
    sub.forEach(id => descendants.add(id));
  }
  return descendants;
}
