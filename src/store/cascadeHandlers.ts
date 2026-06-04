import type { AppState, Goal, Project, Task } from '@/types';
import { supabaseUpdate } from './supabase';
import { genId } from './utils';
import { computeGoalProgressInfo, applyGoalProgressInfo, calcProjectProgress, notifyAssigned, diffAssigned, executeAutomationActions, validateStatusFlow } from './shared';

export function cascadeAddTask(
  s: AppState,
  task: Task,
  currentUserId: string | undefined,
): void {
  if (task.projectId) {
    const pIdx = s.projects.findIndex(p => p.id === task.projectId);
    if (pIdx !== -1) {
      s.projects[pIdx].taskCount = (s.projects[pIdx].taskCount ?? 0) + 1;
      s.projects[pIdx].progress = calcProjectProgress(s.tasks, task.projectId);
    }
  }
  notifyAssigned(s, currentUserId, [task.leaderId, ...(task.supporterIds ?? [])].filter(Boolean), task.title, task.id, 'task');
  for (const rule of s.automationRules) {
    if (rule.trigger === 'item_created' && rule.itemType === 'task' && rule.enabled !== false) {
      try { executeAutomationActions(s, rule, task.id, 'task', task.title); } catch (e) { console.warn('item_created automation failed:', e); }
    }
  }
}

export function cascadeUpdateTaskStatusProjectGoal(
  s: AppState,
  taskId: string,
  oldTask: Task,
  updates: Partial<Task>,
  now: string,
): void {
  if (!updates.status || updates.status === oldTask.status) return;
  if (oldTask.projectId) {
    const pIdx = s.projects.findIndex(p => p.id === oldTask.projectId);
    if (pIdx !== -1) s.projects[pIdx].progress = calcProjectProgress(s.tasks, oldTask.projectId);
  }
  const goalIds = new Set<string>();
  const currentGoalId = updates.goalId !== undefined ? updates.goalId : oldTask.goalId;
  if (currentGoalId) goalIds.add(currentGoalId);
  if (oldTask.goalId && oldTask.goalId !== currentGoalId) goalIds.add(oldTask.goalId);
  for (const gid of goalIds) {
    recalcGoalProgress(s, gid);
  }
}

export function cascadeUpdateTaskDone(
  s: AppState,
  task: Task,
  oldTask: Task,
  updates: Partial<Task>,
  now: string,
  currentUserId: string | undefined,
): void {
  if (updates.status !== 'done') return;

  // Auto-complete parent task
  if (oldTask.parentId) {
    const parentTask = s.tasks.find(t => t.id === oldTask.parentId);
    if (parentTask && parentTask.status !== 'done') {
      const siblings = s.tasks.filter(t => t.parentId === oldTask.parentId);
      const allDone = siblings.every(t => t.status === 'done');
      if (allDone) {
        const { allowed: parentAutoOk } = validateStatusFlow(s, parentTask.id, 'task', parentTask.status, 'done');
        if (parentAutoOk) {
          const oldParentUpdatedAt = parentTask.updatedAt;
          parentTask.status = 'done';
          parentTask.completedAt = now;
          parentTask.updatedAt = now;
          supabaseUpdate('tasks', parentTask.id, { status: 'done', completed_at: parentTask.completedAt, updated_at: now }, oldParentUpdatedAt);
          s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务自动完成', message: `「${parentTask.title}」的所有子任务已完成，已自动标记为完成`, relatedId: parentTask.id, relatedType: 'task', memberId: parentTask.leaderId || currentUserId || '', read: false, createdAt: now });
        }
      }
    }
  }

  // Auto-complete goal when all KRs met
  if (task.goalId) {
    const gIdx = s.goals.findIndex(g => g.id === task.goalId);
    if (gIdx !== -1) {
      const goal = s.goals[gIdx];
      const allKRsMet = (goal.keyResults ?? []).length > 0 && goal.keyResults.every(kr => kr.targetValue > 0 && kr.currentValue >= kr.targetValue);
      if (allKRsMet && goal.progress < 100) {
        const oldGoalUpdatedAt = s.goals[gIdx].updatedAt;
        s.goals[gIdx].progress = 100;
        s.goals[gIdx].updatedAt = now;
        supabaseUpdate('goals', goal.id, { progress: 100, updated_at: now }, oldGoalUpdatedAt);
        s.notifications.unshift({ id: genId('n'), type: 'sync', title: '目标自动达成', message: `「${goal.title}」的所有关键结果已达标，进度自动更新为100%`, relatedId: goal.id, relatedType: 'goal', memberId: goal.leaderId || currentUserId || '', read: false, createdAt: now });
      }
    }
  }

  // K2: Task done -> increment KR currentValue
  if (task.krId && task.goalId) {
    incrementKrOnTaskDone(s, task, now, currentUserId);
  }

  // Unblock dependent tasks
  unblockDependents(s, task.id, now, currentUserId);
}

