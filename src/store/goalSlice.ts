import type { AppState, Goal } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';
import { needMutate, reducerCanDelete, notifyAssigned, calcGoalLevel, calcGoalProgress, clampTitle, clampDesc, markPendingDelete, diffAssigned, resolveInheritedPriority, executeAutomationActions, matchCondition, tsNow, validateStatusFlow, fireAutomationRules } from './shared';

export function goalReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_GOAL': {
      const s = needMutate(state, ['goals', 'notifications']);
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
        keyResults: (payload.keyResults ?? []).map((kr: any) => ({ ...kr, selected: kr.selected ?? true })),
        createdAt: now,
        updatedAt: now,
      };
      s.goals.push(g);
      supabaseInsert('goals', g);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '目标', targetId: g.id, targetTitle: g.title });
      notifyAssigned(s, state.currentUser?.id, [g.leaderId, ...(g.supporterIds ?? [])].filter(Boolean), g.title, g.id, 'goal');
      for (const rule of s.automationRules) {
        if (rule.trigger === 'item_created' && rule.itemType === 'goal' && rule.enabled !== false) {
          try { executeAutomationActions(s, rule, g.id, 'goal', g.title); } catch (e) { console.warn('item_created automation failed:', e); }
        }
      }
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
        const oldStatus = s.goals[idx].status;
        const updates = { ...action.payload.updates };
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
        s.goals[idx].progress = calcGoalProgress(s.goals, action.payload.id);
        supabaseUpdate('goals', action.payload.id, { ...updates, progress: s.goals[idx].progress, updated_at: now }, oldUpdatedAt);
        // 级联更新父目标进度
        if (s.goals[idx].parentId) {
          const pIdx = s.goals.findIndex(g => g.id === s.goals[idx].parentId!);
          if (pIdx !== -1) {
            s.goals[pIdx].progress = calcGoalProgress(s.goals, s.goals[idx].parentId!);
            s.goals[pIdx].updatedAt = now;
            supabaseUpdate('goals', s.goals[idx].parentId!, { progress: s.goals[pIdx].progress, updated_at: now });
            // 递归向上更新祖先目标
            let ancestorId = s.goals[pIdx].parentId;
            while (ancestorId) {
              const aIdx = s.goals.findIndex(g => g.id === ancestorId);
              if (aIdx === -1) break;
              s.goals[aIdx].progress = calcGoalProgress(s.goals, ancestorId);
              s.goals[aIdx].updatedAt = now;
              supabaseUpdate('goals', ancestorId, { progress: s.goals[aIdx].progress, updated_at: now });
              ancestorId = s.goals[aIdx].parentId;
            }
          }
        }
        if ('leaderId' in updates || 'supporterIds' in updates) {
          const newlyAssigned = diffAssigned(oldLeaderId, oldSupporterIds, updates.leaderId ?? oldLeaderId, updates.supporterIds ?? oldSupporterIds);
          notifyAssigned(s, state.currentUser?.id, newlyAssigned, s.goals[idx].title, s.goals[idx].id, 'goal');
        }
        if (updates.status && updates.status !== oldStatus) {
          fireAutomationRules(s, s.goals[idx].id, 'goal', s.goals[idx].title, 'status_change', updates, s.goals[idx]);
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
      const s = needMutate(state, ['goals', 'projects', 'tasks', 'itemLinks', 'comments']);
      const now = tsNow();
      const deletedGoal = s.goals.find(g => g.id === gid) || state.goals.find(g => g.id === gid);
      markPendingDelete(gid);
      s.goals = s.goals.filter(g => g.id !== gid);
      const affectedGoals = s.goals.filter(g => g.parentId === gid);
      s.goals.forEach(g => { if (g.parentId === gid) { g.parentId = null; g.level = 0; } });
      for (const g of affectedGoals) { supabaseUpdate('goals', g.id, { parent_id: null, level: 0, updated_at: now }); }
      function recalcGoalLevels(parentId: string, parentLevel: number) {
        s.goals.filter(g => g.parentId === parentId).forEach(child => {
          child.level = parentLevel + 1;
          recalcGoalLevels(child.id, child.level);
        });
      }
      for (const g of affectedGoals) { recalcGoalLevels(g.id, 0); }
      const affectedProjects = s.projects.filter(p => p.goalId === gid);
      s.projects.forEach(p => { if (p.goalId === gid) p.goalId = null; });
      for (const p of affectedProjects) { supabaseUpdate('projects', p.id, { goal_id: null, updated_at: now }); }
      const affectedTasks = s.tasks.filter(t => t.goalId === gid);
      s.tasks.forEach(t => { if (t.goalId === gid) t.goalId = null; });
      for (const t of affectedTasks) { supabaseUpdate('tasks', t.id, { goal_id: null, updated_at: now }); }
      s.itemLinks = s.itemLinks.filter(l => l.sourceId !== gid && l.targetId !== gid);
      s.comments = s.comments.filter(c => c.itemId !== gid);
      supabaseDelete('goals', gid);
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '目标', targetId: gid, targetTitle: deletedGoal?.title || '' });
      return s;
    }

    case 'MOVE_GOAL_PARENT': {
      const s = needMutate(state, ['goals']);
      const now = tsNow();
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

    case 'SUBMIT_GOAL_APPROVAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload);
      if (!g) return null;
      const now = tsNow();
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'pending', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'submit', actorId: s.currentUser?.id ?? '', comment: '', createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'pending', updated_at: now });
      return s;
    }

    case 'APPROVE_GOAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload.id);
      if (!g || g.approvalStatus !== 'pending') return null;
      const now = tsNow();
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'approved', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'approve', actorId: s.currentUser?.id ?? '', comment: action.payload.comment, createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'approved', updated_at: now });
      return s;
    }

    case 'REJECT_GOAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload.id);
      if (!g || g.approvalStatus !== 'pending') return null;
      const now = tsNow();
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'rejected', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'reject', actorId: s.currentUser?.id ?? '', comment: action.payload.comment, createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'rejected', updated_at: now });
      return s;
    }

    case 'RECALL_GOAL_APPROVAL': {
      const s = needMutate(state, ['goals', 'approvalAudits']);
      const g = s.goals.find(g => g.id === action.payload);
      if (!g || g.approvalStatus !== 'pending') return null;
      const now = tsNow();
      const idx = s.goals.indexOf(g);
      s.goals[idx] = { ...g, approvalStatus: 'draft', updatedAt: now };
      s.approvalAudits.push({ id: genId('aa'), goalId: g.id, action: 'recall', actorId: s.currentUser?.id ?? '', comment: '', createdAt: now });
      supabaseUpdate('goals', g.id, { approval_status: 'draft', updated_at: now });
      return s;
    }

    default: return null;
  }
}
