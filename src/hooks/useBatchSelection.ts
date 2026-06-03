/**
 * useBatchSelection — 统一的批量选择逻辑
 * 支持: 逐项切换 / Ctrl+A全选 / Shift+Click范围选 / 全不选
 */
import { useState, useCallback, useRef } from 'react';

export interface BatchSelectionState {
  batchMode: boolean;
  selectedIds: Set<string>;
  toggleBatchMode: () => void;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  selectRange: (fromId: string, toId: string, orderedIds: string[]) => void;
  clearSelection: () => void;
  exitBatchMode: () => void;
  /** 最后一次点击的 id — 用于 Shift+Click 范围选的锚点 */
  lastSelectedId: string | null;
}

export function useBatchSelection(): BatchSelectionState {
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);

  const toggleBatchMode = useCallback(() => {
    setBatchMode(prev => {
      if (prev) {
        // 退出时清空选择
        setSelectedIds(new Set());
        lastSelectedIdRef.current = null;
      }
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    lastSelectedIdRef.current = id;
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
    lastSelectedIdRef.current = ids.length > 0 ? ids[ids.length - 1] : null;
  }, []);

  const selectRange = useCallback((fromId: string, toId: string, orderedIds: string[]) => {
    const fromIdx = orderedIds.indexOf(fromId);
    const toIdx = orderedIds.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    const rangeIds = orderedIds.slice(start, end + 1);
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const id of rangeIds) next.add(id);
      return next;
    });
    lastSelectedIdRef.current = toId;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  return {
    batchMode,
    selectedIds,
    toggleBatchMode,
    toggleSelect,
    selectAll,
    selectRange,
    clearSelection,
    exitBatchMode,
    lastSelectedId: lastSelectedIdRef.current,
  };
}