export function cascadeUpdateTaskUndone(
  s: AppState,
  oldTask: Task,
  updates: Partial<Task>,
  now: string,
): void {
  if (oldTask.status !== 'done' || !updates.status || updates.status === 'done') return;
  if (oldTask.krId && oldTask.goalId) {
    decrementKrOnTaskUndone(s, oldTask, now);
  }
}

export function cascadeUpdateTaskProject(
  s: AppState,
  oldProjectId: string | null,
  newProjectId: string | null,
): void {
  if (oldProjectId) {
    const pIdx = s.projects.findIndex(p => p.id === oldProjectId);
    if (pIdx !== -1) {
      s.projects[pIdx].progress = calcProjectProgress(s.tasks, oldProjectId);
      s.projects[pIdx].taskCount = Math.max(0, (s.projects[pIdx].taskCount ?? 0) - 1);
    }
  }
  if (newProjectId) {
    const pIdx = s.projects.findIndex(p => p.id === newProjectId);
    if (pIdx !== -1) {
      s.projects[pIdx].progress = calcProjectProgress(s.tasks, newProjectId);
      s.projects[pIdx].taskCount = (s.projects[pIdx].taskCount ?? 0) + 1;
    }
  }
}

export function cascadeUpdateTaskGoal(
  s: AppState,
  oldGoalId: string | null,
  newGoalId: string | null,
  now: string,
): void {
  if (oldGoalId) recalcGoalProgress(s, oldGoalId);
  if (newGoalId) recalcGoalProgress(s, newGoalId);
}

export function cascadeTaskAssignmentChange(
  s: AppState,
  oldTask: Task,
  updatedTask: Task,
  currentUserId: string | undefined,
): void {
  const newlyAssigned = diffAssigned(oldTask.leaderId, oldTask.supporterIds, updatedTask.leaderId ?? oldTask.leaderId, updatedTask.supporterIds ?? oldTask.supporterIds);
  notifyAssigned(s, currentUserId, newlyAssigned, updatedTask.title, updatedTask.id, 'task');
}

export function cascadeToggleSubtask(s: AppState, task: Task): void {
  if (task.projectId) {
    const pIdx = s.projects.findIndex(p => p.id === task.projectId);
    if (pIdx !== -1) s.projects[pIdx].progress = calcProjectProgress(s.tasks, task.projectId!);
  }
}

export function cascadeDeleteMember(
  s: AppState,
  memberId: string,
  now: string,
): void {
  s.goals.forEach(g => {
    let changed = false;
    if (g.leaderId === memberId) { g.leaderId = ''; changed = true; }
    const prevLen = g.supporterIds?.length ?? 0;
    g.supporterIds = (g.supporterIds ?? []).filter(id => id !== memberId);
    if (g.supporterIds.length !== prevLen) changed = true;
    if (changed) { const oldGUpdatedAt = g.updatedAt; g.updatedAt = now; supabaseUpdate('goals', g.id, { leader_id: g.leaderId, supporter_ids: g.supporterIds, updated_at: now }, oldGUpdatedAt); }
  });
  s.projects.forEach(p => {
    let changed = false;
    if (p.leaderId === memberId) { p.leaderId = ''; changed = true; }
    const prevLen = p.supporterIds?.length ?? 0;
    p.supporterIds = (p.supporterIds ?? []).filter(id => id !== memberId);
    if (p.supporterIds.length !== prevLen) changed = true;
    if (changed) { const oldPUUpdatedAt = p.updatedAt; p.updatedAt = now; supabaseUpdate('projects', p.id, { leader_id: p.leaderId, supporter_ids: p.supporterIds, updated_at: now }, oldPUUpdatedAt); }
  });
  s.tasks.forEach(t => {
    let changed = false;
    if (t.leaderId === memberId) { t.leaderId = ''; changed = true; }
    const prevLen = t.supporterIds?.length ?? 0;
    t.supporterIds = (t.supporterIds ?? []).filter(id => id !== memberId);
    if (t.supporterIds.length !== prevLen) changed = true;
    if (changed) { const oldTUpdatedAt = t.updatedAt; t.updatedAt = now; supabaseUpdate('tasks', t.id, { leader_id: t.leaderId, supporter_ids: t.supporterIds, updated_at: now }, oldTUpdatedAt); }
  });
  s.comments.forEach(c => {
    if (c.memberId === memberId) { c.memberId = null; supabaseUpdate('comments', c.id, { member_id: null }); }
  });
}

