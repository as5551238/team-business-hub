import { useEffect, useRef } from 'react';

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
  /** Switch view handler — receives mode string from CustomEvent.detail if present */
  switchView?: (mode?: string) => void;
  /** Focus filter input */
  focusFilter?: () => void;
  /** Override the default complete behavior (set status=done). Allows toggle logic. */
  onCompleteOverride?: (focusedId: string) => void;
}

/**
 * Centralized keyboard navigation hook for entity list pages (Goals/Tasks/Projects).
 * Uses refs internally to avoid re-registering event listeners on every filter/change.
 *
 * Features:
 * - j/k navigation through filtered items
 * - Edit/Open focused item via detail panel
 * - Delete with confirmation
 * - Complete (or custom via onCompleteOverride)
 * - Focus filter input, switch view, batch toggle/select-all
 * - Auto-reset focusedId when item leaves filtered list
 */
export function useKeyboardNavigation(config: KeyboardNavConfig) {
  const {
    updateActionType, deleteActionType,
    editPermission, deletePermission,
    filteredItems, focusedId, setFocusedId,
    dispatch, can, batchMode, onToggleSelect,
    onSelectAll, clearSelection, toggleBatchMode,
    setDetailItem, itemType, switchView, focusFilter,
    onCompleteOverride,
  } = config;

  // Use refs for values that change frequently but shouldn't re-register listeners
  const filteredItemsRef = useRef(filteredItems);
  filteredItemsRef.current = filteredItems;
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const batchModeRef = useRef(batchMode);
  batchModeRef.current = batchMode;

  // Auto-reset focusedId when the focused item leaves the filtered list
  useEffect(() => {
    if (focusedId && !filteredItems.some(i => i.id === focusedId)) {
      setFocusedId(null);
    }
  }, [filteredItems, focusedId, setFocusedId]);

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
      if (onCompleteOverride) {
        onCompleteOverride(fId);
      } else {
        dispatch({ type: updateActionType, payload: { id: fId, updates: { status: 'done' } } });
      }
    };
    const onFocusFilter = () => { focusFilter?.(); };
    const onSwitchView = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      switchView?.(detail);
    };
    const onToggleBatch = () => { toggleBatchMode(); };
    const onBatchSelectAll = () => {
      if (batchModeRef.current) { onSelectAll(); } else { toggleBatchMode(); setTimeout(onSelectAll, 0); }
    };

    const handlers: Record<string, (e?: Event) => void> = {
      'tbh-nav-down': onNavDown,
      'tbh-nav-up': onNavUp,
      'tbh-edit-selected': onEdit,
      'tbh-open-selected': onOpen,
      'tbh-delete-selected': onDelete,
      'tbh-complete-selected': onComplete,
      'tbh-focus-filter': onFocusFilter,
      'tbh-switch-view': onSwitchView,
      'tbh-toggle-batch': onToggleBatch,
      'tbh-select-all': onBatchSelectAll,
    };

    const entries = Object.entries(handlers);
    entries.forEach(([event, handler]) => window.addEventListener(event, handler));

    return () => {
      entries.forEach(([event, handler]) => window.removeEventListener(event, handler));
    };
  }, [updateActionType, deleteActionType, editPermission, deletePermission, dispatch, can, onToggleSelect, onSelectAll, clearSelection, toggleBatchMode, setDetailItem, itemType, switchView, focusFilter, setFocusedId, onCompleteOverride]);
}
