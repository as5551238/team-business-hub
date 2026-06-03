/**
 * BatchActionBar — 统一的批量操作工具栏
 * 通用: 已选计数 / 删除 / 改状态 / 分配人 / 优先级 / 标签 / 日期 / 清空
 */
import React, { useCallback } from 'react';
import { Trash2, X, CheckSquare, Tag, Calendar, ArrowUpCircle } from 'lucide-react';
import type { BatchSelectionState } from '@/hooks/useBatchSelection';

interface BatchActionBarProps {
  selection: BatchSelectionState;
  filteredCount: number;
  filteredIds: string[];
  /** 项类型标签: "任务"/"目标"/"项目" */
  itemLabel: string;
  /** 可用状态列表 */
  statuses: { value: string; label: string }[];
  /** 可分配成员列表 */
  members: { id: string; name: string }[];
  /** 可用标签列表 (name only) */
  tags?: string[];
  /** 可用优先级列表 */
  priorities?: { value: string; label: string }[];
  /** 是否显示日期设置 (任务有 startDate+dueDate, 目标/项目有 startDate+endDate) */
  showDateFields?: boolean;
  /** 日期字段配置 */
  dateFields?: { key: string; label: string }[];
  /** 可移动目标列表 (如: 移动到项目/目标) */
  moveTargets?: { value: string; label: string }[];
  moveLabel?: string;
  onBatchDelete: (ids: string[]) => void;
  onBatchStatus: (ids: string[], status: string) => void;
  onBatchAssign: (ids: string[], assigneeId: string) => void;
  onBatchPriority?: (ids: string[], priority: string) => void;
  onBatchAddTags?: (ids: string[], tags: string[]) => void;
  onBatchRemoveTags?: (ids: string[], tags: string[]) => void;
  onBatchSetDate?: (ids: string[], field: string, value: string) => void;
  onBatchMove?: (ids: string[], targetId: string) => void;
  canDelete: boolean;
  canEdit: boolean;
}

export const BatchActionBar = React.memo(function BatchActionBar({
  selection, filteredCount, filteredIds, itemLabel,
  statuses, members, tags, priorities, showDateFields, dateFields,
  moveTargets, moveLabel,
  onBatchDelete, onBatchStatus, onBatchAssign,
  onBatchPriority, onBatchAddTags, onBatchRemoveTags, onBatchSetDate, onBatchMove,
  canDelete, canEdit,
}: BatchActionBarProps) {
  const { selectedIds, selectAll, clearSelection, exitBatchMode } = selection;
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const ids = Array.from(selectedIds);
  const disabled = selectedIds.size === 0;

  const handleSelectAll = useCallback(() => {
    if (allSelected) clearSelection();
    else selectAll(filteredIds);
  }, [allSelected, clearSelection, selectAll, filteredIds]);

  const handleDelete = useCallback(() => {
    if (disabled) return;
    const msg = `确定删除选中的 ${selectedIds.size} 个${itemLabel}？可以通过 Ctrl+Z 撤销。`;
    if (!window.confirm(msg)) return;
    onBatchDelete(ids);
    exitBatchMode();
  }, [selectedIds, itemLabel, onBatchDelete, exitBatchMode]);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled || !e.target.value) return;
    onBatchStatus(ids, e.target.value);
    e.target.value = '';
  }, [selectedIds, onBatchStatus]);

  const handleAssignChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled || !e.target.value) return;
    onBatchAssign(ids, e.target.value);
    e.target.value = '';
  }, [selectedIds, onBatchAssign]);

  const handlePriorityChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled || !e.target.value || !onBatchPriority) return;
    onBatchPriority(ids, e.target.value);
    e.target.value = '';
  }, [selectedIds, onBatchPriority]);

  const handleAddTagChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled || !e.target.value || !onBatchAddTags) return;
    onBatchAddTags(ids, [e.target.value]);
    e.target.value = '';
  }, [selectedIds, onBatchAddTags]);

  const handleRemoveTagChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled || !e.target.value || !onBatchRemoveTags) return;
    onBatchRemoveTags(ids, [e.target.value]);
    e.target.value = '';
  }, [selectedIds, onBatchRemoveTags]);

  const handleDateChange = useCallback((field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || !onBatchSetDate) return;
    onBatchSetDate(ids, field, e.target.value);
  }, [selectedIds, onBatchSetDate]);

  const handleMoveChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled || !e.target.value || !onBatchMove) return;
    onBatchMove(ids, e.target.value);
    e.target.value = '';
  }, [selectedIds, onBatchMove]);

  return (
    <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 mr-1 flex-wrap">
      <CheckSquare size={14} className="text-primary" />
      <span className="text-xs font-medium text-primary">已选 {selectedIds.size} 项</span>
      <button onClick={handleSelectAll} className="text-xs text-primary hover:underline ml-1">
        {allSelected ? '全不选' : `全选(${filteredCount})`}
      </button>
      {canDelete && (
        <button onClick={handleDelete} className="flex items-center gap-1 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 rounded" disabled={disabled}>
          <Trash2 size={12} /> 删除
        </button>
      )}
      {canEdit && (
        <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-card" defaultValue="" onChange={handleStatusChange} disabled={disabled}>
          <option value="" disabled>改状态</option>
          {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )}
      {canEdit && members.length > 0 && (
        <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-card max-w-[120px]" defaultValue="" onChange={handleAssignChange} disabled={disabled}>
          <option value="" disabled>分配给</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {canEdit && priorities && priorities.length > 0 && onBatchPriority && (
        <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-card" defaultValue="" onChange={handlePriorityChange} disabled={disabled}>
          <option value="" disabled>优先级</option>
          {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      )}
      {canEdit && tags && tags.length > 0 && (onBatchAddTags || onBatchRemoveTags) && (
        <>
          {onBatchAddTags && (
            <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-card max-w-[120px]" defaultValue="" onChange={handleAddTagChange} disabled={disabled}>
              <option value="" disabled>+标签</option>
              {tags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {onBatchRemoveTags && (
            <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-card max-w-[120px]" defaultValue="" onChange={handleRemoveTagChange} disabled={disabled}>
              <option value="" disabled>-标签</option>
              {tags.map(t => <option key={'rm-' + t} value={t}>{t}</option>)}
            </select>
          )}
        </>
      )}
      {canEdit && showDateFields && onBatchSetDate && dateFields && dateFields.length > 0 && (
        dateFields.map(df => (
          <label key={df.key} className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar size={12} />{df.label}
            <input type="date" className="text-xs border border-border rounded px-1 py-0.5 bg-card" onChange={handleDateChange(df.key)} disabled={disabled} />
          </label>
        ))
      )}
      {canEdit && moveTargets && moveTargets.length > 0 && onBatchMove && (
        <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-card max-w-[140px]" defaultValue="" onChange={handleMoveChange} disabled={disabled}>
          <option value="" disabled>{moveLabel || '移动到'}</option>
          {moveTargets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      )}
      <button onClick={clearSelection} className="flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted rounded">
        <X size={12} /> 清空
      </button>
    </div>
  );
});