export function cascadeGoalStatusChange(
  s: AppState,
  goalId: string,
  newStatus: string,
): void {
  if (!['done', 'blocked', 'cancelled'].includes(newStatus)) return;
  const now = new Date().toISOString();
  const cascadeStatus = newStatus === 'done' ? 'done' : newStatus === 'blocked' ? 'blocked' : 'cancelled';
  s.projects.filter(p => p.goalId === goalId && !p.deletedAt).forEach(p => {
    if (p.status !== cascadeStatus) {
      const oldPUUpdatedAt = p.updatedAt;
      const pIdx = s.projects.indexOf(p);
      s.projects[pIdx] = { ...p, status: cascadeStatus, updatedAt: now };
      supabaseUpdate('projects', p.id, { status: cascadeStatus, updated_at: now }, oldPUUpdatedAt);
      s.tasks.filter(t => t.projectId === p.id && !t.deletedAt).forEach(t => {
        if (t.status !== cascadeStatus) {
          const oldTUpdatedAt = t.updatedAt;
          const tIdx = s.tasks.indexOf(t);
          s.tasks[tIdx] = { ...t, status: cascadeStatus, updatedAt: now, ...(cascadeStatus === 'done' ? { completedAt: now } : { completedAt: null }) };
          supabaseUpdate('tasks', t.id, { status: cascadeStatus, updated_at: now, ...(cascadeStatus === 'done' ? { completed_at: now } : { completed_at: null }) }, oldTUpdatedAt);
        }
      });
    }
  });
  s.tasks.filter(t => t.goalId === goalId && !t.projectId && !t.deletedAt).forEach(t => {
    if (t.status !== cascadeStatus) {
      const oldTUpdatedAt = t.updatedAt;
      const tIdx = s.tasks.indexOf(t);
      s.tasks[tIdx] = { ...t, status: cascadeStatus, updatedAt: now, ...(cascadeStatus === 'done' ? { completedAt: now } : { completedAt: null }) };
      supabaseUpdate('tasks', t.id, { status: cascadeStatus, updated_at: now, ...(cascadeStatus === 'done' ? { completed_at: now } : { completed_at: null }) }, oldTUpdatedAt);
    }
  });
}

export function cascadeGoalProgressUpdate(
  s: AppState,
  goalId: string,
  now: string,
): void {
  const goalIdx = s.goals.findIndex(g => g.id === goalId);
  if (goalIdx === -1) return;
  const goal = s.goals[goalIdx];
  const info = computeGoalProgressInfo(s.goals, goalId);
  applyGoalProgressInfo(goal, info);
  goal.progress = info.progress;
  if (goal.parentId) {
    const pIdx = s.goals.findIndex(g => g.id === goal.parentId);
    if (pIdx !== -1) {
      const pInfo = computeGoalProgressInfo(s.goals, goal.parentId);
      applyGoalProgressInfo(s.goals[pIdx], pInfo);
      const oldPUpdatedAt = s.goals[pIdx].updatedAt;
      s.goals[pIdx].progress = pInfo.progress;
      s.goals[pIdx].updatedAt = now;
      supabaseUpdate('goals', goal.parentId, { progress: s.goals[pIdx].progress, updated_at: now }, oldPUpdatedAt);
      let ancestorId = s.goals[pIdx].parentId;
      while (ancestorId) {
        const aIdx = s.goals.findIndex(g => g.id === ancestorId);
        if (aIdx === -1) break;
        const aInfo = computeGoalProgressInfo(s.goals, ancestorId);
        applyGoalProgressInfo(s.goals[aIdx], aInfo);
        const oldAUpdatedAt = s.goals[aIdx].updatedAt;
        s.goals[aIdx].progress = aInfo.progress;
        s.goals[aIdx].updatedAt = now;
        supabaseUpdate('goals', ancestorId, { progress: s.goals[aIdx].progress, updated_at: now }, oldAUpdatedAt);
        ancestorId = s.goals[aIdx].parentId;
      }
    }
  }
}

export function cascadeAddGoal(
  s: AppState,
  goal: Goal,
  currentUserId: string | undefined,
): void {
  notifyAssigned(s, currentUserId, [goal.leaderId, ...(goal.supporterIds ?? [])].filter(Boolean), goal.title, goal.id, 'goal');
  for (const rule of s.automationRules) {
    if (rule.trigger === 'item_created' && rule.itemType === 'goal' && rule.enabled !== false) {
      try { executeAutomationActions(s, rule, goal.id, 'goal', goal.title); } catch (e) { console.warn('item_created automation failed:', e); }
    }
  }
}

