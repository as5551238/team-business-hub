import type { AppState, Goal, Project, Task, Notification, Activity, Member, SubTask, ItemLink, BackupData, Tag, Permission, SavedView, ReviewEntry, Category, Template, ScheduleEvent, Note, ItemType, Comment, Bookmark } from '@/types';

export const STORAGE_KEY = 'team-business-hub-data';
export const SUPABASE_CONFIG_KEY = 'tbh-supabase-config';
export const CURRENT_USER_KEY = 'tbh-current-user';

export type ConnectionMode = 'local' | 'supabase' | 'loading';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export type Action =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'MERGE_STATE'; payload: Partial<AppState> }
  | { type: 'SET_CURRENT_USER'; payload: string | null }
  | { type: 'SET_VIEWING_MEMBER'; payload: string | null }
  | { type: 'ADD_GOAL'; payload: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'progress'> }
  | { type: 'UPDATE_GOAL'; payload: { id: string; updates: Partial<Goal> } }
  | { type: 'DELETE_GOAL'; payload: string }
  | { type: 'MOVE_GOAL_PARENT'; payload: { goalId: string; newParentId: string | null } }
  | { type: 'UPDATE_KEY_RESULT'; payload: { goalId: string; krId: string; value: number } }
  | { type: 'ADD_PROJECT'; payload: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'progress'> }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<Project> } }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'ADD_TASK'; payload: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_TASK'; payload: { id: string; updates: Partial<Task> } }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'TOGGLE_SUBTASK'; payload: { taskId: string; subtaskId: string } }
  | { type: 'ADD_SUBTASK'; payload: { taskId: string; subtask: Omit<SubTask, 'id' | 'createdAt'> } }
  | { type: 'ADD_ITEM_LINK'; payload: Omit<ItemLink, 'id' | 'createdAt'> }
  | { type: 'DELETE_ITEM_LINK'; payload: string }
  | { type: 'IMPORT_BACKUP'; payload: BackupData }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'ADD_MEMBER'; payload: Omit<Member, 'id' | 'joinDate'> & { id?: string } }
  | { type: 'UPDATE_MEMBER'; payload: { id: string; updates: Partial<Member> } }
  | { type: 'DELETE_MEMBER'; payload: string }
  | { type: 'RESET_DATA'; payload: AppState }
  | { type: 'SET_CONNECTION_MODE'; payload: ConnectionMode }
  | { type: 'ADD_TAG'; payload: Omit<Tag, 'id' | 'createdAt'> }
  | { type: 'UPDATE_TAG'; payload: { id: string; updates: Partial<Tag> } }
  | { type: 'DELETE_TAG'; payload: string }
  | { type: 'ADD_SAVED_VIEW'; payload: Omit<SavedView, 'id' | 'createdAt'> }
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
  | { type: 'SET_BOOKMARKS'; payload: Bookmark[] };

export function toCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = row[key];
  }
  return result;
}

export function toSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const snake = key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    result[snake] = obj[key];
  }
  return result;
}

export function ensureAppStateDefaults(data: Partial<AppState> & { members: any[] }): AppState {
  const result: AppState = {
    members: data.members || [],
    goals: data.goals || [],
    projects: data.projects || [],
    tasks: data.tasks || [],
    notifications: data.notifications || [],
    activities: data.activities || [],
    itemLinks: data.itemLinks || [],
    tags: data.tags || [],
    categories: data.categories || [],
    templates: data.templates || [],
    scheduleEvents: data.scheduleEvents || [],
    notes: data.notes || [],
    savedViews: data.savedViews || [],
    reviews: (data as any).reviews || [],
    comments: (data as any).comments || [],
    bookmarks: (data as any).bookmarks || [],
    currentUser: data.currentUser ?? null,
    viewingMemberId: (data as any).viewingMemberId || null,
    batchOperations: (data as any).batchOperations || [],
  };
  result.goals = result.goals.map((g: any) => ({
    ...g, tags: g.tags || [], keyResults: g.keyResults || [],
    attachments: g.attachments || [], trackingRecords: g.trackingRecords || [],
    supporterIds: g.supporterIds || [], priority: g.priority || 'medium',
    status: g.status || 'planning', repeatCycle: g.repeatCycle || 'none',
    selectedKRIds: g.selectedKRIds || [], discussionThreadId: g.discussionThreadId ?? null,
    summary: g.summary || '', progress: g.progress || 0,
  }));
  result.projects = result.projects.map((p: any) => ({
    ...p, tags: p.tags || [], attachments: p.attachments || [],
    trackingRecords: p.trackingRecords || [], supporterIds: p.supporterIds || [],
    priority: p.priority || 'medium', status: p.status || 'planning',
    repeatCycle: p.repeatCycle || 'none', discussionThreadId: p.discussionThreadId ?? null,
    summary: p.summary || '', progress: p.progress || 0,
  }));
  result.tasks = result.tasks.map((t: any) => ({
    ...t, tags: t.tags || [], subtasks: t.subtasks || [],
    attachments: t.attachments || [], trackingRecords: t.trackingRecords || [],
    supporterIds: t.supporterIds || [], priority: t.priority || 'medium',
    status: t.status || 'todo', category: t.category || '',
    repeatCycle: t.repeatCycle || 'none', discussionThreadId: t.discussionThreadId ?? null,
    summary: t.summary || '', parentId: t.parentId || null,
  }));
  result.members = result.members.map((m: any) => ({
    ...m, permissions: m.permissions || [], role: m.role || 'member',
    avatar: m.avatar || '', status: m.status || 'active',
  }));
  result.notifications = result.notifications.map((n: any) => ({
    ...n, read: n.read ?? false,
  }));
  result.categories = result.categories.map((c: any) => ({
    ...c, appliesTo: c.appliesTo || [], color: c.color || '#6366f1',
    icon: c.icon || 'tag',
  }));
  result.tags = result.tags.map((t: any) => ({
    ...t, color: t.color || '#6366f1',
  }));
  return result;
}
