import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Bot, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section } from './detail-shared';
import type { ItemType } from '@/types';
import { AI_AGENTS, AI_AGENT_MAP, getPreferredAgent } from '@/lib/ai/aiAgentSystem';
import type { AiAgentPersona } from '@/lib/ai/aiAgentSystem';
import { parseIntent, chatWithLLM, executeIntent } from '@/lib/ai/intentParser';
import type { ParsedIntent } from '@/lib/ai/intentParser';
import { FallbackForm } from './FallbackForm';
import { executeAiAction } from '@/lib/ai/aiAgentSystem';
import { trackAIIntent, trackAIChat } from '@/store/behaviorTracking';

interface AiChatPanelProps {
  itemId: string;
  itemType: ItemType;
  itemTitle: string;
  itemDescription: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
  actionExecuted?: boolean;
  isError?: boolean;
  /** 需要兜底表单 */
  showFallback?: boolean;
  /** 附加的意图数据（供兜底表单使用） */
  intentData?: ParsedIntent;
}

export function AiChatPanel({ itemId, itemType, itemTitle, itemDescription }: AiChatPanelProps) {
  const { state, dispatch } = useStore();
  const defaultAgent = useMemo(() => getPreferredAgent(), []);
  const [currentAgent, setCurrentAgent] = useState<AiAgentPersona>(defaultAgent);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 获取对话历史（用于 LLM 上下文）
  const chatHistory = useMemo(() => (
    messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  ), [messages]);

  const context = useMemo(() => ({
    itemId,
    itemType,
    itemTitle,
    itemDescription,
  }), [itemId, itemType, itemTitle, itemDescription]);

  const handleSend = useCallback(async (overrideInput?: string) => {
    const text = (overrideInput || input).trim();
    if (!text || isTyping) return;
    setInput('');
    setIsTyping(true);

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Step 1: LLM 意图解析
      const intent = await parseIntent(text, {
        itemType,
        itemTitle,
        itemDescription,
      });

      // 行为埋点：意图解析结果
      trackAIIntent(intent.type, intent.actionId, intent.confidence, intent.source, intent.fallback);

      // Step 2: 根据意图类型执行
      if (intent.type === 'action' || intent.type === 'query') {
        // 有明确操作意图
        if (intent.fallback) {
          // 置信度低→提示兜底表单
          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: `我理解你想${intent.actionId ? '执行操作' : '做点什么'}，但不太确定具体细节。你可以：\n\n1. 用更明确的方式再说一次（如"创建一个任务：完成首页设计，优先级A"）\n2. 点击下方快捷操作\n3. 使用手动创建表单`,
            timestamp: Date.now(),
            agentId: currentAgent.id,
            showFallback: true,
            intentData: intent,
          };
          setMessages(prev => [...prev, aiMsg]);
          trackAIChat(text.length, intent.type as 'action' | 'query');
        } else if (intent.actionId) {
          // 置信度够→执行操作
          if (currentAgent.allowedActions.includes(intent.actionId)) {
            const { action, description } = executeIntent(intent, state, {
              itemId,
              itemType,
            });

            if (action && !('error' in action)) {
              dispatch(action as any);
              const aiMsg: ChatMessage = {
                role: 'assistant',
                content: `✅ ${description}`,
                timestamp: Date.now(),
                agentId: currentAgent.id,
                actionExecuted: true,
              };
              setMessages(prev => [...prev, aiMsg]);
              trackAIChat(text.length, 'action');
            } else {
              const errMsg = action && 'error' in action ? action.error : '执行失败';
              const aiMsg: ChatMessage = {
                role: 'assistant',
                content: `⚠️ ${description}\n\n${errMsg}`,
                timestamp: Date.now(),
                agentId: currentAgent.id,
                isError: true,
              };
              setMessages(prev => [...prev, aiMsg]);
            }
          } else {
            const aiMsg: ChatMessage = {
              role: 'assistant',
              content: `我（${currentAgent.name}）暂不支持此操作。\n\n${intent.source === 'llm' ? 'LLM' : '关键词'}识别为：${intent.actionId}`,
              timestamp: Date.now(),
              agentId: currentAgent.id,
            };
            setMessages(prev => [...prev, aiMsg]);
          }
        }
      } else if (intent.type === 'chat') {
        // 自由对话
        if (intent.reply) {
          // LLM 已经在意图解析时给出了回复
          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: intent.reply,
            timestamp: Date.now(),
            agentId: currentAgent.id,
          };
          setMessages(prev => [...prev, aiMsg]);
        } else {
          // 需要额外调用 LLM 对话
          const reply = await chatWithLLM(text, chatHistory, {
            itemType,
            itemTitle,
            itemDescription,
          });
          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
            agentId: currentAgent.id,
          };
          setMessages(prev => [...prev, aiMsg]);
          trackAIChat(text.length, 'chat');
        }
      }
    } catch (err) {
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: `处理时发生错误：${err instanceof Error ? err.message : '未知错误'}。请稍后重试。`,
        timestamp: Date.now(),
        agentId: currentAgent.id,
        isError: true,
      };
      setMessages(prev => [...prev, aiMsg]);
      trackAIChat(text.length, 'error');
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, currentAgent, state, dispatch, itemId, itemType, itemTitle, itemDescription, chatHistory]);

  const typeLabel = itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务';

  return (
    <Section title="AI 助手" icon={<Sparkles className="w-3.5 h-3.5" />}>
      <div className="space-y-3">
        {/* Agent selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
              onClick={() => setShowAgentPicker(!showAgentPicker)}
            >
              <span>{currentAgent.emoji}</span>
              <span className="font-medium">{currentAgent.name}</span>
              <ChevronDown size={12} />
            </button>
            {showAgentPicker && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-card rounded-lg shadow-lg border border-border z-50 animate-slide-up">
                {AI_AGENTS.map(agent => (
                  <button
                    key={agent.id}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2',
                      agent.id === currentAgent.id && 'bg-primary/10 text-primary'
                    )}
                    onClick={() => { setCurrentAgent(agent); setShowAgentPicker(false); }}
                  >
                    <span>{agent.emoji}</span>
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-[10px] text-muted-foreground">{agent.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent quick actions */}
        <div className="flex flex-wrap gap-1.5">
          {currentAgent.quickActions.map(qa => (
            <button
              key={qa.label}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-border hover:bg-accent transition-colors cursor-pointer"
              onClick={() => handleSend(qa.prompt)}
              disabled={isTyping}
            >
              <Bot size={10} />
              {qa.label}
            </button>
          ))}
        </div>

        {/* Chat messages */}
        <div className="max-h-[280px] overflow-y-auto space-y-2 min-h-[40px]">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {currentAgent.greeting}
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px]">
                  {AI_AGENT_MAP.get(msg.agentId || '')?.emoji || '🤖'}
                </div>
              )}
              <div className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : msg.actionExecuted
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                    : msg.isError
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      : 'bg-muted'
              )}>
                {msg.content}
                {msg.showFallback && msg.intentData && (
                  <div className="mt-2">
                    <FallbackForm
                      intent={msg.intentData}
                      contextItemType={itemType}
                      onSubmit={(formData) => {
                        const actionId = (formData.actionId as string) || msg.intentData?.actionId;
                        if (!actionId) return;
                        const params = { ...formData };
                        delete params.actionId;
                        if (itemType === 'task') params.taskId = params.taskId || itemId;
                        if (itemType === 'goal') params.goalId = params.goalId || itemId;
                        const { action, description } = executeAiAction(actionId, params, state);
                        if (action && !('error' in action)) {
                          dispatch(action as any);
                          setMessages(prev => [...prev, { role: 'assistant', content: `✅ ${description}`, timestamp: Date.now(), agentId: currentAgent.id, actionExecuted: true }]);
                        } else {
                          const errMsg = action && 'error' in action ? action.error : '执行失败';
                          setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}`, timestamp: Date.now(), agentId: currentAgent.id, isError: true }]);
                        }
                      }}
                      onCancel={() => {
                        setMessages(prev => prev.map((m, mi) => mi === i ? { ...m, showFallback: false } : m));
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-2 justify-start">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px]">
                {currentAgent.emoji}
              </div>
              <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 size={10} className="animate-spin" />
                {currentAgent.name} 思考中...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            className="flex-1 border border-input rounded px-2 py-1.5 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={`问${currentAgent.name}关于"${itemTitle}"的问题...`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={isTyping}
          />
          <Button
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
          >
            {isTyping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </Section>
  );
}
