import { useStore } from '@/store/useStore';
import type { SprintStatus } from '@/types';
import { SimpleSelect } from '@/components/ui/simple-select';

const STATUS_LABELS: Record<SprintStatus, string> = { planning: '规划中', active: '进行中', completed: '已完成' };

const EMPTY = '__EMPTY__';

interface SprintSelectorProps {
  value: string | null;
  onChange: (sprintId: string | null) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Sprint dropdown selector using project-standard SimpleSelect.
 * Only shows "active" and "planning" sprints (completed sprints are not assignable).
 */
export function SprintSelector({ value, onChange, className, disabled }: SprintSelectorProps) {
  const { state } = useStore();
  const assignableSprints = (state.sprints || []).filter(sp => sp.status !== 'completed');

  return (
    <SimpleSelect
      value={value || EMPTY}
      onValueChange={v => onChange(v === EMPTY ? null : v)}
      options={[
        { value: EMPTY, label: '无迭代' },
        ...assignableSprints.map(sp => ({ value: sp.id, label: `${sp.name}（${STATUS_LABELS[sp.status]}）` })),
      ]}
      placeholder="无迭代"
      className={className}
      disabled={disabled}
    />
  );
}
