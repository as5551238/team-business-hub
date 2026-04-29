import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState, useMemo, type ReactNode } from 'react';
import type { AppState, Goal, Project, BackupData, Tag, Permission, Category, Template, ScheduleEvent, Note, ItemType, Comment, Member, Bookmark } from '@/types';
import { getSupabaseClient, isSupabaseConfigured, initSupabase, resetSupabase } from '@/supabase/client';
import type { ConnectionMode, SupabaseConfig, Action } from './types';
import { SUPABASE_CONFIG_KEY } from './types';
import { reducer } from './reducer';
import { loadLocalState, saveLocalStateImmediate, fetchAllFromSupabase, supabaseUpsert } from './supabase';
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

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => { saveLocalStateImmediate(state); }, 2000);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        saveLocalStateImmediate(state);
      }
    };
  }, [state]);

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
    } catch {
    }
    return () => { connectAbortRef.current = true; cleanupRealtime(); };
  }, []);

  const connectAbortRef = useRef(false);
  const doConnect = useCallback(async (url: string, anonKey: string): Promise<boolean> => {
    connectAbortRef.current = false;
    setConnectionMode('loading');
    setConnectionError(null);
    try {
      cleanupRealtime();
      initSupabase(url, anonKey);
      const data = await fetchAllFromSupabase();
      if (connectAbortRef.current) return false;
      if (data && data.members.length > 0) {
        dispatch({ type: 'MERGE_STATE', payload: data });
        localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey }));
        setConnectionMode('supabase');
        setupRealtime();
        return true;
      } else {
        localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey }));
        setConnectionMode('supabase');
        setupRealtime();
        return true;
      }
    } catch (e: any) {
      setConnectionError(e.message || '连接失败');
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
      if (fresh) dispatch({ type: 'MERGE_STATE', payload: fresh });
      setConnectionMode('supabase');
      return true;
    } catch (e: any) {
      setConnectionError(e.message || '初始化失败');
      setConnectionMode('local');
      return false;
    }
  }, []);

  function setupRealtime() {
    cleanupRealtime();
    const sb = getSupabaseClient();
    if (!sb) return;
    const rtDebounce = new Map<string, ReturnType<typeof setTimeout>>();
    const tables = ['goals', 'projects', 'tasks', 'members', 'notifications', 'activities', 'item_links', 'reviews', 'categories', 'templates', 'schedule_events', 'notes', 'comments'];
    const channels = tables.map(table => {
      const ch = sb!.channel(`realtime-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          const pending = rtDebounce.get(table);
          if (pending) clearTimeout(pending);
          rtDebounce.set(table, setTimeout(async () => {
            rtDebounce.delete(table);
            try {
              const { data } = await sb.from(table).select('*');
              const key = table === 'item_links' ? 'itemLinks' : table === 'schedule_events' ? 'scheduleEvents' : table;
              dispatch({ type: 'MERGE_STATE', payload: { [key]: data || [] } });
            } catch {
            }
          }, 2000));
        })
        .subscribe();
      return ch;
    });
    realtimeChannels.current = channels;
  }

  function cleanupRealtime() {
    realtimeChannels.current.forEach(ch => { try { ch.unsubscribe(); } catch {
    } });
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

  // Actions context: stable reference (does NOT include state)
  const actionsValue = useMemo<ActionsContextType>(() => ({
    dispatch, connectionMode,
    connectSupabase: doConnect, disconnectSupabase: disconnect,
    initializeSupabaseData: doInitializeData, connectionError, stateRef
  }), [dispatch, connectionMode, doConnect, disconnect, doInitializeData, connectionError]);

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
  // Runtime safety: ensure critical array fields are always arrays even if corrupted
  if (!Array.isArray(state.members)) (state as any).members = [];
  if (!Array.isArray(state.goals)) (state as any).goals = [];
  if (!Array.isArray(state.projects)) (state as any).projects = [];
  if (!Array.isArray(state.tasks)) (state as any).tasks = [];
  return { state, ...actions };
}

/**

export function useDashboardStats() {
  const { goals, projects, tasks, notifications, currentUser } = useStore().state;
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();
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
}

export function useGoalTree() {
  const goals = useStore().state.goals;
  function buildTree(parentId: string | null, visited?: Set<string>): (Goal & { children: Goal[] })[] {
    const visitedSet = visited || new Set<string>();
    return goals.filter(g => g.parentId === parentId).map(g => {
      if (visitedSet.has(g.id)) return { ...g, children: [] }; // cycle detection
      visitedSet.add(g.id);
      return { ...g, children: buildTree(g.id, visitedSet) };
    });
  }
  return buildTree(null);
}

export function useProjectTasks(projectId: string) {
  const tasks = useStore().state.tasks;
  return tasks.filter(t => t.projectId === projectId);
}

export function useGoalProjects(goalId: string) {
  const { projects, goals } = useStore().state;
  function getProjectsForGoal(gid: string): Project[] {
    return [...projects.filter(p => p.goalId === gid), ...goals.filter(g => g.parentId === gid).flatMap(cg => getProjectsForGoal(cg.id))];
  }
  return getProjectsForGoal(goalId);
}

export function useItemLinks(sourceId: string, sourceType: 'goal' | 'project' | 'task') {
  const itemLinks = useStore().state.itemLinks;
  return itemLinks.filter(l => l.sourceId === sourceId && l.sourceType === sourceType);
}

export function useMemberTasks(memberId: string) {
  const tasks = useStore().state.tasks;
  return tasks.filter(t => t.leaderId === memberId || (t.supporterIds || []).includes(memberId));
}

export function useBackupExport(): BackupData {
  const { members, goals, projects, tasks, notifications, activities, itemLinks, tags, categories, templates, scheduleEvents, notes, reviews } = useStore().state;
  return {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    members, goals, projects, tasks, notifications, activities, itemLinks,
    tags, categories, templates, scheduleEvents, notes, reviews,
  };
}

function hasPermission(state: AppState, memberId: string, permission: Permission): boolean {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return false;
  if (member.role === 'admin') return true;
  if (member.permissions && member.permissions.length > 0) {
    if (member.permissions.includes('deny_all')) return false;
    if (member.permissions.includes(permission)) return true;
    return false;
  }
  if (member.role === 'manager') {
    return !['manage_team', 'manage_settings'].includes(permission);
  }
  return ['view_goals', 'view_projects', 'view_tasks'].includes(permission);
}

export function usePermissions() {
  const { state, dispatch } = useStore();
  const user = state.currentUser;
  return {
    can: (permission: Permission) => user ? hasPermission(state, user.id, permission) : false,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager' || user?.role === 'admin',
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
  const memberGoals = goals.filter(g => g.leaderId === memberId || (g.supporterIds || []).includes(memberId));
  const memberProjects = projects.filter(p => p.leaderId === memberId || (p.supporterIds || []).includes(memberId));
  const memberTasks = tasks.filter(t => t.leaderId === memberId || (t.supporterIds || []).includes(memberId));
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