export function cascadeAddProject(
  s: AppState,
  project: Project,
  currentUserId: string | undefined,
): void {
  notifyAssigned(s, currentUserId, [project.leaderId, ...(project.supporterIds ?? [])].filter(Boolean), project.title, project.id, 'project');
  for (const rule of s.automationRules) {
    if (rule.trigger === 'item_created' && rule.itemType === 'project' && rule.enabled !== false) {
      try { executeAutomationActions(s, rule, project.id, 'project', project.title); } catch (e) { console.warn('item_created automation failed:', e); }
    }
  }
}

export function cascadeDeleteTag(
  s: AppState,
  tagId: string,
  now: string,
): void {
  s.goals.forEach(g => {
    const prevLen = g.tags?.length ?? 0;
    g.tags = (g.tags ?? []).filter(id => id !== tagId);
    if (g.tags.length !== prevLen) { const oldGUpdatedAt = g.updatedAt; g.updatedAt = now; supabaseUpdate('goals', g.id, { tags: g.tags, updated_at: now }, oldGUpdatedAt); }
  });
  s.projects.forEach(p => {
    const prevLen = p.tags?.length ?? 0;
    p.tags = (p.tags ?? []).filter(id => id !== tagId);
    if (p.tags.length !== prevLen) { const oldPUUpdatedAt = p.updatedAt; p.updatedAt = now; supabaseUpdate('projects', p.id, { tags: p.tags, updated_at: now }, oldPUUpdatedAt); }
  });
  s.tasks.forEach(t => {
    const prevLen = t.tags?.length ?? 0;
    t.tags = (t.tags ?? []).filter(id => id !== tagId);
    if (t.tags.length !== prevLen) { const oldTUpdatedAt = t.updatedAt; t.updatedAt = now; supabaseUpdate('tasks', t.id, { tags: t.tags, updated_at: now }, oldTUpdatedAt); }
  });
}

export function cascadeDeleteCategory(
  s: AppState,
  categoryId: string,
  now: string,
): void {
  s.goals.forEach(g => { if (g.category === categoryId) { const oldGUpdatedAt = g.updatedAt; g.category = ''; g.updatedAt = now; supabaseUpdate('goals', g.id, { category: '', updated_at: now }, oldGUpdatedAt); } });
  s.projects.forEach(p => { if (p.category === categoryId) { const oldPUUpdatedAt = p.updatedAt; p.category = ''; p.updatedAt = now; supabaseUpdate('projects', p.id, { category: '', updated_at: now }, oldPUUpdatedAt); } });
  s.tasks.forEach(t => { if (t.category === categoryId) { const oldTUpdatedAt = t.updatedAt; t.category = ''; t.updatedAt = now; supabaseUpdate('tasks', t.id, { category: '', updated_at: now }, oldTUpdatedAt); } });
}

export function cascadeDeleteSprint(
  s: AppState,
  sprintId: string,
  now: string,
): void {
  s.tasks.forEach(t => {
    if (t.sprintId === sprintId) { const oldTUpdatedAt = t.updatedAt; t.sprintId = null; t.updatedAt = now; supabaseUpdate('tasks', t.id, { sprint_id: null, updated_at: now }, oldTUpdatedAt); }
  });
}

