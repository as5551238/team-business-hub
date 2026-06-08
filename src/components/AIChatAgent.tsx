/**
 * AIChatAgent — 对话式AI Agent面板
 *
 * 付费级特性：
 * - 多轮对话（上下文记忆）
 * - 流式输出（逐字显示）
 * - RAG知识库检索（自动从团队数据检索相关上下文）
 * - 一键执行（AI建议可直接操作store：更新任务状态/优先级/负责人）
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { saveSettingDualWrite } from '@/supabase/teamSettings';
import { useStore } from '@/store/useStore';
import type { Action } from '@/store/types';
import { callLLMStream } from '@/lib/ai/llmService';
import { loadAIConfig } from '@/lib/ai/types';
import { buildKnowledgeIndex, searchKnowledge, buildRAGContext, loadIndex, saveIndex, type KnowledgeChunk } from '@/lib/ai/knowledgeRAG';
import { handleError } from '@/lib/errorHandler';
import { useAICallGate, getAITodayCount } from '@/hooks/useFeatureGate';
import { Send, Bot, User, X, Play, Check, AlertTriangle } from 'lucide-react';
import { AI_ACTION_MAP } from '@/lib/ai/aiActions';

/** AI 可执行的 action 类型 — 与 aiActions.ts 注册中心对齐 */
interface AIAction {
  type: string;
  targetId?: string;
  targetType?: 'task' | 'goal' | 'project' | 'comment';
  payload: Record<string, unknown>;
  label: string;
  executed?: boolean;
  error?: string;
}

/** 允许 LLM 输出的 action type 白名单（安全校验） */
const ALLOWED_ACTION_TYPES = new Set([
  'UPDATE_TASK_STATUS', 'UPDATE_TASK_PRIORITY', 'UPDATE_TASK_ASSIGNEE', 'UPDATE_GOAL_PROGRESS',
  'create_task', 'create_goal', 'create_comment', 'create_subtask',
  'update_task_status', 'update_task_priority', 'update_task_assignee', 'update_task_due_date',
  'update_goal_status', 'update_kr_value', 'batch_update_task_status',
  'delete_task', 'delete_comment',
  'smart_assign', 'auto_complete_goal',
]);

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: string[];
  streaming?: boolean;
  actions?: AIAction[];
}

const SYSTEM_PROMPT = `你是团队管理中台的AI助手。你可以：
1. 回答关于团队目标、项目、任务的问题
2. 分析团队瓶颈和风险
3. 建议优化方案（如任务分配、优先级调整、资源再分配）
4. 基于复盘数据提供改进建议

回答原则：
- 基于提供的团队知识库数据回答，不编造事实
- 给出具体可执行的建议，不要空泛
- 如果数据不足，明确告知用户
- 用中文回答，简洁专业

当你建议修改某个任务/目标时，在回答末尾用JSON格式附上可执行操作，格式如下：
<!-- ACTION: {"type":"操作ID","targetId":"目标ID","targetType":"task","payload":{...},"label":"操作说明"} -->
可以添加多个ACTION，每个单独一行。

【可用操作清单】
快捷操作（兼容旧格式）：
- UPDATE_TASK_STATUS: payload={status: todo/in_progress/done/blocked/cancelled}
- UPDATE_TASK_PRIORITY: payload={priority: S/A/B/C}
- UPDATE_TASK_ASSIGNEE: payload={assigneeId, assigneeName}
- UPDATE_GOAL_PROGRESS: payload={progress: 0-100}

完整操作（推荐）：
- create_task: payload={title, goalId?, projectId?, priority?, leaderId?, dueDate?}
- create_goal: payload={title, type?, priority?, leaderId?}
- create_subtask: payload={taskId, title}
- update_task_status: payload={taskId, status}
- update_task_priority: payload={taskId, priority}
- update_task_assignee: payload={taskId, leaderId}
- update_task_due_date: payload={taskId, dueDate}
- batch_update_task_status: payload={taskIds(逗号分隔), status}
- update_goal_status: payload={goalId, status}
- update_kr_value: payload={goalId, krId, value}
- smart_assign: payload={taskId}
- auto_complete_goal: payload={goalId}

注意事项：
- targetId 是必须的，从你检索到的数据中获取真实ID
- 不要编造ID，如果不确定，只给建议不附加ACTION
- label 用中文简述这个操作做什么`;

/** 从AI回复中解析可执行操作 */
function parseActions(text: string): AIAction[] {
  const actions: AIAction[] = [];
  // Match from { to the closing --> allowing nested objects
  const regex = /<!--\s*ACTION:\s*(\{[\s\S]*?\})\s*-->/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      // Balance braces to find the correct closing }
      let jsonStr = match[1];
      let depth = 0;
      let endIdx = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
      }
      if (endIdx > 0) jsonStr = jsonStr.slice(0, endIdx);
      const action = JSON.parse(jsonStr);
      if (action.type && action.label && ALLOWED_ACTION_TYPES.has(action.type)) {
        actions.push(action as AIAction);
      }
    } catch { /* skip malformed */ }
  }
  return actions;
}

