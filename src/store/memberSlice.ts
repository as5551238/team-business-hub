import type { AppState, Member } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { hasPermission, reducerCanDelete, needMutate, tsNow, markPendingDelete } from './shared';
import { cascadeDeleteMember } from './cascadeHandlers';

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
      const old = s.members.find(m => m.id === action.payload.id);
      if (idx !== -1) {
        if (!isAdmin && action.payload.updates.role !== undefined) {
          action.payload.updates.role = s.members[idx].role;
        }
        s.members[idx] = { ...s.members[idx], ...action.payload.updates, updatedAt: tsNow() };
        if (state.currentUser?.id === action.payload.id && state.currentUser) s.currentUser = { ...state.currentUser, ...action.payload.updates } as Member;
        supabaseUpdate('members', action.payload.id, { ...action.payload.updates, updated_at: tsNow() }, old?.updatedAt);
      }
      return s;
    }
    case 'DELETE_MEMBER': {
      if (!reducerCanDelete(state, 'team_manage')) return state;
      const mid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['members', 'goals', 'projects', 'tasks', 'comments']);
      markPendingDelete(mid);
      cascadeDeleteMember(s, mid, now);
      s.members = s.members.filter(m => m.id !== mid);
      supabaseDelete('members', mid);
      return s;
    }
  }
  return null;
}
