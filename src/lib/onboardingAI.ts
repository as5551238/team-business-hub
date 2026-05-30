/**
 * AI Onboarding 向导 — 零配置启动体验
 *
 * Round 4 — 长期超越
 * 基于 AI 的首次启动向导，自动推荐目标结构、看板配置、工作流
 */

import type { Task, Goal } from '@/types';

// ===== 行业模板库 =====

export interface IndustryTemplate {
  id: string;
  name: string;
  industry: string;
  teamSize: string;
  goals: Array<{ title: string; type: 'okr' | 'kpi'; priority: string; krs: Array<{ title: string; track: 'okr' | 'kpi' | 'both'; targetValue: number }> }>;
  taskCategories: string[];
  description: string;
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: 'tech-startup',
    name: '科技创业团队',
    industry: '科技',
    teamSize: '5-20人',
    goals: [
      { title: '产品MVP上线', type: 'okr', priority: 'urgent', krs: [
        { title: '核心功能开发完成', track: 'both', targetValue: 100 },
        { title: '内测用户数', track: 'kpi', targetValue: 50 },
      ]},
      { title: '技术架构稳定', type: 'kpi', priority: 'high', krs: [
        { title: '系统可用性', track: 'kpi', targetValue: 99.5 },
        { title: 'API响应时间P99', track: 'kpi', targetValue: 200 },
      ]},
    ],
    taskCategories: ['产品需求', '技术开发', '测试', '运维', '设计'],
    description: '快速迭代、关注MVP交付和用户增长',
  },
  {
    id: 'marketing-team',
    name: '市场营销团队',
    industry: '营销',
    teamSize: '5-30人',
    goals: [
      { title: '品牌影响力提升', type: 'okr', priority: 'high', krs: [
        { title: '社交媒体粉丝增长', track: 'both', targetValue: 10000 },
        { title: '品牌搜索指数', track: 'kpi', targetValue: 80 },
      ]},
      { title: '销售线索增长', type: 'kpi', priority: 'urgent', krs: [
        { title: '月均有效线索', track: 'kpi', targetValue: 200 },
        { title: '线索转化率', track: 'kpi', targetValue: 15 },
      ]},
    ],
    taskCategories: ['内容创作', '活动策划', '渠道运营', '数据分析', '设计'],
    description: '注重品牌和增长指标，内容驱动营销',
  },
  {
    id: 'project-team',
    name: '项目管理团队',
    industry: '工程',
    teamSize: '10-50人',
    goals: [
      { title: '项目按期交付', type: 'okr', priority: 'urgent', krs: [
        { title: '按期交付率', track: 'both', targetValue: 95 },
        { title: '客户满意度', track: 'both', targetValue: 90 },
      ]},
      { title: '成本控制', type: 'kpi', priority: 'high', krs: [
        { title: '预算偏差率', track: 'kpi', targetValue: 5 },
        { title: '资源利用率', track: 'kpi', targetValue: 85 },
      ]},
    ],
    taskCategories: ['需求分析', '规划排期', '开发执行', '质量保障', '交付验收'],
    description: '关注交付效率、成本控制和质量管理',
  },
  {
    id: 'enterprise-hr',
    name: '企业HR团队',
    industry: '人力',
    teamSize: '5-20人',
    goals: [
      { title: '人才招聘到位', type: 'okr', priority: 'high', krs: [
        { title: '关键岗位招聘到位率', track: 'both', targetValue: 100 },
        { title: '招聘周期', track: 'kpi', targetValue: 30 },
      ]},
      { title: '员工满意度', type: 'kpi', priority: 'medium', krs: [
        { title: '员工满意度评分', track: 'both', targetValue: 85 },
        { title: '离职率', track: 'kpi', targetValue: 10 },
      ]},
    ],
    taskCategories: ['招聘面试', '培训发展', '薪资福利', '员工关系', '组织发展'],
    description: '优化招聘流程、提升员工满意度和留存率',
  },
];

// ===== AI 推荐配置 =====

export interface OnboardingConfig {
  industry: string;
  teamSize: string;
  focus: string;
  template: IndustryTemplate;
  suggestedGoals: Array<{ title: string; type: string; priority: string; krs: Array<{ title: string; track: string; targetValue: number }> }>;
  suggestedCategories: string[];
  suggestedPermissions: Record<string, string[]>;
}

/** 根据3个简单问题推荐配置 */
export function recommendConfig(industry: string, teamSize: string, focus: string): OnboardingConfig {
  // 选择最匹配的模板
  let template = INDUSTRY_TEMPLATES.find(t => t.industry === industry);
  if (!template) template = INDUSTRY_TEMPLATES[0]; // 默认科技

  // 根据团队规模调整
  const sizeNum = parseInt(teamSize) || 10;
  const suggestedPermissions: Record<string, string[]> = {
    admin: ['admin'],
    manager: ['goals:read', 'goals:write', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'members:read', 'analytics:read'],
    leader: ['goals:read', 'projects:read', 'tasks:read', 'tasks:write', 'members:read', 'analytics:read'],
    member: ['goals:read', 'projects:read', 'tasks:read', 'tasks:write'],
  };

  // 根据关注点调整目标优先级
  const adjustedGoals = template.goals.map(g => {
    if (focus === 'growth' && g.type === 'kpi') return { ...g, priority: 'urgent' };
    if (focus === 'quality' && g.title.includes('质量') || g.title.includes('满意')) return { ...g, priority: 'urgent' };
    return g;
  });

  return {
    industry,
    teamSize,
    focus,
    template,
    suggestedGoals: adjustedGoals,
    suggestedCategories: template.taskCategories,
    suggestedPermissions,
  };
}

/** 生成 Onboarding 状态标记 */
export function isOnboarded(): boolean {
  try { return localStorage.getItem('tbh-onboarded') === 'true'; } catch { return false; }
}

export function markOnboarded() {
  try { localStorage.setItem('tbh-onboarded', 'true'); } catch {}
}
