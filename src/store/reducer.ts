import type { AppState, Goal, Project, Task, Member, SubTask, ItemLink, Bookmark, Permission, StatusFlowRule, AutomationRule, Sprint, Knowledge } from '@/types';
import { isSupabaseConfigured } from '@/supabase/client';
import type { Action } from './types';
import { ensureAppStateDefaults } from './types';
import { supabaseUpsert, supabaseUpdate, supabaseInsert, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';
import { hasPermission, reducerCanDelete, canDeleteOwnContent, needMutate, tsNow, clampComment, markPendingDelete, cleanPendingDeletes, isPendingDelete, validateNewFlowRule } from './shared';
import { goalReducer } from './goalSlice';
import { projectReducer } from './projectSlice';
import { taskReducer } from './taskSlice';
import { coreReducer } from './coreSlice';

// Re-export hasPermission for external consumers
export { hasPermission } from './shared';

/* shared functions moved to ./shared.ts */
















let lastSyncNotificationTime = 0;

// Map DB table names to AppState keys for Realtime events
const TABLE_TO_STATE_KEY: Record<string, string> = {
  goals: 'goals',
  projects: 'projects',
  tasks: 'tasks',
  members: 'members',
  notifications: 'notifications',
  activities: 'activities',
  comments: 'comments',
  tags: 'tags',
  categories: 'categories',
  notes: 'notes',
  bookmarks: 'bookmarks',
  item_links: 'itemLinks',
  saved_views: 'savedViews',
  reviews: 'reviews',
  templates: 'templates',
  schedule_events: 'scheduleEvents',
  knowledge: 'knowledge',
  sprints: 'sprints',
  teams: 'teams',
  team_members: 'teamMembers',
};

export function reducer(state: AppState, action: Action): AppState {
  const goalResult = goalReducer(state, action);
  if (goalResult !== null) return goalResult;
  const projectResult = projectReducer(state, action);
  if (projectResult !== null) return projectResult;
  const taskResult = taskReducer(state, action);
  if (taskResult !== null) return taskResult;
  const coreResult = coreReducer(state, action);
  if (coreResult !== null) return coreResult;
  switch (action.type) {
    case 'SET_STATE':
      return ensureAppStateDefaults(action.payload);

    case 'MERGE_STATE': {
      const payloadArrKeys = Object.keys(action.payload).filter(k => Array.isArray((action.payload as Record<string, unknown>)[k])) as (keyof AppState)[];
      const mergeKeys: (keyof AppState)[] = [...payloadArrKeys, 'notifications'];
      if (action.payload.currentUser) mergeKeys.push('currentUser');
      if ('viewingMemberId' in action.payload) mergeKeys.push('viewingMemberId');
      const s = needMutate(state, mergeKeys);
      const payload = action.payload;
      cleanPendingDeletes();
      const pruneTables = new Set(['goals', 'projects', 'tasks', 'members', 'tags', 'statusFlowRules', 'automationRules', 'sprints']);
      const teamScopedTables = new Set(['goals', 'projects', 'tasks', 'notifications', 'activities', 'itemLinks', 'comments', 'categories', 'templates', 'scheduleEvents', 'notes', 'reviews', 'tags', 'bookmarks', 'savedViews', 'statusFlowRules', 'automationRules', 'sprints', 'knowledge']);
      const currentTeam = s.currentTeamId;
      const now = Date.now();
      let conflictCount = 0;
      const conflictNames: string[] = [];
      let offlineSince = 0;
      try { offlineSince = parseInt(localStorage.getItem('tbh-went-offline-at') || '0'); } catch {}
      for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
        const newVal = payload[key];
        if (!Array.isArray(newVal)) {
          if (key === 'currentUser' && !newVal && s[key]) continue;
          (s as Record<string, unknown>)[key as string] = newVal;
          continue;
        }
        if (!Array.isArray(s[key])) continue;
        const localArr = s[key] as Array<Record<string, unknown>>;
        let remoteArr = newVal as Array<Record<string, unknown>>;
        if (currentTeam && teamScopedTables.has(key)) {
          remoteArr = remoteArr.filter((item) => !item.teamId || item.teamId === currentTeam || item.teamId === '__default__');
        }
        const remoteIds = new Set(remoteArr.map((item) => item.id as string));
        const localIds = new Map(localArr.map((item) => [item.id as string, item]));
        const merged: Array<Record<string, unknown>> = [];
        for (const remoteItem of remoteArr) {
          if (isPendingDelete(remoteItem.id as string)) continue;
          if (localIds.has(remoteItem.id as string)) {
            const localItem = localIds.get(remoteItem.id as string)!;
            const localUpdated = new Date((localItem.updatedAt as string) || (localItem.updated_at as string) || 0);
            const remoteUpdated = new Date((remoteItem.updatedAt as string) || (remoteItem.updated_at as string) || 0);
            if (remoteUpdated > localUpdated && localUpdated.getTime() > 0) {
              const locAge = Date.now() - localUpdated.getTime();
              if (locAge < 300000) { logActivity({ memberId: s.currentUser?.id, action: 'sync_overwrite', targetType: key as string, targetId: remoteItem.id as string, targetTitle: (remoteItem.title as string) || (remoteItem.name as string) || '数据', details: '数据已被其他设备更新' }); conflictCount++; if (conflictNames.length < 3) conflictNames.push((remoteItem.title as string) || (remoteItem.name as string) || '数据'); }
            }
            merged.push(remoteUpdated > localUpdated ? { ...localItem, ...remoteItem } : localItem);
          } else {
            merged.push(remoteItem);
          }
        }
        if (pruneTables.has(key)) {
          for (const localItem of localArr) {
            if (remoteIds.has(localItem.id as string)) continue;
            if (isPendingDelete(localItem.id as string)) continue;
            const age = now - new Date((localItem.createdAt as string) || (localItem.created_at as string) || 0).getTime();
            if (age < 30000) { merged.push(localItem); continue; }
            if (!localItem.createdAt && !localItem.created_at) { merged.push(localItem); continue; }
            if (offlineSince > 0) { merged.push(localItem); continue; }
          }
        } else {
          for (const localItem of localArr) {
            if (remoteIds.has(localItem.id as string)) continue;
            merged.push(localItem);
          }
        }
        (s as Record<string, unknown>)[key as string] = merged;
      }
      if (offlineSince > 0) { try { localStorage.removeItem('tbh-went-offline-at'); } catch {} }
      if (conflictCount > 0 && now - lastSyncNotificationTime > 60000) {
        lastSyncNotificationTime = now;
        const desc = conflictCount <= 3 ? conflictNames.join('、') : `${conflictNames.slice(0, 2).join('、')} 等${conflictCount}项`;
        s.notifications.unshift({ id: `sync-${Date.now()}-conflict`, type: 'sync', title: '数据同步更新', message: `${desc} 已被其他设备更新`, read: false, createdAt: new Date().toISOString(), relatedId: '', relatedType: 'task', memberId: s.currentUser?.id || '' });
      }
      return ensureAppStateDefaults(s as Partial<AppState> & { members: Member[] });
    }

    case 'SET_CONNECTION_MODE':
      return state;

    case 'SET_CURRENT_USER': {
      const s = needMutate(state, ['currentUser']);
      s.currentUser = state.members.find(m => m.id === action.payload) || null;
      return s;
    }

    case 'SET_VIEWING_MEMBER': {
      const s = needMutate(state, ['viewingMemberId']);
      s.viewingMemberId = action.payload;
      return s;
    }

    case 'SET_CURRENT_TEAM': {
      const s = needMutate(state, ['currentTeamId']);
      s.currentTeamId = action.payload;
      try { localStorage.setItem('tbh-current-team', action.payload || ''); } catch {}
      return s;
    }

    case 'REALTIME_UPSERT': {
      const { table, item } = action.payload;
      const stateKey = TABLE_TO_STATE_KEY[table];
      if (!stateKey) return state;
      const arr = (state as Record<string, unknown>)[stateKey];
      if (!Array.isArray(arr)) return state;
      const itemId = (item as Record<string, unknown>).id as string;
      if (!itemId) return state;
      const idx = (arr as Array<Record<string, unknown>>).findIndex((r: Record<string, unknown>) => (r as Record<string, unknown>).id === itemId);
      const s = needMutate(state, [stateKey as keyof AppState]);
      const currentArr = (s as Record<string, unknown>)[stateKey] as Array<Record<string, unknown>>;
      if (idx >= 0) {
        // LWW per-field: for each field in the incoming item, take the remote
        // value only if remote updatedAt >= local updatedAt, preserving local
        // edits to other fields that were made more recently.
        const local = currentArr[idx];
        const localUpdated = new Date((local.updatedAt as string) || 0).getTime();
        const remoteUpdated = new Date((item.updatedAt as string) || (item.updated_at as string) || 0).getTime();
        if (remoteUpdated >= localUpdated) {
          // Remote is newer or same — merge field-by-field
          const merged: Record<string, unknown> = { ...local };
          for (const [key, value] of Object.entries(item)) {
            if (key === 'id') continue; // never overwrite id
            if (value !== undefined && value !== null) {
              merged[key] = value;
            }
          }
          // Always take the latest updatedAt
          if (item.updatedAt || item.updated_at) {
            merged.updatedAt = item.updatedAt || item.updated_at;
          }
          currentArr[idx] = merged;
        }
        // If local is strictly newer, skip — our optimistic write is more recent
      } else {
        currentArr.push(item);
      }
      return s;
    }

    case 'REALTIME_DELETE': {
      const { table, id } = action.payload;
      const stateKey = TABLE_TO_STATE_KEY[table];
      if (!stateKey) return state;
      const arr = (state as Record<string, unknown>)[stateKey];
      if (!Array.isArray(arr)) return state;
      const idx = (arr as Array<Record<string, unknown>>).findIndex((r: Record<string, unknown>) => (r as Record<string, unknown>).id === id);
      if (idx < 0) return state;
      const s = needMutate(state, [stateKey as keyof AppState]);
      ((s as Record<string, unknown>)[stateKey] as Array<Record<string, unknown>>).splice(idx, 1);
      return s;
    }

    case 'ADD_ITEM_LINK': {
      const s = needMutate(state, ['itemLinks']);
      const now = tsNow();
      const link: ItemLink = { ...action.payload, id: genId('lnk'), createdAt: now };
      s.itemLinks.push(link);
      supabaseInsert('item_links', link);
      return s;
    }

    case 'DELETE_ITEM_LINK': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['itemLinks']);
      markPendingDelete(action.payload);
      s.itemLinks = s.itemLinks.filter(l => l.id !== action.payload);
      supabaseDelete('item_links', action.payload);
      return s;
    }

    case 'IMPORT_BACKUP': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const backup = action.payload;
      if (!backup || typeof backup !== 'object') return state;
      const requiredArrays = ['members', 'goals', 'projects', 'tasks'];
      for (const key of requiredArrays) {
        if (!Array.isArray(backup[key])) return state;
      }
      const MAX_ITEMS = 10000;
      for (const key of requiredArrays) {
        if (backup[key].length > MAX_ITEMS) return state;
      }
      const imported: AppState = {
        members: backup.members,
        goals: backup.goals,
        projects: backup.projects,
        tasks: backup.tasks,
        notifications: backup.notifications,
        activities: backup.activities,
        itemLinks: backup.itemLinks ?? [],
        tags: backup.tags ?? [],
        categories: backup.categories ?? [],
        templates: backup.templates ?? [],
        scheduleEvents: backup.scheduleEvents ?? [],
        notes: backup.notes ?? [],
        savedViews: backup.savedViews ?? [],
        reviews: backup.reviews ?? [],
        comments: backup.comments ?? [],
        bookmarks: backup.bookmarks ?? [],
        batchOperations: backup.batchOperations ?? [],
        statusFlowRules: backup.statusFlowRules ?? [],
        automationRules: backup.automationRules ?? [],
        sprints: backup.sprints ?? [],
        knowledge: backup.knowledge ?? [],
        teams: backup.teams ?? [],
        teamMembers: backup.teamMembers ?? [],
        currentUser: state.currentUser,
        viewingMemberId: state.viewingMemberId,
      };
      if (isSupabaseConfigured()) {
        supabaseUpsert('members', imported.members);
        supabaseUpsert('goals', imported.goals);
        supabaseUpsert('projects', imported.projects);
        supabaseUpsert('tasks', imported.tasks);
        supabaseUpsert('notifications', imported.notifications);
        supabaseUpsert('activities', imported.activities);
        if (imported.itemLinks.length > 0) supabaseUpsert('item_links', imported.itemLinks);
        if (imported.tags.length > 0) supabaseUpsert('tags', imported.tags);
        if (imported.categories.length > 0) supabaseUpsert('categories', imported.categories);
        if (imported.templates.length > 0) supabaseUpsert('templates', imported.templates);
        if (imported.scheduleEvents.length > 0) supabaseUpsert('schedule_events', imported.scheduleEvents);
        if (imported.notes.length > 0) supabaseUpsert('notes', imported.notes);
        if (imported.reviews.length > 0) supabaseUpsert('reviews', imported.reviews);
        if (imported.comments.length > 0) supabaseUpsert('comments', imported.comments);
        if (imported.bookmarks.length > 0) supabaseUpsert('bookmarks', imported.bookmarks);
        if (imported.savedViews.length > 0) supabaseUpsert('saved_views', imported.savedViews);
        if (imported.statusFlowRules.length > 0) supabaseUpsert('status_flow_rules', imported.statusFlowRules);
        if (imported.automationRules.length > 0) supabaseUpsert('automation_rules', imported.automationRules);
        if (imported.sprints.length > 0) supabaseUpsert('sprints', imported.sprints);
        if (imported.knowledge.length) { supabaseUpsert('knowledge', imported.knowledge.map(k => ({ ...k }))); }
        if (imported.teams.length) { supabaseUpsert('teams', imported.teams.map(t => ({ ...t }))); }
        if (imported.teamMembers.length) { supabaseUpsert('team_members', imported.teamMembers.map(m => ({ ...m }))); }
      }
      return ensureAppStateDefaults(imported);
    }

    case 'RESET_DATA': {
      if (!state.currentUser || state.currentUser.role !== 'admin') return state;
      return ensureAppStateDefaults(action.payload);
    }

  }
  return state;
}
