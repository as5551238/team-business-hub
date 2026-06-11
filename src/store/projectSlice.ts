import type { AppState, Project } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';
import { needMutate, reducerCanDelete, notifyAssigned, calcGoalProgress, calcProjectProgress, clampTitle, clampDesc, markPendingDelete, diffAssigned, resolveInheritedPriority, executeAutomationActions, matchCondition, tsNow, validateStatusFlow, fireAutomationRules } from './shared';

export function projectReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_PROJECT': {
      const s = needMutate(state, ['projects', 'notifications']);
      const now = tsNow();
      const payload = action.payload;
      const pTitle = clampTitle(payload.title) ?? payload.title;
      const pDesc = clampDesc(payload.description) ?? payload.description;
      const hasParent = payload.goalId || payload.parentId;
      const inheritedPriority = hasParent ? resolveInheritedPriority(s, { goalId: payload.goalId, parentId: payload.parentId }) : undefined;
      const p: Project = {
        ...payload,
        title: pTitle,
        description: pDesc,
        id: genId('p'),
        appType: payload.appType ?? 'personal',
        progress: 0,
        priority: (inheritedPriority || payload.priority) ?? 'medium',
        tags: payload.tags ?? [],
        supporterIds: payload.supporterIds ?? [],
        category: payload.category ?? '',
        attachments: payload.attachments ?? [],
        trackingRecords: payload.trackingRecords ?? [],
        repeatCycle: payload.repeatCycle ?? 'none',
        teamId: payload.teamId || s.currentTeamId || '__default__',
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary ?? '',
        createdAt: now,
        updatedAt: now,
      };
      s.projects.push(p);
      supabaseInsert('projects', p);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '项目', targetId: p.id, targetTitle: p.title });
      notifyAssigned(s, state.currentUser?.id, [p.leaderId, ...(p.supporterIds ?? [])].filter(Boolean), p.title, p.id, 'project');
      for (const rule of s.automationRules) {
        if (rule.trigger === 'item_created' && rule.itemType === 'project' && rule.enabled !== false) {
          try { executeAutomationActions(s, rule, p.id, 'project', p.title); } catch (e) { console.warn('item_created automation failed:', e); }
        }
      }
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
        const oldStatus = s.projects[idx].status;
        const updates = { ...action.payload.updates };
        if (updates.title) updates.title = clampTitle(updates.title) ?? updates.title;
        if (updates.description) updates.description = clampDesc(updates.description) ?? updates.description;
        if ('goalId' in updates || 'parentId' in updates) {
          const newGoalId = updates.goalId !== undefined ? updates.goalId : s.projects[idx].goalId;
          const newParentId = updates.parentId !== undefined ? updates.parentId : s.projects[idx].parentId;
          const hasNewParent = !!newGoalId || !!newParentId;
          if (hasNewParent) {
            const inherited = resolveInheritedPriority(s, { goalId: newGoalId, parentId: newParentId });
            if (inherited) updates.priority = inherited;
          }
        }
        if (updates.status !== undefined && oldStatus && updates.status !== oldStatus) {
          const { allowed, rule } = validateStatusFlow(s, action.payload.id, 'project', oldStatus, updates.status);
          if (!allowed) {
            delete updates.status;
          } else if (rule) {
            executeAutomationActions(s, rule, s.projects[idx].id, 'project', s.projects[idx].title);
          }
        }
        s.projects[idx] = { ...s.projects[idx], ...updates, updatedAt: now };
        s.projects[idx].progress = calcProjectProgress(s.tasks, action.payload.id);
        supabaseUpdate('projects', action.payload.id, { ...updates, progress: s.projects[idx].progress, updated_at: now }, oldUpdatedAt);
        if ('leaderId' in updates || 'supporterIds' in updates) {
          const newlyAssigned = diffAssigned(oldLeaderId, oldSupporterIds, updates.leaderId ?? oldLeaderId, updates.supporterIds ?? oldSupporterIds);
          notifyAssigned(s, state.currentUser?.id, newlyAssigned, s.projects[idx].title, s.projects[idx].id, 'project');
        }
        if (updates.status && updates.status !== oldStatus) {
          fireAutomationRules(s, s.projects[idx].id, 'project', s.projects[idx].title, 'status_change', updates, s.projects[idx]);
        }
        if (Object.keys(updates).some(k => k !== 'status')) {
          fireAutomationRules(s, s.projects[idx].id, 'project', s.projects[idx].title, 'field_change', updates, s.projects[idx]);
        }
      }
      return s;
    }

    case 'DELETE_PROJECT': {
      if (!reducerCanDelete(state, 'projects_delete')) return state;
      const pid = action.payload;
      const s = needMutate(state, ['projects']);
      const now = tsNow();
      const deletedProject = s.projects.find(p => p.id === pid);
      if (deletedProject) {
        deletedProject.deletedAt = now;
        deletedProject.updatedAt = now;
        supabaseUpdate('projects', pid, { deleted_at: now, updated_at: now });
      }
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '项目', targetId: pid, targetTitle: deletedProject?.title || '' });
      return s;
    }
    case 'RESTORE_PROJECT': {
      const pid = action.payload;
      const s = needMutate(state, ['projects']);
      const project = s.projects.find(p => p.id === pid);
      if (project) {
        project.deletedAt = undefined;
        project.updatedAt = tsNow();
        supabaseUpdate('projects', pid, { deleted_at: null, updated_at: project.updatedAt });
      }
      return s;
    }

    default: return null;
  }
}
