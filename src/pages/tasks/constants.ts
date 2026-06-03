import type { TaskStatus, TaskPriority } from '@/types';
import { Clock, AlertCircle, CheckCircle2, Circle, Ban } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ViewMode = 'board' | 'list' | 'table' | 'matrix' | 'timeline';
export type BusinessPriority = 'S' | 'A' | 'B' | 'C';
export type KanbanGroupBy = 'status' | 'tag' | 'priority' | 'category' | 'level' | 'person' | 'time';

export interface BatchProps { batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void; shiftSelect?: (id: string) => void }

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: LucideIcon }> = {
  todo: { label: '待处理', color: 'bg-gray-100 text-gray-600', icon: Circle },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-700', icon: Clock },
  done: { label: '已完成', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  blocked: { label: '已阻塞', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: '已删除', color: 'bg-slate-100 text-slate-500', icon: Ban },
};

export const URGENCY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: '紧急', color: 'bg-red-100 text-red-700' },
  high: { label: '高', color: 'bg-orange-100 text-orange-700' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700' },
  low: { label: '低', color: 'bg-slate-100 text-slate-600' },
};

export const IMPORTANCE_CONFIG: Record<BusinessPriority, { label: string; color: string; priority: TaskPriority }> = {
  S: { label: 'S级', color: 'bg-red-500 text-white', priority: 'urgent' },
  A: { label: 'A级', color: 'bg-orange-500 text-white', priority: 'high' },
  B: { label: 'B级', color: 'bg-blue-500 text-white', priority: 'medium' },
  C: { label: 'C级', color: 'bg-gray-400 text-white', priority: 'low' },
};

export const TIME_OPTIONS = [
  { key: 'all', label: '全部时间' }, { key: 'overdue', label: '已逾期' }, { key: 'today', label: '今天' }, { key: 'week', label: '本周' },
  { key: 'month', label: '本月' }, { key: 'quarter', label: '本季度' }, { key: 'custom', label: '自定义' },
];

export const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'board', label: '看板' }, { key: 'list', label: '清单' }, { key: 'table', label: '全量' },
  { key: 'matrix', label: '四象限' }, { key: 'timeline', label: '时间线' },
];

export const BOARD_COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'todo', label: '待处理', color: 'border-t-gray-400' },
  { key: 'in_progress', label: '进行中', color: 'border-t-blue-500' },
  { key: 'done', label: '已完成', color: 'border-t-green-500' },
];

export function getTodayStr() { return new Date().toISOString().split('T')[0]; }

export function priorityToBP(p: TaskPriority): BusinessPriority { if (p === 'urgent') return 'S'; if (p === 'high') return 'A'; if (p === 'medium') return 'B'; return 'C'; }

export function getQuadrantForPriority(p: TaskPriority): string { if (p === 'urgent') return '紧急重要'; if (p === 'high') return '重要不紧急'; if (p === 'medium') return '紧急不重要'; return '不紧急不重要'; }

export function isOverdue(task: { status: string; dueDate?: string | null }): boolean { return task.status !== 'done' && task.status !== 'cancelled' && !!task.dueDate && task.dueDate < getTodayStr(); }

export function isInTimeRange(dateStr: string | null, range: string, now?: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = now || new Date();
  if (range === 'today') return d.toDateString() === today.toDateString();
  if (range === 'week') { const ws = new Date(today); ws.setDate(today.getDate() - today.getDay()); ws.setHours(0, 0, 0, 0); return d >= ws; }
  if (range === 'month') { return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }
  if (range === 'quarter') { const q = Math.floor(today.getMonth() / 3); return d.getMonth() >= q * 3 && d.getMonth() < (q + 1) * 3 && d.getFullYear() === today.getFullYear(); }
  return true;
}

export function getTouchPos(e: TouchEvent | MouseEvent) {
  if ('touches' in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if ('changedTouches' in e && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
}
