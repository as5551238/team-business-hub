import React from 'react';
import type { ItemContext } from '@/lib/ai/aiContextEngine';

const TYPE_ICON: Record<ItemContext['type'], string> = { goal: '🎯', project: '📋', task: '✅' };
const STATUS_LABEL: Record<string, string> = {
  todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞', cancelled: '已取消',
  overdue: '逾期',
};

interface SmartSearchResultProps {
  item: ItemContext;
  matchReasons: string[];
  onClick: () => void;
}

export function SmartSearchResult({ item, matchReasons, onClick }: SmartSearchResultProps) {
  const topReasons = matchReasons.slice(0, 2);
  return (
    <div
      role="option"
      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-accent/50"
      onClick={onClick}
      tabIndex={-1}
    >
      <span className="shrink-0 text-base">{TYPE_ICON[item.type]}</span>
      <span className="flex-1 truncate">{item.title}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground shrink-0">{STATUS_LABEL[item.status] ?? item.status}</span>
      {topReasons.map((r, i) => <span key={i} className="text-xs text-muted-foreground truncate max-w-[100px] shrink-0">{r}</span>)}
    </div>
  );
}
