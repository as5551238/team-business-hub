import { handleError } from '@/lib/errorHandler';
import type { AppState, Goal, Project, Task, Permission, PermissionModule, PermissionAction, MemberRole, AutomationRule, StatusFlowRule, Action, DualTrackSummary } from '@/types';
import { genId } from './utils';
import { supabaseUpdate } from './supabase';
import { calcDualTrack, calcKpiKrScore } from '@/lib/kpiScoring';
import { getFactoryRules } from './factoryRules';

// Late-injected dispatch bridge for ai_action (avoids circular dependency with useStore)
let _asyncDispatch: ((action: Action) => void) | null = null;
export function setAsyncDispatch(fn: (action: Action) => void) { _asyncDispatch = fn; }

// AI_ACTION_MAP imported directly (no circular dependency — aiActions only imports types)
import { AI_ACTION_MAP } from '@/lib/ai/aiActions';

// ==================== 软删除过滤 ====================
/** Filter out soft-deleted items for display lists */
export function activeGoals(goals: Goal[]): Goal[] { return goals.filter(g => !g.deletedAt); }
export function activeProjects(projects: Project[]): Project[] { return projects.filter(p => !p.deletedAt); }
export function activeTasks(tasks: Task[]): Task[] { return tasks.filter(t => !t.deletedAt); }
/** Get soft-deleted items (for recycle bin) */
export function deletedGoals(goals: Goal[]): Goal[] { return goals.filter(g => g.deletedAt); }
export function deletedProjects(projects: Project[]): Project[] { return projects.filter(p => p.deletedAt); }
export function deletedTasks(tasks: Task[]): Task[] { return tasks.filter(t => t.deletedAt); }

// ==================== 企微通知桥接 ====================
let _wechatNotify: ((title: string, message: string) => void) | null = null;
export function setWeChatNotify(fn: (title: string, message: string) => void) { _wechatNotify = fn; }
function fireWeChatNotify(title: string, message: string) { try { _wechatNotify?.(title, message); } catch (e) { handleError(e, { module: 'store', operation: 'WECHAT_NOTIFY', severity: 'debug' }); } }

// ==================== 自动化执行锁（防循环触发） ====================
let _executingRuleIds: Set<string> = new Set();
const MAX_RULE_DEPTH = 3;
let _ruleDepth = 0;

// ==================== due_arrive 触发冷却（防通知爆炸） ====================
const DUE_ARRIVE_COOLDOWN_MS = 10 * 60 * 1000; // 10分钟冷却
const _dueArriveLastFired: Map<string, number> = new Map(); // key: `${taskId}:${ruleId}`

function isAutomationLocked(): boolean { return _ruleDepth >= MAX_RULE_DEPTH; }
function resetAutomationLock() { _executingRuleIds.clear(); _ruleDepth = 0; }

// ==================== set_field 字段白名单 ====================
const SET_FIELD_ALLOWLIST: Record<string, string[]> = {
  goal: ['status', 'priority', 'category', 'endDate'],
  project: ['status', 'priority', 'category', 'endDate'],
  task: ['status', 'priority', 'category', 'dueDate', 'reminderDate'],
};

// ==================== 权限矩阵 ====================
const ROLE_DEFAULTS: Record<MemberRole, Permission[]> = {
  admin: ['goals_view','goals_create','goals_edit','goals_delete','goals_manage','projects_view','projects_create','projects_edit','projects_delete','projects_manage','tasks_view','tasks_create','tasks_edit','tasks_delete','tasks_manage','team_view','team_create','team_edit','team_delete','team_manage','settings_view','settings_create','settings_edit','settings_delete','settings_manage','export_view','export_create','export_edit','export_delete','export_manage','knowledge_view','knowledge_create','knowledge_edit','knowledge_delete','knowledge_manage'],
  manager: ['goals_view','goals_create','goals_edit','goals_delete','goals_manage','projects_view','projects_create','projects_edit','projects_delete','projects_manage','tasks_view','tasks_create','tasks_edit','tasks_delete','tasks_manage','team_view','team_edit','settings_view','export_view','export_create','export_edit','knowledge_view','knowledge_create','knowledge_edit','knowledge_delete'],
  leader: ['goals_view','goals_create','goals_edit','goals_delete','goals_manage','projects_view','projects_create','projects_edit','projects_delete','projects_manage','tasks_view','tasks_create','tasks_edit','tasks_delete','tasks_manage','team_view','team_edit','settings_view','knowledge_view','knowledge_create','knowledge_edit','knowledge_delete'],
  member: ['goals_view','goals_create','goals_edit','projects_view','projects_create','projects_edit','tasks_view','tasks_create','tasks_edit','team_view','knowledge_view','knowledge_create','knowledge_edit'],
};

