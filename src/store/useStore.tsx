import { handleError } from '@/lib/errorHandler';
import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState, useMemo, type ReactNode } from 'react';
import type { AppState } from '@/types';
import { getSupabaseClient, initSupabase, resetSupabase } from '@/supabase/client';
import type { ConnectionMode, SupabaseConfig, Action } from './types';
import { SUPABASE_CONFIG_KEY, ensureAppStateDefaults, toCamel } from './types';
import { reducer } from './reducer';
import { pushUndo, popUndo, popRedo, canUndo, canRedo, getUndoLabel, getRedoLabel, clearUndoStack } from './undo';
import { loadLocalState, saveLocalStateImmediate, fetchAllFromSupabase, supabaseUpsert, setOnWriteError, setOnConflict, setCurrentTeamId } from './supabase';
import { setRLSContext } from '@/supabase/client';
import { CURRENT_USER_KEY } from './types';
import { generateAllData } from '@/data/dataGenerator';
import { ACTION_TO_TABLE, ACTION_TO_EVENT } from './actionMaps';
import { notifySelectorListeners } from './selectorSystem';
import { initRealtimeModule, setupRealtime, cleanupRealtime, destroyRealtimeModule } from './realtime';
import { syncPlanTier } from '@/lib/ai/types';

// Timeout wrapper for fetch operations — prevents infinite "连接中..." when Supabase is down
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时(${ms / 1000}s)`)), ms)),
  ]);
}

// --- Split Context Pattern ---
// StateContext: only changes when state changes (consumed by components needing data)
// ActionsContext: stable reference, never changes due to state updates (dispatch, methods)
interface ActionsContextType {
  dispatch: React.Dispatch<Action>;
  connectSupabase: (url: string, anonKey: string) => Promise<boolean>;
  disconnectSupabase: () => void;
  initializeSupabaseData: () => Promise<boolean>;
  connectionMode: ConnectionMode;
  connectionError: string | null;
  stateRef: React.RefObject<AppState>;
  undoInfo: { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null };
}

const StateContext = createContext<AppState | null>(null);
export const ActionsContext = createContext<ActionsContextType | null>(null);

import { setAsyncDispatch } from '@/store/shared';
import { setCollabDispatch } from '@/lib/collab';
import { trackBehavior, setBehaviorUserId } from '@/store/behaviorTracking';

// Module-level dispatch bridge for collab operations (set by StoreProvider)
let _collabDispatch: ((action: Action) => void) | null = null;
function collabDispatch(action: Action) { _collabDispatch?.(action); }

// Re-export batch undo for use in page components
export { pushBatchUndo } from './undo';
// Re-export selector system for consumer use
export { useStoreSelector } from './selectorSystem';

// Store context approach (stable and proven)
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadLocalState);
  const [connectionMode, setConnectionMode] = useReducer((_: ConnectionMode, v: ConnectionMode) => v, 'local' as ConnectionMode);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const realtimeChannels = useRef<unknown[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineWriteCountRef = useRef(0);

  // State ref for selector-based subscriptions (avoids full context re-render)
  const stateRef = useRef(state);
  stateRef.current = state;

  const [undoCounter, setUndoCounter] = useState(0);

  // P3#9 fix: Realtime dedup — shared lastWriteAt map accessible to trackedDispatch
  const lastWriteAtRef = useRef<Record<string, number>>({});

  // Dispatch proxy that tracks offline writes for Layout.tsx badge + undo/redo
  const trackedDispatch = useCallback((action: Action) => {
    // Handle undo/redo special actions
    if (action.type === 'UNDO') {
      const inverseAction = popUndo();
      if (inverseAction) {
        if (Array.isArray(inverseAction)) {
          // Batch undo: dispatch all inverse actions, skip undo recording
          inverseAction.forEach(a => dispatch({ ...a, _skipUndo: true }));
        } else {
          dispatch({ ...inverseAction, _skipUndo: true });
        }
        setUndoCounter(c => c + 1);
        notifySelectorListeners();
      }
      return;
    }
    if (action.type === 'REDO') {
      const redoAction = popRedo();
      if (redoAction) {
        if (Array.isArray(redoAction)) {
          redoAction.forEach(a => dispatch({ ...a, _skipUndo: true }));
        } else {
          dispatch({ ...redoAction, _skipUndo: true });
        }
        setUndoCounter(c => c + 1);
        notifySelectorListeners();
      }
      return;
    }
    dispatch(action);
    // P0: 行为事件采集（fire-and-forget，不阻塞主流程）
    trackBehavior(action);
    // Notify selector subscribers of state change
    notifySelectorListeners();
    // Track for undo — P3#29 fix: only increment counter when action was actually undoable
    if (action.type) { const pushed = pushUndo(action); if (pushed) setUndoCounter(c => c + 1); }
    // P3#9 fix: record lastWriteAt for Realtime dedup
    if (action.type && typeof action.type === 'string' && (action.type.startsWith('ADD_') || action.type.startsWith('UPDATE_') || action.type.startsWith('DELETE_'))) {
      const table = ACTION_TO_TABLE[action.type];
      const evtType = ACTION_TO_EVENT[action.type];
      if (table && evtType) {
        const writeKey = `${table}:${evtType}`;
        lastWriteAtRef.current[writeKey] = Date.now();
      }
    }
    // Track offline writes
    if (action.type && action.type !== 'MERGE_STATE' && action.type !== 'SET_STATE' && action.type !== 'MARK_NOTIFICATION_READ' && action.type !== 'MARK_ALL_NOTIFICATIONS_READ') {
      try {
        if (localStorage.getItem('tbh-went-offline-at')) {
          offlineWriteCountRef.current++;
          localStorage.setItem('tbh-offline-writes', String(offlineWriteCountRef.current));
        }
      } catch (e) { handleError(e, { module: 'store', operation: 'OFFLINE_WRITE_TRACK', severity: 'debug' }); }
    }
  }, []);

  // Wire up write-error notification (STA-01)
  useEffect(() => {
    setOnWriteError((msg: string) => {
      dispatch({ type: 'ADD_NOTIFICATION', payload: { id: `err-${Date.now()}`, type: 'error', title: '同步失败', message: msg, read: false, createdAt: new Date().toISOString() } });
    });
    // S3-1a: Auto-rollback on optimistic lock conflict — fetch latest version & dispatch REALTIME_UPSERT
    setOnConflict((table: string, id: string) => {
      const sb = getSupabaseClient();
      if (!sb) return;
      sb.from(table).select('*').eq('id', id).single().then(({ data }) => {
        if (data) {
          const camelItem = toCamel(data);
          dispatch({ type: 'REALTIME_UPSERT', payload: { table, item: camelItem } });
        }
      }).catch((e: unknown) => { handleError(e, { module: 'store', operation: 'CONFLICT_FETCH', severity: 'warn' }); });
    });
    return () => { setOnWriteError(() => {}); setOnConflict(() => {}); };
  }, [dispatch]);

  // Bridge collab dispatch (used by collab.ts + ai_action pipeline)
  useEffect(() => {
    _collabDispatch = trackedDispatch;
    setAsyncDispatch(trackedDispatch);
    setCollabDispatch(trackedDispatch);
    return () => { _collabDispatch = null; setAsyncDispatch(() => {}); setCollabDispatch(() => {}); };
  }, [trackedDispatch]);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const doSave = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => saveLocalStateImmediate(stateRef.current));
      } else {
        saveLocalStateImmediate(stateRef.current);
      }
    };
    debounceTimerRef.current = setTimeout(doSave, 2000);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        saveLocalStateImmediate(stateRef.current);
      }
    };
  }, [state]);

  // Ensure localStorage is saved before page unload/refresh
  useEffect(() => {
    const handler = () => { saveLocalStateImmediate(stateRef.current); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // No separate immediate-save effect: the 2s debounce above already handles persistence.
  // The old per-render localStorage write was removed — it caused I/O blocking on every render.

  useEffect(() => {
    try {
      const configStr = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (configStr) {
        const config: SupabaseConfig = JSON.parse(configStr);
        if (config.url && config.anonKey) doConnect(config.url, config.anonKey);
      } else {
        const defaultUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const defaultKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        if (defaultUrl && defaultKey) doConnect(defaultUrl, defaultKey);
      }
    } catch (e) {
      handleError(e, { module: 'store', operation: 'LOAD_SUPABASE_CONFIG', severity: 'debug' });
    }
    return () => { connectSeqRef.current++; cleanupRealtime(); };
  }, []);

  const connectSeqRef = useRef(0);
  const doConnect = useCallback(async (url: string, anonKey: string): Promise<boolean> => {
    const mySeq = ++connectSeqRef.current;
    setConnectionMode('loading');
    setConnectionError(null);
    try {
      cleanupRealtime();
      initSupabase(url, anonKey);
      const data = await withTimeout(fetchAllFromSupabase(), 15000, '数据加载');
      if (connectSeqRef.current !== mySeq) return false;
      if (data) {
        // Set current team from localStorage or data
        const savedTeamId = (() => { try { return localStorage.getItem('tbh-current-team'); } catch (e) { handleError(e, { module: 'store', operation: 'LS_READ_TEAM', severity: 'debug' }); return null; } })();
        const teamId = savedTeamId || data.currentTeamId || null;
        if (teamId) setCurrentTeamId(teamId);
        // Sync plan tier from subscriptions to localStorage for feature gating
        try { syncPlanTier(teamId || '', data.subscriptions || []); } catch { /* ignore */ }
        // Set RLS context for subsequent queries
        const savedUserId = (() => { try { return localStorage.getItem(CURRENT_USER_KEY); } catch (e) { handleError(e, { module: 'store', operation: 'LS_READ_USER', severity: 'debug' }); return null; } })();
        if (teamId && savedUserId) setRLSContext(teamId, savedUserId);
        if (data.currentTeamId && !savedTeamId) {
          try { localStorage.setItem('tbh-current-team', data.currentTeamId); } catch (e) { handleError(e, { module: 'store', operation: 'LS_WRITE_TEAM', severity: 'debug' }); }
        }
        data.currentTeamId = teamId;
        const curView = stateRef.current?.viewingMemberId || null;
        const localTags = Array.isArray(stateRef.current?.tags) ? stateRef.current.tags : [];
        const remoteTagIds = new Set(data.tags.map((t: { id: string }) => t.id));
        const unsyncedTags = localTags.filter(t => !remoteTagIds.has(t.id));
        if (unsyncedTags.length > 0) {
          for (const tag of unsyncedTags) { await supabaseUpsert('tags', tag); }
          data.tags = [...data.tags, ...unsyncedTags];
        }
        // Preserve local-only data + merge with remote
        const curUser = stateRef.current?.currentUser || null;
        const localBookmarks = stateRef.current?.bookmarks || [];
        const localSavedViews = stateRef.current?.savedViews || [];
        // Merge: keep local items not in remote (created offline), plus all remote items
        const remoteBmIds = new Set((data.bookmarks || []).map((b: { id: string }) => b.id));
        const remoteSvIds = new Set((data.savedViews || []).map((v: { id: string }) => v.id));
        const mergedBookmarks = [...(data.bookmarks || []), ...localBookmarks.filter((b: { id: string }) => !remoteBmIds.has(b.id))];
        const mergedSavedViews = [...(data.savedViews || []), ...localSavedViews.filter((v: { id: string }) => !remoteSvIds.has(v.id))];
        const dbUser = curUser ? data.members.find((m: { id: string }) => m.id === curUser.id) || null : null;
        // Fallback: try to find currentUser from localStorage key even if stateRef hasn't updated yet
        const dbMembers = data.members;
        let resolvedUser = dbUser || curUser;
        if (!resolvedUser) {
          try {
            const savedId = localStorage.getItem(CURRENT_USER_KEY);
            if (savedId) resolvedUser = dbMembers.find((m: { id: string }) => m.id === savedId) || null;
          } catch (e) { handleError(e, { module: 'store', operation: 'LS_READ_USER_RESOLVE', severity: 'debug' }); }
        }
        // Single MERGE_STATE with members already included — no second SET_STATE that would overwrite
        dispatch({ type: 'MERGE_STATE', payload: { ...data, members: dbMembers, currentUser: resolvedUser, viewingMemberId: curView, bookmarks: mergedBookmarks, savedViews: mergedSavedViews } });
        // P0: 接入行为追踪的当前用户ID
        setBehaviorUserId(resolvedUser?.id || null);
        try { localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey })); } catch (e) { handleError(e, { module: 'store', operation: 'LS_WRITE_CONFIG', severity: 'debug' }); }
        setConnectionMode('supabase');
        setupRealtime();
        return true;
      } else {
        try { localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey })); } catch (e) { handleError(e, { module: 'store', operation: 'LS_WRITE_CONFIG', severity: 'debug' }); }
        setConnectionMode('supabase');
        setupRealtime();
        return true;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      handleError(e, { module: 'store', operation: 'DB_CONNECT', severity: 'error' });
      setConnectionError(msg || '连接失败');
      setConnectionMode('local');
      resetSupabase();
      return false;
    }
  }, []);

  const doInitializeData = useCallback(async (): Promise<boolean> => {
    const sb = getSupabaseClient();
    if (!sb) return false;
    try {
      setConnectionMode('loading');
      const data = generateAllData();
      await sb.from('notes').delete().neq('id', '___never___');
      await sb.from('schedule_events').delete().neq('id', '___never___');
      await sb.from('templates').delete().neq('id', '___never___');
      await sb.from('categories').delete().neq('id', '___never___');
      await sb.from('reviews').delete().neq('id', '___never___');
      await sb.from('activities').delete().neq('id', '___never___');
      await sb.from('notifications').delete().neq('id', '___never___');
      await sb.from('item_links').delete().neq('id', '___never___');
      await sb.from('tasks').delete().neq('id', '___never___');
      await sb.from('projects').delete().neq('id', '___never___');
      await sb.from('goals').delete().neq('id', '___never___');
      await sb.from('members').delete().neq('id', '___never___');
      await supabaseUpsert('members', data.members);
      await supabaseUpsert('goals', data.goals);
      await supabaseUpsert('projects', data.projects);
      await supabaseUpsert('tasks', data.tasks);
      await supabaseUpsert('notifications', data.notifications);
      await supabaseUpsert('activities', data.activities);
      const fresh = await fetchAllFromSupabase();
      if (fresh) {
        const curState = stateRef.current;
        const curUser = curState?.currentUser || null;
        const curView = curState?.viewingMemberId || null;
        // Preserve user-created data that may not have synced to DB yet
        const preserveKeys = ['tags', 'categories', 'templates', 'comments', 'notes', 'scheduleEvents', 'itemLinks', 'notifications', 'activities', 'reviews', 'bookmarks', 'savedViews'] as const;
        const preserved: Record<string, unknown[]> = {};
        for (const k of preserveKeys) { const local = (curState as Record<string, unknown>)?.[k]; if (Array.isArray(local) && local.length) preserved[k] = local; }
        dispatch({ type: 'SET_STATE', payload: { ...fresh, currentUser: curUser, viewingMemberId: curView, ...preserved } });
      }
      setConnectionMode('supabase');
      return true;
    } catch (e: unknown) {
      handleError(e, { module: 'store', operation: 'DB_INITIALIZE', severity: 'error' });
      setConnectionError(e instanceof Error ? e.message : '初始化失败');
      setConnectionMode('local');
      return false;
    }
  }, []);

  // Initialize realtime module with component refs (once on mount)
  useEffect(() => {
    initRealtimeModule({ dispatch, stateRef, channels: realtimeChannels, lastWriteAt: lastWriteAtRef, offlineWriteCount: offlineWriteCountRef, setConnectionMode });
    return () => { destroyRealtimeModule(); };
  }, [dispatch]);

  const disconnect = useCallback(() => {
    cleanupRealtime();
    resetSupabase();
    clearUndoStack();
    try { localStorage.removeItem(SUPABASE_CONFIG_KEY); } catch (e) { handleError(e, { module: 'store', operation: 'LS_REMOVE_CONFIG', severity: 'debug' }); }
    setConnectionMode('local');
    setConnectionError(null);
  }, []);

  // Re-establish Realtime subscriptions when currentTeamId changes
  // P3#34 fix: sole trigger for setupRealtime — doConnect no longer calls setupRealtime directly
  useEffect(() => {
    if (connectionMode === 'supabase' && state.currentTeamId) {
      setupRealtime();
      return cleanupRealtime;
    }
  }, [state.currentTeamId, connectionMode]);

  // Undo/redo info (derived from module-level stacks + counter)
  const undoInfo = useMemo(() => ({
    canUndo: canUndo(),
    canRedo: canRedo(),
    undoLabel: getUndoLabel(),
    redoLabel: getRedoLabel(),
  }), [undoCounter]);

  // Actions context: stable reference (does NOT include state)
  const actionsValue = useMemo<ActionsContextType>(() => ({
    dispatch: trackedDispatch, connectionMode,
    connectSupabase: doConnect, disconnectSupabase: disconnect,
    initializeSupabaseData: doInitializeData, connectionError, stateRef, undoInfo
  }), [trackedDispatch, connectionMode, doConnect, disconnect, doInitializeData, connectionError, undoInfo]);

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actionsValue}>
        {children}
      </ActionsContext.Provider>
    </StateContext.Provider>
  );
}

/** Returns both state and actions. Use this sparingly — prefer useStoreSelector for read-only data access. */
export function useStore() {
  const state = useContext(StateContext);
  const actions = useContext(ActionsContext);
  if (!state || !actions) throw new Error('useStore must be used within StoreProvider');
  // Runtime safety: ensure critical array fields are always arrays (read-only check, no mutation)
  const safeState = (Array.isArray(state.members) && Array.isArray(state.goals) && Array.isArray(state.projects) && Array.isArray(state.tasks))
    ? state
    : ensureAppStateDefaults(state);
  return { state: safeState, ...actions };
}
