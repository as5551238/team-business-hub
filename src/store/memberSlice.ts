import type { AppState, Member } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { hasPermission, reducerCanDelete, needMutate, tsNow, markPendingDelete } from './shared';

export function memberReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
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
        if (c.memberId === mid) { c.memberId = null; supabaseUpdate('comments', c.id, { member_id: null }); } // P3#8 fix: use null instead of ''
      });
      s.members = s.members.filter(m => m.id !== mid);
      supabaseDelete('members', mid); // P3#7 fix: removed conflicting supabaseUpdate('members', mid, { status: 'inactive' })
      return s;
    }
  }
  return null;
}
