/**
 * 渐进式披露 — 根据用户体验等级逐步展示功能
 * 
 * 等级机制：
 * - beginner: 新用户（使用<7天 或 操作<30次）
 * - intermediate: 熟练用户（使用7-30天 或 操作30-100次）
 * - advanced: 高级用户（使用>30天 或 操作>100次）
 * 
 * 功能分层：
 * - beginner: 工作台、任务中心、目标管理（基础卡片+列表）
 * - intermediate: + 项目中心、数据洞察（图表）、评论@AI
 * - advanced: + 知识库、管理中心高级Tab、甘特图、AI主动推送
 */

import { handleError } from '@/lib/errorHandler';

export type UserLevel = 'beginner' | 'intermediate' | 'advanced';

const LEVEL_KEY = 'tbh-user-level';
const FIRST_SEEN_KEY = 'tbh-first-seen';
const ACTION_COUNT_KEY = 'tbh-action-count';

const LEVEL_THRESHOLDS = {
  intermediate: { days: 7, actions: 30 },
  advanced: { days: 30, actions: 100 },
} as const;

/** 获取首次使用日期（不存在则设为今天） */
export function getFirstSeenDate(): string {
  try {
    const stored = localStorage.getItem(FIRST_SEEN_KEY);
    if (stored) return stored;
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(FIRST_SEEN_KEY, today);
    return today;
  } catch (e) { handleError(e, { module: 'progressiveDisclosure', operation: 'GET_FIRST_SEEN', severity: 'debug' });
    return new Date().toISOString().split('T')[0];
  }
}

/** 记录一次用户操作（用于自动升级） */
export function recordAction(): void {
  try {
    const count = parseInt(localStorage.getItem(ACTION_COUNT_KEY) || '0', 10);
    localStorage.setItem(ACTION_COUNT_KEY, String(count + 1));
  } catch (e) { handleError(e, { module: 'progressiveDisclosure', operation: 'RECORD_ACTION', severity: 'debug' }); }
}

/** 计算使用天数 */
function getDaysSinceFirstSeen(): number {
  const firstSeen = getFirstSeenDate();
  const first = new Date(firstSeen);
  const now = new Date();
  return Math.floor((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
}

/** 获取操作次数 */
function getActionCount(): number {
  try {
    return parseInt(localStorage.getItem(ACTION_COUNT_KEY) || '0', 10);
  } catch (e) { handleError(e, { module: 'progressiveDisclosure', operation: 'GET_ACTION_COUNT', severity: 'debug' });
  }
}

/** 自动计算用户体验等级 */
export function computeUserLevel(): UserLevel {
  // 检查手动设置的等级
  try {
    const manual = localStorage.getItem(LEVEL_KEY);
    if (manual === 'advanced' || manual === 'intermediate' || manual === 'beginner') {
      return manual;
    }
  } catch (e) { handleError(e, { module: 'progressiveDisclosure', operation: 'COMPUTE_LEVEL', severity: 'debug' }); }

  const days = getDaysSinceFirstSeen();
  const actions = getActionCount();

  if (days >= LEVEL_THRESHOLDS.advanced.days || actions >= LEVEL_THRESHOLDS.advanced.actions) {
    return 'advanced';
  }
  if (days >= LEVEL_THRESHOLDS.intermediate.days || actions >= LEVEL_THRESHOLDS.intermediate.actions) {
    return 'intermediate';
  }
  return 'beginner';
}

/** 手动设置用户体验等级 */
export function setUserLevel(level: UserLevel): void {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch (e) { handleError(e, { module: 'progressiveDisclosure', operation: 'SET_USER_LEVEL', severity: 'debug' }); }
}

/** 检查功能是否对当前等级可见 */
export function isFeatureVisible(feature: string, level?: UserLevel): boolean {
  const userLevel = level || computeUserLevel();
  const featureLevels: Record<string, UserLevel> = {
    // Beginner: 核心功能
    'dashboard': 'beginner',
    'tasks': 'beginner',
    'goals_basic': 'beginner',
    'quick_create': 'beginner',
    // Intermediate: 增强功能
    'projects': 'intermediate',
    'insight': 'intermediate',
    'charts': 'intermediate',
    'goal_key_results': 'intermediate',
    'comment_ai': 'intermediate',
    // Advanced: 高级功能
    'knowledge': 'intermediate',
    'admin_advanced': 'advanced',
    'gantt': 'advanced',
    'ai_push_events': 'advanced',
    'automation_rules': 'advanced',
    'risk_radar': 'advanced',
    'team_load': 'advanced',
    'retro_tracking': 'advanced',
    'comment_to_task': 'intermediate',
    'goal_change_cascade': 'advanced',
    // L6: 页面内部特性精简
    'goals_matrix_view': 'intermediate',
    'goals_okr_view': 'advanced',
    'admin_non_essential': 'advanced',
  };

  const requiredLevel = featureLevels[feature];
  if (!requiredLevel) return true; // 未知功能默认可见

  const levelOrder: UserLevel[] = ['beginner', 'intermediate', 'advanced'];
  return levelOrder.indexOf(userLevel) >= levelOrder.indexOf(requiredLevel);
}

/** 过滤页面视图模式 — 根据用户等级移除高级视图 */
export function filterViewModes(page: string, modes: string[], level?: UserLevel): string[] {
  const userLevel = level || computeUserLevel();
  if (userLevel === 'advanced') return modes; // 高级用户全部可见

  const pageFeatureMap: Record<string, Record<string, UserLevel>> = {
    goals: {
      detail: 'beginner',
      list: 'beginner',
      matrix: 'intermediate',
      okr: 'advanced',
    },
  };

  const featureMap = pageFeatureMap[page];
  if (!featureMap) return modes;

  const levelOrder: UserLevel[] = ['beginner', 'intermediate', 'advanced'];
  return modes.filter(m => {
    const required = featureMap[m];
    if (!required) return true;
    return levelOrder.indexOf(userLevel) >= levelOrder.indexOf(required);
  });
}

/** 获取当前等级的功能解锁描述 */
export function getLevelDescription(level: UserLevel): { title: string; description: string; nextUnlock: string[] } {
  switch (level) {
    case 'beginner':
      return {
        title: '入门模式',
        description: '核心功能已就绪，帮你快速上手',
        nextUnlock: ['项目中心', '数据洞察图表', '评论@AI助手', '评论转任务'],
      };
    case 'intermediate':
      return {
        title: '进阶模式',
        description: '更多功能已解锁，提升团队协作效率',
        nextUnlock: ['知识库', '甘特图', '自动化规则', '风险雷达', '目标变更联动'],
      };
    case 'advanced':
      return {
        title: '专家模式',
        description: '全部功能已解锁',
        nextUnlock: [],
      };
  }
}
