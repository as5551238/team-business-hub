import type { AppState, Goal, KeyResult } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';
import { needMutate, reducerCanDelete, notifyAssigned, calcGoalLevel, computeGoalProgressInfo, applyGoalProgressInfo, calcProjectProgress, clampTitle, clampDesc, markPendingDelete, diffAssigned, resolveInheritedPriority, executeAutomationActions, matchCondition, tsNow, validateStatusFlow, fireAutomationRules } from './shared';
import { cascadeAddGoal, cascadeGoalStatusChange, cascadeGoalProgressUpdate } from './cascadeHandlers';
import { pushFieldUndo } from './undo';

/** Field name → human-readable label (shared across slices, S5-5) */
import { fieldLabelMap as goalFieldLabelMap } from './fieldLabels';

export function goalReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_GOAL': {
      const s = needMutate(state, ['goals', 'projects', 'tasks', 'notifications']);
      const now = tsNow();
      const payload = action.payload;
      const pTitle = clampTitle(payload.title) ?? payload.title;
      const pDesc = clampDesc(payload.description) ?? payload.description;
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
        teamId: payload.teamId || s.currentTeamId || '__default__',
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary ?? '',
        keyResults: (payload.keyResults ?? []).map((kr: Partial<KeyResult> & Pick<KeyResult, 'title' | 'targetValue' | 'currentValue'>) => ({ ...kr, selected: kr.selected ?? true })),
        createdAt: now,
        updatedAt: now,
      };
      s.goals.push(g);
      supabaseInsert('goals', g);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '目标', targetId: g.id, targetTitle: g.title });
      cascadeAddGoal(s, g, state.currentUser?.id);
      return s;
    }

    case 'UPDATE_GOAL': {
      const s = needMutate(state, ['goals', 'notifications', 'projects', 'tasks']);
      const now = tsNow();
      const idx = s.goals.findIndex(g => g.id === action.payload.id);
      if (idx !== -1) {
        const oldUpdatedAt = s.goals[idx].updatedAt;
        const oldLeaderId = s.goals[idx].leaderId;
        const oldSupporterIds = s.goals[idx].supporterIds;
        const oldStatus = s.goals[idx].status;
        const updates = { ...action.payload.updates };
        // S4-3: Capture old field values for undo before applying updates
        const oldGoal = s.goals[idx];
        const changedKeys = Object.keys(updates).filter(k => (updates as Record<string, unknown>)[k] !== (oldGoal as Record<string, unknown>)[k]);
        if (changedKeys.length > 0) {
          const oldValues: Record<string, unknown> = {};
          const newValues: Record<string, unknown> = {};
          for (const k of changedKeys) { oldValues[k] = (oldGoal as Record<string, unknown>)[k]; newValues[k] = (updates as Record<string, unknown>)[k]; }
          const fieldLabel = changedKeys.length === 1 ? goalFieldLabelMap[changedKeys[0]] || changedKeys[0] : `${changedKeys.length}个字段`;
          pushFieldUndo('UPDATE_GOAL', action.payload.id, oldValues, newValues, `更新目标${fieldLabel}`, (action as Action & { _skipUndo?: boolean })._skipUndo);
        }
        if (updates.title) updates.title = clampTitle(updates.title) ?? updates.title;
        if (updates.description) updates.description = clampDesc(updates.description) ?? updates.description;
        if ('parentId' in updates) {
          const newParentId = updates.parentId !== undefined ? updates.parentId : s.goals[idx].parentId;
          if (newParentId) {
            const inherited = resolveInheritedPriority(s, { goalId: newParentId });
            if (inherited) updates.priority = inherited;
          }
        }
        if (updates.parentId === action.payload.id) updates.parentId = null;
        if (updates.status !== undefined && oldStatus && updates.status !== oldStatus) {
          const { allowed, rule } = validateStatusFlow(s, action.payload.id, 'goal', oldStatus, updates.status);
          if (!allowed) {
            delete updates.status;
          } else if (rule) {
            executeAutomationActions(s, rule, s.goals[idx].id, 'goal', s.goals[idx].title);
          }
        }
        s.goals[idx] = { ...s.goals[idx], ...updates, updatedAt: now };
        const info = computeGoalProgressInfo(s.goals, action.payload.id);
        applyGoalProgressInfo(s.goals[idx], info);
        s.goals[idx].progress = info.progress;
        supabaseUpdate('goals', action.payload.id, { ...updates, progress: s.goals[idx].progress, updated_at: now }, oldUpdatedAt);
        // Cross-slice: ancestor goal progress chain
        cascadeGoalProgressUpdate(s, action.payload.id, now);
        if ('leaderId' in updates || 'supporterIds' in updates) {
          const newlyAssigned = diffAssigned(oldLeaderId, oldSupporterIds, updates.leaderId ?? oldLeaderId, updates.supporterIds ?? oldSupporterIds);
          notifyAssigned(s, state.currentUser?.id, newlyAssigned, s.goals[idx].title, s.goals[idx].id, 'goal');
        }
        if (updates.status && updates.status !== oldStatus) {
          fireAutomationRules(s, s.goals[idx].id, 'goal', s.goals[idx].title, 'status_change', updates, s.goals[idx]);
          // F5: cross-slice cascade to linked projects and tasks
          cascadeGoalStatusChange(s, action.payload.id, updates.status);
        }
        if (Object.keys(updates).some(k => k !== 'status')) {
          fireAutomationRules(s, s.goals[idx].id, 'goal', s.goals[idx].title, 'field_change', updates, s.goals[idx]);
        }
      }
      return s;
    }

    case 'DELETE_GOAL': {
      if (!reducerCanDelete(state, 'goals_delete')) return state;
      const gid = action.payload;
      const s = needMutate(state, ['goals']);
      const now = tsNow();
      const deletedGoal = s.goals.find(g => g.id === gid);
      if (deletedGoal) {
        const oldUpdatedAt = deletedGoal.updatedAt;
        deletedGoal.deletedAt = now;
        deletedGoal.updatedAt = now;
        supabaseUpdate('goals', gid, { deleted_at: now, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }
    case 'RESTORE_GOAL': {
      const gid = action.payload;
      const s = needMutate(state, ['goals']);
      const goal = s.goals.find(g => g.id === gid);
      if (goal) {
        const oldUpdatedAt = goal.updatedAt;
        goal.deletedAt = undefined;
        goal.updatedAt = tsNow();
        supabaseUpdate('goals', gid, { deleted_at: null, updated_at: goal.updatedAt }, oldUpdatedAt);
      }
      return s;
    }

    case 'MOVE_GOAL_PARENT': {
      const s = needMutate(state, ['goals']);
      const now = tsNow();
      if (action.payload.newParentId === action.payload.goalId) return state;
      const idx = s.goals.findIndex(g => g.id === action.payload.goalId);
      if (idx !== -1) {
        const oldUpdatedAt = s.goals[idx].updatedAt;
        s.goals[idx].parentId = action.payload.newParentId;
        s.goals[idx].level = calcGoalLevel(s.goals, action.payload.goalId, action.payload.newParentId);
        s.goals[idx].updatedAt = now;
        function recalcDescendants(parentId: string, visited = new Set<string>()) {
          if (visited.has(parentId)) return;
          visited.add(parentId);
          s.goals.filter(g => g.parentId === parentId).forEach(child => {
            const p = s.goals.find(pp => pp.id === parentId);
            child.level = (p ? p.level : 0) + 1;
            recalcDescendants(child.id, visited);
          });
        }
        recalcDescendants(action.payload.goalId);
        supabaseUpdate('goals', action.payload.goalId, { parent_id: action.payload.newParentId, level: s.goals[idx].level, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }

    case 'UPDATE_KEY_RESULT': {
      const s = needMutate(state, ['goals']);
      const now = tsNow();
      const idx = s.goals.findIndex(g => g.id === action.payload.goalId);
      if (idx !== -1) {
        const g = s.goals[idx];
        const oldUpdatedAt = g.updatedAt;
        g.keyResults = g.keyResults.map(kr => kr.id === action.payload.krId ? { ...kr, currentValue: action.payload.value } : kr);
        const krInfo = computeGoalProgressInfo(s.goals, action.payload.goalId);
        applyGoalProgressInfo(g, krInfo);
        g.progress = krInfo.progress;
        g.updatedAt = now;
        // Cross-slice: update parent goal progress
        cascadeGoalProgressUpdate(s, action.payload.goalId, now);
        supabaseUpdate('goals', action.payload.goalId, { key_results: g.keyResults, progress: g.progress, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }

    case 'SUBMIT_GOAL_APPROVAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload);
      if (!g) return state;
      const now = tsNow();
      const oldUpdatedAt = g.updatedAt;
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'pending', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'submit', actorId: s.currentUser?.id ?? '', comment: '', createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'pending', updated_at: now }, oldUpdatedAt);
      return s;
    }

    case 'APPROVE_GOAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload.id);
      if (!g || g.approvalStatus !== 'pending') return state;
      const now = tsNow();
      const oldUpdatedAt = g.updatedAt;
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'approved', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'approve', actorId: s.currentUser?.id ?? '', comment: action.payload.comment, createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'approved', updated_at: now }, oldUpdatedAt);
      return s;
    }

    case 'REJECT_GOAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload.id);
      if (!g || g.approvalStatus !== 'pending') return state;
      const now = tsNow();
      const oldUpdatedAt = g.updatedAt;
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'rejected', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'reject', actorId: s.currentUser?.id ?? '', comment: action.payload.comment, createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'rejected', updated_at: now }, oldUpdatedAt);
      return s;
    }

    case 'RECALL_GOAL_APPROVAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload);
      if (!g || g.approvalStatus !== 'pending') return state;
      const now = tsNow();
      const oldUpdatedAt = g.updatedAt;
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'draft', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'recall', actorId: s.currentUser?.id ?? '', comment: '', createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'draft', updated_at: now }, oldUpdatedAt);
      return s;
    }

    default: return null;
  }
}
