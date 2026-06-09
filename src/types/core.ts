// ==================== 团队业务中台 - 类型定义 V4 (Multi-tenant) ====================

export type MemberRole = 'admin' | 'manager' | 'leader' | 'member';
export type MemberStatus = 'active' | 'inactive';
export type GoalStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export type GoalApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type GoalType = 'okr' | 'kpi' | 'milestone';
export type PlanTier = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';
export type ProjectStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ReviewPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type RepeatCycle = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type ItemType = 'goal' | 'project' | 'task';

// ==================== 模块权限 (V4 矩阵化) ====================
export type PermissionModule = 'goals' | 'projects' | 'tasks' | 'team' | 'settings' | 'export' | 'knowledge';
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'manage';
export type Permission = `${PermissionModule}_${PermissionAction}`;

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

// ==================== 关键结果（OKR+KPI 双轨融合） ====================
export type KrTrack = 'okr' | 'kpi' | 'both';
export type KpiStatus = 'red' | 'yellow' | 'green';

export interface KeyResult {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  selected: boolean;
  confidence?: number;
  // --- KPI 双轨扩展（可选，向后兼容）---
  track?: KrTrack;
  weight?: number;
  kpiBaseline?: number;
  kpiTarget?: number;
  kpiScore?: number;
}

export interface DualTrackSummary {
  okr: {
    progress: number;
    avgConfidence: number;
    stretchRate: number | null;
  };
  kpi: {
    weightedScore: number;
    overallStatus: KpiStatus;
    redCount: number;
    yellowCount: number;
    greenCount: number;
  };
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
  teamId: string;
  updatedAt: string;
}

// ==================== 目标 ====================
export interface Goal {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  status: GoalStatus;
  approvalStatus?: GoalApprovalStatus;
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
  dualTrack?: DualTrackSummary;
  canvasX?: number;
  canvasY?: number;
  discussionThreadId: string | null;
  summary: string;
  teamId: string;
  seasonId: string | null;
  strategyLevel: 'vision' | 'annual' | 'quarter' | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
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
  teamId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
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
  parentId?: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
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
  startDate: string | null;
  dueDate: string | null;
  reminderDate: string | null;
  completedAt: string | null;
  subtasks: SubTask[];
  attachments: Attachment[];
  trackingRecords: TrackingRecord[];
  repeatCycle: RepeatCycle;
  blockedBy: string[]; // IDs of prerequisite tasks that must be completed first
  sprintId: string | null; // ID of the associated sprint
  storyPoints: number; // 故事点估算（0=未估算）
  krId?: string; // 关联的关键结果ID（任务完成时自动更新该KR的currentValue）
  teamId: string;
  canvasX?: number;
  canvasY?: number;
  discussionThreadId: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
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
  type: 'reminder' | 'overdue' | 'assigned' | 'mentioned' | 'sync' | 'error' | 'risk_alert' | 'system';
  title: string;
  message: string;
  relatedId: string;
  relatedType: ItemType;
  memberId: string;
  read: boolean;
  level: 'normal' | 'important' | 'urgent';
  createdAt: string;
}

export interface NotificationPreference {
  id: string;
  memberId: string;
  itemId: string;
  itemType: string;
  muted: boolean;
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

// (Permission defined above as template literal type)

// ==================== 团队 ====================
export interface Team {
  id: string;
  name: string;
  description: string;
  avatar: string;
  inviteCode: string;
  ownerId: string;
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// ==================== 团队成员关系 ====================
export interface TeamMember {
  id: string;
  teamId: string;
  memberId: string;
  role: MemberRole;
  permissions: Permission[];
  joinedAt: string;
}

// ==================== 自定义分类 ====================
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  appliesTo: ItemType[];
  createdAt: string;
  updatedAt: string;
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
  memberId?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 个人知识库 ====================
export interface Knowledge {
  id: string;
  title: string;
  content: string;
  tags: string[];
  memberId: string;
  relatedItems: { itemId: string; itemType: 'goal' | 'project' | 'task' }[];
  color?: string;
  createdAt: string;
  updatedAt: string;
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

// ==================== 状态流转规则 ====================
export interface StatusFlowRule {
  id: string;
  itemType: ItemType;
  fromStatus: string;
  toStatus: string;
  allowedRoles: MemberRole[]; // empty = all roles
  autoActions?: StatusFlowAutoAction[];
  enabled?: boolean;
  name?: string;
  updatedAt: string;
}

export interface StatusFlowAutoAction {
  type: 'notify' | 'set_field' | 'create_subtask' | 'assign';
  config: Record<string, string>;  // e.g. { field: 'priority', value: 'high' } or { title: 'Follow-up task' }
}

// ==================== 自动化规则 ====================
export type AutomationTrigger = 'status_change' | 'due_arrive' | 'item_created' | 'field_change' | 'kr_lag' | 'overdue';
export type AutomationAction = 'notify' | 'set_field' | 'create_subtask' | 'assign' | 'escalation' | 'ai_action';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  itemType: ItemType;
  trigger: AutomationTrigger;
  condition: { field: string; operator: 'eq' | 'neq' | 'contains' | 'empty' | 'not_empty' | 'gt' | 'lt'; value: string };
  actions: { type: AutomationAction; config: Record<string, string> }[];
  createdAt: string;
  updatedAt: string;
}

// ==================== 复盘模型库 ====================
export type ReviewModelCategory = 'strategy' | 'process' | 'goal' | 'problem' | 'lightweight' | 'comprehensive';

export interface ReviewModelStep {
  index: number;
  title: string;
  description: string;
  inputType: 'text' | 'select' | 'matrix' | 'list';
  inputOptions?: string[];
  placeholder?: string;
  aiAutoFill?: boolean;
}

export interface ReviewModel {
  id: string;
  name: string;
  nameEn: string;
  category: ReviewModelCategory;
  description: string;
  steps: ReviewModelStep[];
  applicableScenarios: string[];
  aiPrompt: string;
}

export interface ReviewSession {
  id: string;
  modelId: string;
  seasonId: string | null;
  goalId: string | null;
  projectId: string | null;
  memberId: string | null;
  teamId: string;
  status: 'in_progress' | 'completed';
  inputs: Record<string, string | string[]>;
  aiInsights: string | null;
  actionItems: ReviewActionItem[];
  createdAt: string;
  completedAt: string | null;
}

