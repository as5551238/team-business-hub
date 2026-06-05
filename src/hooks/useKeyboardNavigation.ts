import { useEffect, useRef, useCallback } from 'react';
import type { Action } from '@/store/types';

interface KeyboardNavConfig {
  /** e.g. 'UPDATE_GOAL' | 'UPDATE_TASK' | 'UPDATE_PROJECT' */
  updateActionType: string;
  /** e.g. 'DELETE_GOAL' | 'DELETE_TASK' | 'DELETE_PROJECT' */
  deleteActionType: string;
  /** Permission for edit */
  editPermission: string;
  /** Permission for delete */
  deletePermission: string;
  /** The filtered items list */
  filteredItems: Array<{ id: string }>;
  /** Currently focused item ID */
  focusedId: string | null;
  /** Set focused ID */
  setFocusedId: (id: string | null) => void;
  /** Dispatch function */
  dispatch: (action: { type: string; payload: unknown }) => void;
  /** Permission check */
  can: (perm: string) => boolean;
  /** Whether batch mode is active */
  batchMode: boolean;
  /** Toggle batch selection for an item */
  onToggleSelect: (id: string) => void;
  /** Select all visible items */
  onSelectAll: () => void;
  /** Clear batch selection */
  clearSelection: () => void;
  /** Toggle batch mode on/off */
  toggleBatchMode: () => void;
  /** Set detail item (for open/edit) */
  setDetailItem?: (item: { type: string; id: string }) => void;
  /** Item type for setDetailItem, e.g. 'goal' */
  itemType?: string;
  /** Switch view handler */
  switchView?: () => void;
  /** Focus filter input */
  focusFilter?: () => void;
}

/**
 * Centralized keyboard navigation hook for entity list pages (Goals/Tasks/Projects).
 * Uses refs internally to avoid re-registering event listeners on every filter/change.
 */
export function useKeyboardNavigation(config: KeyboardNavConfig) {
  const {
    updateActionType, deleteActionType,
    editPermission, deletePermission,
    filteredItems, focusedId, setFocusedId,
    dispatch, can, batchMode, onToggleSelect,
    onSelectAll, clearSelection, toggleBatchMode,
    setDetailItem, itemType, switchView, focusFilter,
  } = config;

  // Use refs for values that change frequently but shouldn't re-register listeners
  const filteredItemsRef = useRef(filteredItems);
  filteredItemsRef.current = filteredItems;
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const batchModeRef = useRef(batchMode);
  batchModeRef.current = batchMode;

  useEffect(() => {
    const ids = () => filteredItemsRef.current.map(i => i.id);
    const getFocusedIdx = () => { const fId = focusedIdRef.current; if (!fId) return 0; const idx = ids().indexOf(fId); return idx >= 0 ? idx : 0; };

    const onNavDown = () => {
      const list = ids();
      if (list.length === 0) return;
      const next = Math.min(getFocusedIdx() + 1, list.length - 1);
      setFocusedId(list[next]);
    };
    const onNavUp = () => {
      const list = ids();
      if (list.length === 0) return;
      const prev = Math.max(getFocusedIdx() - 1, 0);
      setFocusedId(list[prev]);
    };
    const onEdit = () => {
      const fId = focusedIdRef.current;
      if (!fId || !setDetailItem || !itemType) return;
      setDetailItem({ type: itemType, id: fId });
    };
    const onOpen = () => {
      const fId = focusedIdRef.current;
      if (!fId || !setDetailItem || !itemType) return;
      setDetailItem({ type: itemType, id: fId });
    };
    const onDelete = () => {
      const fId = focusedIdRef.current;
      if (!fId || !can(deletePermission)) return;
      if (confirm(`确认删除？`)) {
        dispatch({ type: deleteActionType, payload: fId });
      }
    };
    const onComplete = () => {
      const fId = focusedIdRef.current;
      if (!fId || !can(editPermission)) return;
      dispatch({ type: updateActionType, payload: { id: fId, updates: { status: 'done' } } });
    };
    const onFocusFilter = () => { focusFilter?.(); };
    const onSwitchView = () => { switchView?.(); };
    const onToggleBatch = () => { toggleBatchMode(); };
    const onSelectAll = () => {
      if (batchModeRef.current) { onSelectAll(); } else { toggleBatchMode(); setTimeout(onSelectAll, 0); }
    };

    const handlers: Record<string, () => void> = {
      'tbh-nav-down': onNavDown,
      'tbh-nav-up': onNavUp,
      'tbh-edit-selected': onEdit,
      'tbh-open-selected': onOpen,
      'tbh-delete-selected': onDelete,
      'tbh-complete-selected': onComplete,
      'tbh-focus-filter': onFocusFilter,
      'tbh-switch-view': onSwitchView,
      'tbh-toggle-batch': onToggleBatch,
      'tbh-select-all': onSelectAll,
    };

    const entries = Object.entries(handlers);
    entries.forEach(([event, handler]) => window.addEventListener(event, handler));

    return () => {
      entries.forEach(([event, handler]) => window.removeEventListener(event, handler));
    };
  }, [updateActionType, deleteActionType, editPermission, deletePermission, dispatch, can, onToggleSelect, onSelectAll, clearSelection, toggleBatchMode, setDetailItem, itemType, switchView, focusFilter, setFocusedId]);
}
