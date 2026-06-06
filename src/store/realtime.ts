// Realtime subscription management — extracted from useStore.tsx
import type { Action, ConnectionMode } from './types';
import type { AppState } from '@/types';
import { getSupabaseClient } from '@/supabase/client';
import { toCamel } from './types';
import { replayFailedWrites } from './supabase';
import { notifySelectorListeners } from './selectorSystem';
import { handleError } from '@/lib/errorHandler';

interface RealtimePayload {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export interface RealtimeDeps {
  dispatch: (action: Action) => void;
  stateRef: { readonly current: AppState };
  channels: { current: unknown[] };
  lastWriteAt: { current: Record<string, number> };
  offlineWriteCount: { current: number };
  setConnectionMode: (mode: ConnectionMode) => void;
}

// Module-level state shared between setup and cleanup
let abortController = new AbortController();
let deps: RealtimeDeps | null = null;

export function initRealtimeModule(d: RealtimeDeps) {
  deps = d;
}

export function destroyRealtimeModule() {
  cleanupRealtime();
  deps = null;
}

export function setupRealtime() {
  if (!deps) return;
  const { dispatch, stateRef, channels, lastWriteAt, offlineWriteCount, setConnectionMode } = deps;

  cleanupRealtime();
  const sb = getSupabaseClient();
  if (!sb) return;

  // Dedup: skip events within 2s of a local write to avoid echoing our own changes (P3#9)
  const lastWriteAtMap = lastWriteAt.current;

  const handleDbChange = (table: string, payload: RealtimePayload) => {
    const { eventType, new: newRow, old: oldRow } = payload;
    const writeKey = `${table}:${eventType}`;
    if (lastWriteAtMap[writeKey] && Date.now() - lastWriteAtMap[writeKey] < 2000) return;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (!newRow || !newRow.id) return;
      const camelRow = toCamel(newRow);
      dispatch({ type: 'REALTIME_UPSERT', payload: { table, item: camelRow } });
    } else if (eventType === 'DELETE') {
      const id = oldRow?.id;
      if (!id) return;
      dispatch({ type: 'REALTIME_DELETE', payload: { table, id } });
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

  // --- Fallback REST polling (300s) for missed Realtime events ---
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
      if (abortController.signal.aborted) return;
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

  // Fallback timer: 300s full poll
  const fallbackTimer = window.setInterval(fallbackPoll, 300000);

  // Visibility change: immediate poll when tab becomes visible
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') fallbackPoll();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Offline/online detection
  let reconnectFailures = 0;
  const onOffline = () => { setConnectionMode('offline'); reconnectFailures = 0; offlineWriteCount.current = 0; try { localStorage.setItem('tbh-went-offline-at', String(Date.now())); localStorage.setItem('tbh-offline-writes', '0'); } catch (e) { handleError(e, { module: 'store', operation: 'LS_WRITE_OFFLINE', severity: 'debug' }); } };
  const onOnline = () => {
    const delay = Math.min(100 * Math.pow(2, reconnectFailures), 5000);
    setTimeout(async () => {
      const success = await fallbackPoll().then(() => true).catch(() => false);
      if (success) {
        reconnectFailures = 0;
        offlineWriteCount.current = 0;
        setConnectionMode('supabase');
        try { localStorage.removeItem('tbh-offline-writes'); replayFailedWrites(); } catch (e) { handleError(e, { module: 'store', operation: 'ONLINE_RECONNECT', severity: 'warn' }); }
      } else { reconnectFailures++; }
    }, delay);
  };
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);

  // Store all cleanup references
  if (bc) ((bc as unknown) as { _onMessage?: () => void })._onMessage = onBcMessage;
  channels.current = [realtimeChannel, { clear: () => window.clearInterval(fallbackTimer) }, onVisibilityChange, onOffline, onOnline, ...(bc ? [bc] : [])];
}

export function cleanupRealtime() {
  abortController.abort();
  abortController = new AbortController();
  if (!deps) return;
  const { channels } = deps;
  channels.current.forEach(item => {
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
  channels.current = [];
}
