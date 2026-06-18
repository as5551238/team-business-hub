/**
 * AI 首页对话主入口 — W3 核心组件
 *
 * 与 AiChatPanel 的区别：
 * - 不绑定特定 item，操作全局 state
 * - 支持全局意图：查看今日任务、生成晨间简报、风险报告等
 * - 输出驱动右侧面板实时更新（四象限/今日任务/报告）
 * - 占据首页左侧，是用户的主要交互入口
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Bot, ChevronDown, Loader2, AlertCircle, LayoutDashboard, BarChart3, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AI_AGENTS, AI_AGENT_MAP, getPreferredAgent } from '@/lib/ai/aiAgentSystem';
import type { AiAgentPersona } from '@/lib/ai/aiAgentSystem';
import { parseIntent, chatWithLLM, executeIntent } from '@/lib/ai/intentParser';
import type { ParsedIntent } from '@/lib/ai/intentParser';
import { executeAiAction } from '@/lib/ai/aiAgentSystem';
import { trackAIIntent, trackAIChat } from '@/store/behaviorTracking';

// ===== 类型 =====

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
  actionExecuted?: boolean;
  isError?: boolean;
  showFallback?: boolean;
  intentData?: ParsedIntent;
  /** 触发右侧面板切换的信号 */
  signalPanel?: 'quadrant' | 'today' | 'briefing' | 'report' | 'risk';
}

export interface AiHomepageChatProps {
  /** 当 AI 操作完成后触发的面板切换回调 */
  onPanelChange?: (panel: 'quadrant' | 'today' | 'briefing' | 'report' | 'risk') => void;
  /** 当前活跃面板 */
  activePanel?: string;
  className?: string;
}

// ===== 全局快捷操作 =====

const HOMEPAGE_QUICK_ACTIONS = [
  { label: '今日聚焦', prompt: '今天有什么需要关注的？', icon: LayoutDashboard, panel: 'today' as const },
  { label: '创建任务', prompt: '帮我创建一个任务', icon: Sparkles, panel: 'quadrant' as const },
  { label: '晨间简报', prompt: '生成本周的晨间聚焦简报', icon: BarChart3, panel: 'briefing' as const },
  { label: '风险报告', prompt: '分析当前的风险状况', icon: Shield, panel: 'risk' as const },
];

// ===== 组件 =====

export function AiHomepageChat({ onPanelChange, activePanel, className }: AiHomepageChatProps) {
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

  const chatHistory = useMemo(() => (
    messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  ), [messages]);

  // 全局上下文（不绑定特定 item）
  const globalContext = useMemo(() => {
    const taskCount = state.tasks.length;
    const goalCount = state.goals.length;
    const projectCount = state.projects.length;
    const overdueTasks = state.tasks.filter(t =>
      t.status !== 'done' && t.status !== 'cancelled' &&
      t.dueDate && t.dueDate < new Date().toISOString().split('T')[0]
    ).length;
    return {
      totalTasks: taskCount,
      totalGoals: goalCount,
      totalProjects: projectCount,
      overdueTasks,
    };
  }, [state.tasks, state.goals, state.projects]);

  const handleSend = useCallback(async (overrideInput?: string, panelSignal?: ChatMessage['signalPanel']) => {
    const text = (overrideInput || input).trim();
    if (!text || isTyping) return;
    setInput('');
    setIsTyping(true);

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    // 如果有面板信号，立即切换
    if (panelSignal && onPanelChange) {
      onPanelChange(panelSignal);
    }

    try {
      // 意图解析（全局模式：不传具体 item 上下文）
      const intent = await parseIntent(text, {
        itemType: 'task',
        itemTitle: '',
        itemDescription: `团队共有${globalContext.totalTasks}个任务、${globalContext.totalGoals}个目标、${globalContext.totalProjects}个项目，其中${globalContext.overdueTasks}个逾期`,
      });

      trackAIIntent(intent.type, intent.actionId, intent.confidence, intent.source, intent.fallback);

      // 根据意图类型处理
      if (intent.type === 'action' || intent.type === 'query') {
        if (intent.fallback) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `我理解你想做些操作，但需要更具体的信息。你可以：\n\n1. 说明具体内容（如"创建任务：完成首页设计，优先级A"）\n2. 使用快捷操作\n3. 填写下方表单`,
            timestamp: Date.now(),
            agentId: currentAgent.id,
            showFallback: true,
            intentData: intent,
          }]);
          trackAIChat(text.length, intent.type as 'action' | 'query');
        } else if (intent.actionId) {
          if (currentAgent.allowedActions.includes(intent.actionId)) {
            const { action, description } = executeIntent(intent, state, { itemId: '', itemType: 'task' });
            if (action && !('error' in action)) {
              dispatch(action as any);
              const signal = intent.actionId.includes('goal') ? 'quadrant' :
                intent.actionId.includes('risk') || intent.actionId.includes('predict') ? 'risk' :
                intent.actionId.includes('report') || intent.actionId.includes('summary') ? 'report' : 'quadrant';
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `✅ ${description}`,
                timestamp: Date.now(),
                agentId: currentAgent.id,
                actionExecuted: true,
                signalPanel: signal,
              }]);
              if (onPanelChange) onPanelChange(signal as ChatMessage['signalPanel']!);
              trackAIChat(text.length, 'action');
            } else {
              const errMsg = action && 'error' in action ? action.error : '执行失败';
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `⚠️ ${description}\n\n${errMsg}`,
                timestamp: Date.now(),
                agentId: currentAgent.id,
                isError: true,
              }]);
            }
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `我（${currentAgent.name}）暂不支持此操作。识别为：${intent.actionId}`,
              timestamp: Date.now(),
              agentId: currentAgent.id,
            }]);
          }
        }
      } else if (intent.type === 'chat') {
        if (intent.reply) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: intent.reply!,
            timestamp: Date.now(),
            agentId: currentAgent.id,
          }]);
        } else {
          const reply = await chatWithLLM(text, chatHistory, {
            itemType: 'task',
            itemTitle: '全局对话',
            itemDescription: `团队数据：${globalContext.totalTasks}任务/${globalContext.totalGoals}目标/${globalContext.overdueTasks}逾期`,
          });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
            agentId: currentAgent.id,
          }]);
          trackAIChat(text.length, 'chat');
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `处理时发生错误：${err instanceof Error ? err.message : '未知错误'}。请稍后重试。`,
        timestamp: Date.now(),
        agentId: currentAgent.id,
        isError: true,
      }]);
      trackAIChat(text.length, 'error');
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, currentAgent, state, dispatch, globalContext, chatHistory, onPanelChange]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">AI 助手</h2>
        </div>
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
            <div className="absolute right-0 top-full mt-1 w-48 bg-card rounded-lg shadow-lg border border-border z-50 animate-slide-up">
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

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        {HOMEPAGE_QUICK_ACTIONS.map(qa => (
          <button
            key={qa.label}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-full border border-border hover:bg-accent transition-colors cursor-pointer"
            onClick={() => handleSend(qa.prompt, qa.panel)}
            disabled={isTyping}
          >
            <qa.icon size={12} />
            {qa.label}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">{currentAgent.emoji}</div>
            <p className="text-sm text-muted-foreground">{currentAgent.greeting}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">试试说"今天有什么需要关注的"或"创建一个新任务"</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs">
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
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs">
              {currentAgent.emoji}
            </div>
            <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              {currentAgent.name} 思考中...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex gap-2">
          <input
            className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="说点什么，我来帮你..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={isTyping}
          />
          <Button
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
          >
            {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