/** 从AI回复中移除ACTION标记（用户不需要看到） */
function stripActionTags(text: string): string {
  return text.replace(/<!--\s*ACTION:\s*\{[\s\S]*?\}\s*-->/g, '').trim();
}

export function AIChatAgent() {
  const { state, dispatch } = useStore();
  const aiGate = useAICallGate();
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<KnowledgeChunk[] | null>(null);
  const streamBufferRef = useRef<string>('');
  const streamFlushRef = useRef<number>(0);

  // Persist chat messages to localStorage
  const CHAT_STORAGE_KEY = 'tbh-ai-chat-messages';
  const MAX_PERSISTED_MESSAGES = 50;

  function loadPersistedMessages(): ChatMessage[] {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return [];
      // Restore messages (strip streaming/executed states)
      return parsed.slice(-MAX_PERSISTED_MESSAGES).map((m: ChatMessage) => ({
        ...m,
        streaming: false,
        actions: m.actions?.map((a: AIAction) => ({ ...a, executed: a.executed || false })),
      }));
    } catch { return []; }
  }

  function persistMessages(msgs: ChatMessage[]) {
    try {
      // Only persist non-streaming messages, limited count
      const toSave = msgs
        .filter(m => !m.streaming)
        .slice(-MAX_PERSISTED_MESSAGES);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
      // DR-19: dual-write to DB
      const teamId = state.currentTeamId || '';
      if (teamId) saveSettingDualWrite('ai_chat_messages', CHAT_STORAGE_KEY, toSave, teamId);
    } catch { /* quota exceeded */ }
  }

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadPersistedMessages();
    return saved.length > 0 ? saved : [
      { id: 'welcome', role: 'assistant', content: '你好，我是团队AI助手。可以问我任何关于团队目标、项目进展、任务分配的问题，我会基于团队实时数据为你分析。', timestamp: Date.now() },
    ];
  });
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Build/refresh knowledge index on mount
  useEffect(() => {
    const cached = loadIndex();
    if (cached) {
      indexRef.current = cached;
    } else {
      const chunks = buildKnowledgeIndex(state);
      indexRef.current = chunks;
      saveIndex(chunks);
    }
  }, [state]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist messages on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => persistMessages(messages), 500);
    return () => clearTimeout(timer);
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const config = loadAIConfig();
    if (!config.enabled || !config.apiKey) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'system', content: 'AI未启用。请先在设置中配置API Key。', timestamp: Date.now() }]);
      return;
    }
    // Feature gate: AI daily call limit
    const todayCount = getAITodayCount();
    const aiLimit = aiGate.max;
    if (todayCount >= aiLimit) {
      setMessages(prev => [...prev, { id: `gate-${Date.now()}`, role: 'system', content: `今日AI调用次数已达上限(${aiLimit}次)。升级专业版可享受每天1000次调用。`, timestamp: Date.now() }]);
      return;
    }

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: input.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    // RAG retrieval
    let ragContext = '';
    const sources: string[] = [];
    if (indexRef.current && indexRef.current.length > 0) {
      const relevant = searchKnowledge(indexRef.current, input.trim(), 5);
      if (relevant.length > 0) {
        ragContext = buildRAGContext(relevant);
        sources.push(...relevant.map(r => `[${r.sourceType}] ${r.sourceTitle}`));
      }
    }

    // Build conversation context
    const convMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT + (ragContext ? '\n\n' + ragContext : '') },
      ...messages.filter(m => m.role !== 'system').slice(-8).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: input.trim() },
    ];

    const assistantId = `asst-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true, sources }]);

    try {
      abortRef.current = new AbortController();
      streamBufferRef.current = '';
      const assistantId = `asst-${Date.now()}`;
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true, sources }]);

      // Throttled stream update: batch chunks and flush every 80ms
      const flushStream = () => {
        const buffered = streamBufferRef.current;
        if (!buffered) return;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: buffered } : m));
      };

      const fullText = await callLLMStream(convMessages, config, (chunk) => {
        streamBufferRef.current += chunk;
        const now = Date.now();
        if (now - streamFlushRef.current > 80) {
          streamFlushRef.current = now;
          flushStream();
        }
      }, { signal: abortRef.current.signal });

      // Final flush
      flushStream();
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullText, streaming: false, actions: parseActions(fullText) } : m));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '请求失败';
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `抱歉，出错了：${errMsg}`, streaming: false } : m));
      handleError(err, { module: 'AIChatAgent', operation: 'STREAM', severity: 'warn' });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, state]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearChat = useCallback(() => {
    const welcome = { id: 'welcome', role: 'assistant' as const, content: '对话已清空。有什么可以帮你的？', timestamp: Date.now() };
    setMessages([welcome]);
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  /** 一键执行AI建议的action — 支持新版(aiActions注册中心)和旧版(4种inline type) */
  const executeAction = useCallback((msgId: string, actionIdx: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.actions) return m;
      const action = m.actions[actionIdx];
      if (!action || action.executed) return m;

      // Security: verify action type is in whitelist
      if (!ALLOWED_ACTION_TYPES.has(action.type)) {
        const newActions = [...m.actions!];
        newActions[actionIdx] = { ...action, error: '不支持的操作类型', executed: true };
        return { ...m, actions: newActions };
      }

      try {
        // Legacy inline action types (backward compatible)
        if (action.type === 'UPDATE_TASK_STATUS') {
          dispatch({ type: 'UPDATE_TASK', payload: { id: action.targetId!, updates: { status: action.payload.status, completedAt: action.payload.status === 'done' ? new Date().toISOString() : undefined } } });
        } else if (action.type === 'UPDATE_TASK_PRIORITY') {
          dispatch({ type: 'UPDATE_TASK', payload: { id: action.targetId!, updates: { priority: action.payload.priority } } });
        } else if (action.type === 'UPDATE_TASK_ASSIGNEE') {
          dispatch({ type: 'UPDATE_TASK', payload: { id: action.targetId!, updates: { leaderId: action.payload.assigneeId } } });
        } else if (action.type === 'UPDATE_GOAL_PROGRESS') {
          dispatch({ type: 'UPDATE_GOAL', payload: { id: action.targetId!, updates: { progress: Number(action.payload.progress) } } });
        } else {
          // New action path: use aiActions registry
          const actionDef = AI_ACTION_MAP.get(action.type);
          if (!actionDef) {
            const newActions = [...m.actions!];
            newActions[actionIdx] = { ...action, error: `未知操作: ${action.type}`, executed: true };
            return { ...m, actions: newActions };
          }
          // Build params from payload (+ targetId if needed)
          const params: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(action.payload)) {
            params[k] = v == null ? undefined : String(v);
          }
          if (action.targetId) {
            // Map targetId to the primary key param (taskId, goalId, etc.)
            const idParam = actionDef.params.find(p => p.required && p.key.toLowerCase().includes('id'));
            if (idParam && !params[idParam.key]) params[idParam.key] = action.targetId;
          }
          const result = actionDef.execute(state, params);
          if ('error' in result) {
            const newActions = [...m.actions!];
            newActions[actionIdx] = { ...action, error: result.error, executed: true };
            return { ...m, actions: newActions };
          }
          // Skip analysis-only actions (they don't dispatch)
          if (result.type !== '__AI_ANALYSIS__') {
            dispatch(result as Action);
          }
        }

        // Mark as executed
        const newActions = [...m.actions!];
        newActions[actionIdx] = { ...action, executed: true };
        return { ...m, actions: newActions };
      } catch (err) {
        handleError(err, { module: 'AIChatAgent', operation: 'EXECUTE_ACTION', severity: 'warn' });
        const newActions = [...m.actions!];
        newActions[actionIdx] = { ...action, error: '执行失败', executed: true };
        return { ...m, actions: newActions };
      }
    }));
  }, [dispatch, state]);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role !== 'user' && (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : msg.role === 'system' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-muted'}`}>
              <div className="whitespace-pre-wrap break-words">{stripActionTags(msg.content)}{msg.streaming && <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5" />}</div>
              {msg.sources && msg.sources.length > 0 && !msg.streaming && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {msg.sources.map((s, i) => (
                    <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary">{s}</span>
                  ))}
                </div>
              )}
              {msg.actions && msg.actions.length > 0 && !msg.streaming && (
                <div className="mt-2 space-y-1.5 border-t pt-2">
                  {msg.actions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => executeAction(msg.id, idx)}
                      disabled={action.executed}
                      className={`flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${action.executed ? (action.error ? 'bg-red-50 text-red-600 cursor-default' : 'bg-green-100 text-green-700 cursor-default') : 'bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer border border-primary/20'}`}
                    >
                      {action.executed ? (action.error ? <AlertTriangle size={12} /> : <Check size={12} />) : <Play size={12} />}
                      <span>{action.executed ? (action.error || '已执行') : action.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User size={12} className="text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="问我关于团队数据的任何问题..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button onClick={stopStreaming} className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200">
              <X size={16} />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              <Send size={16} />
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className={`text-[10px] ${aiGate.count >= aiGate.max ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
            AI调用: {aiGate.count}/{aiGate.max}
          </span>
          {aiGate.count >= aiGate.max * 0.8 && aiGate.count < aiGate.max && (
            <span className="text-[10px] text-amber-600">接近上限，升级可获更多</span>
          )}
        </div>
      </div>
    </div>
  );
}
