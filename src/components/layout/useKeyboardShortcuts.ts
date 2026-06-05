import { useEffect, useRef } from 'react';
import type { Page } from './Layout';
import type { Action } from '@/store/types';

interface UseKeyboardShortcutsParams {
  goToPage: (page: Page) => void;
  closeAllDropdowns: () => void;
  dispatch: React.Dispatch<Action>;
  cycleSidebarMode: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setQuickCreateOpen: (open: boolean) => void;
  setQuickCreateType: (type: 'task' | 'goal' | 'project') => void;
  setShortcutHelpOpen: (open: boolean) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useKeyboardShortcuts({
  goToPage,
  closeAllDropdowns,
  dispatch,
  cycleSidebarMode,
  setCommandPaletteOpen,
  setQuickCreateOpen,
  setQuickCreateType,
  setShortcutHelpOpen,
  searchInputRef,
}: UseKeyboardShortcutsParams) {
  const keyBufferRef = useRef('');
  const keyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;

      // --- Always-active shortcuts (even in inputs) ---
      if (isInput) {
        if (e.key === 'Escape') { (e.target as HTMLElement).blur(); closeAllDropdowns(); }
        return;
      }

      // --- Modifier shortcuts (Cmd/Ctrl) ---
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
      if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
      if (mod && e.key === 'k') { e.preventDefault(); setCommandPaletteOpen(true); return; }
      if (mod && e.key === 'a') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-select-all')); return; }
      if (mod && !e.shiftKey && e.key === 'n') { e.preventDefault(); setQuickCreateType('task'); setQuickCreateOpen(true); return; }
      if (mod && e.shiftKey && e.key === 'N') { e.preventDefault(); setQuickCreateType('goal'); setQuickCreateOpen(true); return; }
      if (mod && e.shiftKey && e.key === 'P') { e.preventDefault(); setQuickCreateType('project'); setQuickCreateOpen(true); return; }
      if (mod && e.key === 'g') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-open-gantt')); return; }
      if (mod && e.key === 'f') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-focus-filter')); return; }
      if (mod && e.key === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-save-current')); return; }
      if (mod && e.key === ',') { e.preventDefault(); goToPage('admin'); return; }
      // S3-2a: Ctrl+D = duplicate/clone selected item
      if (mod && e.key === 'd') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-duplicate-selected')); return; }
      // S3-2c: Ctrl+E = archive (soft-delete) selected item
      if (mod && e.key === 'e') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-archive-selected')); return; }

      // --- g-prefix (Vim-style navigation) — check BEFORE single-key shortcuts to avoid conflicts ---
      if (keyBufferRef.current === 'g') {
        keyBufferRef.current = '';
        if (keyTimerRef.current) { clearTimeout(keyTimerRef.current); keyTimerRef.current = null; }
        const gNav: Record<string, Page> = { d: 'dashboard', o: 'goals', p: 'projects', t: 'tasks', i: 'insight', a: 'admin', k: 'knowledge' };
        if (gNav[e.key]) { goToPage(gNav[e.key]); return; }
        // gg: scroll to top
        if (e.key === 'g') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        // Not a recognized g-prefix combo — fall through to single-key handling
      }

      // Bug10 fix: Skip single-key shortcuts when modifier keys are held
      // (e.g. Ctrl+C copy should NOT trigger 'c' quick create)
      if (mod) return;

      // --- Single key shortcuts ---
      // Escape: close dropdowns / command palette / detail panel
      if (e.key === 'Escape') { closeAllDropdowns(); setCommandPaletteOpen(false); window.dispatchEvent(new CustomEvent('tbh-close-detail-panel')); return; }

      // / : focus search
      if (e.key === '/') { e.preventDefault(); searchInputRef.current?.focus(); return; }

      // ? : show keyboard help (via command palette with shortcut filter)
      if (e.key === '?') { e.preventDefault(); setShortcutHelpOpen(true); return; }

      // [ / ] : sidebar toggle
      if (e.key === '[') { e.preventDefault(); cycleSidebarMode(); return; }
      if (e.key === ']') { e.preventDefault(); cycleSidebarMode(); return; }

      // S3-2a: ArrowUp/Down for list navigation (in addition to j/k)
      if (e.key === 'ArrowDown') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-nav-down')); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-nav-up')); return; }

      // 1-7: quick navigation
      const navMap: Record<string, Page> = { '1': 'dashboard', '2': 'goals', '3': 'projects', '4': 'tasks', '5': 'insight', '6': 'knowledge', '7': 'admin' };
      if (navMap[e.key]) { goToPage(navMap[e.key]); return; }

      // c: quick create (task by default)
      if (e.key === 'c') { e.preventDefault(); setQuickCreateType('task'); setQuickCreateOpen(true); return; }

      // e: edit selected item
      if (e.key === 'e') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-edit-selected')); return; }

      // d: delete selected item
      if (e.key === 'd') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-delete-selected')); return; }

      // x: toggle complete for selected task
      if (e.key === 'x') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-complete-selected')); return; }

      // j/k: navigate up/down in list
      if (e.key === 'j') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-nav-down')); return; }
      if (e.key === 'k') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-nav-up')); return; }

      // Enter: open selected item
      if (e.key === 'Enter') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-open-selected')); return; }

      // f: focus filter
      if (e.key === 'f') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-focus-filter')); return; }

      // t/v/l: switch view modes (table/board/list)
      if (e.key === 't') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-switch-view', { detail: 'table' })); return; }
      if (e.key === 'v') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-switch-view', { detail: 'board' })); return; }
      if (e.key === 'l') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-switch-view', { detail: 'list' })); return; }

      // b: toggle batch mode
      if (e.key === 'b') { e.preventDefault(); window.dispatchEvent(new CustomEvent('tbh-toggle-batch')); return; }

      // --- g-prefix start (store 'g' and wait for next key) ---
      if (e.key === 'g') {
        keyBufferRef.current = 'g';
        if (keyTimerRef.current) clearTimeout(keyTimerRef.current);
        keyTimerRef.current = setTimeout(() => { keyBufferRef.current = ''; }, 500);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goToPage, closeAllDropdowns, dispatch, cycleSidebarMode]);
}
