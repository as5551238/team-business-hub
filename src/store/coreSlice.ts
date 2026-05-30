import type { AppState, Member, Bookmark, StatusFlowRule, AutomationRule, Sprint, Knowledge } from '@/types';
import { isSupabaseConfigured } from '@/supabase/client';
import type { Action } from './types';
import { ensureAppStateDefaults } from './types';
import { supabaseUpsert, supabaseUpdate, supabaseInsert, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';
import { hasPermission, reducerCanDelete, canDeleteOwnContent, needMutate, tsNow, clampComment, markPendingDelete, validateNewFlowRule } from './shared';

export function coreReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
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
      if (isSupabaseConfigured()) supabaseUpsert('notifications', unread);
      return s;
    }
    case 'ADD_NOTIFICATION': {
      const s = needMutate(state, ['notifications']);
      const n = { ...action.payload, read: action.payload.read ?? false };
      if (n.id && s.notifications.some(x => x.id === n.id)) return state;
      s.notifications.unshift(n);
      return s;
    }
    case 'ADD_MEMBER': {
      if (!reducerCanDelete(state, 'team_manage')) return state;
      const s = needMutate(state, ['members']);
      const rawId = action.payload.id;
      const mId = (rawId && !s.members.some(m => m.id === rawId)) ? rawId : genId('m');
      const m: Member = { ...action.payload, id: mId, joinDate: new Date().toISOString().split('T')[0], teamId: action.payload.teamId || state.currentTeamId || '__default__' };
      s.members.push(m);
      supabaseInsert('members', m);
      return s;
    }
    case 'UPDATE_MEMBER': {
      const s = needMutate(state, ['members', 'currentUser']);
      const isSelf = state.currentUser?.id === action.payload.id;
      const isAdmin = state.currentUser?.role === 'admin';
      const canManageTeam = hasPermission(state, state.currentUser?.id || '', 'team_manage');
      if (!isSelf && !isAdmin && !canManageTeam) return state;
      const idx = s.members.findIndex(m => m.id === action.payload.id);
      if (idx !== -1) {
        if (!isAdmin && action.payload.updates.role !== undefined) {
          action.payload.updates.role = s.members[idx].role;
        }
        s.members[idx] = { ...s.members[idx], ...action.payload.updates };
        if (state.currentUser?.id === action.payload.id && state.currentUser) s.currentUser = { ...state.currentUser, ...action.payload.updates } as Member;
        supabaseUpdate('members', action.payload.id, action.payload.updates);
      }
      return s;
    }
    case 'DELETE_MEMBER': {
      if (!reducerCanDelete(state, 'team_manage')) return state;
      const mid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['members', 'goals', 'projects', 'tasks', 'comments']);
      markPendingDelete(mid);
      s.goals.forEach(g => {
        let changed = false;
        if (g.leaderId === mid) { g.leaderId = ''; changed = true; }
        const prevLen = g.supporterIds?.length ?? 0;
        g.supporterIds = (g.supporterIds ?? []).filter(id => id !== mid);
        if (g.supporterIds.length !== prevLen) changed = true;
        if (changed) { g.updatedAt = now; supabaseUpdate('goals', g.id, { leader_id: g.leaderId, supporter_ids: g.supporterIds, updated_at: now }); }
      });
      s.projects.forEach(p => {
        let changed = false;
        if (p.leaderId === mid) { p.leaderId = ''; changed = true; }
        const prevLen = p.supporterIds?.length ?? 0;
        p.supporterIds = (p.supporterIds ?? []).filter(id => id !== mid);
        if (p.supporterIds.length !== prevLen) changed = true;
        if (changed) { p.updatedAt = now; supabaseUpdate('projects', p.id, { leader_id: p.leaderId, supporter_ids: p.supporterIds, updated_at: now }); }
      });
      s.tasks.forEach(t => {
        let changed = false;
        if (t.leaderId === mid) { t.leaderId = ''; changed = true; }
        const prevLen = t.supporterIds?.length ?? 0;
        t.supporterIds = (t.supporterIds ?? []).filter(id => id !== mid);
        if (t.supporterIds.length !== prevLen) changed = true;
        if (changed) { t.updatedAt = now; supabaseUpdate('tasks', t.id, { leader_id: t.leaderId, supporter_ids: t.supporterIds, updated_at: now }); }
      });
      s.comments.forEach(c => {
        if (c.memberId === mid) { c.memberId = ''; supabaseUpdate('comments', c.id, { member_id: '' }); }
      });
      s.members = s.members.filter(m => m.id !== mid);
      supabaseUpdate('members', mid, { status: 'inactive' });
      supabaseDelete('members', mid);
      return s;
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
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const tid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['tags', 'goals', 'projects', 'tasks']);
      markPendingDelete(tid);
      s.goals.forEach(g => {
        const prevLen = g.tags?.length ?? 0;
        g.tags = (g.tags ?? []).filter(id => id !== tid);
        if (g.tags.length !== prevLen) { g.updatedAt = now; supabaseUpdate('goals', g.id, { tags: g.tags, updated_at: now }); }
      });
      s.projects.forEach(p => {
        const prevLen = p.tags?.length ?? 0;
        p.tags = (p.tags ?? []).filter(id => id !== tid);
        if (p.tags.length !== prevLen) { p.updatedAt = now; supabaseUpdate('projects', p.id, { tags: p.tags, updated_at: now }); }
      });
      s.tasks.forEach(t => {
        const prevLen = t.tags?.length ?? 0;
        t.tags = (t.tags ?? []).filter(id => id !== tid);
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
      if (!state.currentUser) return state;
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
      if (!reducerCanDelete(state, 'team_manage')) return state;
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
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const cid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['categories', 'goals', 'projects', 'tasks']);
      markPendingDelete(cid);
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
      if (!reducerCanDelete(state, 'settings_manage')) return state;
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
      if (!state.currentUser) return state;
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
      if (!state.currentUser) return state;
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
      const mentionedIds: string[] = comment.mentionedMemberIds ?? [];
      if (mentionedIds.length > 0) {
        const itemName = (state.goals.find(g => g.id === comment.itemId) || state.projects.find(p => p.id === comment.itemId) || state.tasks.find(t => t.id === comment.itemId))?.title || '事项';
        for (const mid of mentionedIds) {
          if (mid === state.currentUser.id) continue;
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
      if (!state.currentUser) return state;
      const commentObj = (state.comments ?? []).find(c => c.id === action.payload);
      if (!canDeleteOwnContent(state, commentObj?.memberId)) return state;
      const s = needMutate(state, ['comments']);
      markPendingDelete(action.payload);
      supabaseDelete('comments', action.payload);
      s.comments = s.comments.filter(c => c.id !== action.payload);
      return s;
    }
    case 'UPDATE_COMMENT': {
      if (!state.currentUser) return state;
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
      if (!state.currentUser) return state;
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
      if (action.payload.length > 0 && isSupabaseConfigured()) supabaseUpsert('bookmarks', action.payload);
      return s;
    }
    case 'SET_BOOKMARKS': {
      const s = needMutate(state, ['bookmarks']);
      s.bookmarks = action.payload;
      if (action.payload.length > 0 && isSupabaseConfigured()) supabaseUpsert('bookmarks', action.payload);
      return s;
    }
    case 'ADD_STATUS_FLOW_RULE': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['statusFlowRules']);
      const rawId = action.payload.id;
      const ruleId = (rawId && !s.statusFlowRules.some(r => r.id === rawId)) ? rawId : genId('sf');
      const rule: StatusFlowRule = { ...action.payload, id: ruleId };
      const validation = validateNewFlowRule(s.statusFlowRules, rule);
      if (!validation.valid) { console.warn('Invalid flow rule:', validation.reason); return state; }
      s.statusFlowRules.push(rule);
      supabaseInsert('status_flow_rules', { id: rule.id, from_status: rule.fromStatus, to_status: rule.toStatus, allowed_roles: rule.allowedRoles, auto_actions: rule.autoActions ?? [] });
      return s;
    }
    case 'UPDATE_STATUS_FLOW_RULE': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['statusFlowRules']);
      const { index, rule } = action.payload;
      if (index >= 0 && index < s.statusFlowRules.length) {
        const others = s.statusFlowRules.filter((_: any, i: number) => i !== index);
        const validation = validateNewFlowRule(others, rule);
        if (!validation.valid) { console.warn('Invalid flow rule:', validation.reason); return state; }
        s.statusFlowRules[index] = rule;
        supabaseUpdate('status_flow_rules', rule.id, { from_status: rule.fromStatus, to_status: rule.toStatus, allowed_roles: rule.allowedRoles, auto_actions: rule.autoActions ?? [], updated_at: tsNow() });
      }
      return s;
    }
    case 'DELETE_STATUS_FLOW_RULE': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
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
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['statusFlowRules']);
      for (const old of s.statusFlowRules) { supabaseDelete('status_flow_rules', old.id); }
      s.statusFlowRules = action.payload;
      for (const rule of s.statusFlowRules) {
        supabaseInsert('status_flow_rules', { id: rule.id, from_status: rule.fromStatus, to_status: rule.toStatus, allowed_roles: rule.allowedRoles, auto_actions: rule.autoActions ?? [] });
      }
      return s;
    }
    case 'ADD_AUTOMATION_RULE': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['automationRules']);
      const now = tsNow();
      const rule: AutomationRule = { ...action.payload, id: genId('ar'), createdAt: now, updatedAt: now };
      s.automationRules.push(rule);
      supabaseInsert('automation_rules', { id: rule.id, name: rule.name, enabled: rule.enabled, item_type: rule.itemType, trigger: rule.trigger, condition: rule.condition, actions: rule.actions, created_at: now, updated_at: now });
      return s;
    }
    case 'UPDATE_AUTOMATION_RULE': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['automationRules']);
      const now = tsNow();
      const rIdx = s.automationRules.findIndex(r => r.id === action.payload.id);
      if (rIdx !== -1) {
        s.automationRules[rIdx] = { ...s.automationRules[rIdx], ...action.payload.updates, updatedAt: now };
        supabaseUpdate('automation_rules', action.payload.id, { ...action.payload.updates, updated_at: now });
      }
      return s;
    }
    case 'DELETE_AUTOMATION_RULE': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['automationRules']);
      s.automationRules = s.automationRules.filter(r => r.id !== action.payload);
      supabaseDelete('automation_rules', action.payload);
      return s;
    }
    case 'ADD_SPRINT': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['sprints']);
      const now = tsNow();
      const sp: Sprint = { ...action.payload, id: genId('sp'), goalIds: action.payload.goalIds ?? [], status: action.payload.status ?? 'planning', createdAt: now, updatedAt: now };
      s.sprints.push(sp);
      supabaseInsert('sprints', { id: sp.id, name: sp.name, start_date: sp.startDate, end_date: sp.endDate, goal_ids: sp.goalIds, status: sp.status, created_at: now, updated_at: now });
      return s;
    }
    case 'UPDATE_SPRINT': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
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
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const spid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['sprints', 'tasks']);
      s.tasks.forEach(t => {
        if (t.sprintId === spid) { t.sprintId = null; t.updatedAt = now; supabaseUpdate('tasks', t.id, { sprint_id: null, updated_at: now }); }
      });
      s.sprints = s.sprints.filter(sp => sp.id !== spid);
      supabaseDelete('sprints', spid);
      return s;
    }
    case 'ADD_KNOWLEDGE': {
      const s = needMutate(state, ['knowledge']);
      const now = tsNow();
      const k: Knowledge = { ...action.payload, id: genId('kb'), tags: action.payload.tags ?? [], relatedItems: action.payload.relatedItems ?? [], content: action.payload.content ?? '', createdAt: now, updatedAt: now };
      s.knowledge.push(k);
      supabaseInsert('knowledge', k);
      return s;
    }
    case 'UPDATE_KNOWLEDGE': {
      const s = needMutate(state, ['knowledge']);
      const now = tsNow();
      const kIdx = s.knowledge.findIndex(k => k.id === action.payload.id);
      if (kIdx !== -1) {
        s.knowledge[kIdx] = { ...s.knowledge[kIdx], ...action.payload.updates, updatedAt: now };
        supabaseUpdate('knowledge', action.payload.id, { ...action.payload.updates, updated_at: now });
      }
      return s;
    }
    case 'DELETE_KNOWLEDGE': {
      const target = state.knowledge.find(k => k.id === action.payload);
      if (!target) return state;
      if (!canDeleteOwnContent(state, target.memberId)) return state;
      const s = needMutate(state, ['knowledge']);
      markPendingDelete(action.payload);
      s.knowledge = s.knowledge.filter(k => k.id !== action.payload);
      supabaseDelete('knowledge', action.payload);
      return s;
    }
    case 'UPDATE_SUBSCRIPTION': {
      const s = needMutate(state, ['subscriptions']);
      const idx = s.subscriptions.findIndex(sub => sub.teamId === action.payload.teamId);
      const now = tsNow();
      if (idx !== -1) {
        s.subscriptions[idx] = { ...s.subscriptions[idx], ...action.payload.updates, updatedAt: now };
      }
      return s;
    }
  }
  return null;
}
