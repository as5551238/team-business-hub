/**
 * Selector-based subscription infrastructure for store.
 * Components using useStoreSelector only re-render when their selected slice changes.
 * Uses a pub/sub pattern with useSyncExternalStore.
 */
import React, { useContext, useCallback, useRef, useSyncExternalStore } from 'react';
import type { AppState } from '@/types';
import { ensureAppStateDefaults } from './types';
import { ActionsContext, type ActionsContextType } from './useStore';

// Global listener registry
const selectorListeners = new Set<() => void>();
let selectorStateVersion = 0;

function subscribeToSelectors(listener: () => void): () => void {
  selectorListeners.add(listener);
  return () => selectorListeners.delete(listener);
}

function getSelectorVersion(): number {
  return selectorStateVersion;
}

/** Called after every dispatch to notify selector subscribers */
export function notifySelectorListeners() {
  selectorStateVersion++;
  selectorListeners.forEach(l => l());
}

// Shallow equality comparison (handles Date and NaN)
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a !== a && b !== b) return true; // NaN check
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i])) return false; }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    const va = (a as Record<string, unknown>)[k];
    const vb = (b as Record<string, unknown>)[k];
    if (va !== vb && !(va !== va && vb !== vb)) return false;
  }
  return true;
}

/**
 * Selector-based subscription: components only re-render when the selected slice changes.
 * Uses a pub/sub pattern with useSyncExternalStore to completely avoid StateContext subscriptions.
 */
export function useStoreSelector<T>(selector: (state: AppState) => T): T {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('useStoreSelector must be used within StoreProvider');

  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const stateRef = actions.stateRef as React.MutableRefObject<AppState>;
  const prevRef = useRef<T | null>(null);

  const getSnapshot = useCallback((): T => {
    const s = stateRef.current;
    const safeState = (s && Array.isArray(s.members)) ? s : ensureAppStateDefaults(s || ({} as AppState));
    const result = selectorRef.current(safeState);
    if (prevRef.current !== null && shallowEqual(result, prevRef.current)) {
      return prevRef.current;
    }
    prevRef.current = result;
    return result;
  }, [stateRef]);

  const version = useSyncExternalStore(
    subscribeToSelectors,
    getSelectorVersion,
    getSelectorVersion,
  );

  // version change triggers re-read via getSnapshot
  return getSnapshot();
}
