import React, { useMemo, useCallback } from 'react';
import { Zap, Target, FolderKanban, ListTodo } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStore } from '@/store/useStore';
import { buildAIContext, extractFocusItems } from '@/lib/ai/aiContextEngine';
import type { ItemContext } from '@/lib/ai/aiContextEngine';

interface AIFocusWidgetProps {
  onPageChange: (page: string) => void;
  onOpenDetail: (id: string, type: 'goal' | 'project' | 'task') => void;
}

const typeIcon: Record<ItemContext['type'], React.ReactNode> = {
  goal: <span>🎯</span>,
  project: <span>📋</span>,
  task: <span>✅</span>,
};

const typePageMap: Record<ItemContext['type'], string> = {
  goal: 'goals',
  project: 'projects',
  task: 'tasks',
};

const priorityBorder: Record<string, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-400',
  medium: 'border-l-gray-300',
  low: 'border-l-gray-200',
};

const priorityBadge: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

const priorityLabel: Record<string, string> = {
  urgent: '紧急', high: '高', medium: '中', low: '低',
};

const statusLabel: Record<string, string> = {
  todo: '待处理',
  in_progress: '进行中',
  done: '已完成',
  blocked: '已阻塞',
  cancelled: '已取消',
};

function AIFocusWidgetInner({ onPageChange, onOpenDetail }: AIFocusWidgetProps) {
  const { state } = useStore();

  const focusItems = useMemo(() => extractFocusItems(buildAIContext(state), 5), [state]);

  const handleClick = useCallback((item: ItemContext) => {
    onPageChange(typePageMap[item.type]);
    onOpenDetail(item.id, item.type);
  }, [onPageChange, onOpenDetail]);

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={16} className="text-yellow-500" />
        <h3 className="font-semibold text-sm">关注焦点</h3>
      </div>
      <EmptyState title="AI自动识别逾期、高优先级和停滞事项，帮你聚焦最需关注的工作" compact />

      {focusItems.length === 0 ? (
        <EmptyState title="暂无需要关注的事项" compact />
      ) : (
        <div className="space-y-2">
          {focusItems.map((item) => {
            const overdueDays = item.isOverdue && item.daysRemaining !== null
              ? Math.abs(item.daysRemaining)
              : null;

            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-2.5 rounded-md border-l-4 ${priorityBorder[item.priority] ?? 'border-l-gray-200'} hover:bg-gray-50 cursor-pointer transition-colors`}
                onClick={() => handleClick(item)}
              >
                <span className="shrink-0">{typeIcon[item.type]}</span>
                <span className="text-sm font-medium truncate flex-1" title={item.title}>{item.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${priorityBadge[item.priority] ?? 'bg-gray-100 text-gray-600'}`}>{priorityLabel[item.priority] ?? item.priority}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{statusLabel[item.status] ?? item.status}</span>
                {overdueDays !== null && (
                  <span className="text-xs text-red-600 font-medium whitespace-nowrap">逾期{overdueDays}天</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const AIFocusWidget = React.memo(AIFocusWidgetInner);
