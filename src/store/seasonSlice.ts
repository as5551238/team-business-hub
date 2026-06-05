import type { AppState, OKRSeason } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, needMutate, tsNow } from './shared';

export function seasonReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_SEASON': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['seasons']);
      const now = tsNow();
      const season: OKRSeason = {
        ...action.payload,
        id: genId('sn'),
        status: action.payload.status ?? 'draft',
        createdAt: now,
        updatedAt: now,
      };
      s.seasons.push(season);
      supabaseInsert('okr_seasons', {
        id: season.id,
        name: season.name,
        type: season.type,
        start_date: season.startDate,
        end_date: season.endDate,
        status: season.status,
        team_id: season.teamId,
        created_at: now,
        updated_at: now,
      });
      return s;
    }
    case 'UPDATE_SEASON': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['seasons']);
      const now = tsNow();
      const idx = s.seasons.findIndex(sn => sn.id === action.payload.id);
      if (idx !== -1) {
        const oldUpdatedAt = s.seasons[idx].updatedAt;
        s.seasons[idx] = { ...s.seasons[idx], ...action.payload.updates, updatedAt: now };
        supabaseUpdate('okr_seasons', action.payload.id, { ...action.payload.updates, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }
    case 'DELETE_SEASON': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['seasons', 'goals']);
      const seasonId = action.payload;
      // Unlink goals from this season and persist to Supabase
      s.goals.forEach(g => {
        if (g.seasonId === seasonId) {
          const oldUpdatedAt = g.updatedAt;
          g.seasonId = null;
          g.strategyLevel = null;
          supabaseUpdate('goals', g.id, { season_id: null, strategy_level: null, updated_at: g.updatedAt }, oldUpdatedAt);
        }
      });
      s.seasons = s.seasons.filter(sn => sn.id !== seasonId);
      supabaseDelete('okr_seasons', seasonId);
      return s;
    }
  }
  return null;
}