export function hasPermission(state: AppState, memberId: string, permission: Permission): boolean {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return false;
  if (member.role === 'admin') return true;
  // Check custom permissions (team-scoped)
  const tm = state.teamMembers.find(t => t.memberId === memberId && t.teamId === state.currentTeamId);
  const customPerms = tm?.permissions ?? member.permissions;
  if (customPerms && customPerms.length > 0) {
    if ((customPerms as readonly string[]).includes('deny_all')) return false;
    if ((customPerms as readonly string[]).some(p => mapLegacyPermission(p) === permission || p === permission)) return true;
    return false;
  }
  // Fall back to role defaults
  const defaults = ROLE_DEFAULTS[member.role] ?? [];
  return defaults.includes(permission);
}

/** Check if a member has ANY permission for a module */
function hasModuleAccess(state: AppState, memberId: string, module: PermissionModule): boolean {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return false;
  if (member.role === 'admin') return true;
  const defaults = ROLE_DEFAULTS[member.role] ?? [];
  return defaults.some(p => p.startsWith(module + '_'));
}

/** Backward compat: map old permission names to new ones */
function mapLegacyPermission(old: string): Permission | null {
  const map: Record<string, Permission> = {
    'view_goals': 'goals_view', 'edit_goals': 'goals_edit', 'delete_goals': 'goals_delete',
    'view_projects': 'projects_view', 'edit_projects': 'projects_edit', 'delete_projects': 'projects_delete',
    'view_tasks': 'tasks_view', 'edit_tasks': 'tasks_edit', 'delete_tasks': 'tasks_delete',
    'manage_team': 'team_manage', 'manage_settings': 'settings_manage',
    'export_data': 'export_view', 'delete_own_content': 'tasks_delete',
  };
  const mapped = map[old];
  return mapped ? mapped as Permission : null;
}

export function reducerCanDelete(state: AppState, permission: Permission): boolean {
  if (!state.currentUser) return false;
  return hasPermission(state, state.currentUser.id, permission);
}

export function canDeleteOwnContent(state: AppState, creatorId: string | undefined): boolean {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'admin' || state.currentUser.role === 'manager' || state.currentUser.role === 'leader') return true;
  if (!creatorId) return false;
  return creatorId === state.currentUser.id;
}

export function notifyAssigned(
  s: AppState, currentUserId: string | undefined,
  memberIds: string[], itemTitle: string, itemId: string, itemType: string,
) {
  if (!currentUserId) return;
  for (const mid of memberIds) {
    if (mid === currentUserId) continue;
    const member = s.members.find(m => m.id === mid);
    const memberName = member?.name || '成员';
    s.notifications.unshift({
      id: genId('n'), type: 'assigned', title: '你被指派了新事项',
      message: `你被指派为「${itemTitle}」的负责人`,
      relatedId: itemId, relatedType: itemType,
      memberId: mid, read: false, createdAt: new Date().toISOString(),
    });
    // Also push via WeChat/browser for instant notification
    fireWeChatNotify(`你被指派了新事项`, `${memberName}，你被指派为「${itemTitle}」的负责人`);
  }
}

export function matchCondition(operator: string, fieldValue: unknown, condValue: string): boolean {
  switch (operator) {
    case 'eq': return fieldValue === condValue;
    case 'neq': return fieldValue !== condValue;
    case 'contains': return String(fieldValue ?? '').includes(condValue);
    case 'empty': return fieldValue == null || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'not_empty': return fieldValue != null && fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'gt': return Number(fieldValue) > Number(condValue);
    case 'lt': return Number(fieldValue) < Number(condValue);
    default: return false;
  }
}

/** 触发自动化规则（status_change / field_change / item_created 统一入口） */
export interface AutomationLogEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: string;
  itemId: string;
  itemType: 'goal' | 'project' | 'task';
  itemTitle: string;
  actionsCount: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

const MAX_LOG_ENTRIES = 200;
const _automationLog: AutomationLogEntry[] = [];

export function getAutomationLog(): AutomationLogEntry[] {
  return _automationLog.slice();
}

export function clearAutomationLog(): void {
  _automationLog.length = 0;
}

export function fireAutomationRules(
  s: AppState, itemId: string, itemType: 'goal' | 'project' | 'task', itemTitle: string,
  trigger: 'status_change' | 'field_change' | 'item_created' | 'due_arrive' | 'kr_lag' | 'overdue',
  updates: Record<string, unknown>, oldItem: Record<string, unknown>,
) {
  for (const rule of s.automationRules) {
    if (!rule.enabled || rule.itemType !== itemType) continue;
    if (rule.trigger !== trigger) continue;
    // Cooldown check for due_arrive: each task+rule combo fires at most once per 10 minutes
    if (trigger === 'due_arrive') {
      const cooldownKey = `${itemId}:${rule.id}`;
      const lastFired = _dueArriveLastFired.get(cooldownKey);
      if (lastFired && Date.now() - lastFired < DUE_ARRIVE_COOLDOWN_MS) continue;
      _dueArriveLastFired.set(cooldownKey, Date.now());
    }
    if (trigger === 'field_change') {
      const condField = rule.condition.field;
      const oldValue = oldItem[condField];
      const newValue = updates[condField] ?? oldValue;
      if (oldValue === newValue) continue;
    }
    const condField = rule.condition.field;
    const condOp = rule.condition.operator;
    const condVal = rule.condition.value;
    const fieldValue = condField === 'status' ? (updates.status ?? oldItem.status) : (updates[condField] ?? oldItem[condField]);
    try {
      if (matchCondition(condOp, fieldValue, condVal)) {
        const ruleName = (rule as AutomationRule).name ?? '未命名规则';
        const ruleId = (rule as AutomationRule).id ?? 'unknown';
        const logEntry: AutomationLogEntry = {
          id: genId('al'),
          ruleId,
          ruleName,
          trigger,
          itemId,
          itemType,
          itemTitle,
          actionsCount: rule.actions.length,
          success: true,
          timestamp: new Date().toISOString(),
        };
        try {
          executeAutomationActions(s, rule, itemId, itemType, itemTitle);
        } catch (execErr) {
          logEntry.success = false;
          logEntry.error = execErr instanceof Error ? execErr.message : String(execErr);
        }
        _automationLog.unshift(logEntry);
        if (_automationLog.length > MAX_LOG_ENTRIES) _automationLog.length = MAX_LOG_ENTRIES;
      }
    } catch (e) { handleError(e, { module: 'store', operation: 'AUTOMATION_MATCH', severity: 'warn' }); }
  }
  // P3#4 fix: prune stale _dueArriveLastFired entries (older than cooldown)
  const pruneThreshold = Date.now() - DUE_ARRIVE_COOLDOWN_MS * 2;
  for (const [key, ts] of _dueArriveLastFired) {
    if (ts < pruneThreshold) _dueArriveLastFired.delete(key);
  }
}

export function executeAutomationActions(s: AppState, rule: AutomationRule | { actions: AutomationRule['actions']; name?: string }, itemId: string, itemType: 'goal' | 'project' | 'task', itemTitle: string) {
  if (isAutomationLocked()) return;
  _ruleDepth++;
  try {
    for (const act of rule.actions) {
      try {
        if (act.type === 'notify') {
          const targetId = act.config.memberId || s.currentUser?.id || '';
          const nTitle = act.config.title ?? (rule as AutomationRule).name ?? '自动化通知';
          const nMsg = act.config.message ?? `自动化规则已触发：${itemTitle}`;
          s.notifications.unshift({ id: genId('n'), type: 'sync', title: nTitle, message: nMsg, relatedId: itemId, relatedType: itemType, memberId: targetId, read: false, createdAt: new Date().toISOString() });
          // D2: 操作反馈 toast
          try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tbh-toast', { detail: { message: nTitle, type: 'info' } })); } catch (e) { handleError(e, { module: 'store', operation: 'TOAST_DISPATCH', severity: 'debug' }); }
          fireWeChatNotify(nTitle, nMsg);
        } else if (act.type === 'escalation') {
          const admins = s.members.filter(m => (m.role === 'admin' || m.role === 'manager') && m.status === 'active');
          const eTitle = `升级通知：${itemTitle}`;
          const eMsg = act.config.message ?? `事项「${itemTitle}」需要关注`;
          for (const admin of admins) {
            s.notifications.unshift({ id: genId('n'), type: 'sync', title: eTitle, message: eMsg, relatedId: itemId, relatedType: itemType, memberId: admin.id, read: false, createdAt: new Date().toISOString() });
          }
          fireWeChatNotify(eTitle, eMsg);
        } else if (act.type === 'set_field') {
          if (!act.config.field || !act.config.value) continue;
          const allowed = SET_FIELD_ALLOWLIST[itemType] ?? [];
          if (!allowed.includes(act.config.field)) { console.warn(`set_field: field "${act.config.field}" not in allowlist for ${itemType}`); continue; }
          const items = itemType === 'goal' ? s.goals : itemType === 'project' ? s.projects : s.tasks;
          const item = items.find(i => i.id === itemId) as Record<string, unknown> | undefined;
          if (!item) continue;
          const oldValue = item[act.config.field];
          if (oldValue === act.config.value) continue;
          if (act.config.field === 'status') {
            const { allowed: flowOk } = validateStatusFlow(s, itemId, itemType, oldValue as string, act.config.value);
            if (!flowOk) continue;
          }
          const oldUpdatedAt = item.updatedAt as string;
          item[act.config.field] = act.config.value;
          item.updatedAt = new Date().toISOString();
          const tableName = itemType === 'goal' ? 'goals' : itemType === 'project' ? 'projects' : 'tasks';
          const snakeField = act.config.field.replace(/([A-Z])/g, '_$1').toLowerCase();
          supabaseUpdate(tableName, itemId, { [snakeField]: act.config.value, updated_at: new Date().toISOString() }, oldUpdatedAt);
          if (act.config.field === 'status' && act.config.value === 'done') {
            item.completedAt = new Date().toISOString();
            supabaseUpdate(tableName, itemId, { completed_at: new Date().toISOString() }, oldUpdatedAt);
          }
        } else if (act.type === 'create_subtask') {
          if (itemType !== 'task' || !act.config.title) continue;
          const parentTask = s.tasks.find(t => t.id === itemId);
          if (!parentTask) continue;
          if (!parentTask.subtasks) parentTask.subtasks = [];
          const subtask = { id: genId('sub'), title: act.config.title, completed: false, priority: act.config.priority ?? parentTask.priority ?? 'medium', dueDate: act.config.dueDate ?? null, leaderId: act.config.memberId ?? parentTask.leaderId ?? '', createdAt: new Date().toISOString() };
          const oldParentUpdatedAt = parentTask.updatedAt as string;
          parentTask.subtasks = [...parentTask.subtasks, subtask];
          parentTask.updatedAt = new Date().toISOString();
          supabaseUpdate('tasks', itemId, { subtasks: parentTask.subtasks, updated_at: parentTask.updatedAt }, oldParentUpdatedAt);
          if (subtask.leaderId && subtask.leaderId !== s.currentUser?.id) {
            s.notifications.unshift({ id: genId('n'), type: 'assigned', title: '你被自动分配了子任务', message: `自动化规则在「${itemTitle}」下创建了子任务「${subtask.title}」`, relatedId: itemId, relatedType: 'task', memberId: subtask.leaderId, read: false, createdAt: new Date().toISOString() });
          }
        } else if (act.type === 'assign') {
          if (!act.config.memberId) continue;
          const items = itemType === 'goal' ? s.goals : itemType === 'project' ? s.projects : s.tasks;
          const item = items.find(i => i.id === itemId) as Record<string, unknown> | undefined;
          if (!item) continue;
          const oldLeaderId = item.leaderId as string | undefined;
          if (oldLeaderId === act.config.memberId) continue;
          const targetMember = s.members.find(m => m.id === act.config.memberId && m.status === 'active');
          if (!targetMember) continue;
          const oldAssignUpdatedAt = item.updatedAt as string;
          item.leaderId = act.config.memberId;
          item.updatedAt = new Date().toISOString();
          const tableName = itemType === 'goal' ? 'goals' : itemType === 'project' ? 'projects' : 'tasks';
          supabaseUpdate(tableName, itemId, { leader_id: act.config.memberId, updated_at: new Date().toISOString() }, oldAssignUpdatedAt);
          if (act.config.memberId !== s.currentUser?.id) {
            s.notifications.unshift({ id: genId('n'), type: 'assigned', title: '你被自动指派了新事项', message: `自动化规则将你指派为「${itemTitle}」的负责人`, relatedId: itemId, relatedType: itemType, memberId: act.config.memberId, read: false, createdAt: new Date().toISOString() });
          }
        } else if (act.type === 'ai_action') {
          // AI-powered workflow action: invoke an AI action with context-aware params
          const actionId = act.config.actionId;
          if (!actionId) continue;
          try {
            const aiAction = AI_ACTION_MAP.get(actionId);
            if (!aiAction) { console.warn(`ai_action: unknown actionId "${actionId}"`); continue; }
            // Build params from config
            const params: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(act.config)) {
              if (k === 'actionId') continue;
              params[k] = v;
            }
            // Inject context: auto-fill itemId/itemType if the action expects them
            if (aiAction.params.some(p => p.key === 'taskId') && itemType === 'task') params.taskId = params.taskId || itemId;
            if (aiAction.params.some(p => p.key === 'goalId') && itemType === 'goal') params.goalId = params.goalId || itemId;
            if (aiAction.params.some(p => p.key === 'projectId') && itemType === 'project') params.projectId = params.projectId || itemId;
            const result = aiAction.execute(s, params);
            if (result && 'error' in result) {
              console.warn(`ai_action ${actionId} failed:`, result.error);
            } else if (result) {
              // Dispatch via late-injected bridge (async, outside reducer)
              if (_asyncDispatch) {
                Promise.resolve().then(() => _asyncDispatch!(result));
              }
            }
          } catch (e) {
            handleError(e, { module: 'store', operation: 'AI_ACTION_EXEC', severity: 'warn' });
          }
        }
      } catch (e) {
        handleError(e, { module: 'store', operation: 'AUTOMATION_ACTION', severity: 'warn', data: { actionType: act.type } });
      }
    }
  } finally {
    _ruleDepth--;
    if (_ruleDepth <= 0) resetAutomationLock();
  }
}

