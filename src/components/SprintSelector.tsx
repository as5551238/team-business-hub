import { useStore } from '@/store/useStore';
import type { SprintStatus } from '@/types';

const STATUS_LABELS: Record<SprintStatus, string> = { planning: '规划中', active: '进行中', completed: '已完成' };

interface SprintSelectorProps {
  value: string | null;
  onChange: (sprintId: string | null) => void;
  className?: string;
}

/**
 * Lightweight Sprint dropdown selector for task forms.
 * Only shows "active" and "planning" sprints (completed sprints are not assignable).
 */
export function SprintSelector({ value, onChange, className }: SprintSelectorProps) {
  const { state } = useStore();
  const sprints = state.sprints || [];
  const assignableSprints = sprints.filter(sp => sp.status !== 'completed');

  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      className={`border border-input rounded px-2 py-1 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-primary/20 ${className || ''}`}
    >
      <option value="">无迭代</option>
      {assignableSprints.map(sp => (
        <option key={sp.id} value={sp.id}>
          {sp.name}（{STATUS_LABELS[sp.status]}）
        </option>
      ))}
    </select>
  );
}
