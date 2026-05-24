import type { AppState, Goal, Project, Task, Member, SubTask, ItemLink, Bookmark, Permission, StatusFlowRule, AutomationRule, Sprint } from '@/types';
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
  // member: view + edit + delete_own_content, but NO delete_goals/projects/tasks/manage_team/manage_settings/export_data
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

// For delete_own_content: admin/manager can delete all, member can only delete own content
function canDeleteOwnContent(state: AppState, creatorId: string | undefined): boolean {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'admin' || state.currentUser.role === 'manager' || state.currentUser.role === 'leader') return true;
  // If no owner info (pre-existing data), allow deletion by any logged-in user
  if (!creatorId) return true;
  return creatorId === state.currentUser.id;
}

/** Generate 'assigned' notifications for newly added leader/supporters (skip self). */
function notifyAssigned(
  s: any, currentUserId: string | undefined,
  memberIds: string[], itemTitle: string, itemId: string, itemType: string,
) {
  if (!currentUserId) return;
  for (const mid of memberIds) {
    if (mid === currentUserId) continue;
    s.notifications.unshift({
      id: genId('n'), type: 'assigned', title: '你被指派了新事项',
      message: `你被指派为「${itemTitle}」的负责人`,
      relatedId: itemId, relatedType: itemType,
      memberId: mid, read: false, createdAt: new Date().toISOString(),
    });
  }
}

/** Match automation rule condition against a field value. */
function matchCondition(operator: string, fieldValue: any, condValue: string): boolean {
  switch (operator) {
    case 'eq': return fieldValue === condValue;
    case 'neq': return fieldValue !== condValue;
    case 'contains': return String(fieldValue ?? '').includes(condValue);
    case 'empty': return fieldValue == null || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'not_empty': return fieldValue != null && fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0);
    default: return false;
  }
}

/** Execute automation rule actions on matched items. */
function executeAutomationActions(s: AppState, rule: AutomationRule, itemId: string, itemType: 'goal' | 'project' | 'task', itemTitle: string) {
  for (const act of rule.actions) {
    if (act.type === 'notify') {
      const targetId = act.config.memberId || s.currentUser?.id || '';
      s.notifications.unshift({ id: genId('n'), type: 'sync', title: act.config.title ?? rule.name, message: act.config.message ?? `自动化规则「${rule.name}」已触发：${itemTitle}`, relatedId: itemId, relatedType: itemType, memberId: targetId, read: false, createdAt: new Date().toISOString() });
    } else if (act.type === 'escalation') {
      // Notify admin/manager
      const admins = s.members.filter(m => (m.role === 'admin' || m.role === 'manager') && m.status === 'active');
      for (const admin of admins) {
        s.notifications.unshift({ id: genId('n'), type: 'sync', title: `升级通知：${itemTitle}`, message: act.config.message ?? `事项「${itemTitle}」需要关注`, relatedId: itemId, relatedType: itemType, memberId: admin.id, read: false, createdAt: new Date().toISOString() });
      }
    }
  }
}

/** Diff old vs new leaderId+supporterIds, return only newly-added member IDs. */
function diffAssigned(
  oldLeaderId: string | null | undefined, oldSupporterIds: string[] | undefined,
  newLeaderId: string | null | undefined, newSupporterIds: string[] | undefined,
): string[] {
  const oldSet = new Set<string>();
  if (oldLeaderId) oldSet.add(oldLeaderId);
  (oldSupporterIds || []).forEach(id => oldSet.add(id));
  const added: string[] = [];
  if (newLeaderId && !oldSet.has(newLeaderId)) added.push(newLeaderId);
  (newSupporterIds || []).forEach(id => { if (!oldSet.has(id)) added.push(id); });
  return added;
}

/** Priority inheritance: look up parent chain and return the first non-default priority found.
 *  Search order: goalId → parentId (for projects/tasks), projectId (for tasks)
 *  Returns undefined if no parent has a set priority (caller keeps its own). */