export function diffAssigned(
  oldLeaderId: string | null | undefined, oldSupporterIds: string[] | undefined,
  newLeaderId: string | null | undefined, newSupporterIds: string[] | undefined,
): string[] {
  const oldSet = new Set<string>();
  if (oldLeaderId) oldSet.add(oldLeaderId);
  (oldSupporterIds || []).forEach(id => oldSet.add(id));
  const added: string[] = [];
  if (newLeaderId && !oldSet.has(newLeaderId)) added.push(newLeaderId);
  (newSupporterIds || []).forEach(id => { if (!oldSet.has(id)) added.push(id); });
  return added;
}

export function resolveInheritedPriority(
  state: { goals: Goal[]; projects: Project[]; tasks: Task[] },
  refs: { goalId?: string | null; projectId?: string | null; parentId?: string | null },
  visited?: Set<string>
): string | undefined {
  const visitedSet = visited || new Set<string>();
  if (refs.goalId) {
    const goal = state.goals.find(g => g.id === refs.goalId);
    if (goal && !visitedSet.has(goal.id)) {
      visitedSet.add(goal.id);
      if (goal.priority && goal.priority !== 'medium') return goal.priority;
      if (goal.parentId) {
        const inherited = resolveInheritedPriority(state, { goalId: goal.parentId }, visitedSet);
        if (inherited) return inherited;
      }
    }
  }
  if (refs.projectId) {
    const proj = state.projects.find(p => p.id === refs.projectId);
    if (proj && !visitedSet.has(proj.id)) {
      visitedSet.add(proj.id);
      if (proj.priority && proj.priority !== 'medium') return proj.priority;
      const inherited = resolveInheritedPriority(state, { goalId: proj.goalId, parentId: proj.parentId }, visitedSet);
      if (inherited) return inherited;
    }
  }
  if (refs.parentId) {
    if (visitedSet.has(refs.parentId)) return undefined;
    visitedSet.add(refs.parentId);
    const parentProject = state.projects.find(p => p.id === refs.parentId);
    if (parentProject) {
      if (parentProject.priority && parentProject.priority !== 'medium') return parentProject.priority;
      const inherited = resolveInheritedPriority(state, { goalId: parentProject.goalId, parentId: parentProject.parentId }, visitedSet);
      if (inherited) return inherited;
    } else {
      const parentTask = state.tasks.find(t => t.id === refs.parentId);
      if (parentTask) {
        if (parentTask.priority && parentTask.priority !== 'medium') return parentTask.priority;
        const inherited = resolveInheritedPriority(state, { goalId: parentTask.goalId, projectId: parentTask.projectId, parentId: parentTask.parentId }, visitedSet);
        if (inherited) return inherited;
      }
    }
  }
  return undefined;
}

export function calcGoalLevel(goals: Goal[], goalId: string, parentId: string | null, visited?: Set<string>): number {
  if (!parentId) return 0;
  const visitedSet = visited || new Set<string>([goalId]);
  if (visitedSet.has(parentId)) return 0;
  visitedSet.add(parentId);
  const parent = goals.find(g => g.id === parentId);
  if (!parent) return 0;
  return calcGoalLevel(goals, parent.id, parent.parentId, visitedSet) + 1;
}

/** Pure computation result for goal progress — no input mutations */
export interface GoalProgressInfo {
  progress: number;
  dualTrack: DualTrackSummary | undefined;
  krUpdates: Array<{ idx: number; kpiScore: number }>;
}

/** Pure: compute goal progress, dualTrack, and KR score updates without mutating inputs */
export function computeGoalProgressInfo(goals: Goal[], goalId: string, visited?: Set<string>): GoalProgressInfo {
  const empty: GoalProgressInfo = { progress: 0, dualTrack: undefined, krUpdates: [] };
  const visitedSet = visited || new Set<string>();
  if (visitedSet.has(goalId)) return empty;
  visitedSet.add(goalId);
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return empty;
  const allKrs = goal.keyResults ?? [];
  if (allKrs.length > 0) {
    const krs = allKrs.filter(kr => kr.selected !== false);
    // Compute KPI scores (no mutation)
    const krUpdates: GoalProgressInfo['krUpdates'] = [];
    for (let i = 0; i < allKrs.length; i++) {
      const kr = allKrs[i];
      if (kr.track === 'kpi' || kr.track === 'both') {
        krUpdates.push({ idx: i, kpiScore: calcKpiKrScore(kr).score });
      }
    }
    const dualTrack = calcDualTrack(allKrs) ?? undefined;
    if (krs.length > 0) {
      const totalWeight = krs.reduce((sum, kr) => sum + (kr.weight ?? 1), 0);
      const progress = Math.round(krs.reduce((sum, kr) => {
        const completion = kr.targetValue > 0 ? Math.min(100, (kr.currentValue / kr.targetValue) * 100) : 0;
        const normalizedWeight = (kr.weight ?? 1) / totalWeight;
        return sum + completion * normalizedWeight;
      }, 0));
      return { progress, dualTrack, krUpdates };
    }
    return { progress: 0, dualTrack, krUpdates };
  }
  const children = goals.filter(g => g.parentId === goalId);
  if (children.length > 0) {
    const progress = Math.round(children.reduce((s, c) => s + computeGoalProgressInfo(goals, c.id, visitedSet).progress, 0) / children.length);
    return { progress, dualTrack: undefined, krUpdates: [] };
  }
  return empty;
}

/** Apply GoalProgressInfo side effects to goal + KR objects (for Immer reducer context) */
export function applyGoalProgressInfo(goal: Goal, info: GoalProgressInfo): void {
  goal.dualTrack = info.dualTrack;
  for (const { idx, kpiScore } of info.krUpdates) {
    const kr = goal.keyResults?.[idx];
    if (kr) kr.kpiScore = kpiScore;
  }
}

