/**
 * 知识库 RAG 索引器 — 将团队知识库条目索引为可检索片段
 *
 * 改进(v2):
 * - 中文 character bigram/trigram 分词，显著提升中文检索效果
 * - 真正的 TF-IDF 评分（含 IDF 权重，常见词自动降权）
 * - 混合评分：精确匹配 + n-gram 匹配 + 语义前缀匹配
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
  ngrams: string[];
  updatedAt: string;
}

const STORAGE_KEY = 'tbh-knowledge-index';
const MAX_CHUNKS = 500;

// 中文停用词（扩展版）
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
  '那', '他', '她', '它', '们', '被', '把', '得', '地', '么', '什么', '吗', '呢', '吧',
  '啊', '呀', '哦', '嗯', '可以', '已经', '还是', '或者', '但是', '因为', '所以', '如果',
  '为了', '关于', '通过', '进行', '以及', '其中', '之后', '之前', '一下', '一些', '这个',
]);

/** 检测字符串是否包含中文字符 */
function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * 中文 character n-gram 生成
 * 对中文文本滑窗提取 bigram(2-gram) 和 trigram(3-gram)
 * 例如 "进度落后" → bigrams: ["进度","度落","落后"], trigrams: ["进度落","度落后"]
 */
function extractNgrams(text: string): string[] {
  const ngrams: string[] = [];
  // 提取纯中文片段
  const chineseSegments = text.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seg of chineseSegments) {
    if (seg.length < 2) continue;
    // Bigrams
    for (let i = 0; i < seg.length - 1; i++) {
      const bg = seg.slice(i, i + 2);
      if (!STOP_WORDS.has(bg)) ngrams.push(bg);
    }
    // Trigrams (only for segments > 2 chars)
    if (seg.length > 2) {
      for (let i = 0; i < seg.length - 2; i++) {
        const tg = seg.slice(i, i + 3);
        if (!STOP_WORDS.has(tg)) ngrams.push(tg);
      }
    }
  }
  return ngrams;
}

/**
 * 分词 v2：标点+空格拆分 + 中文 n-gram
 * - 英文/数字：按空格拆分
 * - 中文：额外提取 bigram/trigram 增强模糊匹配
 * - 保留原文的词作为精确匹配关键字
 */
