/**
 * 知识库 RAG 索引器 — 将团队知识库条目索引为可检索片段
 *
 * 设计原则：
 * - 纯前端实现，无需向量数据库
 * - 基于关键词匹配 + TF-IDF 简易检索
 * - 索引存储于 localStorage，定期刷新
 */
import type { AppState } from '@/types';
import { ensureAppStateDefaults } from '@/store/types';

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  sourceType: 'goal' | 'project' | 'task' | 'knowledge' | 'review';
  sourceTitle: string;
  content: string;
  keywords: string[];
  updatedAt: string;
}

const STORAGE_KEY = 'tbh-knowledge-index';
const MAX_CHUNKS = 500;

// 中文停用词
const STOP_WORDS = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);

/** 分词：简单按标点+空格拆分，过滤停用词 */
function tokenize(text: string): string[] {
  return text
    .replace(/[，。！？、；：""''（）【】《》\-\–\—\.\,\!\?\;\:\(\)\[\]\{\}\/\\]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    .map(t => t.toLowerCase());
}

/** 从AppState构建知识索引 */
export function buildKnowledgeIndex(state: AppState): KnowledgeChunk[] {
  const safeState = (state && Array.isArray(state.members)) ? state : ensureAppStateDefaults(state || ({} as AppState));
  const chunks: KnowledgeChunk[] = [];

  // Goals → 每个目标一个chunk
  for (const g of safeState.goals || []) {
    if ((g as any).deletedAt) continue;
    const content = [g.title, g.description, ...(g.keyResults || []).map((kr: { title: string; currentValue: number; targetValue: number }) => `KR: ${kr.title} (${kr.currentValue}/${kr.targetValue})`)].filter(Boolean).join('\n');
    chunks.push({ id: `goal-${g.id}`, sourceId: g.id, sourceType: 'goal', sourceTitle: g.title || '目标', content, keywords: tokenize(content), updatedAt: g.updatedAt || g.createdAt || '' });
  }

  // Tasks → 每个任务一个chunk
  for (const t of safeState.tasks || []) {
    if ((t as any).deletedAt) continue;
    const content = [t.title, t.description, t.status ? `状态:${t.status}` : '', t.priority ? `优先级:${t.priority}` : '', t.assigneeName ? `负责人:${t.assigneeName}` : ''].filter(Boolean).join('\n');
    chunks.push({ id: `task-${t.id}`, sourceId: t.id, sourceType: 'task', sourceTitle: t.title || '任务', content, keywords: tokenize(content), updatedAt: t.updatedAt || t.createdAt || '' });
  }

  // Knowledge entries
  for (const k of safeState.knowledge || []) {
    if ((k as any).deletedAt) continue;
    const content = [k.title, k.content].filter(Boolean).join('\n');
    chunks.push({ id: `knowledge-${k.id}`, sourceId: k.id, sourceType: 'knowledge', sourceTitle: k.title || '知识', content, keywords: tokenize(content), updatedAt: k.updatedAt || '' });
  }

  // Reviews
  for (const r of safeState.reviews || []) {
    const content = [r.title, r.summary, r.actionItems?.join(', ')].filter(Boolean).join('\n');
    chunks.push({ id: `review-${r.id}`, sourceId: r.id, sourceType: 'review', sourceTitle: r.title || '复盘', content, keywords: tokenize(content), updatedAt: r.updatedAt || '' });
  }

  return chunks.slice(0, MAX_CHUNKS);
}

/** TF-IDF 简易检索：返回与查询最相关的top-k片段 */
export function searchKnowledge(chunks: KnowledgeChunk[], query: string, topK = 5): KnowledgeChunk[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored = chunks.map(chunk => {
    let score = 0;
    for (const qt of queryTokens) {
      const exactMatches = chunk.keywords.filter(k => k === qt).length;
      const prefixMatches = chunk.keywords.filter(k => k.startsWith(qt) || qt.startsWith(k)).length;
      score += exactMatches * 3 + prefixMatches * 1;
    }
    // Boost by content length (more context = more useful)
    score += Math.min(chunk.content.length / 100, 3);
    return { chunk, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.chunk);
}

/** 构建RAG上下文：将检索结果拼接为LLM可消费的文本 */
export function buildRAGContext(relevantChunks: KnowledgeChunk[]): string {
  if (relevantChunks.length === 0) return '';
  let ctx = '## 团队知识库参考（以下是与问题相关的团队数据）\n\n';
  for (const chunk of relevantChunks) {
    ctx += `### [${chunk.sourceType}] ${chunk.sourceTitle}\n${chunk.content.slice(0, 500)}\n\n`;
  }
  return ctx;
}

/** 持久化索引到 localStorage */
export function saveIndex(chunks: KnowledgeChunk[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ chunks, version: Date.now() })); } catch { /* quota exceeded */ }
}

/** 从 localStorage 加载索引 */
export function loadIndex(): KnowledgeChunk[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 索引超过1小时则视为过期
    if (Date.now() - (parsed.version || 0) > 3600000) return null;
    return parsed.chunks;
  } catch { return null; }
}