/** Convenience wrapper: compute + apply mutations + return progress number */
function calcGoalProgress(goals: Goal[], goalId: string, visited?: Set<string>): number {
  const info = computeGoalProgressInfo(goals, goalId, visited);
  const goal = goals.find(g => g.id === goalId);
  if (goal) applyGoalProgressInfo(goal, info);
  return info.progress;
}

export function calcProjectProgress(tasks: Task[], projectId: string): number {
  const pt = tasks.filter(t => t.projectId === projectId);
  if (pt.length === 0) return 0;
  // 精细化进度：done=100%, in_progress=子任务完成率或50%, 其他=0%
  const progress = pt.reduce((sum, t) => {
    if (t.status === 'done') return sum + 100;
    if (t.status === 'in_progress') {
      const subs = t.subtasks ?? [];
      if (subs.length > 0) return sum + Math.round(subs.filter(s => s.completed).length / subs.length * 100);
      return sum + 50;
    }
    return sum;
  }, 0);
  return Math.round(progress / pt.length);
}

const APP_ARRAY_KEYS: readonly (keyof AppState)[] = [
  'members', 'goals', 'projects', 'tasks', 'notifications', 'activities',
  'itemLinks', 'tags', 'categories', 'templates', 'scheduleEvents', 'notes',
  'knowledge', 'savedViews', 'reviews', 'comments', 'bookmarks', 'batchOperations',
  'statusFlowRules', 'automationRules', 'sprints',
];

export function needMutate(state: AppState, keys?: (keyof AppState)[]): AppState {
  if (!keys) return structuredClone(state);
  const s = { ...state } as AppState;
  for (const key of keys) {
    (s as Record<string, unknown>)[key] = structuredClone(state[key]);
  }
  return s;
}

export function tsNow() { return new Date().toISOString(); }

const MAX_TITLE = 200;
const MAX_DESC = 5000;
const MAX_COMMENT = 3000;
export function clampTitle(s: string | undefined): string | undefined { return s && s.length > MAX_TITLE ? s.slice(0, MAX_TITLE) : s; }
export function clampDesc(s: string | undefined): string | undefined { return s && s.length > MAX_DESC ? s.slice(0, MAX_DESC) : s; }
export function clampComment(s: string | undefined): string | undefined { return s && s.length > MAX_COMMENT ? s.slice(0, MAX_COMMENT) : s; }

const PENDING_DELETES_KEY = 'tbh-pending-deletes';
export const pendingDeletes = new Map<string, number>();
let _pendingLoaded = false;

/** Lazy-load persisted pendingDeletes from localStorage (avoids TDZ on module eval) */
function ensurePendingDeletesLoaded() {
  if (_pendingLoaded) return;
  _pendingLoaded = true;
  try {
    const saved = localStorage.getItem(PENDING_DELETES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        const now = Date.now();
        for (const [id, expiry] of Object.entries(parsed)) {
          if (typeof expiry === 'number' && expiry > now) pendingDeletes.set(id, expiry);
        }
      }
    }
  } catch (e) { handleError(e, { module: 'store', operation: 'LS_LOAD_PENDING_DELETES', severity: 'debug' }); }
}

function persistPendingDeletes() {
  try {
    const now = Date.now();
    const obj: Record<string, number> = {};
    for (const [id, expiry] of pendingDeletes) {
      if (now < expiry) obj[id] = expiry;
    }
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(obj));
  } catch (e) { handleError(e, { module: 'store', operation: 'LS_PERSIST_PENDING_DELETES', severity: 'debug' }); }
}

export function markPendingDelete(id: string) {
  ensurePendingDeletesLoaded();
  let ttl = 120_000; // P3#6 fix: online TTL increased from 60s to 120s to match fallbackPoll interval
  try { if (localStorage.getItem('tbh-went-offline-at')) ttl = 10 * 60_000; } catch (e) { handleError(e, { module: 'store', operation: 'LS_READ_OFFLINE', severity: 'debug' }); }
  pendingDeletes.set(id, Date.now() + ttl);
  persistPendingDeletes();
}
export function cleanPendingDeletes() { ensurePendingDeletesLoaded(); const now = Date.now(); for (const [id, expiry] of pendingDeletes) { if (now > expiry) pendingDeletes.delete(id); } persistPendingDeletes(); }
export function isPendingDelete(id: string) { ensurePendingDeletesLoaded(); const expiry = pendingDeletes.get(id); return expiry !== undefined && Date.now() < expiry; }

