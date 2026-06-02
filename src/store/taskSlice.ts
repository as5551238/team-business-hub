import type { AppState, Task, SubTask } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete, logActivity } from './supabase';
import { genId } from './utils';
import { needMutate, reducerCanDelete, notifyAssigned, calcProjectProgress, calcGoalProgress, clampTitle, clampDesc, markPendingDelete, diffAssigned, resolveInheritedPriority, matchCondition, executeAutomationActions, validateStatusFlow, tsNow, fireAutomationRules } from './shared';
import { calcDualTrack } from '@/lib/kpiScoring';
import { learnFromCompletedTask } from '@/lib/delayPrediction';

const BLOCKED_BY_MAX = 20;
function validateBlockedBy(blockedBy: any[], selfId?: string): string[] {
  if (!Array.isArray(blockedBy)) return [];
  return blockedBy.filter((bid: any) => typeof bid === 'string' && bid.length > 0 && bid !== selfId).slice(0, BLOCKED_BY_MAX);
}

export function taskReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_TASK': {
      const s = needMutate(state, ['tasks', 'projects', 'notifications']);
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
        subtasks: (payload.subtasks ?? []).map((st: any) => ({
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
      if (t.projectId) {
        const pIdx = s.projects.findIndex(p => p.id === t.projectId);
        if (pIdx !== -1) { s.projects[pIdx].taskCount = (s.projects[pIdx].taskCount ?? 0) + 1; s.projects[pIdx].progress = calcProjectProgress(s.tasks, t.projectId); }
      }
      supabaseInsert('tasks', t);
      logActivity({ memberId: state.currentUser?.id, action: '创建', targetType: '任务', targetId: t.id, targetTitle: t.title });
      notifyAssigned(s, state.currentUser?.id, [t.leaderId, ...(t.supporterIds ?? [])].filter(Boolean), t.title, t.id, 'task');
      for (const rule of s.automationRules) {
        if (rule.trigger === 'item_created' && rule.itemType === 'task' && rule.enabled !== false) {
          try { executeAutomationActions(s, rule, t.id, 'task', t.title); } catch (e) { console.warn('item_created automation failed:', e); }
        }
      }
      return s;
    }

    case 'UPDATE_TASK': {
      const s = needMutate(state, ['tasks', 'notifications', 'projects', 'goals']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.id);
      if (tIdx !== -1) {
        const oldTask = s.tasks[tIdx];
        const updates = { ...action.payload.updates };
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
        // 完成时自动补 completedAt（确保 P1 延期预测自学习和 K2 KR 更新正常工作）
        if (updates.status === 'done' && !updates.completedAt && !oldTask.completedAt) {
          updates.completedAt = new Date().toISOString();
          s.tasks[tIdx].completedAt = updates.completedAt;
        }
        if (action.payload.updates.status && action.payload.updates.status !== oldTask.status) {
          if (oldTask.projectId) {
            const pIdx = s.projects.findIndex(p => p.id === oldTask.projectId);
            if (pIdx !== -1) s.projects[pIdx].progress = calcProjectProgress(s.tasks, oldTask.projectId);
          }
          // Auto-recalculate goal progress when task status changes (OKR↔Task closed loop)
          const goalIds = new Set<string>();
          const currentGoalId = updates.goalId !== undefined ? updates.goalId : oldTask.goalId;
          if (currentGoalId) goalIds.add(currentGoalId);
          if (oldTask.goalId && oldTask.goalId !== currentGoalId) goalIds.add(oldTask.goalId);
          // Also update parent goal chain
          for (const gid of goalIds) {
            const gIdx = s.goals.findIndex(g => g.id === gid);
            if (gIdx !== -1) {
              s.goals[gIdx].progress = calcGoalProgress(s.goals, gid);
              s.goals[gIdx].dualTrack = calcDualTrack(s.goals[gIdx].keyResults) ?? undefined;
            }
          }
        }
        // projectId 变更时，更新新老两个项目的进度和任务数
        if (updates.projectId !== undefined && updates.projectId !== oldTask.projectId) {
          if (oldTask.projectId) {
            const pIdx = s.projects.findIndex(p => p.id === oldTask.projectId);
            if (pIdx !== -1) {
              s.projects[pIdx].progress = calcProjectProgress(s.tasks, oldTask.projectId);
              s.projects[pIdx].taskCount = Math.max(0, (s.projects[pIdx].taskCount ?? 0) - 1);
            }
          }
          if (updates.projectId) {
            const pIdx = s.projects.findIndex(p => p.id === updates.projectId);
            if (pIdx !== -1) {
              s.projects[pIdx].progress = calcProjectProgress(s.tasks, updates.projectId);
              s.projects[pIdx].taskCount = (s.projects[pIdx].taskCount ?? 0) + 1;
            }
          }
        }
        // goalId 变更时，更新新老两个目标的进度 (OKR↔Task closed loop)
        if (updates.goalId !== undefined && updates.goalId !== oldTask.goalId) {
          if (oldTask.goalId) {
            const gIdx = s.goals.findIndex(g => g.id === oldTask.goalId);
            if (gIdx !== -1) { s.goals[gIdx].progress = calcGoalProgress(s.goals, oldTask.goalId); s.goals[gIdx].dualTrack = calcDualTrack(s.goals[gIdx].keyResults) ?? undefined; }
          }
          if (updates.goalId) {
            const gIdx = s.goals.findIndex(g => g.id === updates.goalId);
            if (gIdx !== -1) { s.goals[gIdx].progress = calcGoalProgress(s.goals, updates.goalId); s.goals[gIdx].dualTrack = calcDualTrack(s.goals[gIdx].keyResults) ?? undefined; }
          }
        }
        // Check blocked status BEFORE writing to Supabase to avoid two competing writes
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
        // Single supabase write with resolved status (avoids race condition)
        const finalUpdates = effectiveStatus === 'blocked' ? { ...updates, status: 'blocked' } : updates;
        supabaseUpdate('tasks', action.payload.id, { ...finalUpdates, updated_at: now }, oldTask.updatedAt);
        if ('leaderId' in updates || 'supporterIds' in updates) {
          const newlyAssigned = diffAssigned(oldTask.leaderId, oldTask.supporterIds, updates.leaderId ?? oldTask.leaderId, updates.supporterIds ?? oldTask.supporterIds);
          notifyAssigned(s, state.currentUser?.id, newlyAssigned, s.tasks[tIdx].title, s.tasks[tIdx].id, 'task');
        }
        // P1: 任务完成时学习偏差率（用于延期预测自学习）
        if (updates.status === 'done' && s.tasks[tIdx].status === 'done') {
          learnFromCompletedTask(s.tasks[tIdx]);
        }
        if (updates.status === 'done' && oldTask.parentId) {
          const parentTask = s.tasks.find(t => t.id === oldTask.parentId);
          if (parentTask && parentTask.status !== 'done') {
            const siblings = s.tasks.filter(t => t.parentId === oldTask.parentId);
            const allDone = siblings.every(t => t.status === 'done');
            if (allDone) {
              const { allowed: parentAutoOk } = validateStatusFlow(s, parentTask.id, 'task', parentTask.status, 'done');
              if (parentAutoOk) {
                parentTask.status = 'done';
                parentTask.completedAt = new Date().toISOString();
                parentTask.updatedAt = now;
                supabaseUpdate('tasks', parentTask.id, { status: 'done', completed_at: parentTask.completedAt, updated_at: now });
                s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务自动完成', message: `「${parentTask.title}」的所有子任务已完成，已自动标记为完成`, relatedId: parentTask.id, relatedType: 'task', memberId: parentTask.leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
              }
            }
          }
        }
        if (updates.status === 'done' && s.tasks[tIdx].goalId) {
          const gIdx = s.goals.findIndex(g => g.id === s.tasks[tIdx].goalId);
          if (gIdx !== -1) {
            const goal = s.goals[gIdx];
            const allKRsMet = (goal.keyResults ?? []).length > 0 && goal.keyResults.every(kr => kr.targetValue > 0 && kr.currentValue >= kr.targetValue);
            if (allKRsMet && goal.progress < 100) {
              s.goals[gIdx].progress = 100;
              s.goals[gIdx].updatedAt = now;
              supabaseUpdate('goals', goal.id, { progress: 100, updated_at: now });
              s.notifications.unshift({ id: genId('n'), type: 'sync', title: '目标自动达成', message: `「${goal.title}」的所有关键结果已达标，进度自动更新为100%`, relatedId: goal.id, relatedType: 'goal', memberId: goal.leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
            }
          }
        }
        // K2: 任务从 done 恢复为非 done 时，回退关联 KR 的 currentValue + 清除 completedAt
        if (oldTask.status === 'done' && updates.status && updates.status !== 'done') {
          s.tasks[tIdx].completedAt = null;
          if (oldTask.krId && oldTask.goalId) {
          const gIdx = s.goals.findIndex(g => g.id === oldTask.goalId);
          if (gIdx !== -1) {
            const goal = s.goals[gIdx];
            const krIdx = (goal.keyResults ?? []).findIndex(kr => kr.id === oldTask.krId);
            if (krIdx !== -1) {
              const kr = goal.keyResults[krIdx];
              const newVal = Math.max(0, kr.currentValue - 1);
              if (newVal !== kr.currentValue) {
                goal.keyResults[krIdx] = { ...kr, currentValue: newVal };
                goal.progress = calcGoalProgress(s.goals, goal.id);
                goal.updatedAt = now;
                supabaseUpdate('goals', goal.id, { key_results: goal.keyResults, progress: goal.progress, updated_at: now });
                // 级联更新父目标
                if (goal.parentId) {
                  const pIdx = s.goals.findIndex(g => g.id === goal.parentId);
                  if (pIdx !== -1) {
                    s.goals[pIdx].progress = calcGoalProgress(s.goals, goal.parentId);
                    s.goals[pIdx].updatedAt = now;
                    supabaseUpdate('goals', goal.parentId, { progress: s.goals[pIdx].progress, updated_at: now });
                  }
                }
              }
            }
            }
          }
        }
        // K2: 任务完成时自动更新关联KR的currentValue
        if (updates.status === 'done' && s.tasks[tIdx].krId && s.tasks[tIdx].goalId) {
          const gIdx = s.goals.findIndex(g => g.id === s.tasks[tIdx].goalId);
          if (gIdx !== -1) {
            const goal = s.goals[gIdx];
            const krIdx = (goal.keyResults ?? []).findIndex(kr => kr.id === s.tasks[tIdx].krId);
            if (krIdx !== -1) {
              const kr = goal.keyResults[krIdx];
              const newVal = Math.min(kr.currentValue + 1, kr.targetValue);
              if (newVal !== kr.currentValue) {
                goal.keyResults[krIdx] = { ...kr, currentValue: newVal };
                goal.progress = calcGoalProgress(s.goals, goal.id);
                goal.updatedAt = now;
                supabaseUpdate('goals', goal.id, { key_results: goal.keyResults, progress: goal.progress, updated_at: now });
                // 级联更新父目标
                if (goal.parentId) {
                  const pIdx = s.goals.findIndex(g => g.id === goal.parentId);
                  if (pIdx !== -1) {
                    s.goals[pIdx].progress = calcGoalProgress(s.goals, goal.parentId);
                    s.goals[pIdx].updatedAt = now;
                    supabaseUpdate('goals', goal.parentId, { progress: s.goals[pIdx].progress, updated_at: now });
                  }
                }
                s.notifications.unshift({ id: genId('n'), type: 'sync', title: 'KR 自动更新', message: `「${kr.title}」的当前值已更新为 ${newVal}/${kr.targetValue}`, relatedId: goal.id, relatedType: 'goal', memberId: s.tasks[tIdx].leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
              }
            } else { s.tasks[tIdx].krId = undefined; }
          }
        }
        if (updates.status === 'done') {
          const completedId = action.payload.id;
          const unblockedTasks = s.tasks.filter(t =>
            t.status === 'blocked' && (t.blockedBy ?? []).includes(completedId)
          );
          for (const ut of unblockedTasks) {
            const stillBlocked = (ut.blockedBy ?? []).filter(bid => {
              if (bid === completedId) return false;
              const bt = s.tasks.find(t => t.id === bid);
              return !bt || bt.status !== 'done';
            });
            if (stillBlocked.length === 0) {
              ut.status = 'todo';
              ut.updatedAt = now;
              const utIdx = s.tasks.findIndex(t => t.id === ut.id);
              if (utIdx !== -1) supabaseUpdate('tasks', ut.id, { status: 'todo', updated_at: now });
              s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务已解除阻塞', message: `「${ut.title}」的前置任务已全部完成，可以开始执行`, relatedId: ut.id, relatedType: 'task', memberId: ut.leaderId || state.currentUser?.id || '', read: false, createdAt: new Date().toISOString() });
            }
          }
        }
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
        t.deletedAt = now;
        t.updatedAt = now;
        supabaseUpdate('tasks', tid, { deleted_at: now, updated_at: now });
      }
      logActivity({ memberId: state.currentUser?.id, action: '删除', targetType: '任务', targetId: tid, targetTitle: t?.title || '' });
      return s;
    }
    case 'RESTORE_TASK': {
      const tid = action.payload;
      const s = needMutate(state, ['tasks']);
      const t = s.tasks.find(t => t.id === tid);
      if (t) {
        t.deletedAt = undefined;
        t.updatedAt = tsNow();
        supabaseUpdate('tasks', tid, { deleted_at: null, updated_at: t.updatedAt });
      }
      return s;
    }

    case 'TOGGLE_SUBTASK': {
      const s = needMutate(state, ['tasks', 'projects']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.taskId);
      if (tIdx !== -1) {
        s.tasks[tIdx].subtasks = s.tasks[tIdx].subtasks.map(st =>
          st.id === action.payload.subtaskId ? { ...st, completed: !st.completed } : st
        );
        s.tasks[tIdx].updatedAt = now;
        supabaseUpdate('tasks', action.payload.taskId, { subtasks: s.tasks[tIdx].subtasks, updated_at: now });
        // 子任务完成率变化后更新所属项目进度
        if (s.tasks[tIdx].projectId) {
          const pIdx = s.projects.findIndex(p => p.id === s.tasks[tIdx].projectId);
          if (pIdx !== -1) s.projects[pIdx].progress = calcProjectProgress(s.tasks, s.tasks[tIdx].projectId!);
        }
      }
      return s;
    }

    case 'ADD_SUBTASK': {
      const s = needMutate(state, ['tasks']);
      const now = tsNow();
      const tIdx = s.tasks.findIndex(t => t.id === action.payload.taskId);
      if (tIdx !== -1) {
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
        supabaseUpdate('tasks', action.payload.taskId, { subtasks: s.tasks[tIdx].subtasks, updated_at: now });
      }
      return s;
    }

    default: return null;
  }
}
