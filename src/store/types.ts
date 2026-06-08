import type { AppState, Goal, Project, Task, Notification, Activity, Member, SubTask, ItemLink, BackupData, Tag, Permission, SavedView, ReviewEntry, Category, Template, ScheduleEvent, Note, ItemType, Comment, Bookmark, StatusFlowRule, AutomationRule, Sprint, Knowledge, Team, TeamMember, Subscription, InstalledAgent, ApprovalAudit, OKRSeason, ReviewSession, Budget, CostEntry, PerformanceReview, SkillRating, EffectivenessMetric, AISuggestion, ReviewKnowledge, OKRScore, CapacityPlan, DSTEPhase, BusinessValueEntry } from '@/types';

export const STORAGE_KEY = 'tbh-data';
const LEGACY_STORAGE_KEY = 'team-business-hub-data';
export const SUPABASE_CONFIG_KEY = 'tbh-supabase-config';
export const CURRENT_USER_KEY = 'tbh-current-user';

export type ConnectionMode = 'local' | 'supabase' | 'loading' | 'offline';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export type Action =
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'MERGE_STATE'; payload: Partial<AppState> }
  | { type: 'SET_CURRENT_USER'; payload: string | null }
  | { type: 'SET_VIEWING_MEMBER'; payload: string | null }
  | { type: 'SET_CURRENT_TEAM'; payload: string | null }
  | { type: 'ADD_GOAL'; payload: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'progress'> }
  | { type: 'DELETE_GOAL'; payload: string }
  | { type: 'RESTORE_GOAL'; payload: string }
  | { type: 'MOVE_GOAL_PARENT'; payload: { goalId: string; newParentId: string | null } }
  | { type: 'UPDATE_KEY_RESULT'; payload: { goalId: string; krId: string; value: number } }
  | { type: 'ADD_PROJECT'; payload: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'progress'> }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'RESTORE_PROJECT'; payload: string }
  | { type: 'ADD_TASK'; payload: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'RESTORE_TASK'; payload: string }
  | { type: 'TOGGLE_SUBTASK'; payload: { taskId: string; subtaskId: string } }
  | { type: 'ADD_SUBTASK'; payload: { taskId: string; subtask: Omit<SubTask, 'id' | 'createdAt'> } }
  | { type: 'ADD_ITEM_LINK'; payload: Omit<ItemLink, 'id' | 'createdAt'> }
  | { type: 'DELETE_ITEM_LINK'; payload: string }
  | { type: 'IMPORT_BACKUP'; payload: BackupData }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'read'> & { read?: boolean } }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'TOGGLE_NOTIFICATION_MUTE'; payload: { itemId: string; itemType: string; memberId: string } }
  | { type: 'ADD_MEMBER'; payload: Omit<Member, 'id' | 'joinDate'> & { id?: string } }
  | { type: 'UPDATE_MEMBER'; payload: { id: string; updates: Partial<Member> } }
  | { type: 'DELETE_MEMBER'; payload: string }
  | { type: 'RESET_DATA'; payload: AppState }
  | { type: 'SET_CONNECTION_MODE'; payload: ConnectionMode }
  | { type: 'ADD_TAG'; payload: Omit<Tag, 'id' | 'createdAt'> }
  | { type: 'UPDATE_TAG'; payload: { id: string; updates: Partial<Tag> } }
  | { type: 'DELETE_TAG'; payload: string }
  | { type: 'ADD_SAVED_VIEW'; payload: Omit<SavedView, 'id' | 'createdAt'> }
  | { type: 'UPDATE_SAVED_VIEW'; payload: { id: string; updates: Partial<SavedView> } }
  | { type: 'DELETE_SAVED_VIEW'; payload: string }
  | { type: 'ADD_REVIEW'; payload: Omit<ReviewEntry, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_REVIEW'; payload: { id: string; updates: Partial<ReviewEntry> } }
  | { type: 'DELETE_REVIEW'; payload: string }
  | { type: 'ADD_CATEGORY'; payload: Omit<Category, 'id' | 'createdAt'> }
  | { type: 'UPDATE_CATEGORY'; payload: { id: string; updates: Partial<Category> } }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'SET_CATEGORIES'; payload: Category[] }
  | { type: 'ADD_TEMPLATE'; payload: Omit<Template, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_TEMPLATE'; payload: { id: string; updates: Partial<Template> } }
  | { type: 'DELETE_TEMPLATE'; payload: string }
  | { type: 'ADD_SCHEDULE_EVENT'; payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_SCHEDULE_EVENT'; payload: { id: string; updates: Partial<ScheduleEvent> } }
  | { type: 'DELETE_SCHEDULE_EVENT'; payload: string }
  | { type: 'ADD_NOTE'; payload: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_NOTE'; payload: { id: string; updates: Partial<Note> } }
  | { type: 'DELETE_NOTE'; payload: string }
  | { type: 'ADD_COMMENT'; payload: Omit<Comment, 'id' | 'createdAt'> }
  | { type: 'DELETE_COMMENT'; payload: string }
  | { type: 'UPDATE_COMMENT'; payload: { id: string; updates: Partial<Comment> } }
  | { type: 'ADD_BOOKMARK'; payload: Omit<Bookmark, 'id' | 'createdAt'> }
  | { type: 'UPDATE_BOOKMARK'; payload: { id: string; updates: Partial<Bookmark> } }
  | { type: 'DELETE_BOOKMARK'; payload: string }
  | { type: 'REORDER_BOOKMARKS'; payload: Bookmark[] }
  | { type: 'SET_BOOKMARKS'; payload: Bookmark[] }
  | { type: 'ADD_STATUS_FLOW_RULE'; payload: Omit<StatusFlowRule, 'id'> & { id?: string } }
  | { type: 'UPDATE_STATUS_FLOW_RULE'; payload: { index: number; rule: StatusFlowRule } }
  | { type: 'DELETE_STATUS_FLOW_RULE'; payload: number }
  | { type: 'SET_STATUS_FLOW_RULES'; payload: StatusFlowRule[] }
  | { type: 'ADD_AUTOMATION_RULE'; payload: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_AUTOMATION_RULE'; payload: { id: string; updates: Partial<AutomationRule> } }
  | { type: 'DELETE_AUTOMATION_RULE'; payload: string }
  | { type: 'ADD_SPRINT'; payload: Omit<Sprint, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_SPRINT'; payload: { id: string; updates: Partial<Sprint> } }
  | { type: 'DELETE_SPRINT'; payload: string }
  | { type: 'ADD_KNOWLEDGE'; payload: Omit<Knowledge, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_KNOWLEDGE'; payload: { id: string; updates: Partial<Knowledge> } }
  | { type: 'DELETE_KNOWLEDGE'; payload: string }
  | { type: 'SUBMIT_GOAL_APPROVAL'; payload: string }
  | { type: 'APPROVE_GOAL'; payload: { id: string; comment: string } }
  | { type: 'REJECT_GOAL'; payload: { id: string; comment: string } }
  | { type: 'RECALL_GOAL_APPROVAL'; payload: string }
  | { type: 'UPDATE_SUBSCRIPTION'; payload: { teamId: string; updates: Partial<Subscription> } }
  | { type: 'REALTIME_UPSERT'; payload: { table: string; item: Record<string, unknown> } }
  | { type: 'REALTIME_DELETE'; payload: { table: string; id: string } }
  | { type: 'SET_OUTLOOK_CALENDAR_EVENTS'; payload: import('@/types').OutlookCalendarEvent[] }
  | { type: 'MERGE_OUTLOOK_CALENDAR_EVENTS'; payload: import('@/types').OutlookCalendarEvent[] }
  | { type: 'DELETE_OUTLOOK_CALENDAR_EVENTS'; payload: string[] }
  | { type: 'LINK_OUTLOOK_CALENDAR_EVENT'; payload: { eventId: string; itemId: string; itemType: 'task' | 'goal' | 'project' } }
  | { type: 'SET_OUTLOOK_MAIL_SUMMARY'; payload: import('@/types').OutlookMailSummary[] }
  | { type: 'MERGE_OUTLOOK_MAIL_SUMMARY'; payload: import('@/types').OutlookMailSummary[] }
  | { type: 'LINK_OUTLOOK_MAIL'; payload: { mailId: string; itemId: string; itemType: 'task' | 'goal' | 'project' } }
  | { type: 'ADD_SEASON'; payload: Omit<OKRSeason, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_SEASON'; payload: { id: string; updates: Partial<OKRSeason> } }
  | { type: 'DELETE_SEASON'; payload: string }
  | { type: 'ADD_REVIEW_SESSION'; payload: Omit<ReviewSession, 'id' | 'createdAt'> }
  | { type: 'UPDATE_REVIEW_SESSION'; payload: { id: string; updates: Partial<ReviewSession> } }
  | { type: 'DELETE_REVIEW_SESSION'; payload: string }
  | { type: 'ADD_BUDGET'; payload: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_BUDGET'; payload: { id: string; updates: Partial<Budget> } }
  | { type: 'DELETE_BUDGET'; payload: string }
  | { type: 'ADD_COST_ENTRY'; payload: Omit<CostEntry, 'id' | 'createdAt'> }
  | { type: 'UPDATE_COST_ENTRY'; payload: { id: string; updates: Partial<CostEntry> } }
  | { type: 'DELETE_COST_ENTRY'; payload: string }
  | { type: 'ADD_PERFORMANCE_REVIEW'; payload: Omit<PerformanceReview, 'id' | 'createdAt'> }
  | { type: 'UPDATE_PERFORMANCE_REVIEW'; payload: { id: string; updates: Partial<PerformanceReview> } }
  | { type: 'DELETE_PERFORMANCE_REVIEW'; payload: string }
  | { type: 'ADD_SKILL_RATING'; payload: SkillRating }
  | { type: 'UPDATE_SKILL_RATING'; payload: { memberId: string; skillId: string; updates: Partial<SkillRating> } }
  | { type: 'ADD_EFFECTIVENESS_METRIC'; payload: Omit<EffectivenessMetric, 'id' | 'measuredAt'> }
  | { type: 'UPDATE_EFFECTIVENESS_METRIC'; payload: { id: string; updates: Partial<EffectivenessMetric> } }
  | { type: 'DELETE_EFFECTIVENESS_METRIC'; payload: string }
  | { type: 'ADD_AI_SUGGESTION'; payload: Omit<AISuggestion, 'id' | 'createdAt'> }
  | { type: 'UPDATE_AI_SUGGESTION'; payload: { id: string; updates: Partial<AISuggestion> } }
  | { type: 'ADD_REVIEW_KNOWLEDGE'; payload: Omit<ReviewKnowledge, 'id' | 'createdAt'> }
  | { type: 'ADD_OKR_SCORE'; payload: OKRScore }
  | { type: 'ADD_CAPACITY_PLAN'; payload: Omit<CapacityPlan, 'id' | 'createdAt'> }
  | { type: 'UPDATE_CAPACITY_PLAN'; payload: { id: string; updates: Partial<CapacityPlan> } }
  | { type: 'ADD_DSTE_PHASE'; payload: Omit<DSTEPhase, 'id'> }
  | { type: 'UPDATE_DSTE_PHASE'; payload: { id: string; updates: Partial<DSTEPhase> } }
  | { type: 'ADD_BUSINESS_VALUE'; payload: Omit<BusinessValueEntry, 'id'> }
  | { type: 'DELETE_BUSINESS_VALUE'; payload: string }
  | { type: 'CLEAR_OUTLOOK_DATA' }
  | { type: 'ADD_INSTALLED_AGENT'; payload: InstalledAgent }
  | { type: 'REMOVE_INSTALLED_AGENT'; payload: string }
  | { type: 'UPDATE_GOAL'; payload: { id: string; updates: Partial<Goal> }; _skipUndo?: boolean }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<Project> }; _skipUndo?: boolean }
  | { type: 'UPDATE_TASK'; payload: { id: string; updates: Partial<Task> }; _skipUndo?: boolean };

export function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = row[key];
  }
  return result;
}

export function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const snake = key.replace(/[A-Z]{2,}/g, m => `_${m.toLowerCase()}`).replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    result[snake] = obj[key];
  }
  return result;
}

function arr<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

export function ensureAppStateDefaults(data: Partial<AppState> & { members: Member[] }): AppState {
  const result: AppState = {
    members: arr(data.members),
    goals: arr(data.goals),
    projects: arr(data.projects),
    tasks: arr(data.tasks),
    notifications: arr(data.notifications),
    notificationPreferences: arr(data.notificationPreferences),
    activities: arr(data.activities),
    itemLinks: arr(data.itemLinks),
    tags: arr(data.tags),
    categories: arr(data.categories),
    templates: arr(data.templates),
    scheduleEvents: arr(data.scheduleEvents),
    notes: arr(data.notes),
    knowledge: arr(data.knowledge),
    savedViews: arr(data.savedViews),
    reviews: arr(data.reviews),
    comments: arr(data.comments),
    bookmarks: arr(data.bookmarks),
    currentUser: data.currentUser ?? null,
    viewingMemberId: data.viewingMemberId || null,
    batchOperations: arr(data.batchOperations),
    statusFlowRules: arr(data.statusFlowRules),
    automationRules: arr(data.automationRules),
    sprints: arr(data.sprints),
    teams: arr(data.teams),
    teamMembers: arr(data.teamMembers),
    subscriptions: arr(data.subscriptions),
    installedAgents: arr(data.installedAgents),
    approvalAudits: arr(data.approvalAudits),
    outlookCalendarEvents: arr(data.outlookCalendarEvents),
    outlookMailSummary: arr(data.outlookMailSummary),
    seasons: arr(data.seasons),
    reviewSessions: arr(data.reviewSessions),
    budgets: arr(data.budgets),
    costEntries: arr(data.costEntries),
    performanceReviews: arr(data.performanceReviews),
    skillRatings: arr(data.skillRatings),
    effectivenessMetrics: arr(data.effectivenessMetrics),
    aiSuggestions: arr(data.aiSuggestions),
    reviewKnowledge: arr(data.reviewKnowledge),
    okrScores: arr(data.okrScores),
    capacityPlans: arr(data.capacityPlans),
    dstePhases: arr(data.dstePhases),
    businessValues: arr(data.businessValues),
    currentTeamId: data.currentTeamId || null,
  };
  result.goals = result.goals.map((g: Goal) => ({
    ...g, tags: g.tags ?? [], keyResults: g.keyResults ?? [],
    attachments: g.attachments ?? [], trackingRecords: g.trackingRecords ?? [],
    supporterIds: g.supporterIds ?? [], priority: g.priority ?? 'medium',
    status: g.status ?? 'todo', repeatCycle: g.repeatCycle ?? 'none',
    selectedKRIds: g.selectedKRIds ?? [], discussionThreadId: g.discussionThreadId ?? null,
    summary: g.summary ?? '', progress: g.progress ?? 0,
    parentId: g.parentId ?? null, level: g.level ?? 0,
    startDate: g.startDate ?? '', endDate: g.endDate ?? '',
    description: g.description ?? '', type: g.type ?? 'okr',
    approvalStatus: g.approvalStatus ?? 'draft',
    seasonId: g.seasonId ?? null,
    strategyLevel: g.strategyLevel ?? null,
  }));
  result.projects = result.projects.map((p: Project) => ({
    ...p, tags: p.tags ?? [], attachments: p.attachments ?? [],
    trackingRecords: p.trackingRecords ?? [], supporterIds: p.supporterIds ?? [],
    priority: p.priority ?? 'medium', status: p.status ?? 'todo',
    repeatCycle: p.repeatCycle ?? 'none', discussionThreadId: p.discussionThreadId ?? null,
    summary: p.summary ?? '', progress: p.progress ?? 0,
    parentId: p.parentId ?? null, goalId: p.goalId ?? null,
    startDate: p.startDate ?? '', endDate: p.endDate ?? '',
    taskCount: p.taskCount ?? 0, description: p.description ?? '',
  }));
  result.tasks = result.tasks.map((t: Task) => ({
    ...t, tags: t.tags ?? [], subtasks: t.subtasks ?? [],
    attachments: t.attachments ?? [], trackingRecords: t.trackingRecords ?? [],
    supporterIds: t.supporterIds ?? [], priority: t.priority ?? 'medium',
    status: t.status ?? 'todo', category: t.category ?? '',
    repeatCycle: t.repeatCycle ?? 'none', discussionThreadId: t.discussionThreadId ?? null,
    summary: t.summary ?? '', parentId: t.parentId ?? null,
    startDate: t.startDate ?? null, dueDate: t.dueDate ?? null,
    reminderDate: t.reminderDate ?? null, completedAt: t.completedAt ?? null,
    goalId: t.goalId ?? null, projectId: t.projectId ?? null,
    blockedBy: t.blockedBy ?? [],
    sprintId: t.sprintId ?? null,
    storyPoints: t.storyPoints ?? 0,
    description: t.description ?? '',
  }));
  result.members = result.members.map((m: Member) => ({
    ...m, permissions: m.permissions ?? [], role: m.role ?? 'member',
    avatar: m.avatar ?? '', status: m.status ?? 'active',
    teamId: m.teamId ?? '__default__',
  }));
  result.notifications = result.notifications.map((n: Notification) => ({
    ...n, read: n.read ?? false,
  }));
  result.categories = result.categories.map((c: Category) => ({
    ...c, appliesTo: c.appliesTo ?? [], color: c.color ?? '#6366f1',
    icon: c.icon ?? 'tag',
  }));
  result.tags = result.tags.map((t: Tag) => ({
    ...t, color: t.color || '#6366f1',
  }));
  result.notes = result.notes.map((n: Note) => ({
    ...n, tags: n.tags ?? [], category: n.category ?? '',
  }));
  result.comments = result.comments.map((c: Comment) => ({
    ...c, mentionedMemberIds: c.mentionedMemberIds ?? [],
    isRead: c.isRead ?? false, followUpRequired: c.followUpRequired ?? false,
    followUpStatus: c.followUpStatus ?? 'none',
  }));
  result.scheduleEvents = result.scheduleEvents.map((e: ScheduleEvent) => ({
    ...e, repeatCycle: e.repeatCycle ?? 'none', allDay: e.allDay ?? true, memberId: e.memberId ?? '',
  }));
  result.bookmarks = result.bookmarks.map((b: Bookmark) => ({
    ...b, icon: b.icon ?? 'file', category: b.category ?? '默认', order: b.order ?? 0, memberId: b.memberId ?? '',
  }));
  result.savedViews = result.savedViews.map((v: SavedView) => ({
    ...v, filters: v.filters ?? [], filterLogic: v.filterLogic ?? 'and', memberId: v.memberId ?? '', updatedAt: v.updatedAt || v.createdAt || '',
  }));
  result.templates = result.templates.map((t: Template) => ({
    ...t, isPublic: t.isPublic ?? true, category: t.category ?? '',
  }));
  result.activities = result.activities.map((a: Activity) => ({
    ...a, details: a.details ?? '',
  }));
  result.reviews = result.reviews.map((r: ReviewEntry) => ({
    ...r, content: r.content ?? '', improvements: Array.isArray(r.improvements) ? r.improvements : [], metrics: r.metrics && typeof r.metrics === 'object' ? r.metrics : { goalsCompleted: 0, goalsInProgress: 0, projectsCompleted: 0, projectsInProgress: 0, tasksCompleted: 0, tasksOverdue: 0, tasksTotal: 0, completionRate: 0 },
  }));
  result.statusFlowRules = result.statusFlowRules.map((r: StatusFlowRule & Record<string, unknown>) => ({
    ...r, id: r.id ?? '', allowedRoles: r.allowedRoles ?? (r.allowed_roles as MemberRole[]) ?? [], autoActions: r.autoActions ?? (r.auto_actions as StatusFlowRule['autoActions']) ?? [],
  }));
  result.automationRules = result.automationRules.map((r: AutomationRule) => ({
    ...r, condition: r.condition ?? {}, actions: r.actions ?? [],
  }));
  result.sprints = result.sprints.map((sp: Sprint & Record<string, unknown>) => ({
    ...sp, goalIds: sp.goalIds ?? (sp.goal_ids as string[]) ?? [], status: sp.status ?? 'planning',
  }));
  result.knowledge = result.knowledge.map((k: Knowledge & Record<string, unknown>) => ({
    ...k, tags: k.tags ?? [], relatedItems: k.relatedItems ?? (k.related_items as Knowledge['relatedItems']) ?? [], content: k.content ?? '',
  }));
  return result;
}
