/**
 * 智能搜索服务 —— 前端轻量级语义搜索，无需向量数据库
 * 利用 AIProjectContext 的结构化数据进行多维度匹配：
 * 1. 文本匹配（标题、描述、标签、人员）
 * 2. 状态/优先级/时间属性匹配
 * 3. 关联关系匹配（找"属于某目标的项目"等）
 * 对标 Notion Enterprise Search 的跨实体搜索能力
 */
import type { AIProjectContext, ItemContext } from './aiContextEngine';
import { buildAIContext } from './aiContextEngine';
import type { AppState } from '@/types';

// ===== 搜索类型 =====

export interface SearchResult {
  item: ItemContext;
  /** 匹配得分 0-100 */
  score: number;
  /** 匹配原因 */
  matchReasons: string[];
}

export interface SmartSearchResults {
  query: string;
  results: SearchResult[];
  /** 搜索耗时 ms */
  duration: number;
  /** 搜索时的上下文 */
  generatedAt: string;
}

// ===== 分词与匹配 =====

/** 简易分词：中文按字符，英文按空格，统一小写 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  // 提取中文连续段
  const cjkMatch = lower.match(/[\u4e00-\u9fa5]+/g);
  if (cjkMatch) {
    for (const seg of cjkMatch) {
      // 中文：每1-2字符组合都算一个 token
      for (let i = 0; i < seg.length; i++) {
        tokens.push(seg[i]);
        if (i + 1 < seg.length) tokens.push(seg.slice(i, i + 2));
        if (i + 2 < seg.length) tokens.push(seg.slice(i, i + 3));
      }
    }
  }
  // 提取英文/数字词
  const enMatch = lower.match(/[a-z0-9]+/g);
  if (enMatch) tokens.push(...enMatch);
  return [...new Set(tokens)];
}

/** 计算查询与文本的匹配分（0-1） */
function textMatchScore(queryTokens: string[], text: string): number {
  if (queryTokens.length === 0) return 0;
  const lower = text.toLowerCase();
  let matched = 0;
  for (const t of queryTokens) {
    if (lower.includes(t)) matched++;
  }
  return matched / queryTokens.length;
}

/** 状态关键词映射 */
const STATUS_KEYWORDS: Record<string, string[]> = {
  '逾期': ['overdue'], '延期': ['overdue'], '超期': ['overdue'],
  '进行中': ['in_progress'], '进行': ['in_progress'],
  '待处理': ['todo'], '待办': ['todo'], '未开始': ['todo'],
  '已完成': ['done'], '完成': ['done'],
  '阻塞': ['blocked'], '卡住': ['blocked'],
  '紧急': ['urgent'], '高优先': ['high'], '低优先': ['low'],
};

/** 优先级关键词映射 */
const PRIORITY_KEYWORDS: Record<string, string> = {
  '紧急': 'urgent', '高': 'high', '中': 'medium', '低': 'low',
};

/** 类型关键词 */
const TYPE_KEYWORDS: Record<string, 'goal' | 'project' | 'task'> = {
  '目标': 'goal', 'okr': 'goal', '项目': 'project', '任务': 'task',
};

/** 识别查询中的特殊意图 */
interface SearchIntent {
  typeFilter?: 'goal' | 'project' | 'task';
  statusFilter?: string;
  priorityFilter?: string;
  overdueOnly?: boolean;
  personFilter?: string;
  remaining!: string[];
}

function parseSearchIntent(queryTokens: string[]): SearchIntent {
  const intent: SearchIntent = { remaining: [] };
  for (const t of queryTokens) {
    if (TYPE_KEYWORDS[t]) { intent.typeFilter = TYPE_KEYWORDS[t]; continue; }
    if (STATUS_KEYWORDS[t]) { intent.statusFilter = STATUS_KEYWORDS[t][0]; continue; }
    if (PRIORITY_KEYWORDS[t]) { intent.priorityFilter = PRIORITY_KEYWORDS[t]; continue; }
    if (t === '逾期' || t === '延期' || t === '超期') { intent.overdueOnly = true; continue; }
    intent.remaining.push(t);
  }
  return intent;
}

// ===== 主体搜索 =====

