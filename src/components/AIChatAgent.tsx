/**
 * AIChatAgent — 对话式AI Agent面板
 *
 * 可嵌入任意页面，支持：
 * - 多轮对话（上下文记忆）
 * - 流式输出（逐字显示）
 * - RAG知识库检索（自动从团队数据检索相关上下文）
 * - 一键执行（AI建议可直接写入store）
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { callLLMStream, loadAIConfig } from '@/lib/ai/llmService';
import { buildKnowledgeIndex, searchKnowledge, buildRAGContext, loadIndex, saveIndex, type KnowledgeChunk } from '@/lib/ai/knowledgeRAG';
import { handleError } from '@/lib/errorHandler';
import { Send, Bot, User, Sparkles, X, Trash2, Loader2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: string[];
  streaming?: boolean;
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
- 用中文回答，简洁专业`;

export function AIChatAgent() {
  const { state } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: '你好，我是团队AI助手。可以问我任何关于团队目标、项目进展、任务分配的问题，我会基于团队实时数据为你分析。', timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<KnowledgeChunk[] | null>(null);

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

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const config = loadAIConfig();
    if (!config.enabled || !config.apiKey) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'system', content: 'AI未启用。请先在设置中配置API Key。', timestamp: Date.now() }]);
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
      const fullText = await callLLMStream(convMessages, config, (chunk) => {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
      }, { signal: abortRef.current.signal });

      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullText, streaming: false } : m));
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
    setMessages([{ id: 'welcome', role: 'assistant', content: '对话已清空。有什么可以帮你的？', timestamp: Date.now() }]);
  }, []);

  return (
    <div className="flex flex-col h-full max-h-[600px] border rounded-xl bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles size={12} className="text-primary" />
          </div>
          <span className="text-sm font-semibold">AI 助手</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">RAG</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearChat} className="p-1 rounded hover:bg-muted text-muted-foreground" title="清空对话">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

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
              <div className="whitespace-pre-wrap break-words">{msg.content}{msg.streaming && <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5" />}</div>
              {msg.sources && msg.sources.length > 0 && !msg.streaming && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {msg.sources.map((s, i) => (
                    <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary">{s}</span>
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
      </div>
    </div>
  );
}
