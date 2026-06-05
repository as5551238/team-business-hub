import type { AppState, StatusFlowRule, AutomationRule } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, needMutate, tsNow, validateNewFlowRule } from './shared';

export function settingsReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
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
        const others = s.statusFlowRules.filter((_: unknown, i: number) => i !== index);
        const validation = validateNewFlowRule(others, rule);
        if (!validation.valid) { console.warn('Invalid flow rule:', validation.reason); return state; }
        const old = s.statusFlowRules.find(r => r.id === rule.id);
        s.statusFlowRules[index] = rule;
        supabaseUpdate('status_flow_rules', rule.id, { from_status: rule.fromStatus, to_status: rule.toStatus, allowed_roles: rule.allowedRoles, auto_actions: rule.autoActions ?? [], updated_at: tsNow() }, old?.updatedAt);
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
        const oldUpdatedAt = s.automationRules[rIdx].updatedAt;
        s.automationRules[rIdx] = { ...s.automationRules[rIdx], ...action.payload.updates, updatedAt: now };
        supabaseUpdate('automation_rules', action.payload.id, { ...action.payload.updates, updated_at: now }, oldUpdatedAt);
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
  }
  return null;
}
