/**
 * BatchActionBar — 统一的批量操作工具栏
 * 通用: 已选计数 / 删除 / 改状态 / 分配人 / 清空
 */
import React, { useCallback } from 'react';
import { Trash2, X, User, RefreshCw, CheckSquare } from 'lucide-react';
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
  onBatchDelete: (ids: string[]) => void;
  onBatchStatus: (ids: string[], status: string) => void;
  onBatchAssign: (ids: string[], assigneeId: string) => void;
  canDelete: boolean;
  canEdit: boolean;
}

export const BatchActionBar = React.memo(function BatchActionBar({
  selection, filteredCount, filteredIds, itemLabel,
  statuses, members, onBatchDelete, onBatchStatus, onBatchAssign,
  canDelete, canEdit,
}: BatchActionBarProps) {
  const { selectedIds, selectAll, clearSelection, exitBatchMode } = selection;
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));

  const handleSelectAll = useCallback(() => {
    if (allSelected) clearSelection();
    else selectAll(filteredIds);
  }, [allSelected, clearSelection, selectAll, filteredIds]);

  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const msg = `确定删除选中的 ${selectedIds.size} 个${itemLabel}？此操作不可撤销。`;
    if (!window.confirm(msg)) return;
    onBatchDelete(Array.from(selectedIds));
    exitBatchMode();
  }, [selectedIds, itemLabel, onBatchDelete, exitBatchMode]);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (selectedIds.size === 0 || !e.target.value) return;
    onBatchStatus(Array.from(selectedIds), e.target.value);
    e.target.value = '';
  }, [selectedIds, onBatchStatus]);

  const handleAssignChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (selectedIds.size === 0 || !e.target.value) return;
    onBatchAssign(Array.from(selectedIds), e.target.value);
    e.target.value = '';
  }, [selectedIds, onBatchAssign]);

  return (
    <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 mr-1">
      <CheckSquare size={14} className="text-primary" />
      <span className="text-xs font-medium text-primary">已选 {selectedIds.size} 项</span>
      <button onClick={handleSelectAll} className="text-xs text-primary hover:underline ml-1">
        {allSelected ? '全不选' : `全选(${filteredCount})`}
      </button>
      {canDelete && (
        <button onClick={handleDelete} className="flex items-center gap-1 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 rounded" disabled={selectedIds.size === 0}>
          <Trash2 size={12} /> 删除
        </button>
      )}
      {canEdit && (
        <select
          className="text-xs border border-border rounded px-1.5 py-0.5 bg-card"
          defaultValue=""
          onChange={handleStatusChange}
          disabled={selectedIds.size === 0}
        >
          <option value="" disabled>改状态</option>
          {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )}
      {canEdit && members.length > 0 && (
        <select
          className="text-xs border border-border rounded px-1.5 py-0.5 bg-card max-w-[120px]"
          defaultValue=""
          onChange={handleAssignChange}
          disabled={selectedIds.size === 0}
        >
          <option value="" disabled>分配给</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      <button onClick={clearSelection} className="flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted rounded">
        <X size={12} /> 清空
      </button>
    </div>
  );
});