export function cascadeAddComment(
  s: AppState,
  comment: { itemId: string; mentionedMemberIds?: string[]; itemType: string },
  currentUserId: { id: string; name: string } | null,
): void {
  const mentionedIds: string[] = comment.mentionedMemberIds ?? [];
  if (mentionedIds.length === 0) return;
  const itemName = (s.goals.find(g => g.id === comment.itemId) || s.projects.find(p => p.id === comment.itemId) || s.tasks.find(t => t.id === comment.itemId))?.title || '事项';
  for (const mid of mentionedIds) {
    if (mid === currentUserId?.id) continue;
    s.notifications.unshift({
      id: genId('n'), type: 'mentioned', title: '有人@了你',
      message: `${currentUserId?.name} 在「${itemName}」中提及了你`,
      relatedId: comment.itemId, relatedType: comment.itemType as 'goal' | 'project' | 'task',
      memberId: mid, read: false, createdAt: new Date().toISOString(),
    });
  }
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function recalcGoalProgress(s: AppState, goalId: string): void {
  const gIdx = s.goals.findIndex(g => g.id === goalId);
  if (gIdx !== -1) {
    const info = computeGoalProgressInfo(s.goals, goalId);
    applyGoalProgressInfo(s.goals[gIdx], info);
    s.goals[gIdx].progress = info.progress;
  }
}

function incrementKrOnTaskDone(s: AppState, task: Task, now: string, currentUserId: string | undefined): void {
  const gIdx = s.goals.findIndex(g => g.id === task.goalId);
  if (gIdx === -1) return;
  const goal = s.goals[gIdx];
  const krIdx = (goal.keyResults ?? []).findIndex(kr => kr.id === task.krId);
  if (krIdx === -1) { task.krId = undefined; return; }
  const kr = goal.keyResults[krIdx];
  const newVal = Math.min(kr.currentValue + 1, kr.targetValue);
  if (newVal === kr.currentValue) return;
  goal.keyResults[krIdx] = { ...kr, currentValue: newVal };
  const gInfo = computeGoalProgressInfo(s.goals, goal.id);
  applyGoalProgressInfo(goal, gInfo);
  goal.progress = gInfo.progress;
  const oldGoalUpdatedAt = goal.updatedAt;
  goal.updatedAt = now;
  supabaseUpdate('goals', goal.id, { key_results: goal.keyResults, progress: goal.progress, updated_at: now }, oldGoalUpdatedAt);
  if (goal.parentId) {
    const pIdx = s.goals.findIndex(g => g.id === goal.parentId);
    if (pIdx !== -1) {
      const pInfo = computeGoalProgressInfo(s.goals, goal.parentId);
      applyGoalProgressInfo(s.goals[pIdx], pInfo);
      const oldPUpdatedAt = s.goals[pIdx].updatedAt;
      s.goals[pIdx].progress = pInfo.progress;
      s.goals[pIdx].updatedAt = now;
      supabaseUpdate('goals', goal.parentId, { progress: s.goals[pIdx].progress, updated_at: now }, oldPUpdatedAt);
    }
  }
  s.notifications.unshift({ id: genId('n'), type: 'sync', title: 'KR 自动更新', message: `「${kr.title}」的当前值已更新为 ${newVal}/${kr.targetValue}`, relatedId: goal.id, relatedType: 'goal', memberId: task.leaderId || currentUserId || '', read: false, createdAt: now });
}

function decrementKrOnTaskUndone(s: AppState, oldTask: Task, now: string): void {
  const gIdx = s.goals.findIndex(g => g.id === oldTask.goalId);
  if (gIdx === -1) return;
  const goal = s.goals[gIdx];
  const krIdx = (goal.keyResults ?? []).findIndex(kr => kr.id === oldTask.krId);
  if (krIdx === -1) return;
  const kr = goal.keyResults[krIdx];
  const newVal = Math.max(0, kr.currentValue - 1);
  if (newVal === kr.currentValue) return;
  goal.keyResults[krIdx] = { ...kr, currentValue: newVal };
  const gInfo = computeGoalProgressInfo(s.goals, goal.id);
  applyGoalProgressInfo(goal, gInfo);
  goal.progress = gInfo.progress;
  const oldGoalUpdatedAt2 = goal.updatedAt;
  goal.updatedAt = now;
  supabaseUpdate('goals', goal.id, { key_results: goal.keyResults, progress: goal.progress, updated_at: now }, oldGoalUpdatedAt2);
  if (goal.parentId) {
    const pIdx = s.goals.findIndex(g => g.id === goal.parentId);
    if (pIdx !== -1) {
      const pInfo = computeGoalProgressInfo(s.goals, goal.parentId);
      applyGoalProgressInfo(s.goals[pIdx], pInfo);
      const oldPUpdatedAt2 = s.goals[pIdx].updatedAt;
      s.goals[pIdx].progress = pInfo.progress;
      s.goals[pIdx].updatedAt = now;
      supabaseUpdate('goals', goal.parentId, { progress: s.goals[pIdx].progress, updated_at: now }, oldPUpdatedAt2);
    }
  }
}

function unblockDependents(s: AppState, completedId: string, now: string, currentUserId: string | undefined): void {
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
      const oldUtUpdatedAt = ut.updatedAt;
      ut.status = 'todo';
      ut.updatedAt = now;
      const utIdx = s.tasks.findIndex(t => t.id === ut.id);
      if (utIdx !== -1) supabaseUpdate('tasks', ut.id, { status: 'todo', updated_at: now }, oldUtUpdatedAt);
      s.notifications.unshift({ id: genId('n'), type: 'sync', title: '任务已解除阻塞', message: `「${ut.title}」的前置任务已全部完成，可以开始执行`, relatedId: ut.id, relatedType: 'task', memberId: ut.leaderId || currentUserId || '', read: false, createdAt: now });
    }
  }
}
