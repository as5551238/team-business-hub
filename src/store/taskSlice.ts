import type { AppState, Task, SubTask } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';
import { needMutate, reducerCanDelete, clampTitle, clampDesc, resolveInheritedPriority, executeAutomationActions, validateStatusFlow, fireAutomationRules, tsNow } from './shared';
import { pushFieldUndo } from './undo';

/** Field name → human-readable label (shared across slices, S5-5) */
import { fieldLabelMap } from './fieldLabels';
import { learnFromCompletedTask } from '@/lib/delayPrediction';
import { cascadeAddTask, cascadeUpdateTaskStatusProjectGoal, cascadeUpdateTaskDone, cascadeUpdateTaskUndone, cascadeUpdateTaskProject, cascadeUpdateTaskGoal, cascadeTaskAssignmentChange, cascadeToggleSubtask } from './cascadeHandlers';

const BLOCKED_BY_MAX = 20;
function validateBlockedBy(blockedBy: unknown[], selfId?: string): string[] {
  if (!Array.isArray(blockedBy)) return [];
  return blockedBy.filter((bid): bid is string => typeof bid === 'string' && bid.length > 0 && bid !== selfId).slice(0, BLOCKED_BY_MAX);
}

export function taskReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_TASK': {
      const s = needMutate(state, ['tasks', 'projects', 'goals', 'notifications']);
      const now = tsNow();
      const payload = action.payload;
      const tTitle = clampTitle(payload.title) ?? payload.title;
      const tDesc = clampDesc(payload.description) ?? payload.description;
      const hasParent = payload.goalId || payload.projectId || payload.parentId;
      const inheritedPriority = hasParent ? resolveInheritedPriority(s, { goalId: payload.goalId, projectId: payload.projectId, parentId: payload.parentId }) : undefined;
      const t: Task = {
        ...payload,
        title: tTitle,
        description: tDesc,
        id: genId('t'),
        startDate: payload.startDate || null,
        dueDate: payload.dueDate || null,
        reminderDate: payload.reminderDate || null,
        priority: (inheritedPriority || payload.priority) ?? 'medium',
        parentId: payload.parentId || null,
        tags: payload.tags ?? [],
        supporterIds: payload.supporterIds ?? [],
        category: payload.category ?? '',
        attachments: payload.attachments ?? [],
        trackingRecords: payload.trackingRecords ?? [],
        repeatCycle: payload.repeatCycle ?? 'none',
        discussionThreadId: payload.discussionThreadId ?? null,
        summary: payload.summary ?? '',
        sprintId: payload.sprintId ?? null,
        teamId: payload.teamId || s.currentTeamId || '__default__',
        subtasks: (payload.subtasks ?? []).map((st: Partial<SubTask> & { title: string; completed: boolean }) => ({
          ...st,
          priority: st.priority ?? 'medium',
          leaderId: st.leaderId ?? '',
          supporterIds: st.supporterIds ?? [],
          tags: st.tags ?? [],
          attachments: st.attachments ?? [],
          trackingRecords: st.trackingRecords ?? [],
          repeatCycle: st.repeatCycle ?? 'none',
        })),
        blockedBy: validateBlockedBy(payload.blockedBy),
        createdAt: now,
        updatedAt: now,
      };
      s.tasks.push(t);
      cascadeAddTask(s, t, state.currentUser?.id);
      supabaseInsert('tasks', t);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '任务', targetId: t.id, targetTitle: t.title });
      return s;
    }

    case 'UPDATE_TASK': {
      const s = needMutate(state, ['tasks', 'notifications', 'projects', 'goals']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.id);
      if (tIdx !== -1) {
        const oldTask = s.tasks[tIdx];
        const updates = { ...action.payload.updates };
        // S4-3: Capture old field values for undo before applying updates
        const changedKeys = Object.keys(updates).filter(k => (updates as Record<string, unknown>)[k] !== (oldTask as Record<string, unknown>)[k]);
        if (changedKeys.length > 0) {
          const oldValues: Record<string, unknown> = {};
          const newValues: Record<string, unknown> = {};
          for (const k of changedKeys) {
            oldValues[k] = (oldTask as Record<string, unknown>)[k];
            newValues[k] = (updates as Record<string, unknown>)[k];
          }
          const fieldLabel = changedKeys.length === 1 ? fieldLabelMap[changedKeys[0]] || changedKeys[0] : `${changedKeys.length}个字段`;
          pushFieldUndo('UPDATE_TASK', action.payload.id, oldValues, newValues, `更新任务${fieldLabel}`);
        }
        if (updates.title) updates.title = clampTitle(updates.title) ?? updates.title;
        if (updates.description) updates.description = clampDesc(updates.description) ?? updates.description;
        if ('parentId' in updates || 'projectId' in updates || 'goalId' in updates) {
          const newGoalId = updates.goalId !== undefined ? updates.goalId : oldTask.goalId;
          const newProjectId = updates.projectId !== undefined ? updates.projectId : oldTask.projectId;
          const newParentId = updates.parentId !== undefined ? updates.parentId : oldTask.parentId;
          const hasNewParent = !!newGoalId || !!newProjectId || !!newParentId;
          if (hasNewParent) {
            const inherited = resolveInheritedPriority(s, { goalId: newGoalId, projectId: newProjectId, parentId: newParentId });
            if (inherited) updates.priority = inherited;
          }
        }
        if (updates.parentId === action.payload.id) updates.parentId = null;
        if (updates.blockedBy) updates.blockedBy = validateBlockedBy(updates.blockedBy, action.payload.id);
        if (updates.status && updates.status !== oldTask.status) {
          const { allowed, rule } = validateStatusFlow(s, action.payload.id, 'task', oldTask.status, updates.status);
          if (!allowed) {
            delete updates.status;
          } else if (rule) {
            try { executeAutomationActions(s, rule, oldTask.id, 'task', oldTask.title); } catch (e) { console.warn('status_flow automation failed:', e); }
          }
        }
        if (updates.status && updates.status !== oldTask.status) {
          fireAutomationRules(s, oldTask.id, 'task', oldTask.title, 'status_change', updates, oldTask);
        }
        if (Object.keys(updates).some(k => k !== 'status')) {
          fireAutomationRules(s, oldTask.id, 'task', oldTask.title, 'field_change', updates, oldTask);
        }
        s.tasks[tIdx] = { ...oldTask, ...updates, updatedAt: now };
        // completedAt auto-fill on done
        if (updates.status === 'done' && !updates.completedAt && !oldTask.completedAt) {
          updates.completedAt = new Date().toISOString();
          s.tasks[tIdx].completedAt = updates.completedAt;
        }
        // Cross-slice: status change -> recalc project + goal progress
        if (action.payload.updates.status && action.payload.updates.status !== oldTask.status) {
          cascadeUpdateTaskStatusProjectGoal(s, action.payload.id, oldTask, updates, now);
        }
        // Cross-slice: projectId change -> update old+new project progress + taskCount
        if (updates.projectId !== undefined && updates.projectId !== oldTask.projectId) {
          cascadeUpdateTaskProject(s, oldTask.projectId, updates.projectId);
        }
        // Cross-slice: goalId change -> update old+new goal progress
        if (updates.goalId !== undefined && updates.goalId !== oldTask.goalId) {
          cascadeUpdateTaskGoal(s, oldTask.goalId, updates.goalId, now);
        }
        // Block check BEFORE writing to Supabase to avoid two competing writes
        let effectiveStatus = updates.status;
        if (updates.status && updates.status !== oldTask.status && (updates.status === 'in_progress' || updates.status === 'done')) {
          const currentBlockedBy = updates.blockedBy !== undefined ? updates.blockedBy : oldTask.blockedBy ?? [];
          const uncompleted = currentBlockedBy.filter(bid => {
            const bt = s.tasks.find(t => t.id === bid);
            return !bt || bt.status !== 'done';
          });
          if (uncompleted.length > 0) {
            const names = uncompleted.map(bid => { const bt = s.tasks.find(t => t.id === bid); return bt ? bt.title : '已删除的任务'; });
            effectiveStatus = 'blocked';
            s.tasks[tIdx].status = 'blocked';
            s.tasks[tIdx].updatedAt = now;
            s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务被阻塞', message: `「${s.tasks[tIdx].title}」的前置任务「${names.join('、')}」尚未完成，已自动标记为阻塞`, relatedId: s.tasks[tIdx].id, relatedType: 'task', memberId: s.tasks[tIdx].leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
          }
        }
        // Single supabase write with resolved status
        const finalUpdates = effectiveStatus === 'blocked' ? { ...updates, status: 'blocked' } : updates;
        supabaseUpdate('tasks', action.payload.id, { ...finalUpdates, updated_at: now }, oldTask.updatedAt);
        if ('leaderId' in updates || 'supporterIds' in updates) {
          cascadeTaskAssignmentChange(s, oldTask, s.tasks[tIdx], state.currentUser?.id);
        }
        // P1: delay prediction self-learning
        if (updates.status === 'done' && s.tasks[tIdx].status === 'done') {
          learnFromCompletedTask(s.tasks[tIdx]);
        }
        // Cross-slice: done cascades (parent auto-complete, goal auto-complete, KR update, unblock)
        cascadeUpdateTaskDone(s, s.tasks[tIdx], oldTask, updates, now, state.currentUser?.id);
        // Cross-slice: undone -> rollback KR
        cascadeUpdateTaskUndone(s, oldTask, updates, now);
      }
      return s;
    }

    case 'DELETE_TASK': {
      if (!reducerCanDelete(state, 'tasks_delete')) return state;
      const tid = action.payload;
      const s = needMutate(state, ['tasks']);
      const now = tsNow();
      const t = s.tasks.find(t => t.id === tid);
      if (t) {
        const oldUpdatedAt = t.updatedAt;
        t.deletedAt = now;
        t.updatedAt = now;
        supabaseUpdate('tasks', tid, { deleted_at: now, updated_at: now }, oldUpdatedAt);
      }
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '任务', targetId: tid, targetTitle: t?.title || '' });
      return s;
    }
    case 'RESTORE_TASK': {
      const tid = action.payload;
      const s = needMutate(state, ['tasks']);
      const t = s.tasks.find(t => t.id === tid);
      if (t) {
        const oldUpdatedAt = t.updatedAt;
        t.deletedAt = undefined;
        t.updatedAt = tsNow();
        supabaseUpdate('tasks', tid, { deleted_at: null, updated_at: t.updatedAt }, oldUpdatedAt);
      }
      return s;
    }

    case 'TOGGLE_SUBTASK': {
      const s = needMutate(state, ['tasks', 'projects']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.taskId);
      if (tIdx !== -1) {
        const oldUpdatedAt = s.tasks[tIdx].updatedAt;
        s.tasks[tIdx].subtasks = s.tasks[tIdx].subtasks.map(st =>
          st.id === action.payload.subtaskId ? { ...st, completed: !st.completed } : st
        );
        s.tasks[tIdx].updatedAt = now;
        supabaseUpdate('tasks', action.payload.taskId, { subtasks: s.tasks[tIdx].subtasks, updated_at: now }, oldUpdatedAt);
        cascadeToggleSubtask(s, s.tasks[tIdx]);
      }
      return s;
    }

    case 'ADD_SUBTASK': {
      const s = needMutate(state, ['tasks']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.taskId);
      if (tIdx !== -1) {
        const oldUpdatedAt = s.tasks[tIdx].updatedAt;
        const subPayload = action.payload.subtask;
        const newSub: SubTask = {
          ...subPayload,
          id: genId('st'),
          priority: subPayload.priority ?? 'medium',
          leaderId: subPayload.leaderId ?? '',
          supporterIds: subPayload.supporterIds ?? [],
          tags: subPayload.tags ?? [],
          attachments: subPayload.attachments ?? [],
          trackingRecords: subPayload.trackingRecords ?? [],
          repeatCycle: subPayload.repeatCycle ?? 'none',
          createdAt: now,
        };
        s.tasks[tIdx].subtasks.push(newSub);
        s.tasks[tIdx].updatedAt = now;
        supabaseUpdate('tasks', action.payload.taskId, { subtasks: s.tasks[tIdx].subtasks, updated_at: now }, oldUpdatedAt);
      }
      return s;
    }

    default: return null;
  }
}
