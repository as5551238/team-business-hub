// Re-export all types from core
export * from './core';

// ==================== 以下为扩展类型（从原index.ts拆分） ====================

// ==================== R3: 绩效与有效性 ====================
export type ReviewRole = 'self' | 'peer' | 'manager' | 'direct_report';

export interface ReviewAnswer {
  reviewerId: string;
  role: ReviewRole;
  ratings: Record<string, number>;
  strengths: string;
  improvements: string;
  submittedAt: string;
}

export interface PerformanceReview {
  id: string;
  seasonId: string | null;
  revieweeId: string;
  status: 'pending' | 'in_progress' | 'completed';
  selfReview: ReviewAnswer | null;
  peerReviews: ReviewAnswer[];
  managerReview: ReviewAnswer | null;
  directReportReviews: ReviewAnswer[];
  aiSummary: string | null;
  finalScore: number | null;
  teamId: string;
  createdAt: string;
  completedAt: string | null;
}

export interface SkillRating {
  memberId: string;
  skillId: string;
  level: number; // 0-5
  updatedAt: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  category: string;
  targetLevel: number; // team target
}

export interface EffectivenessMetric {
  id: string;
  goalId: string;
  businessValue: number; // 1-10
  effortHours: number;
  impactScore: number; // 1-10
  roi: number | null;
  measuredAt: string;
  teamId: string;
}

export interface AISuggestion {
  id: string;
  sourceType: 'review' | 'dashboard' | 'automation' | 'coaching';
  sourceId: string | null;
  content: string;
  status: 'suggested' | 'adopted' | 'dismissed' | 'partially_adopted';
  adoptedAt: string | null;
  outcomeRating: number | null; // 1-5
  outcomeNote: string | null;
  teamId: string;
  createdAt: string;
}

// ==================== R4: 知识图谱与自动化 ====================
export interface ReviewKnowledge {
  id: string;
  sourceSessionId: string;
  pattern: string;
  context: string;
  relatedPatterns: string[];
  aiExtracted: boolean;
  teamId: string;
  createdAt: string;
}

export interface OKRScore {
  goalId: string;
  seasonId: string;
  score: number; // 0.0-1.0
  confidence: number; // 0-100
  previousConfidence: number | null;
  scorerId: string;
  scoredAt: string;
  deviationNote: string | null;
}

export interface CapacityPlan {
  id: string;
  period: string; // "2026-Q3"
  availableHours: number;
  plannedHours: number;
  forecastHours: number; // AI predicted
  gap: number;
  teamId: string;
  createdAt: string;
}

export interface DSTEPhase {
  id: string;
  seasonId: string;
  phase: 'strategy' | 'decode' | 'execute' | 'evaluate';
  status: 'not_started' | 'in_progress' | 'completed';
  aiAutoProgress: boolean;
  completedAt: string | null;
  checklist: { item: string; done: boolean }[];
  teamId: string;
}

export interface BusinessValueEntry {
  id: string;
  goalId: string;
  inputCost: number;
  outputValue: number;
  roi: number;
  valueStream: string;
  measuredAt: string;
  teamId: string;
}

// ==================== 预算与成本管理 ====================
export type BudgetCategory = 'labor' | 'material' | 'outsourcing' | 'travel' | 'other';
export type BudgetStatus = 'draft' | 'approved' | 'active' | 'closed';
export type CostEntryStatus = 'pending' | 'approved' | 'rejected';

export interface BudgetItem {
  id: string;
  category: BudgetCategory;
  name: string;
  plannedAmount: number;
  actualAmount: number;
  notes: string | null;
}

