import type { AppState, Budget, CostEntry } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, needMutate, tsNow } from './shared';

export function budgetReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_BUDGET': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['budgets']);
      const now = tsNow();
      const budget: Budget = {
        ...action.payload,
        id: genId('bgt'),
        status: action.payload.status ?? 'draft',
        createdAt: now,
        updatedAt: now,
      };
      s.budgets.push(budget);
      supabaseInsert('budgets', {
        id: budget.id,
        project_id: budget.projectId,
        season_id: budget.seasonId,
        name: budget.name,
        total_amount: budget.totalAmount,
        currency: budget.currency,
        status: budget.status,
        items: JSON.stringify(budget.items),
        approved_by: budget.approvedBy,
        team_id: budget.teamId,
        created_at: now,
        updated_at: now,
      });
      return s;
    }
    case 'UPDATE_BUDGET': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['budgets']);
      const now = tsNow();
      const idx = s.budgets.findIndex(b => b.id === action.payload.id);
      if (idx !== -1) {
        const oldUpdatedAt = s.budgets[idx].updatedAt;
        s.budgets[idx] = { ...s.budgets[idx], ...action.payload.updates, updatedAt: now };
        const updates = { ...action.payload.updates, updated_at: now };
        if (updates.items) updates.items = JSON.stringify(updates.items);
        supabaseUpdate('budgets', action.payload.id, updates, oldUpdatedAt);
      }
      return s;
    }
    case 'DELETE_BUDGET': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['budgets', 'costEntries']);
      const budgetId = action.payload;
      s.costEntries = s.costEntries.filter(ce => ce.budgetId !== budgetId);
      s.budgets = s.budgets.filter(b => b.id !== budgetId);
      supabaseDelete('budgets', budgetId);
      return s;
    }
    case 'ADD_COST_ENTRY': {
      const s = needMutate(state, ['costEntries']);
      const now = tsNow();
      const entry: CostEntry = {
        ...action.payload,
        id: genId('cst'),
        createdAt: now,
      };
      s.costEntries.push(entry);
      supabaseInsert('cost_entries', {
        id: entry.id,
        budget_id: entry.budgetId,
        project_id: entry.projectId,
        task_id: entry.taskId,
        category: entry.category,
        amount: entry.amount,
        description: entry.description,
        recorded_by: entry.recordedBy,
        recorded_at: entry.recordedAt,
        approved_by: entry.approvedBy,
        status: entry.status,
        team_id: entry.teamId,
        created_at: now,
      });
      // Update budget item actualAmount
      const budget = s.budgets.find(b => b.id === entry.budgetId);
      if (budget) {
        const item = budget.items.find(it => it.category === entry.category);
        if (item) {
          item.actualAmount = (item.actualAmount || 0) + entry.amount;
          const oldUpdatedAt = budget.updatedAt;
          budget.updatedAt = now;
          supabaseUpdate('budgets', budget.id, {
            items: JSON.stringify(budget.items),
            updated_at: now,
          }, oldUpdatedAt);
        }
      }
      return s;
    }
    case 'UPDATE_COST_ENTRY': {
      const s = needMutate(state, ['costEntries']);
      const idx = s.costEntries.findIndex(ce => ce.id === action.payload.id);
      if (idx !== -1) {
        s.costEntries[idx] = { ...s.costEntries[idx], ...action.payload.updates };
        supabaseUpdate('cost_entries', action.payload.id, action.payload.updates);
      }
      return s;
    }
    case 'DELETE_COST_ENTRY': {
      const s = needMutate(state, ['costEntries']);
      s.costEntries = s.costEntries.filter(ce => ce.id !== action.payload);
      supabaseDelete('cost_entries', action.payload);
      return s;
    }
  }
  return null;
}
