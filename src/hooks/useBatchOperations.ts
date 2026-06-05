import { useCallback, useRef } from 'react';
import { pushBatchUndo } from '@/store/undo';
import { handleError } from '@/lib/errorHandler';

interface BatchOpsConfig<T> {
  /** e.g. 'goal' | 'task' | 'project' */
  entityType: string;
  /** e.g. 'UPDATE_GOAL' | 'UPDATE_TASK' | 'UPDATE_PROJECT' */
  updateActionType: string;
  /** e.g. 'DELETE_GOAL' | 'DELETE_TASK' | 'DELETE_PROJECT' */
  deleteActionType: string;
  /** Permission string for edit, e.g. 'goals_edit' */
  editPermission: string;
  /** Permission string for delete, e.g. 'goals_delete' */
  deletePermission: string;
  /** Chinese label for undo messages, e.g. '目标' */
  entityLabel: string;
  /** Current items array (will be read via ref for stable deps) */
  items: T[];
  /** Function to find an item's ID */
  getItemId: (item: T) => string;
  /** Dispatch function */
  dispatch: (action: { type: string; payload: unknown }) => void;
  /** Permission check function */
  can: (perm: string) => boolean;
  /** Clear selection after batch op */
  clearSelection: () => void;
  /** Exit batch mode after delete */
  exitBatchMode: () => void;
  /** Selected IDs */
  selectedIds: Set<string>;
  /** Whether to show toast notifications */
  showToast?: boolean;
}

/** Default date field getter — override for task-specific fields like 'dueDate' */
function getDefaultDateField(_entityType: string): string { return 'endDate'; }

