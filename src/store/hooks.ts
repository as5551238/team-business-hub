/**
 * Utility hooks extracted from useStore.tsx
 * These hooks provide convenient access to specific slices of the store state.
 * They are re-exports from useStore and can be tree-shaken independently.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useContext, useSyncExternalStore } from 'react';
import type { AppState, Goal, Project, BackupData, Tag, Permission, Category, Template, ScheduleEvent, Note, ItemType, Member, Bookmark, Knowledge } from '@/types';
import { ensureAppStateDefaults } from './types';
import { useStore } from './useStore';
import { hasPermission } from './reducer';

// --- Dashboard statistics hook ---

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

// --- Goal tree hook ---

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

// --- Project tasks hook ---

export function useProjectTasks(projectId: string) {
  const tasks = useStore().state.tasks;
  return useMemo(() => tasks.filter(t => t.projectId === projectId), [tasks, projectId]);
}

// --- Goal projects hook ---

export function useGoalProjects(goalId: string) {
  const { projects, goals } = useStore().state;
  return useMemo(() => {
    function getProjectsForGoal(gid: string): Project[] {
      return [...projects.filter(p => p.goalId === gid), ...goals.filter(g => g.parentId === gid).flatMap(cg => getProjectsForGoal(cg.id))];
    }
    return getProjectsForGoal(goalId);
  }, [projects, goals, goalId]);
}

// --- Item links hook ---

export function useItemLinks(sourceId: string, sourceType: 'goal' | 'project' | 'task') {
  const itemLinks = useStore().state.itemLinks;
  return useMemo(() => itemLinks.filter(l => l.sourceId === sourceId && l.sourceType === sourceType), [itemLinks, sourceId, sourceType]);
}

// --- Member tasks hook ---

export function useMemberTasks(memberId: string) {
  const tasks = useStore().state.tasks;
  return useMemo(() => tasks.filter(t => t.leaderId === memberId || (t.supporterIds ?? []).includes(memberId)), [tasks, memberId]);
}

// --- Backup export hook ---

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

// --- Permissions hook ---

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

// --- Tags hook ---

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

// --- Categories hook ---

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

// --- Templates hook ---

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

// --- Schedule events hook ---

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

// --- Notes hook ---

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

// --- Knowledge hook ---

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

// --- Bookmarks hook ---

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

// --- Viewing member hook ---

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

// --- Member data hook ---

export function useMemberData(memberId: string) {
  const { goals, projects, tasks, activities } = useStore().state;
  const memberGoals = goals.filter(g => g.leaderId === memberId || (g.supporterIds ?? []).includes(memberId));
  const memberProjects = projects.filter(p => p.leaderId === memberId || (p.supporterIds ?? []).includes(memberId));
  const memberTasks = tasks.filter(t => t.leaderId === memberId || (t.supporterIds ?? []).includes(memberId));
  const memberActivities = activities.filter(a => a.memberId === memberId);
  return { goals: memberGoals, projects: memberProjects, tasks: memberTasks, activities: memberActivities };
}

// --- Review list hook ---

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