export function validateStatusFlow(
  state: AppState, itemId: string, itemType: 'goal' | 'project' | 'task',
  oldStatus: string, newStatus: string
): { allowed: boolean; rule?: StatusFlowRule } {
  if (oldStatus === newStatus) return { allowed: true };
  const rule = state.statusFlowRules.find(r =>
    r.itemType === itemType && r.fromStatus === oldStatus && r.toStatus === newStatus
  );
  if (!rule) return { allowed: true };
  if (!state.currentUser) return { allowed: false };
  if (state.currentUser.role === 'admin') return { allowed: true, rule };
  if (rule.allowedRoles && rule.allowedRoles.length > 0) {
    const allowed = rule.allowedRoles.includes(state.currentUser.role);
    return { allowed, rule: allowed ? rule : undefined };
  }
  return { allowed: true, rule };
}

/** 校验新增/修改的状态流转规则（防冲突/自环/环路） */
export function validateNewFlowRule(
  existing: StatusFlowRule[],
  newRule: StatusFlowRule,
): { valid: boolean; reason?: string } {
  // 自环检测
  if (newRule.fromStatus === newRule.toStatus) return { valid: false, reason: '起止状态不能相同' };
  // 冲突检测
  const conflict = existing.find(r => r.itemType === newRule.itemType && r.fromStatus === newRule.fromStatus && r.toStatus === newRule.toStatus);
  if (conflict) return { valid: false, reason: '重复的状态流转规则' };
  // 合法状态值
  const VALID = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'];
  if (!VALID.includes(newRule.fromStatus) || !VALID.includes(newRule.toStatus)) return { valid: false, reason: '无效的状态值' };
  // 环路检测：从 toStatus 做 BFS，看能否回到 fromStatus
  const visited = new Set<string>();
  const queue = [newRule.toStatus];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === newRule.fromStatus) return { valid: false, reason: '存在状态流转环路' };
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const r of existing) {
      if (r.itemType === newRule.itemType && r.fromStatus === cur) queue.push(r.toStatus);
    }
  }
  return { valid: true };
}

export function initFactoryRulesIfNeeded(existingRules: AutomationRule[]): AutomationRule[] {
  if (existingRules.length > 0) return existingRules;
  return getFactoryRules();
}

export function getDefaultStatusFlowRules(): StatusFlowRule[] {
  return [
    { id: 'default_1', itemType: 'task', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader', 'member'], autoActions: [], enabled: true, name: '开始任务' },
    { id: 'default_2', itemType: 'task', fromStatus: 'in_progress', toStatus: 'done', allowedRoles: ['admin', 'manager', 'leader', 'member'], autoActions: [], enabled: true, name: '完成任务' },
    { id: 'default_3', itemType: 'task', fromStatus: 'in_progress', toStatus: 'blocked', allowedRoles: ['admin', 'manager', 'leader', 'member'], autoActions: [{ type: 'notify' as const, config: { title: '任务被阻塞', message: '任务状态已变更为阻塞' } }], enabled: true, name: '阻塞任务' },
    { id: 'default_4', itemType: 'task', fromStatus: 'blocked', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader'], autoActions: [], enabled: true, name: '解除阻塞' },
    { id: 'default_5', itemType: 'project', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader', 'member'], autoActions: [], enabled: true, name: '启动项目' },
    { id: 'default_6', itemType: 'project', fromStatus: 'in_progress', toStatus: 'done', allowedRoles: ['admin', 'manager', 'leader'], autoActions: [], enabled: true, name: '完成项目' },
    { id: 'default_7', itemType: 'goal', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader'], autoActions: [], enabled: true, name: '启动目标' },
    { id: 'default_8', itemType: 'goal', fromStatus: 'in_progress', toStatus: 'done', allowedRoles: ['admin'], autoActions: [{ type: 'notify' as const, config: { title: '目标已完成', message: '恭喜！目标已达成' } }], enabled: true, name: '完成目标' },
  ];
}
