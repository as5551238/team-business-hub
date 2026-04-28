import type { GoalStatus, GoalType, TaskPriority } from '@/types';
import {
  Target, ListTodo, LayoutGrid, TrendingUp, Clock, Kanban
} from 'lucide-react';

export type ViewMode = 'detail' | 'list' | 'kanban' | 'table' | 'matrix' | 'timeline';

export const statusLabels: Record<GoalStatus, string> = {
  planning: '规划中', in_progress: '进行中', completed: '已完成', paused: '已暂停', cancelled: '已取消',
};
export const statusColors: Record<GoalStatus, string> = {
  planning: 'bg-gray-100 text-gray-600', in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700', paused: 'bg-amber-100 text-amber-700', cancelled: 'bg-red-100 text-red-600',
};
export const typeLabels: Record<GoalType, string> = { okr: 'OKR', kpi: 'KPI', milestone: '里程碑' };
export const typeColors: Record<GoalType, string> = {
  okr: 'bg-blue-100 text-blue-700', kpi: 'bg-emerald-100 text-emerald-700', milestone: 'bg-purple-100 text-purple-700',
};
export const bizLabels: Record<string, string> = { urgent: 'S级', high: 'A级', medium: 'B级', low: 'C级' };
export const bizColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600',
};

export const viewTabs: Array<{ value: ViewMode; label: string; icon: typeof Target }> = [
  { value: 'detail', label: '详细', icon: Target },
  { value: 'list', label: '清单', icon: ListTodo },
  { value: 'kanban', label: '看板', icon: LayoutGrid },
  { value: 'table', label: '全量', icon: LayoutGrid },
  { value: 'matrix', label: '四象限', icon: TrendingUp },
  { value: 'timeline', label: '时间线', icon: Clock },
];

export function progressColor(p: number) {
  if (p >= 80) return 'bg-green-500';
  if (p >= 50) return 'bg-blue-500';
  return 'bg-amber-500';
}
export function progressTextColor(p: number) {
  if (p >= 80) return 'text-green-600';
  if (p >= 50) return 'text-blue-600';
  return 'text-amber-600';
}