function resolveInheritedPriority(
  state: { goals: Goal[]; projects: Project[]; tasks: Task[] },
  refs: { goalId?: string | null; projectId?: string | null; parentId?: string | null },
  visited?: Set<string>
): string | undefined {
  const visitedSet = visited || new Set<string>();
  // 1. Check goal first (highest level)
  if (refs.goalId) {
    const goal = state.goals.find(g => g.id === refs.goalId);
    if (goal && !visitedSet.has(goal.id)) {
      visitedSet.add(goal.id);
      if (goal.priority && goal.priority !== 'medium') return goal.priority;
      // Recurse into goal's parent
      if (goal.parentId) {
        const inherited = resolveInheritedPriority(state, { goalId: goal.parentId }, visitedSet);
        if (inherited) return inherited;
      }
    }
  }
  // 2. Check project (for tasks)
  if (refs.projectId) {
    const proj = state.projects.find(p => p.id === refs.projectId);
    if (proj && !visitedSet.has(proj.id)) {
      visitedSet.add(proj.id);
      if (proj.priority && proj.priority !== 'medium') return proj.priority;
      // Recurse into project's parent project / goal
      const inherited = resolveInheritedPriority(state, { goalId: proj.goalId, parentId: proj.parentId }, visitedSet);
      if (inherited) return inherited;
    }
  }
  // 3. Check parent (project or task, both use parentId field)
  if (refs.parentId) {
    if (visitedSet.has(refs.parentId)) return undefined;
    visitedSet.add(refs.parentId);
    // parentId could reference a parent project or a parent task — try both
    const parentProject = state.projects.find(p => p.id === refs.parentId);
    if (parentProject) {
      if (parentProject.priority && parentProject.priority !== 'medium') return parentProject.priority;
      const inherited = resolveInheritedPriority(state, { goalId: parentProject.goalId, parentId: parentProject.parentId }, visitedSet);
      if (inherited) return inherited;
    } else {
      const parentTask = state.tasks.find(t => t.id === refs.parentId);
      if (parentTask) {
        if (parentTask.priority && parentTask.priority !== 'medium') return parentTask.priority;
        const inherited = resolveInheritedPriority(state, { goalId: parentTask.goalId, projectId: parentTask.projectId, parentId: parentTask.parentId }, visitedSet);
        if (inherited) return inherited;
      }
    }
  }
  return undefined;
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
  const krs = goal.keyResults ?? [];
  if (krs.length > 0) {
    return Math.round(krs.reduce((sum, kr) =>
      sum + (kr.targetValue > 0 ? Math.min(100, (kr.currentValue / kr.targetValue) * 100) : 0), 0) / krs.length);
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

// Selective clone: only deep-clones specified keys, preserves references for unchanged keys.
// This is critical for useMemo performance — unchanged arrays keep the same reference,
// so components skip recomputation when unrelated state changes.
// Without keys, falls back to full structuredClone (safe but defeats reference stability).
const APP_ARRAY_KEYS: readonly (keyof AppState)[] = [
  'members', 'goals', 'projects', 'tasks', 'notifications', 'activities',
  'itemLinks', 'tags', 'categories', 'templates', 'scheduleEvents', 'notes',
  'savedViews', 'reviews', 'comments', 'bookmarks', 'batchOperations',
  'statusFlowRules', 'automationRules', 'sprints',
];
function needMutate(state: AppState, keys?: (keyof AppState)[]): AppState {
  if (!keys) return structuredClone(state);
  const s = { ...state } as AppState;
  for (const key of keys) {
    (s as any)[key] = structuredClone(state[key]);
  }
  return s;
}
function tsNow() { return new Date().toISOString(); }

// Input length limits — safety net to prevent excessively long data
const MAX_TITLE = 200;
const MAX_DESC = 5000;
const MAX_COMMENT = 3000;
function clampTitle(s: string | undefined): string | undefined { return s && s.length > MAX_TITLE ? s.slice(0, MAX_TITLE) : s; }
function clampDesc(s: string | undefined): string | undefined { return s && s.length > MAX_DESC ? s.slice(0, MAX_DESC) : s; }
function clampComment(s: string | undefined): string | undefined { return s && s.length > MAX_COMMENT ? s.slice(0, MAX_COMMENT) : s; }

// Track recently-deleted IDs to prevent Realtime MERGE_STATE from re-adding them
// before the async supabaseDelete completes. Items expire after 60 seconds
// (covers multiple Realtime debounce cycles at 2s each + network latency).
const pendingDeletes = new Map<string, number>();
function markPendingDelete(id: string) {
  let ttl = 60_000;
  try { if (localStorage.getItem('tbh-went-offline-at')) ttl = 10 * 60_000; } catch {}
  pendingDeletes.set(id, Date.now() + ttl);
}
function cleanPendingDeletes() { const now = Date.now(); for (const [id, expiry] of pendingDeletes) { if (now > expiry) pendingDeletes.delete(id); } }
function isPendingDelete(id: string) { const expiry = pendingDeletes.get(id); return expiry !== undefined && Date.now() < expiry; }
let lastSyncNotificationTime = 0;

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STATE':
      return ensureAppStateDefaults(action.payload);

    case 'MERGE_STATE': {
      // Deep merge: Supabase is source of truth for adding/updating/deleting items.
      // Core tables (goals/projects/tasks/members/tags) use "remote is authority" —
      // local items missing from remote are pruned (deletion sync).
      // Auxiliary tables keep all local items (append-only, no prune).
      // Selective clone: only clone keys present in payload + notifications (conflict unshift)
      const payloadArrKeys = Object.keys(action.payload).filter(k => Array.isArray((action.payload as any)[k])) as (keyof AppState)[];
      const mergeKeys: (keyof AppState)[] = [...payloadArrKeys, 'notifications'];
      if (action.payload.currentUser) mergeKeys.push('currentUser');
      if ('viewingMemberId' in action.payload) mergeKeys.push('viewingMemberId');
      const s = needMutate(state, mergeKeys);
      const payload = action.payload;
      cleanPendingDeletes();
      // Tables where remote deletion should propagate to local
      const pruneTables = new Set(['goals', 'projects', 'tasks', 'members', 'tags', 'statusFlowRules', 'automationRules', 'sprints']);
      const now = Date.now();
      let conflictCount = 0;
      const conflictNames: string[] = [];
      let offlineSince = 0;
      try { offlineSince = parseInt(localStorage.getItem('tbh-went-offline-at') || '0'); } catch {}
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
            if (remoteUpdated > localUpdated && localUpdated.getTime() > 0) {
              // Remote item is newer than local — log sync event for transparency
              const locAge = Date.now() - localUpdated.getTime();
              if (locAge < 300000) { logActivity({ memberId: s.currentUser?.id, action: 'sync_overwrite', targetType: key as string, targetId: remoteItem.id, targetTitle: remoteItem.title || remoteItem.name || '数据', details: '数据已被其他设备更新' }); conflictCount++; if (conflictNames.length < 3) conflictNames.push(remoteItem.title || remoteItem.name || '数据'); }
            }
            merged.push(remoteUpdated > localUpdated ? { ...localItem, ...remoteItem } : localItem);
          } else {
            merged.push(remoteItem);
          }
        }
        // For core tables: prune local items not in remote (deleted elsewhere)
        // Exception: keep items created in last 30s (may not have synced yet)
        // Exception: keep items created while offline (may not have synced yet)
        if (pruneTables.has(key)) {
          for (const localItem of localArr) {
            if (remoteIds.has(localItem.id)) continue;
            if (isPendingDelete(localItem.id)) continue;
            const age = now - new Date(localItem.createdAt || localItem.created_at || 0).getTime();
            if (age < 30000) { merged.push(localItem); continue; }
            // Items without createdAt should not be pruned (timestamps missing)
            if (!localItem.createdAt && !localItem.created_at) { merged.push(localItem); continue; }
            if (offlineSince > 0) { merged.push(localItem); continue; }
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
      // Clear offline flag after all tables processed (not inside the loop)
      if (offlineSince > 0) { try { localStorage.removeItem('tbh-went-offline-at'); } catch {} }
      // Add user-visible conflict notification (cooldown: 1 per 60s)
      if (conflictCount > 0 && now - lastSyncNotificationTime > 60000) {
        lastSyncNotificationTime = now;
        const desc = conflictCount <= 3 ? conflictNames.join('、') : `${conflictNames.slice(0, 2).join('、')} 等${conflictCount}项`;
        s.notifications.unshift({ id: `sync-${Date.now()}-conflict`, type: 'sync', title: '数据同步更新', message: `${desc} 已被其他设备更新`, read: false, createdAt: new Date().toISOString(), relatedId: '', relatedType: 'task', memberId: s.currentUser?.id || '' });
      }
      return ensureAppStateDefaults(s as any);
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

    case 'ADD_GOAL': {
      const s = needMutate(state, ['goals', 'notifications']);
      const now = tsNow();
      const payload = action.payload;
      // Input length safety — use local vars to avoid mutating action.payload
      const pTitle = clampTitle(payload.title) ?? payload.title;
      const pDesc = clampDesc(payload.description) ?? payload.description;
      // Inherit priority from parent goal when associated
      const inheritedPriority = payload.parentId ? resolveInheritedPriority(s, { goalId: payload.parentId }) : undefined;
      const g: Goal = {
        ...payload,
        title: pTitle,
        description: pDesc,
        id: genId('g'),
        progress: 0,
        priority: (inheritedPriority || payload.priority) ?? 'medium',
        tags: payload.tags ?? [],
        supporterIds: payload.supporterIds ?? [],
        category: payload.category ?? '',
        attachments: payload.attachments ?? [],
        trackingRecords: payload.trackingRecords ?? [],
        repeatCycle: payload.repeatCycle ?? 'none',
        selectedKRIds: payload.selectedKRIds ?? [],
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary ?? '',
        keyResults: (payload.keyResults ?? []).map((kr: any) => ({ ...kr, selected: kr.selected ?? true })),
        createdAt: now,
        updatedAt: now,
      };
      s.goals.push(g);
      supabaseInsert('goals', g);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '目标', targetId: g.id, targetTitle: g.title });
      notifyAssigned(s, state.currentUser?.id, [g.leaderId, ...(g.supporterIds ?? [])].filter(Boolean), g.title, g.id, 'goal');
      return s;
    }

    case 'UPDATE_GOAL': {
      const s = needMutate(state, ['goals', 'notifications']);
      const now = tsNow();
      const idx = s.goals.findIndex(g => g.id === action.payload.id);
      if (idx !== -1) {
        const oldUpdatedAt = s.goals[idx].updatedAt;
        const oldLeaderId = s.goals[idx].leaderId;
        const oldSupporterIds = s.goals[idx].supporterIds;
        const updates = { ...action.payload.updates };
        if (updates.title) updates.title = clampTitle(updates.title) ?? updates.title;
        if (updates.description) updates.description = clampDesc(updates.description) ?? updates.description;
        // If parent goal changed (binding to new parent, not unbinding), inherit priority
        if ('parentId' in updates) {
          const newParentId = updates.parentId !== undefined ? updates.parentId : s.goals[idx].parentId;
          if (newParentId) {
            const inherited = resolveInheritedPriority(s, { goalId: newParentId });
            if (inherited) updates.priority = inherited;
          }
        }
        // Prevent self-referential parentId
        if (updates.parentId === action.payload.id) updates.parentId = null;
        s.goals[idx] = { ...s.goals[idx], ...updates, updatedAt: now };
        s.goals[idx].progress = calcGoalProgress(s.goals, action.payload.id);
        supabaseUpdate('goals', action.payload.id, { ...updates, progress: s.goals[idx].progress, updated_at: now }, oldUpdatedAt);
        // Notify newly assigned members
        if ('leaderId' in updates || 'supporterIds' in updates) {
          const newlyAssigned = diffAssigned(oldLeaderId, oldSupporterIds, updates.leaderId ?? oldLeaderId, updates.supporterIds ?? oldSupporterIds);
          notifyAssigned(s, state.currentUser?.id, newlyAssigned, s.goals[idx].title, s.goals[idx].id, 'goal');
        }
      }
      return s;
    }

    case 'DELETE_GOAL': {
      if (!reducerCanDelete(state, 'delete_goals')) return state;
      const gid = action.payload;
      const s = needMutate(state, ['goals', 'projects', 'tasks', 'itemLinks', 'comments']);
      const now = tsNow();
      const deletedGoal = state.goals.find(g => g.id === gid);
      markPendingDelete(gid);
      s.goals = s.goals.filter(g => g.id !== gid);
      // Orphan child goals: clear parentId + recalculate level
      const affectedGoals = s.goals.filter(g => g.parentId === gid);
      s.goals.forEach(g => { if (g.parentId === gid) { g.parentId = null; g.level = 0; } });
      for (const g of affectedGoals) { supabaseUpdate('goals', g.id, { parent_id: null, level: 0, updated_at: now }); }
      // Recalculate descendants' levels for each orphaned goal
      function recalcGoalLevels(parentId: string, parentLevel: number) {
        s.goals.filter(g => g.parentId === parentId).forEach(child => {
          child.level = parentLevel + 1;
          recalcGoalLevels(child.id, child.level);
        });
      }
      for (const g of affectedGoals) { recalcGoalLevels(g.id, 0); }
      // Orphan linked projects: clear goalId
      const affectedProjects = s.projects.filter(p => p.goalId === gid);
      s.projects.forEach(p => { if (p.goalId === gid) p.goalId = null; });
      for (const p of affectedProjects) { supabaseUpdate('projects', p.id, { goal_id: null, updated_at: now }); }
      // Orphan linked tasks: clear goalId
      const affectedTasks = s.tasks.filter(t => t.goalId === gid);
      s.tasks.forEach(t => { if (t.goalId === gid) t.goalId = null; });
      for (const t of affectedTasks) { supabaseUpdate('tasks', t.id, { goal_id: null, updated_at: now }); }
      // Cascade: remove itemLinks + comments referencing this goal
      s.itemLinks = s.itemLinks.filter(l => l.sourceId !== gid && l.targetId !== gid);
      s.comments = s.comments.filter(c => c.itemId !== gid);
      supabaseDelete('goals', gid);
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '目标', targetId: gid, targetTitle: deletedGoal?.title || '' });
      return s;
    }

    case 'MOVE_GOAL_PARENT': {
      const s = needMutate(state, ['goals']);
      const now = tsNow();
      // Prevent self-referential parentId
      if (action.payload.newParentId === action.payload.goalId) return state;
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
      const s = needMutate(state, ['goals']);
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
      const s = needMutate(state, ['projects', 'notifications']);
      const now = tsNow();
      const payload = action.payload;
      const pTitle = clampTitle(payload.title) ?? payload.title;
      const pDesc = clampDesc(payload.description) ?? payload.description;
      // Inherit priority from parent goal/project when associated
      const hasParent = payload.goalId || payload.parentId;
      const inheritedPriority = hasParent ? resolveInheritedPriority(s, { goalId: payload.goalId, parentId: payload.parentId }) : undefined;
      const p: Project = {
        ...payload,
        title: pTitle,
        description: pDesc,
        id: genId('p'),
        progress: 0,
        priority: (inheritedPriority || payload.priority) ?? 'medium',
        tags: payload.tags ?? [],
        supporterIds: payload.supporterIds ?? [],
        category: payload.category ?? '',
        attachments: payload.attachments ?? [],
        trackingRecords: payload.trackingRecords ?? [],
        repeatCycle: payload.repeatCycle ?? 'none',
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary ?? '',
        createdAt: now,
        updatedAt: now,
      };
      s.projects.push(p);
      supabaseInsert('projects', p);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '项目', targetId: p.id, targetTitle: p.title });
      notifyAssigned(s, state.currentUser?.id, [p.leaderId, ...(p.supporterIds ?? [])].filter(Boolean), p.title, p.id, 'project');
      return s;
    }

    case 'UPDATE_PROJECT': {
      const s = needMutate(state, ['projects', 'notifications']);
      const now = tsNow();
      const idx = s.projects.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) {
        const oldUpdatedAt = s.projects[idx].updatedAt;
        const oldLeaderId = s.projects[idx].leaderId;
        const oldSupporterIds = s.projects[idx].supporterIds;
        const updates = { ...action.payload.updates };
        if (updates.title) updates.title = clampTitle(updates.title) ?? updates.title;
        if (updates.description) updates.description = clampDesc(updates.description) ?? updates.description;
        // If parent association changed (binding to new parent, not unbinding), inherit priority
        if ('goalId' in updates || 'parentId' in updates) {
          const newGoalId = updates.goalId !== undefined ? updates.goalId : s.projects[idx].goalId;
          const newParentId = updates.parentId !== undefined ? updates.parentId : s.projects[idx].parentId;
          const hasNewParent = !!newGoalId || !!newParentId;
          if (hasNewParent) {
            const inherited = resolveInheritedPriority(s, { goalId: newGoalId, parentId: newParentId });
            if (inherited) updates.priority = inherited;
          }
        }
        s.projects[idx] = { ...s.projects[idx], ...updates, updatedAt: now };
        s.projects[idx].progress = calcProjectProgress(s.tasks, action.payload.id);
        supabaseUpdate('projects', action.payload.id, { ...updates, progress: s.projects[idx].progress, updated_at: now }, oldUpdatedAt);
        // Notify newly assigned members
        if ('leaderId' in updates || 'supporterIds' in updates) {
          const newlyAssigned = diffAssigned(oldLeaderId, oldSupporterIds, updates.leaderId ?? oldLeaderId, updates.supporterIds ?? oldSupporterIds);
          notifyAssigned(s, state.currentUser?.id, newlyAssigned, s.projects[idx].title, s.projects[idx].id, 'project');
        }
      }
      return s;
    }

    case 'DELETE_PROJECT': {
      if (!reducerCanDelete(state, 'delete_projects')) return state;
      const pid = action.payload;
      const s = needMutate(state, ['projects', 'tasks', 'goals', 'itemLinks', 'comments']);
      const now = tsNow();
      const deletedProject = state.projects.find(p => p.id === pid);
      const parentGoalId = deletedProject?.goalId || null;
      markPendingDelete(pid);
      s.projects = s.projects.filter(p => p.id !== pid);
      const affectedTasks = s.tasks.filter(t => t.projectId === pid);
      s.tasks.forEach(t => { if (t.projectId === pid) t.projectId = null; });
      for (const t of affectedTasks) { supabaseUpdate('tasks', t.id, { project_id: null, updated_at: now }); }
      // Recalculate parent goal progress after project removal
      if (parentGoalId) {
        const pIdx = s.goals.findIndex(g => g.id === parentGoalId);
        if (pIdx !== -1) {
          s.goals[pIdx].progress = calcGoalProgress(s.goals, parentGoalId);
          s.goals[pIdx].updatedAt = now;
          supabaseUpdate('goals', parentGoalId, { progress: s.goals[pIdx].progress, updated_at: now });
        }
      }
      // Cascade: remove itemLinks + comments referencing this project
      s.itemLinks = s.itemLinks.filter(l => l.sourceId !== pid && l.targetId !== pid);
      s.comments = s.comments.filter(c => c.itemId !== pid);
      supabaseDelete('projects', pid);
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '项目', targetId: pid, targetTitle: deletedProject?.title || '' });
      return s;
    }

    case 'ADD_TASK': {
      const s = needMutate(state, ['tasks', 'projects', 'notifications']);
      const now = tsNow();
      const payload = action.payload;
      const tTitle = clampTitle(payload.title) ?? payload.title;
      const tDesc = clampDesc(payload.description) ?? payload.description;
      // Inherit priority from parent goal/project/task when associated
      const hasParent = payload.goalId || payload.projectId || payload.parentId;
      const inheritedPriority = hasParent ? resolveInheritedPriority(s, { goalId: payload.goalId, projectId: payload.projectId, parentId: payload.parentId }) : undefined;
      const t: Task = {
        ...payload,
        title: tTitle,
        description: tDesc,
        id: genId('t'),
        startDate: payload.startDate || null,
        dueDate: payload.dueDate || null,
        reminderDate: payload.reminderDate || null,
        priority: (inheritedPriority || payload.priority) ?? 'medium',
        parentId: payload.parentId || null,
        tags: payload.tags ?? [],
        supporterIds: payload.supporterIds ?? [],
        category: payload.category ?? '',
        attachments: payload.attachments ?? [],
        trackingRecords: payload.trackingRecords ?? [],
        repeatCycle: payload.repeatCycle ?? 'none',
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary ?? '',
        sprintId: payload.sprintId ?? null,
        subtasks: (payload.subtasks ?? []).map((st: any) => ({
          ...st,
          priority: st.priority ?? 'medium',
          leaderId: st.leaderId ?? '',
          supporterIds: st.supporterIds ?? [],
          tags: st.tags ?? [],
          attachments: st.attachments ?? [],
          trackingRecords: st.trackingRecords ?? [],
          repeatCycle: st.repeatCycle ?? 'none',
        })),
        blockedBy: payload.blockedBy ?? [],
        createdAt: now,
        updatedAt: now,
      };
      s.tasks.push(t);
      if (t.projectId) {
        const pIdx = s.projects.findIndex(p => p.id === t.projectId);
        if (pIdx !== -1) { s.projects[pIdx].taskCount = (s.projects[pIdx].taskCount ?? 0) + 1; s.projects[pIdx].progress = calcProjectProgress(s.tasks, t.projectId); }
      }
      supabaseInsert('tasks', t);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '任务', targetId: t.id, targetTitle: t.title });
      notifyAssigned(s, state.currentUser?.id, [t.leaderId, ...(t.supporterIds ?? [])].filter(Boolean), t.title, t.id, 'task');
      return s;
    }

    case 'UPDATE_TASK': {
      const s = needMutate(state, ['tasks', 'notifications', 'projects', 'goals']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.id);
      if (tIdx !== -1) {
        const oldTask = s.tasks[tIdx];
        const updates = { ...action.payload.updates };
        if (updates.title) updates.title = clampTitle(updates.title) ?? updates.title;
        if (updates.description) updates.description = clampDesc(updates.description) ?? updates.description;
        // If parent association changed (set to new parent, not unbind), inherit priority
        if ('parentId' in updates || 'projectId' in updates || 'goalId' in updates) {
          const newGoalId = updates.goalId !== undefined ? updates.goalId : oldTask.goalId;
          const newProjectId = updates.projectId !== undefined ? updates.projectId : oldTask.projectId;
          const newParentId = updates.parentId !== undefined ? updates.parentId : oldTask.parentId;
          // Only inherit when binding to a new parent (not when unbinding to null)
          const hasNewParent = !!newGoalId || !!newProjectId || !!newParentId;
          if (hasNewParent) {
            const inherited = resolveInheritedPriority(s, { goalId: newGoalId, projectId: newProjectId, parentId: newParentId });
            if (inherited) updates.priority = inherited;
          }
        }
        // Prevent self-referential parentId and blockedBy
        if (updates.parentId === action.payload.id) updates.parentId = null;
        if (updates.blockedBy) updates.blockedBy = updates.blockedBy.filter((bid: string) => bid !== action.payload.id);
        // Status flow validation: check if transition is allowed
        if (updates.status && updates.status !== oldTask.status && s.statusFlowRules.length > 0) {
          const currentUserRole = s.currentUser?.role ?? 'member';
          const matchingRule = s.statusFlowRules.find(r =>
            r.fromStatus === oldTask.status && r.toStatus === updates.status
          );
          if (matchingRule) {
            if (matchingRule.allowedRoles.length > 0 && !matchingRule.allowedRoles.includes(currentUserRole)) {
              s.notifications.unshift({ id: genId('n'), type: 'error', title: '状态流转被拒绝', message: `您的角色无权将任务从「${oldTask.status}」转为「${updates.status}」`, relatedId: oldTask.id, relatedType: 'task', memberId: s.currentUser?.id ?? '', read: false, createdAt: new Date().toISOString() });
              return s;
            }
            // Execute auto-actions
            if (matchingRule.autoActions) {
              for (const act of matchingRule.autoActions) {
                if (act.type === 'set_field') {
                  const field = act.config.field as keyof Task;
                  if (field) (updates as any)[field] = act.config.value;
                } else if (act.type === 'notify') {
                  const targetId = act.config.memberId || oldTask.leaderId || s.currentUser?.id || '';
                  s.notifications.unshift({ id: genId('n'), type: 'sync', title: act.config.title ?? '状态变更通知', message: act.config.message ?? `「${oldTask.title}」已从「${oldTask.status}」变更为「${updates.status}」`, relatedId: oldTask.id, relatedType: 'task', memberId: targetId, read: false, createdAt: new Date().toISOString() });
                } else if (act.type === 'assign') {
                  (updates as any).leaderId = act.config.memberId ?? '';
                }
              }
            }
          }
        }
        // Automation rules engine: check matching rules on status change
        if (updates.status && updates.status !== oldTask.status) {
          for (const rule of s.automationRules) {
            if (!rule.enabled || rule.itemType !== 'task') continue;
            if (rule.trigger === 'status_change') {
              const condField = rule.condition.field;
              const condOp = rule.condition.operator;
              const condVal = rule.condition.value;
              const fieldValue = condField === 'status' ? updates.status : (updates as any)[condField] ?? (oldTask as any)[condField];
              if (matchCondition(condOp, fieldValue, condVal)) {
                executeAutomationActions(s, rule, oldTask.id, 'task', oldTask.title);
              }
            }
          }
        }
        s.tasks[tIdx] = { ...oldTask, ...updates, updatedAt: now };
        if (action.payload.updates.status && action.payload.updates.status !== oldTask.status) {
          if (oldTask.projectId) {
            const pIdx = s.projects.findIndex(p => p.id === oldTask.projectId);
            if (pIdx !== -1) s.projects[pIdx].progress = calcProjectProgress(s.tasks, oldTask.projectId);
          }
        }
        supabaseUpdate('tasks', action.payload.id, { ...updates, updated_at: now }, oldTask.updatedAt);
        // Notify newly assigned members
        if ('leaderId' in updates || 'supporterIds' in updates) {
          const newlyAssigned = diffAssigned(oldTask.leaderId, oldTask.supporterIds, updates.leaderId ?? oldTask.leaderId, updates.supporterIds ?? oldTask.supporterIds);
          notifyAssigned(s, state.currentUser?.id, newlyAssigned, s.tasks[tIdx].title, s.tasks[tIdx].id, 'task');
        }
        // Dependency check: if status advances but blockedBy has uncompleted tasks → auto-set to 'blocked'
        if (updates.status && updates.status !== oldTask.status && (updates.status === 'in_progress' || updates.status === 'done')) {
          const currentBlockedBy = updates.blockedBy !== undefined ? updates.blockedBy : oldTask.blockedBy ?? [];
          const uncompleted = currentBlockedBy.filter(bid => {
            const bt = s.tasks.find(t => t.id === bid);
            return !bt || bt.status !== 'done';
          });
          if (uncompleted.length > 0) {
            const names = uncompleted.map(bid => { const bt = s.tasks.find(t => t.id === bid); return bt ? bt.title : '已删除的任务'; });
            s.tasks[tIdx].status = 'blocked';
            s.tasks[tIdx].updatedAt = now;
            supabaseUpdate('tasks', action.payload.id, { status: 'blocked', updated_at: now }, oldTask.updatedAt);
            s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务被阻塞', message: `「${s.tasks[tIdx].title}」的前置任务「${names.join('、')}」尚未完成，已自动标记为阻塞`, relatedId: s.tasks[tIdx].id, relatedType: 'task', memberId: s.tasks[tIdx].leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
          }
        }
        // Auto-rule 1: All subtasks done → parent task auto-complete
        if (updates.status === 'done' && oldTask.parentId) {
          const parentTask = s.tasks.find(t => t.id === oldTask.parentId);
          if (parentTask && parentTask.status !== 'done') {
            const siblings = s.tasks.filter(t => t.parentId === oldTask.parentId);
            const allDone = siblings.every(t => t.status === 'done');
            if (allDone) {
              parentTask.status = 'done';
              parentTask.updatedAt = now;
              supabaseUpdate('tasks', parentTask.id, { status: 'done', updated_at: now });
              s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务自动完成', message: `「${parentTask.title}」的所有子任务已完成，已自动标记为完成`, relatedId: parentTask.id, relatedType: 'task', memberId: parentTask.leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
            }
          }
        }
        // Auto-rule 3: task completed and linked to goal with KRs → recalc progress (handled by calcGoalProgress which checks KRs)
        if (updates.status === 'done' && s.tasks[tIdx].goalId) {
          const gIdx = s.goals.findIndex(g => g.id === s.tasks[tIdx].goalId);
          if (gIdx !== -1) {
            // Check if all KRs reached target
            const goal = s.goals[gIdx];
            const allKRsMet = (goal.keyResults ?? []).length > 0 && goal.keyResults.every(kr => kr.targetValue > 0 && kr.currentValue >= kr.targetValue);
            if (allKRsMet && goal.progress < 100) {
              s.goals[gIdx].progress = 100;
              s.goals[gIdx].updatedAt = now;
              supabaseUpdate('goals', goal.id, { progress: 100, updated_at: now });
              s.notifications.unshift({ id: genId('n'), type: 'sync', title: '目标自动达成', message: `「${goal.title}」的所有关键结果已达标，进度自动更新为100%`, relatedId: goal.id, relatedType: 'goal', memberId: goal.leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
            }
          }
        }
        // Unblocked notification: when a task is done, check if it was blocking other tasks
        if (updates.status === 'done') {
          const completedId = action.payload.id;
          const unblockedTasks = s.tasks.filter(t =>
            t.status === 'blocked' && (t.blockedBy ?? []).includes(completedId)
          );
          for (const ut of unblockedTasks) {
            const stillBlocked = (ut.blockedBy ?? []).filter(bid => {
              if (bid === completedId) return false;
              const bt = s.tasks.find(t => t.id === bid);
              return !bt || bt.status !== 'done';
            });
            if (stillBlocked.length === 0) {
              ut.status = 'todo';
              ut.updatedAt = now;
              const utIdx = s.tasks.findIndex(t => t.id === ut.id);
              if (utIdx !== -1) supabaseUpdate('tasks', ut.id, { status: 'todo', updated_at: now });
              s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务已解除阻塞', message: `「${ut.title}」的前置任务已全部完成，可以开始执行`, relatedId: ut.id, relatedType: 'task', memberId: ut.leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
            }
          }
        }
      }
      return s;
    }

    case 'DELETE_TASK': {
      if (!reducerCanDelete(state, 'delete_tasks')) return state;
      const tid = action.payload;
      const s = needMutate(state, ['tasks', 'notifications', 'projects', 'itemLinks', 'comments']);
      const now = tsNow();
      markPendingDelete(tid);
      const t = s.tasks.find(t => t.id === tid);
      s.tasks = s.tasks.filter(t => t.id !== tid);
      const affectedTasks = s.tasks.filter(t => t.parentId === tid);
      s.tasks.forEach(tk => { if (tk.parentId === tid) tk.parentId = null; });
      // Clean up blockedBy references to the deleted task
      const dependents = s.tasks.filter(tk => (tk.blockedBy ?? []).includes(tid));
      s.tasks.forEach(tk => { if ((tk.blockedBy ?? []).includes(tid)) tk.blockedBy = tk.blockedBy.filter((bid: string) => bid !== tid); });
      for (const t2 of affectedTasks) { supabaseUpdate('tasks', t2.id, { parent_id: null, updated_at: now }); }
      for (const dep of dependents) { supabaseUpdate('tasks', dep.id, { blocked_by: dep.blockedBy, updated_at: now }); }
      // If a blocked task now has all prerequisites met, unblock it
      for (const dep of dependents) {
        if (dep.status === 'blocked' && dep.blockedBy.length === 0) {
          dep.status = 'todo'; dep.updatedAt = now;
          supabaseUpdate('tasks', dep.id, { status: 'todo', updated_at: now });
          s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务已解除阻塞', message: `「${dep.title}」的前置任务已删除，可以开始执行`, relatedId: dep.id, relatedType: 'task', memberId: dep.leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
        }
      }
      if (t?.projectId) {
        const pIdx = s.projects.findIndex(p => p.id === t.projectId);
        if (pIdx !== -1) { s.projects[pIdx].taskCount = Math.max(0, (s.projects[pIdx].taskCount ?? 0) - 1); s.projects[pIdx].progress = calcProjectProgress(s.tasks, t.projectId); }
      }
      // Cascade: remove itemLinks + comments referencing this task
      s.itemLinks = s.itemLinks.filter(l => l.sourceId !== tid && l.targetId !== tid);
      s.comments = s.comments.filter(c => c.itemId !== tid);
      supabaseDelete('tasks', tid);
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '任务', targetId: tid, targetTitle: t?.title || '' });
      return s;
    }

    case 'TOGGLE_SUBTASK': {
      const s = needMutate(state, ['tasks']);
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
      const s = needMutate(state, ['tasks']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.taskId);
      if (tIdx !== -1) {
        const subPayload = action.payload.subtask;
        const newSub: SubTask = {
          ...subPayload,
          id: genId('st'),
          priority: subPayload.priority ?? 'medium',
          leaderId: subPayload.leaderId ?? '',
          supporterIds: subPayload.supporterIds ?? [],
          tags: subPayload.tags ?? [],
          attachments: subPayload.attachments ?? [],
          trackingRecords: subPayload.trackingRecords ?? [],
          repeatCycle: subPayload.repeatCycle ?? 'none',
          createdAt: now,
        };
        s.tasks[tIdx].subtasks.push(newSub);
        s.tasks[tIdx].updatedAt = now;
        supabaseUpdate('tasks', action.payload.taskId, { subtasks: s.tasks[tIdx].subtasks, updated_at: now });
      }
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
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['itemLinks']);
      markPendingDelete(action.payload);
      s.itemLinks = s.itemLinks.filter(l => l.id !== action.payload);
      supabaseDelete('item_links', action.payload);
      return s;
    }

    case 'IMPORT_BACKUP': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
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
        batchOperations: (backup as any).batchOperations || [],
        statusFlowRules: backup.statusFlowRules ?? [],
        automationRules: backup.automationRules ?? [],
        sprints: backup.sprints ?? [],
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
      }
      return ensureAppStateDefaults(imported);
    }

    case 'MARK_NOTIFICATION_READ': {
      const s = needMutate(state, ['notifications']);
      const idx = s.notifications.findIndex(n => n.id === action.payload);
      if (idx !== -1) { s.notifications[idx].read = true; supabaseUpdate('notifications', action.payload, { read: true }); }
      return s;
    }

    case 'MARK_ALL_NOTIFICATIONS_READ': {
      const s = needMutate(state, ['notifications']);
      const unread = s.notifications.filter(n => !n.read);
      if (unread.length === 0) return state;
      unread.forEach(n => { n.read = true; });
      // Bulk upsert instead of N individual updates
      if (isSupabaseConfigured()) supabaseUpsert('notifications', unread);
      return s;
    }

    case 'ADD_NOTIFICATION': {
      const s = needMutate(state, ['notifications']);
      const n = { ...action.payload, read: action.payload.read ?? false };
      // Prevent duplicate ID
      if (n.id && s.notifications.some(x => x.id === n.id)) return state;
      s.notifications.unshift(n);
      return s;
    }

    case 'ADD_MEMBER': {
      if (!reducerCanDelete(state, 'manage_team')) return state;
      const s = needMutate(state, ['members']);
      const rawId = (action.payload as any).id;
      // Prevent duplicate ID — always genId if conflict or missing
      const mId = (rawId && !s.members.some(m => m.id === rawId)) ? rawId : genId('m');
      const m: Member = { ...action.payload, id: mId, joinDate: new Date().toISOString().split('T')[0] };
      s.members.push(m);
      supabaseInsert('members', m);
      return s;
    }

    case 'UPDATE_MEMBER': {
      const s = needMutate(state, ['members', 'currentUser']);
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
        if (state.currentUser?.id === action.payload.id && state.currentUser) s.currentUser = { ...state.currentUser, ...action.payload.updates } as Member;
        supabaseUpdate('members', action.payload.id, action.payload.updates);
      }
      return s;
    }

    case 'DELETE_MEMBER': {
      if (!reducerCanDelete(state, 'manage_team')) return state;
      const mid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['members', 'goals', 'projects', 'tasks', 'comments']);
      markPendingDelete(mid);
      // Clean orphan references + persist to Supabase + bump updatedAt
      s.goals.forEach(g => {
        let changed = false;
        if (g.leaderId === mid) { g.leaderId = ''; changed = true; }
        const prevLen = g.supporterIds?.length ?? 0;
        g.supporterIds = (g.supporterIds || []).filter(id => id !== mid);
        if (g.supporterIds.length !== prevLen) changed = true;
        if (changed) { g.updatedAt = now; supabaseUpdate('goals', g.id, { leader_id: g.leaderId, supporter_ids: g.supporterIds, updated_at: now }); }
      });
      s.projects.forEach(p => {
        let changed = false;
        if (p.leaderId === mid) { p.leaderId = ''; changed = true; }
        const prevLen = p.supporterIds?.length ?? 0;
        p.supporterIds = (p.supporterIds || []).filter(id => id !== mid);
        if (p.supporterIds.length !== prevLen) changed = true;
        if (changed) { p.updatedAt = now; supabaseUpdate('projects', p.id, { leader_id: p.leaderId, supporter_ids: p.supporterIds, updated_at: now }); }
      });
      s.tasks.forEach(t => {
        let changed = false;
        if (t.leaderId === mid) { t.leaderId = ''; changed = true; }
        const prevLen = t.supporterIds?.length ?? 0;
        t.supporterIds = (t.supporterIds || []).filter(id => id !== mid);
        if (t.supporterIds.length !== prevLen) changed = true;
        if (changed) { t.updatedAt = now; supabaseUpdate('tasks', t.id, { leader_id: t.leaderId, supporter_ids: t.supporterIds, updated_at: now }); }
      });
      s.comments.forEach(c => {
        if (c.memberId === mid) { c.memberId = ''; supabaseUpdate('comments', c.id, { member_id: '' }); }
      });
      // Remove member from list
      s.members = s.members.filter(m => m.id !== mid);
      // Set inactive in Supabase first (resilient to race conditions)
      supabaseUpdate('members', mid, { status: 'inactive' });
      // Hard delete from Supabase in background (best-effort cleanup)
      supabaseDelete('members', mid);
      return s;
    }

    case 'RESET_DATA': {
      if (!state.currentUser || state.currentUser.role !== 'admin') return state;
      return ensureAppStateDefaults(action.payload);
    }

    case 'ADD_TAG': {
      const s = needMutate(state, ['tags']);
      const now = tsNow();
      const tag = { ...action.payload, id: genId('tag'), createdAt: now, updatedAt: now };
      s.tags.push(tag);
      supabaseInsert('tags', tag);
      return s;
    }

    case 'UPDATE_TAG': {
      const s = needMutate(state, ['tags']);
      const now = tsNow();
      const idx = s.tags.findIndex(t => t.id === action.payload.id);
      if (idx !== -1) { s.tags[idx] = { ...s.tags[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('tags', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_TAG': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const tid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['tags', 'goals', 'projects', 'tasks']);
      markPendingDelete(tid);
      // Clean orphan tag references + persist to Supabase + bump updatedAt
      s.goals.forEach(g => {
        const prevLen = g.tags?.length ?? 0;
        g.tags = (g.tags || []).filter(id => id !== tid);
        if (g.tags.length !== prevLen) { g.updatedAt = now; supabaseUpdate('goals', g.id, { tags: g.tags, updated_at: now }); }
      });
      s.projects.forEach(p => {
        const prevLen = p.tags?.length ?? 0;
        p.tags = (p.tags || []).filter(id => id !== tid);
        if (p.tags.length !== prevLen) { p.updatedAt = now; supabaseUpdate('projects', p.id, { tags: p.tags, updated_at: now }); }
      });
      s.tasks.forEach(t => {
        const prevLen = t.tags?.length ?? 0;
        t.tags = (t.tags || []).filter(id => id !== tid);
        if (t.tags.length !== prevLen) { t.updatedAt = now; supabaseUpdate('tasks', t.id, { tags: t.tags, updated_at: now }); }
      });
      s.tags = s.tags.filter(t => t.id !== tid);
      supabaseDelete('tags', tid);
      return s;
    }

    case 'ADD_SAVED_VIEW': {
      const s = needMutate(state, ['savedViews']);
      const now = tsNow();
      const view = { ...action.payload, id: genId('sv'), createdAt: now };
      s.savedViews.push(view);
      supabaseInsert('saved_views', view);
      return s;
    }

    case 'UPDATE_SAVED_VIEW': {
      const s = needMutate(state, ['savedViews']);
      const now = tsNow();
      const idx = s.savedViews.findIndex(v => v.id === action.payload.id);
      if (idx !== -1) { s.savedViews[idx] = { ...s.savedViews[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('saved_views', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_SAVED_VIEW': {
      if (!reducerCanDelete(state, 'delete_own_content')) return state;
      const svObj = state.savedViews.find(v => v.id === action.payload);
      if (!canDeleteOwnContent(state, svObj?.memberId)) return state;
      const s = needMutate(state, ['savedViews']);
      markPendingDelete(action.payload);
      s.savedViews = s.savedViews.filter(v => v.id !== action.payload);
      supabaseDelete('saved_views', action.payload);
      return s;
    }

    case 'ADD_REVIEW': {
      if (!state.currentUser) return state;
      const s = needMutate(state, ['reviews']);
      const now = tsNow();
      // Enforce: personal review can only be created for self; team review is allowed
      const payload = { ...action.payload };
      if (payload.memberId && payload.memberId !== state.currentUser.id) return state;
      const r = { ...payload, id: genId('rv'), createdAt: now, updatedAt: now };
      s.reviews.push(r);
      supabaseInsert('reviews', r);
      return s;
    }

    case 'UPDATE_REVIEW': {
      if (!state.currentUser) return state;
      const s = needMutate(state, ['reviews']);
      const now = tsNow();
      const idx = s.reviews.findIndex(r => r.id === action.payload.id);
      if (idx !== -1) {
        // Only allow editing own personal reviews or team reviews (admin can edit all)
        const existing = s.reviews[idx];
        const isOwnOrTeam = !existing.memberId || existing.memberId === state.currentUser.id;
        const isAdmin = state.currentUser.role === 'admin';
        if (!isOwnOrTeam && !isAdmin) return state;
        s.reviews[idx] = { ...existing, ...action.payload.updates, updatedAt: now };
        supabaseUpdate('reviews', action.payload.id, { ...action.payload.updates, updated_at: now });
      }
      return s;
    }

    case 'DELETE_REVIEW': {
      if (!reducerCanDelete(state, 'manage_team')) return state;
      const s = needMutate(state, ['reviews']);
      markPendingDelete(action.payload);
      s.reviews = s.reviews.filter(r => r.id !== action.payload);
      supabaseDelete('reviews', action.payload);
      return s;
    }

    case 'ADD_CATEGORY': {
      const s = needMutate(state, ['categories']);
      const now = tsNow();
      const c = { ...action.payload, id: genId('cat'), createdAt: now };
      s.categories.push(c);
      supabaseInsert('categories', c);
      return s;
    }

    case 'UPDATE_CATEGORY': {
      const s = needMutate(state, ['categories']);
      const idx = s.categories.findIndex(c => c.id === action.payload.id);
      if (idx !== -1) { s.categories[idx] = { ...s.categories[idx], ...action.payload.updates }; supabaseUpdate('categories', action.payload.id, action.payload.updates); }
      return s;
    }

    case 'DELETE_CATEGORY': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const cid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['categories', 'goals', 'projects', 'tasks']);
      markPendingDelete(cid);
      // Clean orphan category references
      s.goals.forEach(g => { if (g.category === cid) { g.category = ''; g.updatedAt = now; supabaseUpdate('goals', g.id, { category: '', updated_at: now }); } });
      s.projects.forEach(p => { if (p.category === cid) { p.category = ''; p.updatedAt = now; supabaseUpdate('projects', p.id, { category: '', updated_at: now }); } });
      s.tasks.forEach(t => { if (t.category === cid) { t.category = ''; t.updatedAt = now; supabaseUpdate('tasks', t.id, { category: '', updated_at: now }); } });
      s.categories = s.categories.filter(c => c.id !== cid);
      supabaseDelete('categories', cid);
      return s;
    }

    case 'SET_CATEGORIES': {
      const s = needMutate(state, ['categories']);
      s.categories = action.payload;
      return s;
    }

    case 'ADD_TEMPLATE': {
      const s = needMutate(state, ['templates']);
      const now = tsNow();
      const t = { ...action.payload, id: genId('tpl'), createdAt: now, updatedAt: now };
      s.templates.push(t);
      supabaseInsert('templates', t);
      return s;
    }

    case 'UPDATE_TEMPLATE': {
      const s = needMutate(state, ['templates']);
      const now = tsNow();
      const idx = s.templates.findIndex(t => t.id === action.payload.id);
      if (idx !== -1) { s.templates[idx] = { ...s.templates[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('templates', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_TEMPLATE': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['templates']);
      markPendingDelete(action.payload);
      s.templates = s.templates.filter(t => t.id !== action.payload);
      supabaseDelete('templates', action.payload);
      return s;
    }

    case 'ADD_SCHEDULE_EVENT': {
      const s = needMutate(state, ['scheduleEvents']);
      const now = tsNow();
      const e = { ...action.payload, id: genId('evt'), createdAt: now, updatedAt: now };
      s.scheduleEvents.push(e);
      supabaseInsert('schedule_events', e);
      return s;
    }

    case 'UPDATE_SCHEDULE_EVENT': {
      const s = needMutate(state, ['scheduleEvents']);
      const now = tsNow();
      const idx = s.scheduleEvents.findIndex(e => e.id === action.payload.id);
      if (idx !== -1) { s.scheduleEvents[idx] = { ...s.scheduleEvents[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('schedule_events', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_SCHEDULE_EVENT': {
      if (!reducerCanDelete(state, 'delete_own_content')) return state;
      const seObj = state.scheduleEvents.find(e => e.id === action.payload);
      if (!canDeleteOwnContent(state, seObj?.memberId)) return state;
      const s = needMutate(state, ['scheduleEvents']);
      markPendingDelete(action.payload);
      s.scheduleEvents = s.scheduleEvents.filter(e => e.id !== action.payload);
      supabaseDelete('schedule_events', action.payload);
      return s;
    }

    case 'ADD_NOTE': {
      const s = needMutate(state, ['notes']);
      const now = tsNow();
      const n = { ...action.payload, id: genId('note'), createdAt: now, updatedAt: now };
      s.notes.push(n);
      supabaseInsert('notes', n);
      return s;
    }

    case 'UPDATE_NOTE': {
      const s = needMutate(state, ['notes']);
      const now = tsNow();
      const idx = s.notes.findIndex(n => n.id === action.payload.id);
      if (idx !== -1) { s.notes[idx] = { ...s.notes[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('notes', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }

    case 'DELETE_NOTE': {
      if (!reducerCanDelete(state, 'delete_own_content')) return state;
      const noteObj = state.notes.find(n => n.id === action.payload);
      if (!canDeleteOwnContent(state, noteObj?.createdBy)) return state;
      const s = needMutate(state, ['notes']);
      markPendingDelete(action.payload);
      s.notes = s.notes.filter(n => n.id !== action.payload);
      supabaseDelete('notes', action.payload);
      return s;
    }

    case 'ADD_COMMENT': {
      if (!state.currentUser) return state;
      const s = needMutate(state, ['comments', 'notifications']);
      const comment = { ...action.payload, id: genId('c'), createdAt: new Date().toISOString(), content: clampComment(action.payload.content) };
      supabaseInsert('comments', comment);
      s.comments.push(comment);
      // Mentioned members → in-app notification
      const mentionedIds: string[] = comment.mentionedMemberIds ?? [];
      if (mentionedIds.length > 0) {
        const itemName = (state.goals.find(g => g.id === comment.itemId) || state.projects.find(p => p.id === comment.itemId) || state.tasks.find(t => t.id === comment.itemId))?.title || '事项';
        for (const mid of mentionedIds) {
          if (mid === state.currentUser.id) continue; // skip self-mention
          s.notifications.unshift({
            id: genId('n'), type: 'mentioned', title: '有人@了你',
            message: `${state.currentUser.name} 在「${itemName}」中提及了你`,
            relatedId: comment.itemId, relatedType: comment.itemType,
            memberId: mid, read: false, createdAt: new Date().toISOString(),
          });
        }
      }
      return s;
    }

    case 'DELETE_COMMENT': {
      if (!reducerCanDelete(state, 'delete_own_content')) return state;
      const commentObj = (state.comments ?? []).find(c => c.id === action.payload);
      if (!canDeleteOwnContent(state, commentObj?.memberId)) return state;
      const s = needMutate(state, ['comments']);
      markPendingDelete(action.payload);
      supabaseDelete('comments', action.payload);
      s.comments = s.comments.filter(c => c.id !== action.payload);
      return s;
    }

    case 'UPDATE_COMMENT': {
      if (!reducerCanDelete(state, 'delete_own_content')) return state;
      const commentObj = (state.comments ?? []).find(c => c.id === action.payload.id);
      if (!canDeleteOwnContent(state, commentObj?.memberId)) return state;
      const s = needMutate(state, ['comments']);
      s.comments = s.comments.map(c => c.id === action.payload.id ? { ...c, ...action.payload.updates } : c);
      supabaseUpdate('comments', action.payload.id, action.payload.updates);
      return s;
    }

    case 'ADD_BOOKMARK': {
      const s = needMutate(state, ['bookmarks']);
      const b: Bookmark = { ...action.payload, id: genId('bm'), createdAt: new Date().toISOString() };
      s.bookmarks.push(b);
      supabaseInsert('bookmarks', b);
      return s;
    }

    case 'UPDATE_BOOKMARK': {
      const s = needMutate(state, ['bookmarks']);
      const idx = s.bookmarks.findIndex(b => b.id === action.payload.id);
      if (idx !== -1) { s.bookmarks[idx] = { ...s.bookmarks[idx], ...action.payload.updates }; supabaseUpdate('bookmarks', action.payload.id, action.payload.updates); }
      return s;
    }

    case 'DELETE_BOOKMARK': {
      if (!reducerCanDelete(state, 'delete_own_content')) return state;
      const bmObj = state.bookmarks.find(b => b.id === action.payload);
      if (!canDeleteOwnContent(state, bmObj?.memberId)) return state;
      const s = needMutate(state, ['bookmarks']);
      markPendingDelete(action.payload);
      s.bookmarks = s.bookmarks.filter(b => b.id !== action.payload);
      supabaseDelete('bookmarks', action.payload);
      return s;
    }

    case 'REORDER_BOOKMARKS': {
      const s = needMutate(state, ['bookmarks']);
      s.bookmarks = action.payload;
      // Bulk upsert for reorder
      if (action.payload.length > 0 && isSupabaseConfigured()) {
        supabaseUpsert('bookmarks', action.payload);
      }
      return s;
    }

    case 'SET_BOOKMARKS': {
      const s = needMutate(state, ['bookmarks']);
      s.bookmarks = action.payload;
      if (action.payload.length > 0 && isSupabaseConfigured()) supabaseUpsert('bookmarks', action.payload);
      return s;
    }

    // ==================== Status Flow Rules ====================
    case 'ADD_STATUS_FLOW_RULE': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['statusFlowRules']);
      const rawId = action.payload.id;
      const ruleId = (rawId && !s.statusFlowRules.some(r => r.id === rawId)) ? rawId : genId('sf');
      const rule: StatusFlowRule = { ...action.payload, id: ruleId };
      s.statusFlowRules.push(rule);
      supabaseInsert('status_flow_rules', { id: rule.id, from_status: rule.fromStatus, to_status: rule.toStatus, allowed_roles: rule.allowedRoles, auto_actions: rule.autoActions ?? [] });
      return s;
    }
    case 'UPDATE_STATUS_FLOW_RULE': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['statusFlowRules']);
      const { index, rule } = action.payload;
      if (index >= 0 && index < s.statusFlowRules.length) {
        s.statusFlowRules[index] = rule;
        supabaseUpdate('status_flow_rules', rule.id, { from_status: rule.fromStatus, to_status: rule.toStatus, allowed_roles: rule.allowedRoles, auto_actions: rule.autoActions ?? [], updated_at: tsNow() });
      }
      return s;
    }
    case 'DELETE_STATUS_FLOW_RULE': {
      const s = needMutate(state, ['statusFlowRules']);
      const idx = action.payload;
      if (idx >= 0 && idx < s.statusFlowRules.length) {
        const deleted = s.statusFlowRules[idx];
        s.statusFlowRules.splice(idx, 1);
        supabaseDelete('status_flow_rules', deleted.id);
      }
      return s;
    }
    case 'SET_STATUS_FLOW_RULES': {
      const s = needMutate(state, ['statusFlowRules']);
      s.statusFlowRules = action.payload;
      return s;
    }

    // ==================== Automation Rules ====================
    case 'ADD_AUTOMATION_RULE': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['automationRules']);
      const now = tsNow();
      const rule: AutomationRule = {
        ...action.payload,
        id: genId('ar'),
        createdAt: now,
        updatedAt: now,
      };
      s.automationRules.push(rule);
      supabaseInsert('automation_rules', { id: rule.id, name: rule.name, enabled: rule.enabled, item_type: rule.itemType, trigger: rule.trigger, condition: rule.condition, actions: rule.actions, created_at: now, updated_at: now });
      return s;
    }
    case 'UPDATE_AUTOMATION_RULE': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['automationRules']);
      const now = tsNow();
      const rIdx = s.automationRules.findIndex(r => r.id === action.payload.id);
      if (rIdx !== -1) {
        s.automationRules[rIdx] = { ...s.automationRules[rIdx], ...action.payload.updates, updatedAt: now };
        const updates = action.payload.updates;
        supabaseUpdate('automation_rules', action.payload.id, { ...updates, updated_at: now });
      }
      return s;
    }
    case 'DELETE_AUTOMATION_RULE': {
      const s = needMutate(state, ['automationRules']);
      s.automationRules = s.automationRules.filter(r => r.id !== action.payload);
      supabaseDelete('automation_rules', action.payload);
      return s;
    }

    // ==================== Sprints ====================
    case 'ADD_SPRINT': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['sprints']);
      const now = tsNow();
      const sp: Sprint = {
        ...action.payload,
        id: genId('sp'),
        goalIds: action.payload.goalIds ?? [],
        status: action.payload.status ?? 'planning',
        createdAt: now,
        updatedAt: now,
      };
      s.sprints.push(sp);
      supabaseInsert('sprints', { id: sp.id, name: sp.name, start_date: sp.startDate, end_date: sp.endDate, goal_ids: sp.goalIds, status: sp.status, created_at: now, updated_at: now });
      return s;
    }
    case 'UPDATE_SPRINT': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const s = needMutate(state, ['sprints']);
      const now = tsNow();
      const spIdx = s.sprints.findIndex(sp => sp.id === action.payload.id);
      if (spIdx !== -1) {
        s.sprints[spIdx] = { ...s.sprints[spIdx], ...action.payload.updates, updatedAt: now };
        supabaseUpdate('sprints', action.payload.id, { ...action.payload.updates, updated_at: now });
      }
      return s;
    }
    case 'DELETE_SPRINT': {
      if (!reducerCanDelete(state, 'manage_settings')) return state;
      const spid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['sprints', 'tasks']);
      // Clean orphan sprintId on tasks + persist to Supabase
      s.tasks.forEach(t => {
        if (t.sprintId === spid) {
          t.sprintId = null; t.updatedAt = now;
          supabaseUpdate('tasks', t.id, { sprint_id: null, updated_at: now });
        }
      });
      s.sprints = s.sprints.filter(sp => sp.id !== spid);
      supabaseDelete('sprints', spid);
      return s;
    }
  }
  return state;
}
