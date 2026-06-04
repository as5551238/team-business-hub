import { handleError } from '@/lib/errorHandler';
import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { AppState } from '@/types';
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
import { pushUndo, pushBatchUndo, popUndo, popRedo, canUndo, canRedo, getUndoLabel, getRedoLabel, clearUndoStack } from './undo';
import { loadLocalState, saveLocalStateImmediate, fetchAllFromSupabase, supabaseUpsert, setOnWriteError, setOnConflict, setCurrentTeamId } from './supabase';
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

import { setAsyncDispatch } from '@/store/shared';
import { setCollabDispatch } from '@/lib/collab';
import { trackBehavior, setBehaviorUserId } from '@/store/behaviorTracking';

// Module-level dispatch bridge for collab operations (set by StoreProvider)
let _collabDispatch: ((action: Action) => void) | null = null;
export function collabDispatch(action: Action) { _collabDispatch?.(action); }

// Re-export batch undo for use in page components
export { pushBatchUndo } from './undo';

// Store context approach (stable and proven)
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadLocalState);
  const [connectionMode, setConnectionMode] = useReducer((_: ConnectionMode, v: ConnectionMode) => v, 'local' as ConnectionMode);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const realtimeChannels = useRef<unknown[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineWriteCountRef = useRef(0);

  const [undoCounter, setUndoCounter] = useState(0);

  // P3#9 fix: Realtime dedup — shared lastWriteAt map accessible to trackedDispatch
  const lastWriteAtRef = useRef<Record<string, number>>({});
  const ACTION_TO_TABLE: Record<string, string> = {
    ADD_GOAL: 'goals', UPDATE_GOAL: 'goals', DELETE_GOAL: 'goals',
    ADD_PROJECT: 'projects', UPDATE_PROJECT: 'projects', DELETE_PROJECT: 'projects',
    ADD_TASK: 'tasks', UPDATE_TASK: 'tasks', DELETE_TASK: 'tasks',
    ADD_NOTIFICATION: 'notifications', UPDATE_NOTIFICATION: 'notifications', DELETE_NOTIFICATION: 'notifications',
    TOGGLE_NOTIFICATION_MUTE: 'notification_preferences',
    ADD_MEMBER: 'members', UPDATE_MEMBER: 'members', DELETE_MEMBER: 'members',
    ADD_COMMENT: 'comments', UPDATE_COMMENT: 'comments', DELETE_COMMENT: 'comments',
    ADD_NOTE: 'notes', UPDATE_NOTE: 'notes', DELETE_NOTE: 'notes',
    ADD_CATEGORY: 'categories', UPDATE_CATEGORY: 'categories', DELETE_CATEGORY: 'categories',
    ADD_TEMPLATE: 'templates', UPDATE_TEMPLATE: 'templates', DELETE_TEMPLATE: 'templates',
    ADD_SCHEDULE_EVENT: 'schedule_events', UPDATE_SCHEDULE_EVENT: 'schedule_events', DELETE_SCHEDULE_EVENT: 'schedule_events',
    ADD_BOOKMARK: 'bookmarks', UPDATE_BOOKMARK: 'bookmarks', DELETE_BOOKMARK: 'bookmarks', REORDER_BOOKMARKS: 'bookmarks',
    ADD_SAVED_VIEW: 'saved_views', UPDATE_SAVED_VIEW: 'saved_views', DELETE_SAVED_VIEW: 'saved_views',
    ADD_REVIEW: 'reviews', UPDATE_REVIEW: 'reviews', DELETE_REVIEW: 'reviews',
    ADD_KNOWLEDGE: 'knowledge', UPDATE_KNOWLEDGE: 'knowledge', DELETE_KNOWLEDGE: 'knowledge',
    ADD_TAG: 'tags', UPDATE_TAG: 'tags', DELETE_TAG: 'tags',
    ADD_SPRINT: 'sprints', UPDATE_SPRINT: 'sprints', DELETE_SPRINT: 'sprints',
    ADD_AUTOMATION_RULE: 'automation_rules', UPDATE_AUTOMATION_RULE: 'automation_rules', DELETE_AUTOMATION_RULE: 'automation_rules',
    ADD_STATUS_FLOW_RULE: 'status_flow_rules', UPDATE_STATUS_FLOW_RULE: 'status_flow_rules', DELETE_STATUS_FLOW_RULE: 'status_flow_rules',
    ADD_ITEM_LINK: 'item_links', DELETE_ITEM_LINK: 'item_links',
    ADD_ACTIVITY: 'activities',
  };
  const ACTION_TO_EVENT: Record<string, string> = {
    ADD_GOAL: 'INSERT', ADD_PROJECT: 'INSERT', ADD_TASK: 'INSERT',
    ADD_NOTIFICATION: 'INSERT', ADD_MEMBER: 'INSERT', ADD_COMMENT: 'INSERT',
    ADD_NOTE: 'INSERT', ADD_CATEGORY: 'INSERT', ADD_TEMPLATE: 'INSERT',
    ADD_SCHEDULE_EVENT: 'INSERT', ADD_BOOKMARK: 'INSERT', ADD_SAVED_VIEW: 'INSERT',
    ADD_REVIEW: 'INSERT', ADD_KNOWLEDGE: 'INSERT', ADD_TAG: 'INSERT',
    ADD_SPRINT: 'INSERT', ADD_AUTOMATION_RULE: 'INSERT', ADD_STATUS_FLOW_RULE: 'INSERT',
    ADD_ITEM_LINK: 'INSERT', ADD_ACTIVITY: 'INSERT',
    UPDATE_GOAL: 'UPDATE', UPDATE_PROJECT: 'UPDATE', UPDATE_TASK: 'UPDATE',
    UPDATE_NOTIFICATION: 'UPDATE', UPDATE_MEMBER: 'UPDATE', UPDATE_COMMENT: 'UPDATE',
    UPDATE_NOTE: 'UPDATE', UPDATE_CATEGORY: 'UPDATE', UPDATE_TEMPLATE: 'UPDATE',
    UPDATE_SCHEDULE_EVENT: 'UPDATE', UPDATE_BOOKMARK: 'UPDATE', UPDATE_SAVED_VIEW: 'UPDATE',
    UPDATE_REVIEW: 'UPDATE', UPDATE_KNOWLEDGE: 'UPDATE', UPDATE_TAG: 'UPDATE',
    UPDATE_SPRINT: 'UPDATE', UPDATE_AUTOMATION_RULE: 'UPDATE', UPDATE_STATUS_FLOW_RULE: 'UPDATE',
    DELETE_GOAL: 'DELETE', DELETE_PROJECT: 'DELETE', DELETE_TASK: 'DELETE',
    DELETE_NOTIFICATION: 'DELETE', DELETE_MEMBER: 'DELETE', DELETE_COMMENT: 'DELETE',
    DELETE_NOTE: 'DELETE', DELETE_CATEGORY: 'DELETE', DELETE_TEMPLATE: 'DELETE',
    DELETE_SCHEDULE_EVENT: 'DELETE', DELETE_BOOKMARK: 'DELETE', DELETE_SAVED_VIEW: 'DELETE',
    DELETE_REVIEW: 'DELETE', DELETE_KNOWLEDGE: 'DELETE', DELETE_TAG: 'DELETE',
    DELETE_SPRINT: 'DELETE', DELETE_AUTOMATION_RULE: 'DELETE', DELETE_STATUS_FLOW_RULE: 'DELETE',
    DELETE_ITEM_LINK: 'DELETE',
  };

  // Dispatch proxy that tracks offline writes for Layout.tsx badge + undo/redo
  const trackedDispatch = useCallback((action: Action) => {
    // Handle undo/redo special actions
    if (action.type === 'UNDO') {
      const inverseAction = popUndo();
      if (inverseAction) {
        if (Array.isArray(inverseAction)) {
          // Batch undo: dispatch all inverse actions
          inverseAction.forEach(a => dispatch(a));
        } else {
          dispatch(inverseAction);
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
          redoAction.forEach(a => dispatch(a));
        } else {
          dispatch(redoAction);
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
        const defaultUrl = 'https://atexvoyvnnuaonvrgzhn.supabase.co';
        const defaultKey = 'sb_publishable_WeMPVE8GNCTOqrE7OZhTIw_WXJaz2Ie';
        doConnect(defaultUrl, defaultKey);
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

  interface RealtimePayload {
    eventType: string;
    new: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  }

  function setupRealtime() {
    cleanupRealtime();
    const sb = getSupabaseClient();
    if (!sb) return;

    // --- Supabase Realtime postgres_changes subscriptions ---
    // Dedup: skip events within 2s of a local write to avoid echoing our own changes (P3#9: uses shared lastWriteAtRef from trackedDispatch)
    const lastWriteAt = lastWriteAtRef.current;
    const origDispatch = dispatch;
    const dedupedDispatch = (action: Action) => {
      origDispatch(action);
    };

    const handleDbChange = (table: string, payload: RealtimePayload) => {
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

    const teamId = stateRef.current?.currentTeamId;
    const channelId = teamId ? `db-changes-${teamId}` : 'db-changes';
    const realtimeChannel = sb.channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('goals', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('projects', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('tasks', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (p) => handleDbChange('members', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (p) => handleDbChange('notifications', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('comments', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_rules', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('automation_rules', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_flow_rules', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('status_flow_rules', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_links', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('item_links', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('tags', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sprints', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('sprints', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('notes', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('categories', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'templates', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('templates', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_events', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('schedule_events', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('bookmarks', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_views', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('saved_views', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('reviews', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('knowledge', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_preferences', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('notification_preferences', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: teamId ? `team_id=eq.${teamId}` : undefined }, (p) => handleDbChange('activities', p))
      .subscribe();

    // --- Fallback REST polling (120s) for missed Realtime events ---
    const tableKeyMap: Record<string, string> = {
      item_links: 'itemLinks', schedule_events: 'scheduleEvents', saved_views: 'savedViews',
      status_flow_rules: 'statusFlowRules', automation_rules: 'automationRules',
    };
    const allTables = ['goals', 'projects', 'tasks', 'members', 'notifications', 'activities', 'item_links', 'reviews', 'categories', 'templates', 'schedule_events', 'notes', 'comments', 'tags', 'bookmarks', 'saved_views', 'status_flow_rules', 'automation_rules', 'sprints', 'knowledge', 'notification_preferences'];
    const teamScopedTables = new Set(['goals', 'projects', 'tasks', 'notifications', 'activities', 'item_links', 'comments', 'categories', 'templates', 'schedule_events', 'notes', 'reviews', 'tags', 'bookmarks', 'saved_views', 'status_flow_rules', 'automation_rules', 'sprints', 'knowledge', 'notification_preferences']);
    let polling = false;
    const fallbackPoll = async () => {
      if (polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const teamId = stateRef.current?.currentTeamId;
        const results = await Promise.allSettled(allTables.map(table => {
          let query: { eq(col: string, val: unknown): typeof query; then<R>(resolve: (result: { data: Record<string, unknown>[] | null }) => R): Promise<R> };
          if (table === 'members') {
            query = sb.from(table).select('*').eq('status', 'active');
          } else {
            query = sb.from(table).select('*');
          }
          // P3#1 fix: scope team-scoped tables by currentTeamId
          if (teamId && teamScopedTables.has(table)) {
            query = query.eq('team_id', teamId);
          }
          return query.then(({ data }) => {
            const key = tableKeyMap[table] || table;
            return { key, data: Array.isArray(data) ? data.map(toCamel) : [] };
          });
        }));
        const payload: Record<string, unknown[]> = {};
        results.forEach(r => { if (r.status === 'fulfilled') { payload[r.value.key] = r.value.data; } });
        dispatch({ type: 'MERGE_STATE', payload });
        notifySelectorListeners();
        try { bc.postMessage({ type: 'MERGE_STATE', payload }); } catch (e) { handleError(e, { module: 'store', operation: 'BC_POST_MERGE', severity: 'debug' }); }
      } catch (e) {
        handleError(e, { module: 'store', operation: 'FALLBACK_POLL', severity: 'warn' });
      } finally {
        polling = false;
      }
    };

    // BroadcastChannel for cross-tab instant sync
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('tbh-sync'); } catch (e) { handleError(e, { module: 'store', operation: 'BC_CREATE', severity: 'debug' }); }
    const onBcMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'MERGE_STATE' && e.data.payload) {
        // P2#3 fix: reject cross-team data contamination
        if (e.data.payload.currentTeamId && e.data.payload.currentTeamId !== stateRef.current?.currentTeamId) return;
        dispatch({ type: 'MERGE_STATE', payload: e.data.payload });
        notifySelectorListeners();
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
    const onOffline = () => { setConnectionMode('offline'); reconnectFailures = 0; offlineWriteCountRef.current = 0; try { localStorage.setItem('tbh-went-offline-at', String(Date.now())); localStorage.setItem('tbh-offline-writes', '0'); } catch (e) { handleError(e, { module: 'store', operation: 'LS_WRITE_OFFLINE', severity: 'debug' }); } };
    const onOnline = () => {
      const delay = Math.min(100 * Math.pow(2, reconnectFailures), 5000);
      setTimeout(async () => {
        const success = await fallbackPoll().then(() => true).catch(() => false);
        if (success) {
          reconnectFailures = 0;
          offlineWriteCountRef.current = 0;
          setConnectionMode('supabase');
          try { localStorage.removeItem('tbh-offline-writes'); replayFailedWrites(); } catch (e) { handleError(e, { module: 'store', operation: 'ONLINE_RECONNECT', severity: 'warn' }); }
        } else { reconnectFailures++; }
      }, delay);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    // Store all cleanup references
    if (bc) ((bc as unknown) as { _onMessage?: () => void })._onMessage = onBcMessage;
    realtimeChannels.current = [realtimeChannel, { clear: () => window.clearInterval(fallbackTimer) }, onVisibilityChange, onOffline, onOnline, ...(bc ? [bc] : [])];
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
        const bcItem = item as BroadcastChannel & { _onMessage?: () => void };
        if (bcItem._onMessage) bcItem.removeEventListener('message', bcItem._onMessage);
        item.close();
      }
      else if (item && typeof (item as { unsubscribe?: unknown }).unsubscribe === 'function') {
        try { (item as { unsubscribe: () => void }).unsubscribe(); } catch (e) { handleError(e, { module: 'store', operation: 'REALTIME_UNSUBSCRIBE', severity: 'debug' }); }
      }
      else if (item && typeof (item as { clear?: unknown }).clear === 'function') {
        (item as { clear: () => void }).clear();
      }
    });
    realtimeChannels.current = [];
  }

  const disconnect = useCallback(() => {
    cleanupRealtime();
    resetSupabase();
    clearUndoStack();
    try { localStorage.removeItem(SUPABASE_CONFIG_KEY); } catch (e) { handleError(e, { module: 'store', operation: 'LS_REMOVE_CONFIG', severity: 'debug' }); }
    setConnectionMode('local');
    setConnectionError(null);
  }, []);

  // State ref for selector-based subscriptions (avoids full context re-render)
  const stateRef = useRef(state);
  stateRef.current = state;

  // Re-establish Realtime subscriptions when currentTeamId changes
  // P3#34 fix: sole trigger for setupRealtime — doConnect no longer calls setupRealtime directly
  useEffect(() => {
    if (connectionMode === 'supabase' && state.currentTeamId) {
      setupRealtime();
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

// Shallow equality comparison (handles Date and NaN)
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  // Handle NaN
  if (a !== a && b !== b) return true; // NaN check
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  // Handle Date
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
