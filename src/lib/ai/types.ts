/** AI 分析模块类型定义 */

import { handleError } from '@/lib/errorHandler';

export type AIModelProvider = 'deepseek' | 'doubao';

/** 任务复杂度等级，影响模型选择和token预算 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

export interface AIConfig {
  provider: AIModelProvider;
  apiKey: string;
  /** 自定义 API 端点（可选，用于私有部署） */
  baseUrl: string;
  /** 模型名称 */
  model: string;
  /** 是否启用 AI 深度分析 */
  enabled: boolean;
  /** 是否启用成本路由（自动按任务复杂度选模型） */
  costRouting?: boolean;
  /** 当前套餐层级（门禁用） */
  _planTier?: string;
}

export type SuggestedAction = {
  type: 'update_status' | 'reassign' | 'add_tag';
  label: string;
  payload: Record<string, unknown>;
};

export type AnalysisPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface HealthScore {
  /** 总体健康分 0-100 */
  overall: number;
  /** 目标健康分 */
  goals: number;
  /** 项目健康分 */
  projects: number;
  /** 任务健康分 */
  tasks: number;
  /** 等级：优秀/良好/一般/风险/严重 */
  level: 'excellent' | 'good' | 'fair' | 'risk' | 'critical';
}

export interface RiskItem {
  id: string;
  /** 风险等级 */
  severity: 'high' | 'medium' | 'low';
  /** 风险类型 */
  type: 'overdue' | 'stalled' | 'blocked' | 'overloaded' | 'no_leader' | 'kr_off_track';
  /** 关联实体类型 */
  itemType: 'goal' | 'project' | 'task';
  /** 关联实体ID */
  itemId: string;
  /** 关联实体标题 */
  itemTitle: string;
  /** 风险描述 */
  description: string;
  /** 建议操作 */
  suggestion: string;
  /** 关联成员ID */
  memberId?: string;
  /** 关联成员名称 */
  memberName?: string;
  /** 建议的一键执行动作 */
  suggestedAction?: SuggestedAction;
}

export interface EfficiencyMetrics {
  /** 任务完成率 */
  completionRate: number;
  /** 按期完成率 */
  onTimeRate: number;
  /** 平均完成天数 */
  avgCompletionDays: number;
  /** 活跃目标数 */
  activeGoals: number;
  /** 活跃项目数 */
  activeProjects: number;
  /** 活跃任务数 */
  activeTasks: number;
  /** 本期完成任务数 */
  completedTasksInPeriod: number;
  /** 本期新增任务数 */
  newTasksInPeriod: number;
  /** 阻塞任务数 */
  blockedTasks: number;
  /** 逾期任务数 */
  overdueTasks: number;
  /** 效率趋势：up/stable/down */
  trend: 'up' | 'stable' | 'down';
}

export interface MemberAnalysis {
  memberId: string;
  memberName: string;
  role: string;
  health: HealthScore;
  risks: RiskItem[];
  efficiency: EfficiencyMetrics;
}

export interface TeamAnalysis {
  health: HealthScore;
  risks: RiskItem[];
  efficiency: EfficiencyMetrics;
  /** 成员级分析 */
  members: MemberAnalysis[];
  /** 分析时间 */
  analyzedAt: string;
  /** 分析周期 */
  period: AnalysisPeriod;
  /** 周期起止 */
  periodStart: string;
  periodEnd: string;
}

export interface AIInsight {
  id: string;
  /** 洞察类型 */
  type: 'health' | 'risk' | 'efficiency' | 'improvement';
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 建议操作 */
  actions: string[];
  /** 生成时间 */
  createdAt: string;
  /** 是否来自 LLM */
  fromLLM: boolean;
  /** 建议的一键执行动作 */
  suggestedAction?: SuggestedAction;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: '',
  model: '',
  enabled: false,
  costRouting: true,
};

/** 成本路由：按任务复杂度选择模型 */
export const COST_ROUTING_MAP: Record<AIModelProvider, Record<TaskComplexity, string>> = {
  deepseek: {
    simple: 'deepseek-v4-flash',    // 便宜：格式化/通知/摘要
    moderate: 'deepseek-v4-flash',   // 中等：分析/摘要（flash够用）
    complex: 'deepseek-v4-pro',      // 复杂：架构/安全/深度推理
  },
  doubao: {
    simple: 'doubao-pro-4k',
    moderate: 'doubao-pro-4k',
    complex: 'doubao-pro-4k',       // 豆包暂无分级模型
  },
};

