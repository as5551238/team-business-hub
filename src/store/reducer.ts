import type { AppState, Goal, Project, Task, Member, SubTask, ItemLink, BackupData, Bookmark, Permission } from '@/types';
import { isSupabaseConfigured } from '@/supabase/client';
import type { Action } from './types';
import { ensureAppStateDefaults } from './types';
import { supabaseUpsert, supabaseUpdate, supabaseInsert, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';

export function hasPermission(state: AppState, memberId: string, permission: Permission): boolean {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return false;
  if (member.role === 'admin') return true;
  if (member.permissions && member.permissions.length > 0) {
    if (member.permissions.includes('deny_all')) return false;
    if (member.permissions.includes(permission)) return true;
    return false;
  }
  if (member.role === 'manager' || member.role === 'leader') {
    return !['manage_team', 'manage_settings'].includes(permission);
  }
  // member: view + edit, but NO delete/manage_team/manage_settings/export_data
  if (member.role === 'member') {
    const forbidden = new Set(['manage_team', 'manage_settings', 'delete_goals', 'delete_projects', 'delete_tasks', 'export_data']);
    return !forbidden.has(permission);
  }
  return false;
}

function reducerCanDelete(state: AppState, permission: Permission): boolean {
  if (!state.currentUser) return false;
  return hasPermission(state, state.currentUser.id, permission);
}

function calcGoalLevel(goals: Goal[], goalId: string, parentId: string | null, visited?: Set<string>): number {
  if (!parentId) return 0;
  const visitedSet = visited || new Set<string>([goalId]);
  if (visitedSet.has(parentId)) return 0; // cycle detection
  visitedSet.add(parentId);
  const parent = goals.find(g => g.id === parentId);
  if (!parent) return 0;
  return calcGoalLevel(goals, parent.id, parent.parentId, visitedSet) + 1;
}

function calcGoalProgress(goals: Goal[], goalId: string, visited?: Set<string>): number {
  const visitedSet = visited || new Set<string>();
  if (visitedSet.has(goalId)) return 0; // cycle detection
  visitedSet.add(goalId);
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return 0;
  if (goal.keyResults.length > 0) {
    return Math.round(goal.keyResults.reduce((sum, kr) =>
      sum + (kr.targetValue > 0 ? Math.min(100, (kr.currentValue / kr.targetValue) * 100) : 0), 0) / goal.keyResults.length);
  }
  const children = goals.filter(g => g.parentId === goalId);
  if (children.length > 0) return Math.round(children.reduce((s, c) => s + calcGoalProgress(goals, c.id, visitedSet), 0) / children.length);
  return 0;
}

function calcProjectProgress(tasks: Task[], projectId: string): number {
  const pt = tasks.filter(t => t.projectId === projectId);
  if (pt.length === 0) return 0;
  return Math.round(pt.filter(t => t.status === 'done').length / pt.length * 100);
}

// Lazy clone: only when we actually mutate state (perf: structuredClone ~3x faster than JSON round-trip)
function needMutate(state: AppState): AppState {
  return structuredClone(state);
}
function tsNow() { return new Date().toISOString(); }

// Track recently-deleted IDs to prevent Realtime MERGE_STATE from re-adding them
// before the async supabaseDelete completes. Items expire after 60 seconds
// (covers multiple Realtime debounce cycles at 2s each + network latency).
const pendingDeletes = new Map<string, number>();
function markPendingDelete(id: string) { pendingDeletes.set(id, Date.now()); }
function cleanPendingDeletes() { const now = Date.now(); for (const [id, t] of pendingDeletes) { if (now - t > 60000) pendingDeletes.delete(id); } }
function isPendingDelete(id: string) { return pendingDeletes.has(id); }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STATE':
      return ensureAppStateDefaults(action.payload);

    case 'MERGE_STATE': {
      // Deep merge: Supabase is source of truth for adding/updating/deleting items.
      // Core tables (goals/projects/tasks/members/tags) use "remote is authority" —
      // local items missing from remote are pruned (deletion sync).
      // Auxiliary tables keep all local items (append-only, no prune).
      const s = needMutate(state);
      const payload = action.payload;
      cleanPendingDeletes();
      // Tables where remote deletion should propagate to local
      const pruneTables = new Set(['goals', 'projects', 'tasks', 'members', 'tags']);
      const now = Date.now();
      for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
        const newVal = payload[key];
        if (!Array.isArray(newVal)) { (s as any)[key] = newVal; continue; }
        if (!Array.isArray(s[key])) continue;
        const localArr = s[key] as any[];
        const remoteArr = newVal as any[];
        const remoteIds = new Set(remoteArr.map((item: any) => item.id));
        const localIds = new Map(localArr.map((item: any) => [item.id, item]));
        const merged: any[] = [];
        for (const remoteItem of remoteArr) {
          if (isPendingDelete(remoteItem.id)) continue;
          if (localIds.has(remoteItem.id)) {
            const localItem = localIds.get(remoteItem.id);
            const localUpdated = new Date(localItem.updatedAt || localItem.updated_at || 0);
            const remoteUpdated = new Date(remoteItem.updatedAt || remoteItem.updated_at || 0);
            merged.push(remoteUpdated > localUpdated ? remoteItem : localItem);
          } else {
            merged.push(remoteItem);
          }
        }
        // For core tables: prune local items not in remote (deleted elsewhere)
        // Exception: keep items created in last 30s (may not have synced yet)
        if (pruneTables.has(key)) {
          for (const localItem of localArr) {
            if (remoteIds.has(localItem.id)) continue;
            if (isPendingDelete(localItem.id)) continue;
            const age = now - new Date(localItem.createdAt || localItem.created_at || 0).getTime();
            if (age < 30000) { merged.push(localItem); continue; }
            // Prune: item deleted from remote
          }
        } else {
          // Auxiliary tables: keep all local items
          for (const localItem of localArr) {
            if (remoteIds.has(localItem.id)) continue;
            merged.push(localItem);
          }
        }
        (s as any)[key] = merged;
      }
      return ensureAppStateDefaults(s as any);
    }

    case 'SET_CONNECTION_MODE':
      return state;

    case 'SET_CURRENT_USER': {
      const s = needMutate(state);
      s.currentUser = state.members.find(m => m.id === action.payload) || null;
      return s;
    }

    case 'SET_VIEWING_MEMBER': {
      const s = needMutate(state);
      s.viewingMemberId = action.payload;
      return s;
    }

    case 'ADD_GOAL': {
      const s = needMutate(state);
      const now = tsNow();
      const payload = action.payload;
      const g: Goal = {
        ...payload,
        id: genId('g'),
        progress: 0,
        priority: payload.priority || 'medium',
        tags: payload.tags || [],
        category: payload.category || '',
        attachments: payload.attachments || [],
        trackingRecords: payload.trackingRecords || [],
        repeatCycle: payload.repeatCycle || 'none',
        selectedKRIds: payload.selectedKRIds || [],
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary || '',
        keyResults: (payload.keyResults || []).map((kr: any) => ({ ...kr, selected: kr.selected ?? true })),
        createdAt: now,
        updatedAt: now,
      };
      s.goals.push(g);
      supabaseInsert('goals', g);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '目标', targetId: g.id, targetTitle: g.title });
      return s;
    }

    case 'UPDATE_GOAL': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.goals.findIndex(g => g.id === action.payload.id);
      if (idx !== -1) {
        const oldUpdatedAt = s.goals[idx].updatedAt;
        s.goals[idx] = { ...s.goals[idx], ...action.payload.updates, updatedAt: now };
        s.goals[idx].progress = calcGoalProgress(s.goals, action.payload.id);
        supabaseUpdate('goals', action.payload.id, { ...action.payload.updates, progress: s.goals[idx].progress, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }

    case 'DELETE_GOAL': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      const now = tsNow();
      const deletedGoal = state.goals.find(g => g.id === action.payload);
      markPendingDelete(action.payload);
      s.goals = s.goals.filter(g => g.id !== action.payload);
      const affectedGoals = s.goals.filter(g => g.parentId === action.payload);
      s.goals.forEach(g => { if (g.parentId === action.payload) g.parentId = null; });
      for (const g of affectedGoals) { supabaseUpdate('goals', g.id, { parent_id: null, updated_at: now }); }
      const affectedProjects = s.projects.filter(p => p.goalId === action.payload);
      s.projects.forEach(p => { if (p.goalId === action.payload) p.goalId = null; });
      for (const p of affectedProjects) { supabaseUpdate('projects', p.id, { goal_id: null, updated_at: now }); }
      supabaseDelete('goals', action.payload);
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '目标', targetId: action.payload, targetTitle: deletedGoal?.title || '' });
      return s;
    }

    case 'MOVE_GOAL_PARENT': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.goals.findIndex(g => g.id === action.payload.goalId);
      if (idx !== -1) {
        s.goals[idx].parentId = action.payload.newParentId;
        s.goals[idx].level = calcGoalLevel(s.goals, action.payload.goalId, action.payload.newParentId);
        s.goals[idx].updatedAt = now;
        function recalcDescendants(parentId: string) {
          s.goals.filter(g => g.parentId === parentId).forEach(child => {
            const p = s.goals.find(pp => pp.id === parentId);
            child.level = (p ? p.level : 0) + 1;
            recalcDescendants(child.id);
          });
        }
        recalcDescendants(action.payload.goalId);
        supabaseUpdate('goals', action.payload.goalId, { parent_id: action.payload.newParentId, level: s.goals[idx].level, updated_at: now });
      }
      return s;
    }

    case 'UPDATE_KEY_RESULT': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.goals.findIndex(g => g.id === action.payload.goalId);
      if (idx !== -1) {
        const g = s.goals[idx];
        g.keyResults = g.keyResults.map(kr => kr.id === action.payload.krId ? { ...kr, currentValue: action.payload.value } : kr);
        g.progress = calcGoalProgress(s.goals, action.payload.goalId);
        g.updatedAt = now;
        if (g.parentId) {
          const pIdx = s.goals.findIndex(p => p.id === g.parentId);
          if (pIdx !== -1) { s.goals[pIdx].progress = calcGoalProgress(s.goals, g.parentId); s.goals[pIdx].updatedAt = now; }
        }
        supabaseUpdate('goals', action.payload.goalId, { key_results: g.keyResults, progress: g.progress, updated_at: now });
      }
      return s;
    }

    case 'ADD_PROJECT': {
      const s = needMutate(state);
      const now = tsNow();
      const payload = action.payload;
      const p: Project = {
        ...payload,
        id: genId('p'),
        progress: 0,
        priority: payload.priority || 'medium',
        category: payload.category || '',
        attachments: payload.attachments || [],
        trackingRecords: payload.trackingRecords || [],
        repeatCycle: payload.repeatCycle || 'none',
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary || '',
        createdAt: now,
        updatedAt: now,
      };
      s.projects.push(p);
      supabaseInsert('projects', p);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '项目', targetId: p.id, targetTitle: p.title });
      return s;
    }

    case 'UPDATE_PROJECT': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.projects.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) {
        const oldUpdatedAt = s.projects[idx].updatedAt;
        s.projects[idx] = { ...s.projects[idx], ...action.payload.updates, updatedAt: now };
        s.projects[idx].progress = calcProjectProgress(s.tasks, action.payload.id);
        supabaseUpdate('projects', action.payload.id, { ...action.payload.updates, progress: s.projects[idx].progress, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }

    case 'DELETE_PROJECT': {
      if (!reducerCanDelete(state, 'delete_projects')) return state;
      const s = needMutate(state);
      const now = tsNow();
      const deletedProject = state.projects.find(p => p.id === action.payload);
      markPendingDelete(action.payload);
      s.projects = s.projects.filter(p => p.id !== action.payload);
      const affectedTasks = s.tasks.filter(t => t.projectId === action.payload);
      s.tasks.forEach(t => { if (t.projectId === action.payload) t.projectId = null; });
      for (const t of affectedTasks) { supabaseUpdate('tasks', t.id, { project_id: null, updated_at: now }); }
      supabaseDelete('projects', action.payload);
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '项目', targetId: action.payload, targetTitle: deletedProject?.title || '' });
      return s;
    }

    case 'ADD_TASK': {
      const s = needMutate(state);
      const now = tsNow();
      const payload = action.payload;
      const t: Task = {
        ...payload,
        id: genId('t'),
        parentId: payload.parentId || null,
        category: payload.category || '',
        attachments: payload.attachments || [],
        trackingRecords: payload.trackingRecords || [],
        repeatCycle: payload.repeatCycle || 'none',
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary || '',
        subtasks: (payload.subtasks || []).map((st: any) => ({
          ...st,
          priority: st.priority || 'medium',
          leaderId: st.leaderId || '',
          supporterIds: st.supporterIds || [],
          tags: st.tags || [],
          attachments: st.attachments || [],
          trackingRecords: st.trackingRecords || [],
          repeatCycle: st.repeatCycle || 'none',
        })),
        createdAt: now,
        updatedAt: now,
      };
      s.tasks.push(t);
      if (t.projectId) {
        const pIdx = s.projects.findIndex(p => p.id === t.projectId);
        if (pIdx !== -1) { s.projects[pIdx].taskCount = (s.projects[pIdx].taskCount || 0) + 1; s.projects[pIdx].progress = calcProjectProgress(s.tasks, t.projectId); }
      }
      supabaseInsert('tasks', t);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '任务', targetId: t.id, targetTitle: t.title });
      return s;
    }

    case 'UPDATE_TASK': {
      const s = needMutate(state);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.id);
      if (tIdx !== -1) {
        const oldTask = s.tasks[tIdx];
        s.tasks[tIdx] = { ...oldTask, ...action.payload.updates, updatedAt: now };
        if (action.payload.updates.status && action.payload.updates.status !== oldTask.status) {
          if (oldTask.projectId) {
            const pIdx = s.projects.findIndex(p => p.id === oldTask.projectId);
            if (pIdx !== -1) s.projects[pIdx].progress = calcProjectProgress(s.tasks, oldTask.projectId);
          }
        }
        supabaseUpdate('tasks', action.payload.id, { ...action.payload.updates, updated_at: now }, oldTask.updatedAt);
      }
      return s;
    }

    case 'DELETE_TASK': {
      if (!reducerCanDelete(state, 'delete_tasks')) return state;
      const s = needMutate(state);
      const now = tsNow();
      markPendingDelete(action.payload);
      const t = s.tasks.find(t => t.id === action.payload);
      s.tasks = s.tasks.filter(t => t.id !== action.payload);
      const affectedTasks = s.tasks.filter(t => t.parentId === action.payload);
      s.tasks.forEach(tk => { if (tk.parentId === action.payload) tk.parentId = null; });
      for (const t2 of affectedTasks) { supabaseUpdate('tasks', t2.id, { parent_id: null, updated_at: now }); }
      if (t?.projectId) {
        const pIdx = s.projects.findIndex(p => p.id === t.projectId);
        if (pIdx !== -1) { s.projects[pIdx].taskCount = Math.max(0, (s.projects[pIdx].taskCount || 0) - 1); s.projects[pIdx].progress = calcProjectProgress(s.tasks, t.projectId); }
      }
      supabaseDelete('tasks', action.payload);
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '任务', targetId: action.payload, targetTitle: t?.title || '' });
      return s;
    }

    case 'TOGGLE_SUBTASK': {
      const s = needMutate(state);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.taskId);
      if (tIdx !== -1) {
        s.tasks[tIdx].subtasks = s.tasks[tIdx].subtasks.map(st =>
          st.id === action.payload.subtaskId ? { ...st, completed: !st.completed } : st
        );
        s.tasks[tIdx].updatedAt = now;
        supabaseUpdate('tasks', action.payload.taskId, { subtasks: s.tasks[tIdx].subtasks, updated_at: now });
      }
      return s;
    }

    case 'ADD_SUBTASK': {
      const s = needMutate(state);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.taskId);
      if (tIdx !== -1) {
        const subPayload = action.payload.subtask;
        const newSub: SubTask = {
          ...subPayload,
          id: genId('st'),
          priority: subPayload.priority || 'medium',
          leaderId: subPayload.leaderId || '',
          supporterIds: subPayload.supporterIds || [],
          tags: subPayload.tags || [],
          attachments: subPayload.attachments || [],
          trackingRecords: subPayload.trackingRecords || [],
          repeatCycle: subPayload.repeatCycle || 'none',
          createdAt: now,
        };
        s.tasks[tIdx].subtasks.push(newSub);
        s.tasks[tIdx].updatedAt = now;
        supabaseUpdate('tasks', action.payload.taskId, { subtasks: s.tasks[tIdx].subtasks, updated_at: now });
      }
      return s;
    }

    case 'ADD_ITEM_LINK': {
      const s = needMutate(state);
      const now = tsNow();
      const link: ItemLink = { ...action.payload, id: genId('lnk'), createdAt: now };
      s.itemLinks.push(link);
      supabaseInsert('item_links', link);
      return s;
    }

    case 'DELETE_ITEM_LINK': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.itemLinks = s.itemLinks.filter(l => l.id !== action.payload);
      supabaseDelete('item_links', action.payload);
      return s;
    }

    case 'IMPORT_BACKUP': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const backup = action.payload;
      const imported: AppState = {
        members: backup.members,
        goals: backup.goals,
        projects: backup.projects,
        tasks: backup.tasks,
        notifications: backup.notifications,
        activities: backup.activities,
        itemLinks: backup.itemLinks || [],
        tags: backup.tags || [],
        categories: backup.categories || [],
        templates: backup.templates || [],
        scheduleEvents: backup.scheduleEvents || [],
        notes: backup.notes || [],
        savedViews: (backup as any).savedViews || [],
        reviews: backup.reviews || [],
        comments: (backup as any).comments || [],
        bookmarks: (backup as any).bookmarks || [],
        batchOperations: (backup as any).batchOperations || [],
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
      }
      return ensureAppStateDefaults(imported);
    }

    case 'MARK_NOTIFICATION_READ': {
      const s = needMutate(state);
      const idx = s.notifications.findIndex(n => n.id === action.payload);
      if (idx !== -1) { s.notifications[idx].read = true; supabaseUpdate('notifications', action.payload, { read: true }); }
      return s;
    }

    case 'MARK_ALL_NOTIFICATIONS_READ': {
      const s = needMutate(state);
      s.notifications.forEach(n => n.read = true);
      return s;
    }

    case 'ADD_NOTIFICATION': {
      const s = needMutate(state);
      s.notifications.unshift({ ...action.payload, read: action.payload.read ?? false });
      return s;
    }

    case 'ADD_MEMBER': {
      if (!reducerCanDelete(state, 'manage_team')) return state;
      const s = needMutate(state);
      const m: Member = { ...action.payload, id: (action.payload as any).id || genId('m'), joinDate: new Date().toISOString().split('T')[0] };
      s.members.push(m);
      supabaseInsert('members', m);
      return s;
    }

    case 'UPDATE_MEMBER': {
      const s = needMutate(state);
      const isSelf = state.currentUser?.id === action.payload.id;
      const isAdmin = state.currentUser?.role === 'admin';
      const canManageTeam = hasPermission(state, state.currentUser?.id || '', 'manage_team');
      if (!isSelf && !isAdmin && !canManageTeam) return state;
      const idx = s.members.findIndex(m => m.id === action.payload.id);
      if (idx !== -1) {
        // Non-admins cannot change role
        if (!isAdmin && (action.payload.updates as any).role !== undefined) {
          (action.payload.updates as any).role = s.members[idx].role;
        }
        s.members[idx] = { ...s.members[idx], ...action.payload.updates };
        if (state.currentUser?.id === action.payload.id) s.currentUser = { ...state.currentUser, ...action.payload.updates } as Member;
        supabaseUpdate('members', action.payload.id, action.payload.updates);
      }
      return s;
    }

    case 'DELETE_MEMBER': {
      if (!reducerCanDelete(state, 'manage_team')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      // Soft-delete: set status='inactive' immediately (prevents re-appearance)
      s.members = s.members.filter(m => m.id !== action.payload);
      // Set inactive in Supabase first (resilient to race conditions)
      supabaseUpdate('members', action.payload, { status: 'inactive' });
      // Hard delete from Supabase in background (best-effort cleanup)
      supabaseDelete('members', action.payload);
      return s;
    }

    case 'RESET_DATA': {
      if (!state.currentUser || state.currentUser.role !== 'admin') return state;
      return ensureAppStateDefaults(action.payload);
    }

    case 'ADD_TAG': {
      const s = needMutate(state);
      const now = tsNow();
      const tag = { ...action.payload, id: genId('tag'), createdAt: now, updatedAt: now };
      s.tags.push(tag);
      supabaseInsert('tags', tag);
      return s;
    }

    case 'UPDATE_TAG': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.tags.findIndex(t => t.id === action.payload.id);
      if (idx !== -1) { s.tags[idx] = { ...s.tags[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('tags', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_TAG': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.tags = s.tags.filter(t => t.id !== action.payload);
      supabaseDelete('tags', action.payload);
      return s;
    }

    case 'ADD_SAVED_VIEW': {
      const s = needMutate(state);
      const now = tsNow();
      const view = { ...action.payload, id: genId('sv'), createdAt: now };
      s.savedViews.push(view);
      supabaseInsert('saved_views', view);
      return s;
    }

    case 'DELETE_SAVED_VIEW': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.savedViews = s.savedViews.filter(v => v.id !== action.payload);
      supabaseDelete('saved_views', action.payload);
      return s;
    }

    case 'ADD_REVIEW': {
      const s = needMutate(state);
      const now = tsNow();
      const r = { ...action.payload, id: genId('rv'), createdAt: now, updatedAt: now };
      s.reviews.push(r);
      supabaseInsert('reviews', r);
      return s;
    }

    case 'UPDATE_REVIEW': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.reviews.findIndex(r => r.id === action.payload.id);
      if (idx !== -1) { s.reviews[idx] = { ...s.reviews[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('reviews', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_REVIEW': {
      if (!reducerCanDelete(state, 'manage_team')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.reviews = s.reviews.filter(r => r.id !== action.payload);
      supabaseDelete('reviews', action.payload);
      return s;
    }

    case 'ADD_CATEGORY': {
      const s = needMutate(state);
      const now = tsNow();
      const c = { ...action.payload, id: genId('cat'), createdAt: now };
      s.categories.push(c);
      supabaseInsert('categories', c);
      return s;
    }

    case 'UPDATE_CATEGORY': {
      const s = needMutate(state);
      const idx = s.categories.findIndex(c => c.id === action.payload.id);
      if (idx !== -1) { s.categories[idx] = { ...s.categories[idx], ...action.payload.updates }; supabaseUpdate('categories', action.payload.id, action.payload.updates); }
      return s;
    }

    case 'DELETE_CATEGORY': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.categories = s.categories.filter(c => c.id !== action.payload);
      supabaseDelete('categories', action.payload);
      return s;
    }

    case 'SET_CATEGORIES': {
      const s = needMutate(state);
      s.categories = action.payload;
      return s;
    }

    case 'ADD_TEMPLATE': {
      const s = needMutate(state);
      const now = tsNow();
      const t = { ...action.payload, id: genId('tpl'), createdAt: now, updatedAt: now };
      s.templates.push(t);
      supabaseInsert('templates', t);
      return s;
    }

    case 'UPDATE_TEMPLATE': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.templates.findIndex(t => t.id === action.payload.id);
      if (idx !== -1) { s.templates[idx] = { ...s.templates[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('templates', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_TEMPLATE': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.templates = s.templates.filter(t => t.id !== action.payload);
      supabaseDelete('templates', action.payload);
      return s;
    }

    case 'ADD_SCHEDULE_EVENT': {
      const s = needMutate(state);
      const now = tsNow();
      const e = { ...action.payload, id: genId('evt'), createdAt: now, updatedAt: now };
      s.scheduleEvents.push(e);
      supabaseInsert('schedule_events', e);
      return s;
    }

    case 'UPDATE_SCHEDULE_EVENT': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.scheduleEvents.findIndex(e => e.id === action.payload.id);
      if (idx !== -1) { s.scheduleEvents[idx] = { ...s.scheduleEvents[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('schedule_events', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_SCHEDULE_EVENT': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.scheduleEvents = s.scheduleEvents.filter(e => e.id !== action.payload);
      supabaseDelete('schedule_events', action.payload);
      return s;
    }

    case 'ADD_NOTE': {
      const s = needMutate(state);
      const now = tsNow();
      const n = { ...action.payload, id: genId('note'), createdAt: now, updatedAt: now };
      s.notes.push(n);
      supabaseInsert('notes', n);
      return s;
    }

    case 'UPDATE_NOTE': {
      const s = needMutate(state);
      const now = tsNow();
      const idx = s.notes.findIndex(n => n.id === action.payload.id);
      if (idx !== -1) { s.notes[idx] = { ...s.notes[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('notes', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_NOTE': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.notes = s.notes.filter(n => n.id !== action.payload);
      supabaseDelete('notes', action.payload);
      return s;
    }

    case 'ADD_COMMENT': {
      const comments = state.comments || [];
      const comment = { ...action.payload, id: `c_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, createdAt: new Date().toISOString() };
      supabaseInsert('comments', comment);
      return { ...state, comments: [...comments, comment] };
    }

    case 'DELETE_COMMENT': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      markPendingDelete(action.payload);
      const comments = state.comments || [];
      supabaseDelete('comments', action.payload);
      return { ...state, comments: comments.filter(c => c.id !== action.payload) };
    }

    case 'UPDATE_COMMENT': {
      const comments = state.comments || [];
      supabaseUpdate('comments', action.payload.id, action.payload.updates);
      return { ...state, comments: comments.map(c => c.id === action.payload.id ? { ...c, ...action.payload.updates } : c) };
    }

    case 'ADD_BOOKMARK': {
      const s = needMutate(state);
      const b: Bookmark = { ...action.payload, id: genId('bm'), createdAt: new Date().toISOString() };
      s.bookmarks.push(b);
      supabaseInsert('bookmarks', b);
      return s;
    }

    case 'UPDATE_BOOKMARK': {
      const s = needMutate(state);
      const idx = s.bookmarks.findIndex(b => b.id === action.payload.id);
      if (idx !== -1) { s.bookmarks[idx] = { ...s.bookmarks[idx], ...action.payload.updates }; supabaseUpdate('bookmarks', action.payload.id, action.payload.updates); }
      return s;
    }

    case 'DELETE_BOOKMARK': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const s = needMutate(state);
      markPendingDelete(action.payload);
      s.bookmarks = s.bookmarks.filter(b => b.id !== action.payload);
      supabaseDelete('bookmarks', action.payload);
      return s;
    }

    case 'REORDER_BOOKMARKS': {
      const s = needMutate(state);
      s.bookmarks = action.payload;
      // Bulk upsert for reorder
      if (action.payload.length > 0 && isSupabaseConfigured()) {
        supabaseUpsert('bookmarks', action.payload);
      }
      return s;
    }

    case 'SET_BOOKMARKS': {
      const s = needMutate(state);
      s.bookmarks = action.payload;
      return s;
    }
  }
  return state;
}
