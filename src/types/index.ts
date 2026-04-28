// ==================== 团队业务中台 - 类型定义 V3 ====================

export type MemberRole = 'admin' | 'manager' | 'member';
export type MemberStatus = 'active' | 'inactive';
export type GoalStatus = 'planning' | 'in_progress' | 'completed' | 'paused' | 'cancelled';
export type GoalType = 'okr' | 'kpi' | 'milestone';
export type ProjectStatus = 'planning' | 'in_progress' | 'completed' | 'paused' | 'cancelled';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ReviewPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type RepeatCycle = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type ItemType = 'goal' | 'project' | 'task';

// ==================== 附件 ====================
export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

// ==================== 跟踪记录 ====================
export interface TrackingRecord {
  id: string;
  date: string;
  content: string;
  result: string;
  recordedBy: string;
  createdAt: string;
}

// ==================== 关键结果（支持多项选择） ====================
export interface KeyResult {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  selected: boolean;
}

// ==================== 成员 ====================
export interface Member {
  id: string;
  name: string;
  nickname: string;
  wechatId: string;
  phone: string;
  email: string;
  role: MemberRole;
  department: string;
  avatar: string;
  status: MemberStatus;
  joinDate: string;
  permissions: Permission[];
}

// ==================== 目标 ====================
export interface Goal {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  status: GoalStatus;
  priority: TaskPriority;
  parentId: string | null;
  level: number;
  category: string;
  startDate: string;
  endDate: string;
  leaderId: string;
  supporterIds: string[];
  tags: string[];
  keyResults: KeyResult[];
  selectedKRIds: string[];
  attachments: Attachment[];
  trackingRecords: TrackingRecord[];
  repeatCycle: RepeatCycle;
  progress: number;
  canvasX?: number;
  canvasY?: number;
  discussionThreadId: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 项目 ====================
export interface Project {
  id: string;
  title: string;
  description: string;
  goalId: string | null;
  parentId: string | null;
  status: ProjectStatus;
  priority: TaskPriority;
  startDate: string;
  endDate: string;
  leaderId: string;
  supporterIds: string[];
  tags: string[];
  category: string;
  attachments: Attachment[];
  trackingRecords: TrackingRecord[];
  repeatCycle: RepeatCycle;
  taskCount: number;
  progress: number;
  canvasX?: number;
  canvasY?: number;
  discussionThreadId: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 子任务 ====================
export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
  dueDate: string | null;
  reminderDate: string | null;
  leaderId: string;
  supporterIds: string[];
  tags: string[];
  attachments: Attachment[];
  trackingRecords: TrackingRecord[];
  repeatCycle: RepeatCycle;
  createdAt: string;
}

// ==================== 讨论/评论 ====================
export interface Comment {
  id: string;
  itemId: string;
  itemType: ItemType;
  memberId: string;
  memberName: string;
  content: string;
  mentionedMemberIds: string[];
  isRead: boolean;
  followUpRequired: boolean;
  followUpStatus: 'none' | 'pending' | 'completed';
  createdAt: string;
}

// ==================== 任务 ====================
export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  goalId: string | null;
  parentId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  leaderId: string;
  supporterIds: string[];
  tags: string[];
  category: string;
  dueDate: string | null;
  reminderDate: string | null;
  completedAt: string | null;
  subtasks: SubTask[];
  attachments: Attachment[];
  trackingRecords: TrackingRecord[];
  repeatCycle: RepeatCycle;
  canvasX?: number;
  canvasY?: number;
  discussionThreadId: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 关联/通知/活动/标签 ====================
export interface ItemLink {
  id: string;
  sourceId: string;
  sourceType: ItemType;
  targetId: string;
  targetType: ItemType;
  label?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: 'reminder' | 'overdue' | 'assigned' | 'completed' | 'goal_update' | 'mentioned' | 'batch_update';
  title: string;
  message: string;
  relatedId: string;
  relatedType: ItemType;
  memberId: string;
  read: boolean;
  createdAt: string;
}

export interface BatchOperation {
  id: string;
  itemType: ItemType;
  operation: 'delete' | 'update_status' | 'move' | 'assign';
  targetIds: string[];
  updates?: Record<string, any>;
  createdAt: string;
  createdBy: string;
}

export interface Activity {
  id: string;
  memberId: string;
  action: string;
  targetType: ItemType;
  targetId: string;
  targetTitle: string;
  details: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export type Permission = 'view_goals' | 'edit_goals' | 'delete_goals' | 'view_projects' | 'edit_projects' | 'delete_projects' | 'view_tasks' | 'edit_tasks' | 'delete_tasks' | 'manage_team' | 'manage_settings' | 'export_data';

// ==================== 自定义分类 ====================
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  appliesTo: ItemType[];
  createdAt: string;
}

// ==================== 模板/工具库 ====================
export interface Template {
  id: string;
  title: string;
  description: string;
  type: 'goal' | 'project' | 'task' | 'document';
  content: string;
  createdBy: string;
  updatedBy: string;
  isPublic: boolean;
  category: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 日程 ====================
export interface ScheduleEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
  linkedItemId: string | null;
  linkedItemType: ItemType | null;
  memberId: string;
  repeatCycle: RepeatCycle;
  createdAt: string;
  updatedAt: string;
}

// ==================== 常用网址 ====================
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: string;
  icon: string;
  order: number;
  createdAt: string;
}

// ==================== 记事本 ====================
export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  color: string;
  isPinned: boolean;
  category: string;
  tags: string[];
  linkedItemId: string | null;
  linkedItemType: ItemType | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 视图/复盘/备份 ====================
export interface ViewFilter {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'before' | 'after' | 'empty' | 'not_empty';
  value: string | string[];
}

export interface SavedView {
  id: string;
  name: string;
  type: ItemType;
  filters: ViewFilter[];
  filterLogic: 'and' | 'or';
  createdAt: string;
}

export interface ReviewEntry {
  id: string;
  period: ReviewPeriod;
  periodStart: string;
  periodEnd: string;
  memberId: string | null;
  content: string;
  improvements: string[];
  metrics: ReviewMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewMetrics {
  goalsCompleted: number;
  goalsInProgress: number;
  projectsCompleted: number;
  projectsInProgress: number;
  tasksCompleted: number;
  tasksOverdue: number;
  tasksTotal: number;
  completionRate: number;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  members: Member[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  notifications: Notification[];
  activities: Activity[];
  itemLinks: ItemLink[];
  tags: Tag[];
  categories: Category[];
  templates: Template[];
  scheduleEvents: ScheduleEvent[];
  notes: Note[];
  reviews: ReviewEntry[];
}

// ==================== 应用状态 ====================
export interface AppState {
  members: Member[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  notifications: Notification[];
  activities: Activity[];
  itemLinks: ItemLink[];
  tags: Tag[];
  categories: Category[];
  templates: Template[];
  scheduleEvents: ScheduleEvent[];
  notes: Note[];
  savedViews: SavedView[];
  reviews: ReviewEntry[];
  comments: Comment[];
  bookmarks: Bookmark[];
  batchOperations: BatchOperation[];
  currentUser: Member | null;
  viewingMemberId: string | null;
}
