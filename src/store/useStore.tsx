import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { AppState, Goal, Project, BackupData, Tag, Permission, Category, Template, ScheduleEvent, Note, ItemType, Comment, Member, Bookmark, Knowledge } from '@/types';
import { getSupabaseClient, initSupabase, resetSupabase } from '@/supabase/client';
import type { ConnectionMode, SupabaseConfig, Action } from './types';
import { SUPABASE_CONFIG_KEY, ensureAppStateDefaults } from './types';
import { replayFailedWrites } from './supabase';

// Timeout wrapper for fetch operations — prevents infinite "连接中..." when Supabase is down
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时(${ms / 1000}s)`)), ms)),
  ]);
}
import { toCamel } from './types';
import { reducer, hasPermission } from './reducer';
import { pushUndo, popUndo, popRedo, canUndo, canRedo, getUndoLabel, getRedoLabel } from './undo';
import { loadLocalState, saveLocalStateImmediate, fetchAllFromSupabase, supabaseUpsert, setOnWriteError, setCurrentTeamId } from './supabase';
import { setRLSContext } from '@/supabase/client';
import { CURRENT_USER_KEY } from './types';
import { generateAllData } from '@/data/dataGenerator';

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
const ActionsContext = createContext<ActionsContextType | null>(null);

// Store context approach (stable and proven)
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadLocalState);
  const [connectionMode, setConnectionMode] = useReducer((_: ConnectionMode, v: ConnectionMode) => v, 'local' as ConnectionMode);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const realtimeChannels = useRef<any[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineWriteCountRef = useRef(0);

  const [undoCounter, setUndoCounter] = useState(0);

  // Dispatch proxy that tracks offline writes for Layout.tsx badge + undo/redo
  const trackedDispatch = useCallback((action: any) => {
    // Handle undo/redo special actions
    if (action.type === 'UNDO') {
      const inverseAction = popUndo();
      if (inverseAction) { dispatch(inverseAction); setUndoCounter(c => c + 1); notifySelectorListeners(); }
      return;
    }
    if (action.type === 'REDO') {
      const redoAction = popRedo();
      if (redoAction) { dispatch(redoAction); setUndoCounter(c => c + 1); notifySelectorListeners(); }
      return;
    }
    dispatch(action);
    // Notify selector subscribers of state change
    notifySelectorListeners();
    // Track for undo
    if (action.type) pushUndo(action);
    setUndoCounter(c => c + 1);
    // Track offline writes
    if (action.type && action.type !== 'MERGE_STATE' && action.type !== 'SET_STATE' && action.type !== 'MARK_NOTIFICATION_READ' && action.type !== 'MARK_ALL_NOTIFICATIONS_READ') {
      try {
        if (localStorage.getItem('tbh-went-offline-at')) {
          offlineWriteCountRef.current++;
          localStorage.setItem('tbh-offline-writes', String(offlineWriteCountRef.current));
        }
      } catch {}
    }
  }, []);

  // Wire up write-error notification (STA-01)
  useEffect(() => {
    setOnWriteError((msg: string) => {
      dispatch({ type: 'ADD_NOTIFICATION', payload: { id: `err-${Date.now()}`, type: 'error', title: '同步失败', message: msg, read: false, createdAt: new Date().toISOString() } });
    });
    return () => { setOnWriteError(() => {}); };
  }, [dispatch]);

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
        const defaultUrl = 'https://atexvoyvnnuaonvrgzhn.supabase.co';
        const defaultKey = 'sb_publishable_WeMPVE8GNCTOqrE7OZhTIw_WXJaz2Ie';
        doConnect(defaultUrl, defaultKey);
      }
    } catch (e) {
      console.error('[StoreProvider] failed to load Supabase config:', e);
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
        const savedTeamId = (() => { try { return localStorage.getItem('tbh-current-team'); } catch { return null; } })();
        const teamId = savedTeamId || data.currentTeamId || null;
        if (teamId) setCurrentTeamId(teamId);
        // Set RLS context for subsequent queries
        const savedUserId = (() => { try { return localStorage.getItem(CURRENT_USER_KEY); } catch { return null; } })();
        if (teamId && savedUserId) setRLSContext(teamId, savedUserId);
        if (data.currentTeamId && !savedTeamId) {
          try { localStorage.setItem('tbh-current-team', data.currentTeamId); } catch {}
        }
        data.currentTeamId = teamId;
        const curView = stateRef.current?.viewingMemberId || null;
        const localTags = Array.isArray(stateRef.current?.tags) ? stateRef.current.tags : [];
        const remoteTagIds = new Set(data.tags.map((t: any) => t.id));
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
        const remoteBmIds = new Set((data.bookmarks || []).map((b: any) => b.id));
        const remoteSvIds = new Set((data.savedViews || []).map((v: any) => v.id));
        const mergedBookmarks = [...(data.bookmarks || []), ...localBookmarks.filter((b: any) => !remoteBmIds.has(b.id))];
        const mergedSavedViews = [...(data.savedViews || []), ...localSavedViews.filter((v: any) => !remoteSvIds.has(v.id))];
        const dbUser = curUser ? data.members.find((m: any) => m.id === curUser.id) || null : null;
        // Fallback: try to find currentUser from localStorage key even if stateRef hasn't updated yet
        const dbMembers = data.members;
        let resolvedUser = dbUser || curUser;
        if (!resolvedUser) {
          try {
            const savedId = localStorage.getItem(CURRENT_USER_KEY);
            if (savedId) resolvedUser = dbMembers.find((m: any) => m.id === savedId) || null;
          } catch {}
        }
        // Single MERGE_STATE with members already included — no second SET_STATE that would overwrite
        dispatch({ type: 'MERGE_STATE', payload: { ...data, members: dbMembers, currentUser: resolvedUser, viewingMemberId: curView, bookmarks: mergedBookmarks, savedViews: mergedSavedViews } });
        try { localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey })); } catch {}
        setConnectionMode('supabase');
        setupRealtime();
        return true;
      } else {
        try { localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey })); } catch {}
        setConnectionMode('supabase');
        setupRealtime();
        return true;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[doConnect] Connection failed:', msg);
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
        const preserved: Record<string, any> = {};
        for (const k of preserveKeys) { const local = (curState as any)?.[k]; if (local?.length) preserved[k] = local; }
        dispatch({ type: 'SET_STATE', payload: { ...fresh, currentUser: curUser, viewingMemberId: curView, ...preserved } });
      }
      setConnectionMode('supabase');
      return true;
    } catch (e: unknown) {
      setConnectionError(e instanceof Error ? e.message : '初始化失败');
      setConnectionMode('local');
      return false;
    }
  }, []);

  function setupRealtime() {
    cleanupRealtime();
    const sb = getSupabaseClient();
    if (!sb) return;

    // --- Supabase Realtime postgres_changes subscriptions ---
    // Dedup: skip events within 2s of a local write to avoid echoing our own changes
    const lastWriteAt: Record<string, number> = {};
    const origDispatch = dispatch;
    const dedupedDispatch = (action: Action) => {
      if (action.type && typeof action.type === 'string' && action.type.startsWith('ADD_') || action.type.startsWith('UPDATE_') || action.type.startsWith('DELETE_')) {
        lastWriteAt[action.type] = Date.now();
      }
      origDispatch(action);
    };

    const handleDbChange = (table: string, payload: any) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      // Skip events caused by our own recent write (within 2s)
      const writeKey = `${table}:${eventType}`;
      if (lastWriteAt[writeKey] && Date.now() - lastWriteAt[writeKey] < 2000) return;

      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        if (!newRow || !newRow.id) return;
        const camelRow = toCamel(newRow);
        dedupedDispatch({ type: 'REALTIME_UPSERT', payload: { table, item: camelRow } });
      } else if (eventType === 'DELETE') {
        const id = oldRow?.id;
        if (!id) return;
        dedupedDispatch({ type: 'REALTIME_DELETE', payload: { table, id } });
      }
    };

    const teamId = state.currentTeamId;
    const realtimeChannel = sb.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('goals', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('projects', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('tasks', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (p) => handleDbChange('members', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (p) => handleDbChange('notifications', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('comments', p))
      .subscribe();

    // --- Fallback REST polling (120s) for missed Realtime events ---
    const tableKeyMap: Record<string, string> = {
      item_links: 'itemLinks', schedule_events: 'scheduleEvents', saved_views: 'savedViews',
      status_flow_rules: 'statusFlowRules', automation_rules: 'automationRules',
    };
    const allTables = ['goals', 'projects', 'tasks', 'members', 'notifications', 'activities', 'item_links', 'reviews', 'categories', 'templates', 'schedule_events', 'notes', 'comments', 'tags', 'bookmarks', 'saved_views', 'status_flow_rules', 'automation_rules'];
    let polling = false;
    const fallbackPoll = async () => {
      if (polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const results = await Promise.allSettled(allTables.map(table => {
          const query = table === 'members' ? sb.from(table).select('*').eq('status', 'active') : sb.from(table).select('*');
          return query.then(({ data }) => {
            const key = tableKeyMap[table] || table;
            return { key, data: Array.isArray(data) ? data.map(toCamel) : [] };
          });
        }));
        const payload: Record<string, any> = {};
        results.forEach(r => { if (r.status === 'fulfilled') { payload[r.value.key] = r.value.data; } });
        dispatch({ type: 'MERGE_STATE', payload });
        try { bc.postMessage({ type: 'MERGE_STATE', payload }); } catch {}
      } catch (e) {
        console.error('[fallbackPoll] data sync failed:', e);
      } finally {
        polling = false;
      }
    };

    // BroadcastChannel for cross-tab instant sync
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('tbh-sync'); } catch {}
    const onBcMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'MERGE_STATE' && e.data.payload) {
        dispatch({ type: 'MERGE_STATE', payload: e.data.payload });
      }
    };
    if (bc) bc.addEventListener('message', onBcMessage);

    // Initial full fetch
    fallbackPoll();

    // Fallback timer: 120s full poll
    const fallbackTimer = window.setInterval(fallbackPoll, 120000);

    // Visibility change: immediate poll when tab becomes visible
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fallbackPoll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Offline/online detection
    let reconnectFailures = 0;
    const onOffline = () => { setConnectionMode('offline'); reconnectFailures = 0; offlineWriteCountRef.current = 0; try { localStorage.setItem('tbh-went-offline-at', String(Date.now())); localStorage.setItem('tbh-offline-writes', '0'); } catch {} };
    const onOnline = () => {
      const delay = Math.min(100 * Math.pow(2, reconnectFailures), 5000);
      setTimeout(async () => {
        const success = await fallbackPoll().then(() => true).catch(() => false);
        if (success) {
          reconnectFailures = 0;
          offlineWriteCountRef.current = 0;
          setConnectionMode('supabase');
          try { localStorage.removeItem('tbh-offline-writes'); replayFailedWrites(); } catch {}
        } else { reconnectFailures++; }
      }, delay);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    // Store all cleanup references
    if (bc) (bc as any)._onMessage = onBcMessage;
    realtimeChannels.current = [realtimeChannel, { clear: () => window.clearInterval(fallbackTimer) } as any, onVisibilityChange, onOffline, onOnline, ...(bc ? [bc] : [])];
  }

  function cleanupRealtime() {
    realtimeChannels.current.forEach(item => {
      if (typeof item === 'number') window.clearInterval(item);
      else if (typeof item === 'function') {
        document.removeEventListener('visibilitychange', item);
        window.removeEventListener('offline', item);
        window.removeEventListener('online', item);
      }
      else if (item instanceof BroadcastChannel) {
        if ((item as any)._onMessage) item.removeEventListener('message', (item as any)._onMessage);
        item.close();
      }
      else if (item && typeof (item as any).unsubscribe === 'function') {
        // Supabase Realtime channel
        try { (item as any).unsubscribe(); } catch {}
      }
      else if (item && typeof (item as any).clear === 'function') {
        (item as any).clear();
      }
    });
    realtimeChannels.current = [];
  }

  const disconnect = useCallback(() => {
    cleanupRealtime();
    resetSupabase();
    try { localStorage.removeItem(SUPABASE_CONFIG_KEY); } catch {}
    setConnectionMode('local');
    setConnectionError(null);
  }, []);

  // State ref for selector-based subscriptions (avoids full context re-render)
  const stateRef = useRef(state);
  stateRef.current = state;

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

/**
 * Selector-based subscription: components only re-render when the selected slice changes.
 * Uses a pub/sub pattern with useSyncExternalStore to completely avoid StateContext subscriptions.
 * Components using this hook are NOT triggered by unrelated state changes.
 * Supports shallow equality check to prevent re-renders when array/object contents haven't changed.
 *
 * Usage: const tasks = useStoreSelector(s => s.tasks);
 */
// Global listener registry for selector-based subscriptions
const selectorListeners = new Set<() => void>();
let selectorStateVersion = 0;

function subscribeToSelectors(listener: () => void): () => void {
  selectorListeners.add(listener);
  return () => selectorListeners.delete(listener);
}

function getSelectorVersion(): number {
  return selectorStateVersion;
}

// Called after every dispatch to notify selector subscribers
function notifySelectorListeners() {
  selectorStateVersion++;
  selectorListeners.forEach(l => l());
}

// Shallow equality comparison
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) { if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false; }
  return true;
}

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
    // Shallow equal check: if the selected slice hasn't meaningfully changed, return previous reference
    // This prevents downstream re-renders when only unrelated state changed
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

export function useDashboardStats() {
  const { goals, projects, tasks, notifications, currentUser } = useStore().state;
  const [todayStr, setTodayStr] = useState(() => new Date().toISOString().split('T')[0]);
  const now = useMemo(() => new Date(), [todayStr]);
  useEffect(() => {
    const timer = setInterval(() => {
      const newToday = new Date().toISOString().split('T')[0];
      if (newToday !== todayStr) setTodayStr(newToday);
    }, 60000);
    return () => clearInterval(timer);
  }, [todayStr]);
  return useMemo(() => {
    const activeGoals = goals.filter(g => g.status === 'in_progress');
    const activeProjects = projects.filter(p => p.status === 'in_progress');
    const myTasks = tasks.filter(t => t.leaderId === currentUser?.id && t.status !== 'done');
    const overdueTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < todayStr);
    const todayTodos = tasks.filter(t => t.leaderId === currentUser?.id && t.status !== 'done' && t.dueDate === todayStr);
    const completedThisWeek = tasks.filter(t => {
      if (!t.completedAt) return false;
      const d = new Date(t.completedAt);
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    });
    return {
      activeGoals: activeGoals.length, activeProjects: activeProjects.length,
      myTasks: myTasks.length, overdueTasks: overdueTasks.length, todayTodos,
      completedThisWeek: completedThisWeek.length,
      overallGoalProgress: activeGoals.length > 0 ? Math.round(activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length) : 0,
      unreadNotifications: notifications.filter(n => !n.read).length,
    };
  }, [goals, projects, tasks, notifications, currentUser, todayStr, now]);
}

export function useGoalTree() {
  const goals = useStore().state.goals;
  return useMemo(() => {
    function buildTree(parentId: string | null, visited?: Set<string>): (Goal & { children: Goal[] })[] {
      const visitedSet = visited || new Set<string>();
      return goals.filter(g => g.parentId === parentId).map(g => {
        if (visitedSet.has(g.id)) return { ...g, children: [] };
        visitedSet.add(g.id);
        return { ...g, children: buildTree(g.id, visitedSet) };
      });
    }
    return buildTree(null);
  }, [goals]);
}

export function useProjectTasks(projectId: string) {
  const tasks = useStore().state.tasks;
  return useMemo(() => tasks.filter(t => t.projectId === projectId), [tasks, projectId]);
}

export function useGoalProjects(goalId: string) {
  const { projects, goals } = useStore().state;
  return useMemo(() => {
    function getProjectsForGoal(gid: string): Project[] {
      return [...projects.filter(p => p.goalId === gid), ...goals.filter(g => g.parentId === gid).flatMap(cg => getProjectsForGoal(cg.id))];
    }
    return getProjectsForGoal(goalId);
  }, [projects, goals, goalId]);
}

export function useItemLinks(sourceId: string, sourceType: 'goal' | 'project' | 'task') {
  const itemLinks = useStore().state.itemLinks;
  return useMemo(() => itemLinks.filter(l => l.sourceId === sourceId && l.sourceType === sourceType), [itemLinks, sourceId, sourceType]);
}

export function useMemberTasks(memberId: string) {
  const tasks = useStore().state.tasks;
  return useMemo(() => tasks.filter(t => t.leaderId === memberId || (t.supporterIds ?? []).includes(memberId)), [tasks, memberId]);
}

export function useBackupExport(): BackupData {
  const { members, goals, projects, tasks, notifications, activities, itemLinks, tags, categories, templates, scheduleEvents, notes, reviews, comments, bookmarks, savedViews, statusFlowRules, automationRules, sprints } = useStore().state;
  return {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    members, goals, projects, tasks, notifications, activities, itemLinks,
    tags, categories, templates, scheduleEvents, notes, reviews,
    comments: comments || [], bookmarks: bookmarks || [], savedViews: savedViews || [],
    statusFlowRules: statusFlowRules || [], automationRules: automationRules || [], sprints: sprints || [],
  };
}

export function usePermissions() {
  const store = useStore();
  const { state, dispatch } = store;
  const user = state.currentUser;
  return {
    can: (permission: Permission) => user ? hasPermission(state, user.id, permission) : false,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager' || user?.role === 'leader' || user?.role === 'admin',
    setMemberPermissions: (memberId: string, permissions: Permission[]) => {
      dispatch({ type: 'UPDATE_MEMBER', payload: { id: memberId, updates: { permissions } } });
    },
  };
}

export function useTags() {
  const tags = useStore().state.tags;
  const dispatch = useStore().dispatch;
  return {
    tags,
    addTag: (tag: Omit<Tag, 'id' | 'createdAt'>) => dispatch({ type: 'ADD_TAG', payload: tag }),
    updateTag: (id: string, updates: Partial<Tag>) => dispatch({ type: 'UPDATE_TAG', payload: { id, updates } }),
    deleteTag: (id: string) => dispatch({ type: 'DELETE_TAG', payload: id }),
  };
}

export function useCategories() {
  const categories = useStore().state.categories;
  const dispatch = useStore().dispatch;
  return {
    categories,
    addCategory: (cat: Omit<Category, 'id' | 'createdAt'>) => dispatch({ type: 'ADD_CATEGORY', payload: cat }),
    updateCategory: (id: string, updates: Partial<Category>) => dispatch({ type: 'UPDATE_CATEGORY', payload: { id, updates } }),
    deleteCategory: (id: string) => dispatch({ type: 'DELETE_CATEGORY', payload: id }),
    setCategories: (cats: Category[]) => dispatch({ type: 'SET_CATEGORIES', payload: cats }),
    getCategoriesForType: (itemType: ItemType) => categories.filter(c => (c.appliesTo || []).includes(itemType)),
  };
}

export function useTemplates() {
  const templates = useStore().state.templates;
  const dispatch = useStore().dispatch;
  return {
    templates,
    addTemplate: (tpl: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) => dispatch({ type: 'ADD_TEMPLATE', payload: tpl }),
    updateTemplate: (id: string, updates: Partial<Template>) => dispatch({ type: 'UPDATE_TEMPLATE', payload: { id, updates } }),
    deleteTemplate: (id: string) => dispatch({ type: 'DELETE_TEMPLATE', payload: id }),
    getTemplatesByType: (type: 'goal' | 'project' | 'task' | 'document') => templates.filter(t => t.type === type),
  };
}

export function useScheduleEvents(memberId?: string) {
  const scheduleEvents = useStore().state.scheduleEvents;
  const dispatch = useStore().dispatch;
  const filtered = memberId ? scheduleEvents.filter(e => e.memberId === memberId) : scheduleEvents;
  return {
    events: filtered,
    addEvent: (evt: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>) => dispatch({ type: 'ADD_SCHEDULE_EVENT', payload: evt }),
    updateEvent: (id: string, updates: Partial<ScheduleEvent>) => dispatch({ type: 'UPDATE_SCHEDULE_EVENT', payload: { id, updates } }),
    deleteEvent: (id: string) => dispatch({ type: 'DELETE_SCHEDULE_EVENT', payload: id }),
  };
}

export function useNotes(folder?: string) {
  const notes = useStore().state.notes;
  const dispatch = useStore().dispatch;
  const filtered = folder ? notes.filter(n => n.folder === folder) : notes;
  return {
    notes: filtered,
    allNotes: notes,
    addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => dispatch({ type: 'ADD_NOTE', payload: note }),
    updateNote: (id: string, updates: Partial<Note>) => dispatch({ type: 'UPDATE_NOTE', payload: { id, updates } }),
    deleteNote: (id: string) => dispatch({ type: 'DELETE_NOTE', payload: id }),
    pinnedNotes: notes.filter(n => n.isPinned),
  };
}

export function useKnowledge() {
  const knowledge = useStore().state.knowledge;
  const dispatch = useStore().dispatch;
  return {
    knowledge: knowledge || [],
    addKnowledge: (k: Omit<Knowledge, 'id' | 'createdAt' | 'updatedAt'>) => dispatch({ type: 'ADD_KNOWLEDGE', payload: k }),
    updateKnowledge: (id: string, updates: Partial<Knowledge>) => dispatch({ type: 'UPDATE_KNOWLEDGE', payload: { id, updates } }),
    deleteKnowledge: (id: string) => dispatch({ type: 'DELETE_KNOWLEDGE', payload: id }),
  };
}

export function useBookmarks() {
  const bookmarks = useStore().state.bookmarks;
  const dispatch = useStore().dispatch;
  return {
    bookmarks: bookmarks || [],
    addBookmark: (bm: Omit<Bookmark, 'id' | 'createdAt'>) => dispatch({ type: 'ADD_BOOKMARK', payload: bm }),
    updateBookmark: (id: string, updates: Partial<Bookmark>) => dispatch({ type: 'UPDATE_BOOKMARK', payload: { id, updates } }),
    deleteBookmark: (id: string) => dispatch({ type: 'DELETE_BOOKMARK', payload: id }),
    reorderBookmarks: (bms: Bookmark[]) => dispatch({ type: 'REORDER_BOOKMARKS', payload: bms }),
    setBookmarks: (bms: Bookmark[]) => dispatch({ type: 'SET_BOOKMARKS', payload: bms }),
  };
}

export function useViewingMember() {
  const viewingMemberId = useStore().state.viewingMemberId;
  const members = useStore().state.members;
  const dispatch = useStore().dispatch;
  const viewingMember = viewingMemberId ? members.find(m => m.id === viewingMemberId) || null : null;
  const isTeamView = viewingMemberId === null;
  const setViewingMember = useCallback((id: string | null) => {
    dispatch({ type: 'SET_VIEWING_MEMBER', payload: id });
  }, [dispatch]);
  return { viewingMemberId, setViewingMember, viewingMember, isTeamView };
}

export function useMemberData(memberId: string) {
  const { goals, projects, tasks, activities } = useStore().state;
  const memberGoals = goals.filter(g => g.leaderId === memberId || (g.supporterIds ?? []).includes(memberId));
  const memberProjects = projects.filter(p => p.leaderId === memberId || (p.supporterIds ?? []).includes(memberId));
  const memberTasks = tasks.filter(t => t.leaderId === memberId || (t.supporterIds ?? []).includes(memberId));
  const memberActivities = activities.filter(a => a.memberId === memberId);
  return { goals: memberGoals, projects: memberProjects, tasks: memberTasks, activities: memberActivities };
}

export function useReviewList(memberId?: string) {
  const reviews = useStore().state.reviews;
  if (memberId) {
    return reviews.filter(r => r.memberId === memberId);
  }
  return reviews;
}

// --- Shared lookup hooks (perf: pre-compute Maps to avoid O(n) find in render loops) ---

/** O(1) member name/lookup by id - replaces repeated state.members.find() across components */
export function useMemberLookup() {
  const members = useStore().state.members;
  const { nameMap, avatarMap, memberMap } = useMemo(() => {
    const nameMap = new Map<string, string>();
    const avatarMap = new Map<string, string>();
    const memberMap = new Map<string, Member>();
    for (const m of members) {
      nameMap.set(m.id, m.name);
      avatarMap.set(m.id, m.avatar);
      memberMap.set(m.id, m);
    }
    return { nameMap, avatarMap, memberMap };
  }, [members]);
  const getName = useCallback((id: string | undefined) => id ? nameMap.get(id) || '未知' : '未知', [nameMap]);
  const getAvatar = useCallback((id: string | undefined) => id ? avatarMap.get(id) || '' : '', [avatarMap]);
  const getMember = useCallback((id: string | undefined) => id ? memberMap.get(id) : undefined, [memberMap]);
  return { getName, getAvatar, getMember, nameMap, avatarMap, memberMap };
}

/** Pre-computed active members list + count - replaces repeated state.members.filter(m => m.status === 'active') */
export function useActiveMembers() {
  const members = useStore().state.members;
  const activeMembers = useMemo(() => members.filter(m => m.status === 'active'), [members]);
  const activeCount = activeMembers.length;
  return { activeMembers, activeCount };
}

/** Pre-computed project/goal/task lookup maps */
export function useItemLookupMaps() {
  const { goals, projects, tasks } = useStore().state;
  const { goalMap, projectMap, taskMap } = useMemo(() => ({
    goalMap: new Map(goals.map(g => [g.id, g])),
    projectMap: new Map(projects.map(p => [p.id, p])),
    taskMap: new Map(tasks.map(t => [t.id, t])),
  }), [goals, projects, tasks]);
  const getGoalTitle = useCallback((id: string | undefined) => id ? goalMap.get(id)?.title || '' : '', [goalMap]);
  const getProjectTitle = useCallback((id: string | undefined) => id ? projectMap.get(id)?.title || '' : '', [projectMap]);
  const getTaskTitle = useCallback((id: string | undefined) => id ? taskMap.get(id)?.title || '' : '', [taskMap]);
  return { goalMap, projectMap, taskMap, getGoalTitle, getProjectTitle, getTaskTitle };
}