export interface Budget {
  id: string;
  projectId: string | null;
  seasonId: string | null;
  name: string;
  totalAmount: number;
  currency: string;
  status: BudgetStatus;
  items: BudgetItem[];
  approvedBy: string | null;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CostEntry {
  id: string;
  budgetId: string;
  projectId: string | null;
  taskId: string | null;
  category: BudgetCategory;
  amount: number;
  description: string;
  recordedBy: string;
  recordedAt: string;
  approvedBy: string | null;
  status: CostEntryStatus;
  teamId: string;
  createdAt: string;
}

// ==================== 复盘行动项 ====================
export interface ReviewActionItem {
  id: string;
  content: string;
  assigneeId: string | null;
  dueDate: string | null;
  linkedTaskId: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'verified';
  verifiedAt: string | null;
}

// ==================== OKR周期/Season ====================
export type SeasonStatus = 'draft' | 'planning' | 'executing' | 'scoring' | 'reviewing' | 'closed';
export type SeasonType = 'quarter' | 'annual' | 'custom';

export interface OKRSeason {
  id: string;
  name: string;
  type: SeasonType;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 迭代/Sprint ====================
export type SprintStatus = 'planning' | 'active' | 'completed';

export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  goalIds: string[];
  status: SprintStatus;
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
  memberId?: string;
  createdAt: string;
  updatedAt?: string;
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
  notificationPreferences: NotificationPreference[];
  activities: Activity[];
  itemLinks: ItemLink[];
  tags: Tag[];
  categories: Category[];
  templates: Template[];
  scheduleEvents: ScheduleEvent[];
  notes: Note[];
  knowledge: Knowledge[];
  reviews: ReviewEntry[];
  comments: Comment[];
  bookmarks: Bookmark[];
  savedViews: SavedView[];
  statusFlowRules: StatusFlowRule[];
  automationRules: AutomationRule[];
  sprints: Sprint[];
  batchOperations?: BatchOperation[];
  teams?: Team[];
  teamMembers?: TeamMember[];
  subscriptions?: Subscription[];
  approvalAudits?: ApprovalAudit[];
}

// ==================== 定价与订阅 ====================
export interface PlanLimit {
  maxMembers: number;
  maxAutomations: number;
  cloudAiPerDay: number;
  agentAutomation: boolean;
  approvalFlow: boolean;
  advancedPermissions: boolean;
  agentMarketplace: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimit> = {
  free: { maxMembers: 5, maxAutomations: 5, cloudAiPerDay: 10, agentAutomation: false, approvalFlow: false, advancedPermissions: false, agentMarketplace: false },
  pro: { maxMembers: 50, maxAutomations: 100, cloudAiPerDay: 1000, agentAutomation: true, approvalFlow: true, advancedPermissions: true, agentMarketplace: false },
  enterprise: { maxMembers: 999, maxAutomations: 9999, cloudAiPerDay: 99999, agentAutomation: true, approvalFlow: true, advancedPermissions: true, agentMarketplace: true },
};

export interface Subscription {
  id: string;
  teamId: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstalledAgent {
  id: string;
  agentId: string;
  teamId: string;
  memberId: string;
  installedAt: string;
}

export interface ApprovalAudit {
  id: string;
  goalId: string;
  action: 'submit' | 'approve' | 'reject' | 'recall';
  actorId: string;
  comment: string;
  createdAt: string;
}

// ==================== Outlook 集成 ====================

export interface OutlookCalendarEvent {
  id: string;                       // Graph event ID
  memberId: string;
  subject: string;
  bodyPreview: string;
  startTime: string;                // ISO 8601
  endTime: string;                  // ISO 8601
  isAllDay: boolean;
  location: string;
  isRecurring: boolean;
  seriesMasterId: string | null;
  sensitivity: 'normal' | 'personal' | 'private' | 'confidential';
  outlookLink: string | null;
  linkedItemId: string | null;      // 关联的 TBH 任务/目标/项目 ID
  linkedItemType: 'task' | 'goal' | 'project' | null;
  etag: string | null;              // 增量同步用
  lastSyncedAt: string;
  createdAt: string;
}

export interface OutlookMailSummary {
  id: string;                       // Graph message ID
  memberId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;               // ISO 8601
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
  hasAttachments: boolean;
  outlookLink: string | null;
  linkedItemId: string | null;
  linkedItemType: 'task' | 'goal' | 'project' | null;
  etag: string | null;
  lastSyncedAt: string;
}

export interface OutlookTokenData {
  provider: 'microsoft';
  connectionMethod: 'manual' | 'oauth';  // 手动 token 输入 vs OAuth 流程
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;                // ISO 8601
  scope: string;
  providerAccountId: string | null; // 微软用户 OID
  connectedEmail: string | null;
}

// ==================== 应用状态 ====================
export interface AppState {
  members: Member[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  notifications: Notification[];
  notificationPreferences: NotificationPreference[];
  activities: Activity[];
  itemLinks: ItemLink[];
  tags: Tag[];
  categories: Category[];
  templates: Template[];
  scheduleEvents: ScheduleEvent[];
  knowledge: Knowledge[];
  notes: Note[];
  savedViews: SavedView[];
  reviews: ReviewEntry[];
  comments: Comment[];
  bookmarks: Bookmark[];
  batchOperations: BatchOperation[];
  statusFlowRules: StatusFlowRule[];
  automationRules: AutomationRule[];
  sprints: Sprint[];
  seasons: OKRSeason[];
  reviewSessions: ReviewSession[];
  budgets: Budget[];
  costEntries: CostEntry[];
  performanceReviews: PerformanceReview[];
  skillRatings: SkillRating[];
  effectivenessMetrics: EffectivenessMetric[];
  aiSuggestions: AISuggestion[];
  reviewKnowledge: ReviewKnowledge[];
  okrScores: OKRScore[];
  capacityPlans: CapacityPlan[];
  dstePhases: DSTEPhase[];
  businessValues: BusinessValueEntry[];
  teams: Team[];
  teamMembers: TeamMember[];
  subscriptions: Subscription[];
  installedAgents: InstalledAgent[];
  approvalAudits: ApprovalAudit[];
  outlookCalendarEvents: OutlookCalendarEvent[];
  outlookMailSummary: OutlookMailSummary[];
  currentUser: Member | null;
  viewingMemberId: string | null;
  currentTeamId: string | null;
}
