import type { ProjectStatus, TaskPriority } from '@/types';
import { ListTodo, LayoutGrid, TrendingUp, Clock } from 'lucide-react';

export type ViewMode = 'detail' | 'list' | 'table' | 'kanban' | 'matrix' | 'timeline';

export const statusLabels: Record<ProjectStatus, string> = { planning: '规划中', in_progress: '进行中', completed: '已完成', paused: '已暂停', cancelled: '已取消' };
export const statusColors: Record<ProjectStatus, string> = { planning: 'bg-gray-100 text-gray-600', in_progress: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700', paused: 'bg-amber-100 text-amber-700', cancelled: 'bg-red-100 text-red-600' };
export const priorityLabels: Record<TaskPriority, string> = { low: '低', medium: '中', high: '高', urgent: '紧急' };
export const priorityColors: Record<TaskPriority, string> = { low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };
export const bpMap: Record<string, TaskPriority> = { S: 'urgent', A: 'high', B: 'medium', C: 'low' };
export const bpLabels: Record<string, string> = { S: 'S级', A: 'A级', B: 'B级', C: 'C级' };
export const viewTabs: Array<{ value: ViewMode; label: string; icon: typeof LayoutGrid }> = [
  { value: 'detail', label: '详细', icon: LayoutGrid }, { value: 'list', label: '清单', icon: ListTodo },
  { value: 'table', label: '全量', icon: LayoutGrid }, { value: 'kanban', label: '看板', icon: LayoutGrid },
  { value: 'matrix', label: '四象限', icon: TrendingUp }, { value: 'timeline', label: '时间线', icon: Clock },
];
export const statusOptions: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部状态' }, { value: 'planning', label: '规划中' }, { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' }, { value: 'paused', label: '已暂停' },
];
export const priorityOptions: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部紧急程度' }, { value: 'urgent', label: '紧急' }, { value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' },
];
export const bpOptions: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部重要程度' }, { value: 'S', label: 'S级' }, { value: 'A', label: 'A级' }, { value: 'B', label: 'B级' }, { value: 'C', label: 'C级' },
];
export const timeOptions: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部时间' }, { value: 'today', label: '今天' }, { value: 'this_week', label: '本周' }, { value: 'this_month', label: '本月' }, { value: 'this_quarter', label: '本季度' },
];

export function priorityFromBp(bp: string): TaskPriority | null { return bpMap[bp] || null; }
export function bpFromPriority(p: TaskPriority): string { if (p === 'urgent') return 'S'; if (p === 'high') return 'A'; if (p === 'medium') return 'B'; return 'C'; }

export function getTouchPos(e: TouchEvent | MouseEvent) {
  if ('touches' in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if ('changedTouches' in e && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
}

export interface BatchProps { batchMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }
