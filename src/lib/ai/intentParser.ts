/**
 * 意图解析器 — LLM 驱动的自然语言→结构化意图转换
 *
 * 核心范式转变：从"关键词正则匹配"到"LLM 深度理解"
 * - 3 大意图类型：action（执行操作）、query（查询数据）、chat（自由对话）
 * - 置信度机制：低置信度→兜底表单，不走错误执行
 * - 降级策略：LLM 不可用时回退到 parseActionIntent() 关键词匹配
 *
 * 数据流：user text → parseIntent() → ParsedIntent → executeAiAction() or LLM chat
 */
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { parseActionIntent, executeAiAction } from './aiAgentSystem';
import { getAiActionSummary } from './aiActions';
import type { AppState } from '@/store/reducer';
import type { Action } from '@/store/reducer';

// ==================== 类型定义 ====================

export type IntentType = 'action' | 'query' | 'chat';

export interface ParsedIntent {
  /** 意图类型：action=执行操作, query=查询数据, chat=自由对话 */
  type: IntentType;
  /** 操作ID（当type=action或query时） */
  actionId?: string;
  /** 操作参数 */
  params?: Record<string, unknown>;
  /** 置信度 0-1，低于0.5走兜底 */
  confidence: number;
  /** 需要兜底表单 */
  fallback: boolean;
  /** LLM 提取的对话回复（当type=chat时直接使用） */
  reply?: string;
  /** 用于LLM继续对话的消息（当type=chat时，追加到消息历史发LLM） */
  needsLLMResponse?: boolean;
  /** 降级来源：'llm' | 'keyword' */
  source: 'llm' | 'keyword';
}

// ==================== System Prompt ====================

const INTENT_SYSTEM_PROMPT = `你是 TBH（智简协作）的意图解析引擎。你的任务是分析用户的自然语言输入，判断其意图并输出结构化 JSON。

## 可用操作列表
${getAiActionSummary()}

## 意图分类规则

1. **action** — 用户要执行某个操作（创建/更新/删除/分配等）
   - 必须匹配上述操作列表中的某个 actionId
   - 提取操作参数（如任务标题、优先级、日期等）
   
2. **query** — 用户要查询数据（查看逾期、进度、负载等）
   - 匹配 analyze 类别的 actionId
   - 提取查询过滤参数

3. **chat** — 用户在闲聊、咨询、求建议等，不需要执行具体操作
   - 直接给出有价值的回复
   - 回复要简洁实用（2-4句话）

## 置信度规则
- 用户指令明确→0.8-1.0
- 用户意图模糊但可推断→0.5-0.7
- 无法判断→0.0-0.4 → 设 fallback=true

## 输出格式（严格 JSON，无 markdown 标记）
{"type":"action|query|chat","actionId":"xxx","params":{},"confidence":0.0,"fallback":false,"reply":"当type=chat时，直接给出回复"}`;

// ==================== 主解析函数 ====================

/**
 * LLM 驱动意图解析
 *
 * 流程：
 * 1. 先尝试 LLM 解析（异步）
 * 2. 失败/超时→降级到关键词匹配 parseActionIntent()
 * 3. 返回 ParsedIntent
 */
export async function parseIntent(
  text: string,
  context?: { itemType?: string; itemTitle?: string; itemDescription?: string },
): Promise<ParsedIntent> {
  const config = loadAIConfig();

  // 如果 AI 未启用，直接降级到关键词
  if (!config.enabled) {
    return keywordFallback(text);
  }

  try {
    // 构建上下文提示
    let userPrompt = text;
    if (context?.itemTitle) {
      userPrompt = `[当前上下文: ${context.itemType === 'goal' ? '目标' : context.itemType === 'project' ? '项目' : '任务'}「${context.itemTitle}」]\n\n用户说：${text}`;
    }

    const raw = await callLLM(userPrompt, { ...config, costRouting: true }, 'simple');

    if (!raw) {
      console.warn('[IntentParser] LLM returned empty, falling back to keywords');
      return keywordFallback(text);
    }

    // 解析 LLM 返回的 JSON
    const parsed = parseIntentJSON(raw);
    if (parsed) {
      return {
        ...parsed,
        source: 'llm',
        fallback: parsed.fallback || parsed.confidence < 0.5,
      };
    }

    // JSON 解析失败，但 LLM 返回了文本内容，当作 chat 处理
    console.warn('[IntentParser] LLM output not valid JSON, treating as chat');
    return {
      type: 'chat',
      confidence: 0.4,
      fallback: false,
      reply: raw.slice(0, 500),
      needsLLMResponse: false,
      source: 'llm',
    };
  } catch (err) {
    console.warn('[IntentParser] LLM call failed:', err instanceof Error ? err.message : String(err));
    return keywordFallback(text);
  }
}

