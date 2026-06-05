import type { AppState, Sprint } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, needMutate, tsNow } from './shared';
import { cascadeDeleteSprint } from './cascadeHandlers';

export function sprintReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
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
        const oldUpdatedAt = s.sprints[spIdx].updatedAt;
        s.sprints[spIdx] = { ...s.sprints[spIdx], ...action.payload.updates, updatedAt: now };
        supabaseUpdate('sprints', action.payload.id, { ...action.payload.updates, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }
    case 'DELETE_SPRINT': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const spid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['sprints', 'tasks']);
      cascadeDeleteSprint(s, spid, now);
      s.sprints = s.sprints.filter(sp => sp.id !== spid);
      supabaseDelete('sprints', spid);
      return s;
    }
  }
  return null;
}