function tokenize(text: string): { keywords: string[]; ngrams: string[] } {
  // Step 1: 按标点+空格拆分得到原始词
  const rawTokens = text
    .replace(/[，。！？、；：""''（）【】《》\-\–\—\.\,\!\?\;\:\(\)\[\]\{\}\/\\]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    .map(t => t.toLowerCase());

  // Step 2: 从原始文本提取中文 n-gram
  const ngrams = extractNgrams(text);

  // Deduplicate keywords
  const keywords = [...new Set(rawTokens)];
  const uniqueNgrams = [...new Set(ngrams)];

  return { keywords, ngrams: uniqueNgrams };
}

/** 计算IDF（逆文档频率）— 返回每个token在所有chunks中出现的文档比例 */
function computeIDF(chunks: KnowledgeChunk[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  const totalDocs = chunks.length || 1;

  for (const chunk of chunks) {
    const allTerms = new Set([...chunk.keywords, ...chunk.ngrams]);
    for (const term of allTerms) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, freq] of docFreq) {
    // IDF = log(N / df) + 1 (加1避免为0)
    idf.set(term, Math.log(totalDocs / freq) + 1);
  }
  return idf;
}

/** 从AppState构建知识索引 */
export function buildKnowledgeIndex(state: AppState): KnowledgeChunk[] {
  const safeState = (state && Array.isArray(state.members)) ? state : ensureAppStateDefaults(state || ({} as AppState));
  const chunks: KnowledgeChunk[] = [];

  // Goals → 每个目标一个chunk
  for (const g of safeState.goals || []) {
    if ((g as any).deletedAt) continue;
    const content = [g.title, g.description, ...(g.keyResults || []).map((kr: { title: string; currentValue: number; targetValue: number }) => `KR: ${kr.title} (${kr.currentValue}/${kr.targetValue})`)].filter(Boolean).join('\n');
    const { keywords, ngrams } = tokenize(content);
    chunks.push({ id: `goal-${g.id}`, sourceId: g.id, sourceType: 'goal', sourceTitle: g.title || '目标', content, keywords, ngrams, updatedAt: g.updatedAt || g.createdAt || '' });
  }

  // Tasks → 每个任务一个chunk
  for (const t of safeState.tasks || []) {
    if ((t as any).deletedAt) continue;
    const content = [t.title, t.description, t.status ? `状态:${t.status}` : '', t.priority ? `优先级:${t.priority}` : '', t.assigneeName ? `负责人:${t.assigneeName}` : ''].filter(Boolean).join('\n');
    const { keywords, ngrams } = tokenize(content);
    chunks.push({ id: `task-${t.id}`, sourceId: t.id, sourceType: 'task', sourceTitle: t.title || '任务', content, keywords, ngrams, updatedAt: t.updatedAt || t.createdAt || '' });
  }

  // Knowledge entries
  for (const k of safeState.knowledge || []) {
    if ((k as any).deletedAt) continue;
    const content = [k.title, k.content].filter(Boolean).join('\n');
    const { keywords, ngrams } = tokenize(content);
    chunks.push({ id: `knowledge-${k.id}`, sourceId: k.id, sourceType: 'knowledge', sourceTitle: k.title || '知识', content, keywords, ngrams, updatedAt: k.updatedAt || '' });
  }

  // Reviews
  for (const r of safeState.reviews || []) {
    const content = [r.title, r.summary, r.actionItems?.join(', ')].filter(Boolean).join('\n');
    const { keywords, ngrams } = tokenize(content);
    chunks.push({ id: `review-${r.id}`, sourceId: r.id, sourceType: 'review', sourceTitle: r.title || '复盘', content, keywords, ngrams, updatedAt: r.updatedAt || '' });
  }

  return chunks.slice(0, MAX_CHUNKS);
}

/**
 * TF-IDF + n-gram 混合检索 v2
 *
 * 评分维度：
 * 1. 精确关键词匹配（权重最高）— 原始词命中
 * 2. 前缀匹配（中等权重）— 模糊匹配
 * 3. n-gram 匹配（低权重）— 中文模糊匹配核心
 * 4. IDF 权重 — 常见词降权，罕见词提权
 * 5. 内容长度微调 — 更多上下文略提权
 */
export function searchKnowledge(chunks: KnowledgeChunk[], query: string, topK = 5): KnowledgeChunk[] {
  const { keywords: queryKeywords, ngrams: queryNgrams } = tokenize(query);
  if (queryKeywords.length === 0 && queryNgrams.length === 0) return [];

  // Compute IDF across all chunks
  const idf = computeIDF(chunks);

  const scored = chunks.map(chunk => {
    let score = 0;

    // Dimension 1: Exact keyword match × IDF
    for (const qk of queryKeywords) {
      const termIdf = idf.get(qk) || 1;
      const exactHits = chunk.keywords.filter(k => k === qk).length;
      if (exactHits > 0) {
        score += exactHits * 3 * termIdf;
      }
    }

    // Dimension 2: Prefix match (bidirectional)
    for (const qk of queryKeywords) {
      const termIdf = idf.get(qk) || 1;
      const prefixHits = chunk.keywords.filter(k => k.startsWith(qk) || qk.startsWith(k)).length;
      if (prefixHits > 0) {
        score += prefixHits * 1 * termIdf;
      }
    }

    // Dimension 3: n-gram overlap — core Chinese fuzzy matching
    const chunkNgramSet = new Set(chunk.ngrams);
    let ngramOverlap = 0;
    for (const qn of queryNgrams) {
      if (chunkNgramSet.has(qn)) {
        const termIdf = idf.get(qn) || 1;
        ngramOverlap += termIdf;
      }
    }
    // Normalize by query ngram count to avoid long queries dominating
    if (queryNgrams.length > 0) {
      score += (ngramOverlap / queryNgrams.length) * 2;
    }

    // Dimension 4: Content length boost (capped, minor)
    score += Math.min(chunk.content.length / 200, 2);

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