export function smartSearch(state: AppState, query: string): SmartSearchResults {
  const start = Date.now();
  const ctx = buildAIContext(state);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return { query, results: [], duration: Date.now() - start, generatedAt: ctx.generatedAt };
  }

  const intent = parseSearchIntent(queryTokens);
  const searchTokens = intent.remaining.length > 0 ? intent.remaining : queryTokens;

  const scored: SearchResult[] = [];

  for (const item of ctx.items) {
    // 硬过滤
    if (intent.typeFilter && item.type !== intent.typeFilter) continue;
    if (intent.statusFilter && item.status !== intent.statusFilter) continue;
    if (intent.priorityFilter && item.priority !== intent.priorityFilter) continue;
    if (intent.overdueOnly && !item.isOverdue) continue;

    const reasons: string[] = [];
    let score = 0;

    // 1. 标题匹配（权重最高）
    const titleMatch = textMatchScore(searchTokens, item.title);
    if (titleMatch > 0) { score += titleMatch * 40; reasons.push('标题匹配'); }

    // 2. 人员匹配
    const leaderMatch = textMatchScore(searchTokens, item.leaderName);
    if (leaderMatch > 0) { score += leaderMatch * 25; reasons.push(`负责人: ${item.leaderName}`); }
    for (const s of item.supporterNames) {
      const sMatch = textMatchScore(searchTokens, s);
      if (sMatch > 0) { score += sMatch * 15; reasons.push(`协作人: ${s}`); }
    }

    // 3. 标签匹配
    for (const tag of item.tags) {
      const tagMatch = textMatchScore(searchTokens, tag);
      if (tagMatch > 0) { score += tagMatch * 20; reasons.push(`标签: ${tag}`); }
    }

    // 4. 上下文摘要匹配
    const ctxMatch = textMatchScore(searchTokens, item.contextSummary);
    if (ctxMatch > 0) { score += ctxMatch * 15; reasons.push('上下文匹配'); }

    // 5. 父级标题匹配
    if (item.parentTitle) {
      const parentMatch = textMatchScore(searchTokens, item.parentTitle);
      if (parentMatch > 0) { score += parentMatch * 10; reasons.push(`上级: ${item.parentTitle}`); }
    }

    // 6. KR 匹配（仅目标）
    if (item.keyResults) {
      for (const kr of item.keyResults) {
        const krMatch = textMatchScore(searchTokens, kr.title);
        if (krMatch > 0) { score += krMatch * 15; reasons.push(`KR: ${kr.title}`); }
      }
    }

    // 7. 状态/属性匹配加分
    if (intent.overdueOnly && item.isOverdue) { score += 15; reasons.push('逾期'); }
    if (item.isOverdue) { score += 5; }
    if (item.blockedByCount > 0 && searchTokens.some(t => '阻塞'.includes(t) || '卡'.includes(t))) { score += 10; reasons.push('阻塞中'); }

    if (score > 0) {
      scored.push({ item, score: Math.min(100, Math.round(score)), matchReasons: reasons });
    }
  }

  // 排序
  scored.sort((a, b) => b.score - a.score);

  return {
    query, results: scored.slice(0, 20),
    duration: Date.now() - start, generatedAt: ctx.generatedAt,
  };
}

/** 快捷搜索：基于当前上下文推荐"你可能想找的" */
export function suggestRelated(ctx: AIProjectContext, currentItemId: string, currentItemType: 'goal' | 'project' | 'task'): ItemContext[] {
  const current = ctx.items.find(i => i.id === currentItemId);
  if (!current) return [];

  return ctx.items
    .filter(i => i.id !== currentItemId && i.status !== 'done' && i.status !== 'cancelled')
    .map(item => {
      let score = 0;
      // 同一父级
      if (item.parentId && item.parentId === current.parentId && current.parentId) score += 30;
      // 当前项的子项
      if (item.parentId === currentItemId) score += 40;
      // 当前项的父项
      if (current.parentId === item.id) score += 40;
      // 人员重叠
      if (current.leaderId && item.leaderId === current.leaderId) score += 15;
      // 标签重叠
      const tagOverlap = current.tags.filter(t => item.tags.includes(t)).length;
      score += tagOverlap * 10;
      return { item, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(r => r.item);
}