/** 根据prompt特征自动判断任务复杂度 */
export function detectTaskComplexity(prompt: string): TaskComplexity {
  const complexKeywords = ['架构', '安全', '策略', '重构', '优化方案', '风险预测', '方法论', 'vision', 'strategy', 'architecture'];
  const moderateKeywords = ['分析', '建议', '评估', '改进', '洞察', '匹配', '资源', '复盘'];
  const lower = prompt.toLowerCase();
  if (complexKeywords.some(k => lower.includes(k))) return 'complex';
  if (moderateKeywords.some(k => lower.includes(k))) return 'moderate';
  return 'simple';
}

export const PROVIDER_PRESETS: Record<AIModelProvider, { baseUrl: string; model: string; label: string; models?: string[] }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    label: 'DeepSeek',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-4k', label: '豆包' },
};

/** 已知的历史预设值，用于自动迁移 */
const KNOWN_OLD_PRESETS: Record<string, { baseUrls: string[]; models: string[] }> = {
  deepseek: { baseUrls: ['https://api.deepseek.com/v1'], models: ['deepseek-chat', 'deepseek-reasoner'] },
  doubao: { baseUrls: [], models: [] },
};

export function loadAIConfig(): AIConfig {
  try {
    const s = localStorage.getItem('tbh-ai-config');
    if (s) {
      const saved = { ...DEFAULT_AI_CONFIG, ...JSON.parse(s) };
      const old = KNOWN_OLD_PRESETS[saved.provider];
      let migrated = false;
      if (old && old.baseUrls.includes(saved.baseUrl)) { saved.baseUrl = ''; migrated = true; }
      if (old && old.models.includes(saved.model)) { saved.model = ''; migrated = true; }
      if (migrated) saveAIConfig(saved);
      // Inject plan tier for feature gating
      saved._planTier = loadPlanTier();
      return saved;
    }
  } catch (e) { handleError(e, { module: 'aiTypes', operation: 'LOAD_AI_CONFIG', severity: 'debug' }); }
  const config = { ...DEFAULT_AI_CONFIG };
  config._planTier = loadPlanTier();
  return config;
}

/** Load plan tier from localStorage (synced from store via syncPlanTier) */
function loadPlanTier(): string {
  try {
    const raw = localStorage.getItem('tbh-plan-tier');
    if (raw) return raw;
  } catch { /* ignore */ }
  return 'free';
}

/** Sync plan tier from store state to localStorage — call after login / subscription change */
export function syncPlanTier(teamId: string, subscriptions: Array<{ teamId: string; tier: string; status: string }>): void {
  try {
    const sub = subscriptions.find(s => s.teamId === teamId && s.status === 'active');
    const tier = sub?.tier ?? 'free';
    localStorage.setItem('tbh-plan-tier', tier);
  } catch { /* ignore */ }
}

export function saveAIConfig(c: AIConfig) {
  try { localStorage.setItem('tbh-ai-config', JSON.stringify(c)); } catch (e) { handleError(e, { module: 'aiTypes', operation: 'SAVE_AI_CONFIG', severity: 'debug' }); }
}

export const PERIOD_LABELS: Record<AnalysisPeriod, string> = { daily: '每日', weekly: '每周', monthly: '每月', quarterly: '每季度' };

export const HEALTH_LEVEL_LABELS: Record<HealthScore['level'], string> = { excellent: '优秀', good: '良好', fair: '一般', risk: '风险', critical: '严重' };

export const HEALTH_LEVEL_COLORS: Record<HealthScore['level'], string> = { excellent: 'text-green-600', good: 'text-blue-600', fair: 'text-amber-600', risk: 'text-orange-600', critical: 'text-red-600' };

export const HEALTH_LEVEL_BG: Record<HealthScore['level'], string> = { excellent: 'bg-green-50 border-green-200', good: 'bg-blue-50 border-blue-200', fair: 'bg-amber-50 border-amber-200', risk: 'bg-orange-50 border-orange-200', critical: 'bg-red-50 border-red-200' };

export const RISK_SEVERITY_LABELS: Record<RiskItem['severity'], string> = { high: '高', medium: '中', low: '低' };

export const RISK_SEVERITY_COLORS: Record<RiskItem['severity'], string> = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-blue-100 text-blue-700' };

export const RISK_TYPE_LABELS: Record<RiskItem['type'], string> = { overdue: '逾期', stalled: '停滞', blocked: '阻塞', overloaded: '过载', no_leader: '无负责人', kr_off_track: 'KR偏移' };
