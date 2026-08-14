import type { KnowledgePriority } from '@/types';

/**
 * Phase3-P0: 本地规则引擎 —— 知识条目智能标签与自动分类
 * 策略：关键词匹配优先（0成本），LLM API 按需降级
 */

// 分类关键词字典
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '技术方案': ['架构', 'API', '数据库', '前端', '后端', '部署', '性能', '重构', 'TypeScript', 'React', 'NestJS', 'SQL', '缓存', '微服务'],
  '团队管理': ['会议', '周报', '考核', '招聘', '培训', '流程', '规范', '制度', 'OKR', '绩效', '团队建设'],
  '产品设计': ['需求', '原型', '用户体验', 'UX', 'UI', '交互', '功能', 'PRD', '设计稿', '用户故事'],
  '运维保障': ['监控', '告警', '日志', 'CI/CD', 'SLO', '故障', '部署', '灰度', '容器', 'K8s'],
  '知识沉淀': ['文档', '笔记', '总结', '复盘', '经验', '教训', '最佳实践', '规范', '指南'],
  '安全合规': ['安全', '漏洞', '审计', '合规', '权限', '加密', 'XSS', 'CSRF', 'OWASP'],
};

// 标签关键词字典
const TAG_KEYWORDS: Record<string, string[]> = {
  'bug': ['bug', '缺陷', '错误', '修复', '异常', '崩溃', '报错'],
  'feature': ['功能', '特性', '新增', '实现', '开发', '迭代'],
  '文档': ['文档', '说明', '手册', '指南', 'README'],
  '会议': ['会议', '讨论', '评审', '站会', '复盘', '周会'],
  '优化': ['优化', '改进', '提升', '重构', '性能', '加速'],
  '紧急': ['紧急', 'ASAP', '立即', '马上', '阻断', 'critical'],
};

// 优先级关键词字典
const PRIORITY_KEYWORDS: Record<string, string[]> = {
  urgent: ['紧急', '阻断', '严重', '崩溃', 'ASAP', '立即', '马上', 'critical', 'P0'],
  high: ['重要', '优先', '尽快', '高优', 'urgent', 'P1'],
};

export interface KnowledgeSuggestion {
  tags: string[];
  category?: string;
  priority?: KnowledgePriority;
  confidence: number;
  source: 'local' | 'learned';
}

/**
 * 分析知识条目内容，返回标签/分类/优先级建议
 * @param title 标题
 * @param content 正文
 * @returns 建议结果，confidence 0-1
 */
export function analyzeKnowledge(title: string, content: string): KnowledgeSuggestion {
  const text = `${title} ${content}`.toLowerCase();
  const tags: string[] = [];
  let category: string | undefined;
  let priority: KnowledgePriority | undefined;
  let matchScore = 0;

  // 匹配分类（取第一个命中的）
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      category = cat;
      matchScore += 1;
      break;
    }
  }

  // 匹配标签（可命中多个）
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      tags.push(tag);
      matchScore += 0.5;
    }
  }

  // 匹配优先级（取最高优先级的命中）
  for (const [p, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      priority = p as KnowledgePriority;
      matchScore += 1;
      break;
    }
  }

  // confidence 计算：基于匹配数，上限1.0
  const confidence = matchScore > 0 ? Math.min(matchScore / 3, 1) : 0;

  return {
    tags: tags.slice(0, 5),
    category,
    priority,
    confidence,
    source: 'local',
  };
}

/**
 * 判断建议是否达到自动应用阈值
 */
export function shouldAutoApply(suggestion: KnowledgeSuggestion): boolean {
  return suggestion.confidence >= 0.7;
}

/**
 * 将用户确认的建议学习为本地规则（持久化到 localStorage）
 */
const LEARNED_RULES_KEY = 'tbh-knowledge-learned-rules';

interface LearnedRule {
  keyword: string;
  field: 'tag' | 'category' | 'priority';
  value: string;
  createdAt: string;
}

export function loadLearnedRules(): LearnedRule[] {
  try {
    return JSON.parse(localStorage.getItem(LEARNED_RULES_KEY) || '[]');
  } catch { return []; }
}

export function saveLearnedRule(keyword: string, field: 'tag' | 'category' | 'priority', value: string): void {
  const rules = loadLearnedRules();
  if (!rules.some(r => r.keyword === keyword && r.field === field && r.value === value)) {
    rules.push({ keyword, field, value, createdAt: new Date().toISOString() });
    try { localStorage.setItem(LEARNED_RULES_KEY, JSON.stringify(rules)); } catch {}
  }
}