export function useBatchOperations<T extends Record<string, unknown>>(config: BatchOpsConfig<T>) {
  const {
    entityType, updateActionType, deleteActionType,
    editPermission, deletePermission, entityLabel,
    items, getItemId, dispatch, can, clearSelection, exitBatchMode,
    selectedIds, showToast = false,
  } = config;

  // Use ref for items to avoid unstable deps
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  function getIds(): string[] { return Array.from(selectedIdsRef.current); }
  function findItem(id: string): T | undefined { return itemsRef.current.find(x => getItemId(x) === id); }

  function toast(message: string, module: string, operation: string) {
    if (!showToast) return;
    try { window.dispatchEvent(new CustomEvent('tbh-toast', { detail: { message, type: 'success' } })); } catch (e) { handleError(e, { module, operation, severity: 'debug' }); }
  }

  const batchDelete = useCallback(() => {
    if (!can(deletePermission)) return;
    const ids = getIds();
    if (!confirm(`确认删除选中的 ${ids.length} 个${entityLabel}？`)) return;
    ids.forEach(id => dispatch({ type: deleteActionType, payload: id }));
    exitBatchMode();
    toast(`已删除 ${ids.length} 个${entityLabel}`, entityType, 'BATCH_DELETE');
  }, [can, deletePermission, deleteActionType, dispatch, exitBatchMode, entityType, entityLabel, showToast]);

  const batchUpdateStatus = useCallback((status: string) => {
    if (!can(editPermission)) return;
    if (!status) return;
    const ids = getIds();
    const inverses = ids.map(id => {
      const item = findItem(id);
      return { type: updateActionType as `${string}`, payload: { id, updates: { status: (item as Record<string, unknown>)?.status || 'todo' } } };
    });
    ids.forEach(id => dispatch({ type: updateActionType, payload: { id, updates: { status } } }));
    pushBatchUndo(inverses, undefined, `批量修改${entityLabel}状态`);
    clearSelection();
    toast(`已更新 ${ids.length} 个${entityLabel}状态`, entityType, 'BATCH_UPDATE');
  }, [can, editPermission, updateActionType, dispatch, clearSelection, entityType, entityLabel, showToast]);

  const batchAssign = useCallback((leaderId: string) => {
    if (!can(editPermission)) return;
    if (!leaderId) return;
    const ids = getIds();
    const inverses = ids.map(id => {
      const item = findItem(id);
      return { type: updateActionType as `${string}`, payload: { id, updates: { leaderId: (item as Record<string, unknown>)?.leaderId || '' } } };
    });
    ids.forEach(id => dispatch({ type: updateActionType, payload: { id, updates: { leaderId } } }));
    pushBatchUndo(inverses, undefined, `批量分配${entityLabel}`);
    clearSelection();
    toast(`已分配 ${ids.length} 个${entityLabel}`, entityType, 'BATCH_ASSIGN');
  }, [can, editPermission, updateActionType, dispatch, clearSelection, entityType, entityLabel, showToast]);

  const batchUpdatePriority = useCallback((priority: string) => {
    if (!can(editPermission)) return;
    const ids = getIds();
    const inverses = ids.map(id => {
      const item = findItem(id);
      return { type: updateActionType as `${string}`, payload: { id, updates: { priority: (item as Record<string, unknown>)?.priority || 'medium' } } };
    });
    ids.forEach(id => dispatch({ type: updateActionType, payload: { id, updates: { priority } } }));
    pushBatchUndo(inverses, undefined, `批量修改${entityLabel}优先级`);
    clearSelection();
    toast(`已更新 ${ids.length} 个${entityLabel}优先级`, entityType, 'BATCH_PRIORITY');
  }, [can, editPermission, updateActionType, dispatch, clearSelection, entityType, entityLabel, showToast]);

  const batchAddTags = useCallback((newTags: string[]) => {
    if (!can(editPermission)) return;
    const ids = getIds();
    const inverses = ids.map(id => {
      const item = findItem(id);
      return { type: updateActionType as `${string}`, payload: { id, updates: { tags: (item as Record<string, unknown>)?.tags || [] } } };
    });
    ids.forEach(id => {
      const item = findItem(id);
      if (item) {
        const merged = [...new Set([...((item as Record<string, unknown>)?.tags as string[] || []), ...newTags])];
        dispatch({ type: updateActionType, payload: { id, updates: { tags: merged } } });
      }
    });
    pushBatchUndo(inverses, undefined, `批量添加${entityLabel}标签`);
    clearSelection();
    toast(`已为 ${ids.length} 个${entityLabel}添加标签`, entityType, 'BATCH_ADD_TAGS');
  }, [can, editPermission, updateActionType, dispatch, clearSelection, entityType, entityLabel, showToast]);

  const batchRemoveTags = useCallback((removeTags: string[]) => {
    if (!can(editPermission)) return;
    const ids = getIds();
    const inverses = ids.map(id => {
      const item = findItem(id);
      return { type: updateActionType as `${string}`, payload: { id, updates: { tags: (item as Record<string, unknown>)?.tags || [] } } };
    });
    ids.forEach(id => {
      const item = findItem(id);
      if (item) {
        const filtered = ((item as Record<string, unknown>)?.tags as string[] || []).filter(t => !removeTags.includes(t));
        dispatch({ type: updateActionType, payload: { id, updates: { tags: filtered } } });
      }
    });
    pushBatchUndo(inverses, undefined, `批量移除${entityLabel}标签`);
    clearSelection();
    toast(`已移除 ${ids.length} 个${entityLabel}的标签`, entityType, 'BATCH_REMOVE_TAGS');
  }, [can, editPermission, updateActionType, dispatch, clearSelection, entityType, entityLabel, showToast]);

  const batchSetDate = useCallback((field: string, value: string) => {
    if (!can(editPermission)) return;
    const ids = getIds();
    const inverses = ids.map(id => {
      const item = findItem(id) as Record<string, unknown> | undefined;
      const oldVal = field === 'dueDate' ? item?.dueDate : field === 'endDate' ? item?.endDate : field === 'startDate' ? item?.startDate : null;
      return { type: updateActionType as `${string}`, payload: { id, updates: { [field]: oldVal || '' } } };
    });
    ids.forEach(id => dispatch({ type: updateActionType, payload: { id, updates: { [field]: value || '' } } }));
    pushBatchUndo(inverses, undefined, `批量设置${entityLabel}日期`);
    clearSelection();
    toast(`已设置 ${ids.length} 个${entityLabel}日期`, entityType, 'BATCH_DATE');
  }, [can, editPermission, updateActionType, dispatch, clearSelection, entityType, entityLabel, showToast]);

  /** Entity-specific batch move — caller provides the field name and undo label */
  const batchMoveTo = useCallback((field: string, value: string | null, undoLabel: string) => {
    if (!can(editPermission)) return;
    const ids = getIds();
    const inverses = ids.map(id => {
      const item = findItem(id) as Record<string, unknown> | undefined;
      return { type: updateActionType as `${string}`, payload: { id, updates: { [field]: (item as Record<string, unknown>)?.[field] || null } } };
    });
    ids.forEach(id => dispatch({ type: updateActionType, payload: { id, updates: { [field]: value } } }));
    pushBatchUndo(inverses, undefined, undoLabel);
    clearSelection();
    toast(`${undoLabel}`, entityType, 'BATCH_MOVE');
  }, [can, editPermission, updateActionType, dispatch, clearSelection, entityType, showToast]);

  return { batchDelete, batchUpdateStatus, batchAssign, batchUpdatePriority, batchAddTags, batchRemoveTags, batchSetDate, batchMoveTo };
}