// ==================== 关键词降级 ====================

function keywordFallback(text: string): ParsedIntent {
  const result = parseActionIntent(text);
  if (result) {
    const isQuery = ['get_overdue_tasks', 'get_team_load', 'get_goal_progress', 'get_risk_items'].includes(result.actionId);
    return {
      type: isQuery ? 'query' : 'action',
      actionId: result.actionId,
      params: result.params,
      confidence: 0.6, // 关键词匹配给中等置信度
      fallback: false,
      source: 'keyword',
    };
  }
  return {
    type: 'chat',
    confidence: 0.3,
    fallback: true, // 关键词也没匹配上，需要兜底
    needsLLMResponse: true,
    source: 'keyword',
  };
}

// ==================== JSON 解析 ====================

function parseIntentJSON(raw: string): Omit<ParsedIntent, 'source'> | null {
  let text = raw.trim();
  // 去除 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj.type !== 'string') return null;

    const type = (['action', 'query', 'chat'].includes(obj.type) ? obj.type : 'chat') as IntentType;
    const confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5;
    const fallback = obj.fallback === true || confidence < 0.5;

    return {
      type,
      actionId: obj.actionId || undefined,
      params: obj.params && typeof obj.params === 'object' ? obj.params : undefined,
      confidence,
      fallback,
      reply: obj.reply || undefined,
      needsLLMResponse: type === 'chat' && !obj.reply,
    };
  } catch {
    // 尝试提取 JSON 片段
    const match = text.match(/\{[\s\S]*"type"[\s\S]*\}/);
    if (match) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj && typeof obj.type === 'string') {
          const type = (['action', 'query', 'chat'].includes(obj.type) ? obj.type : 'chat') as IntentType;
          const confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5;
          return {
            type,
            actionId: obj.actionId || undefined,
            params: obj.params && typeof obj.params === 'object' ? obj.params : undefined,
            confidence,
            fallback: obj.fallback === true || confidence < 0.5,
            reply: obj.reply || undefined,
            needsLLMResponse: type === 'chat' && !obj.reply,
          };
        }
      } catch {}
    }
    return null;
  }
}

// ==================== LLM 自由对话 ====================

const CHAT_SYSTEM_PROMPT = `你是 TBH（智简协作）的 AI 助手。你精通项目管理、OKR、团队协作和复盘分析。
回答要简洁实用（3-5句话），多用要点列表，适当给出操作建议。
用户可能提到当前的某个目标/项目/任务，结合上下文给出针对性建议。`;

/**
 * 调用 LLM 进行自由对话
 */
export async function chatWithLLM(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context?: { itemType?: string; itemTitle?: string; itemDescription?: string },
): Promise<string> {
  const config = loadAIConfig();

  let systemPrompt = CHAT_SYSTEM_PROMPT;
  if (context?.itemTitle) {
    systemPrompt += `\n\n当前上下文：${context.itemType === 'goal' ? '目标' : context.itemType === 'project' ? '项目' : '任务'}「${context.itemTitle}」${context.itemDescription ? '，描述：' + context.itemDescription.slice(0, 200) : ''}`;
  }

  // 构建消息序列（保留最近5轮）
  const recentHistory = history.slice(-10);
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...recentHistory,
    { role: 'user' as const, content: userMessage },
  ];

  try {
    // 直接用 callLLM，但需要构建完整 prompt
    const fullPrompt = messages.map(m => `${m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '系统'}：${m.content}`).join('\n\n');
    const raw = await callLLM(fullPrompt, { ...config, costRouting: true }, 'simple');
    return raw || '抱歉，我暂时无法回应，请稍后再试。';
  } catch (err) {
    console.error('[IntentParser] Chat LLM failed:', err instanceof Error ? err.message : String(err));
    return '网络请求失败，请检查 AI 设置或稍后重试。';
  }
}

// ==================== 执行入口 ====================

/**
 * 处理解析后的意图：执行操作或生成对话
 * 返回 { action, description } 其中 action 用于 dispatch
 */
export function executeIntent(
  intent: ParsedIntent,
  state: AppState,
  context?: { itemId?: string; itemType?: string },
): { action: Action | { error: string } | null; description: string } {
  if (intent.type === 'action' || intent.type === 'query') {
    if (!intent.actionId) {
      return { action: null, description: '未能识别具体操作，请尝试更明确的表述，或点击下方快捷操作。' };
    }

    const params = { ...intent.params };
    // 注入上下文 ID
    if (context?.itemType === 'task') params.taskId = params.taskId || context.itemId;
    if (context?.itemType === 'goal') params.goalId = params.goalId || context.itemId;

    return executeAiAction(intent.actionId, params, state);
  }

  // chat 类型不执行操作
  return { action: null, description: '' };
}
