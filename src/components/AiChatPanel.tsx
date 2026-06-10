import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Lightbulb, Target, AlertTriangle, UserCheck, Bot, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section } from './detail-shared';
import type { ItemType } from '@/types';
import { AI_AGENTS, AI_AGENT_MAP, getPreferredAgent, parseActionIntent, executeAiAction } from '@/lib/ai/aiAgentSystem';
import type { AiAgentPersona } from '@/lib/ai/aiAgentSystem';

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
}

function generateContextualResponse(prompt: string, itemType: string, itemTitle: string, itemDescription: string, agent: AiAgentPersona): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('分解') || lower.includes('拆分') || lower.includes('步骤')) {
    return `关于"${itemTitle}"的分解建议：\n\n1. 明确核心目标和验收标准\n2. 梳理关键路径和依赖关系\n3. 按里程碑拆分为可衡量的阶段成果\n4. 为每个阶段指定负责人和截止日期\n5. 设置检查点，确保进度可控\n\n💡 你可以说"创建任务"让我直接帮你创建分解后的子任务。`;
  }
  if (lower.includes('风险') || lower.includes('问题') || lower.includes('隐患')) {
    return `关于"${itemTitle}"的风险分析：\n\n🔴 高风险：进度延期、资源不足\n🟡 中风险：跨团队协作沟通、需求变更\n🟢 低风险：技术方案调整\n\n建议：设定里程碑检查点，每周同步进度，提前准备备选方案。\n\n💡 我可以执行"风险检测"来分析实际数据。`;
  }
  if (lower.includes('匹配') || lower.includes('负责') || lower.includes('指派')) {
    return `为"${itemTitle}"推荐负责人的考虑因素：\n\n1. 相关经验和专业技能匹配度\n2. 当前工作负载（是否有余力）\n3. 与项目其他成员的协作默契度\n\n💡 说"智能分配"可以让我根据团队负载自动推荐。`;
  }
  if (lower.includes('建议') || lower.includes('改进') || lower.includes('优化')) {
    return `针对"${itemTitle}"的改进建议：\n\n1. 确保目标和关键结果的量化指标清晰\n2. 定期同步进度，及时识别偏差\n3. 合理分配资源，避免瓶颈\n4. 建立反馈闭环，持续优化流程`;
  }
  return `关于"${itemTitle}"的分析：\n\n这是一个${itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务'}。我能帮你：\n\n· 输入"创建任务" — 直接创建新任务\n· 输入"查看逾期" — 查询逾期任务\n· 输入"智能分配" — 自动推荐负责人\n· 输入"风险检测" — 分析项目风险\n\n或者使用下方快捷指令。`;
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

  function handleSend(overrideInput?: string) {
    const text = (overrideInput || input).trim();
    if (!text) return;
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Check if the user intent matches an executable action
    const actionIntent = parseActionIntent(text);

    setTimeout(() => {
      if (actionIntent) {
        // Check if current agent can execute this action
        if (currentAgent.allowedActions.includes(actionIntent.actionId)) {
          // Inject itemId for context-aware actions
          const params = { ...actionIntent.params };
          if (itemType === 'task') params.taskId = params.taskId || itemId;
          if (itemType === 'goal') params.goalId = params.goalId || itemId;

          const { action, description } = executeAiAction(actionIntent.actionId, params, state);

          if (action && !('error' in action)) {
            // Dispatch the action
            dispatch(action as any);
            const aiMsg: ChatMessage = {
              role: 'assistant',
              content: `✅ ${description}`,
              timestamp: Date.now(),
              agentId: currentAgent.id,
              actionExecuted: true,
            };
            setMessages(prev => [...prev, aiMsg]);
          } else {
            const errMsg = action && 'error' in action ? action.error : '执行失败';
            const aiMsg: ChatMessage = {
              role: 'assistant',
              content: `⚠️ ${description}\n\n${errMsg}`,
              timestamp: Date.now(),
              agentId: currentAgent.id,
            };
            setMessages(prev => [...prev, aiMsg]);
          }
        } else {
          // Agent can't execute this action — suggest switching
          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: `我（${currentAgent.name}）不支持此操作。你可以切换到支持该操作的 Agent，或者我可以用文字为你分析。`,
            timestamp: Date.now(),
            agentId: currentAgent.id,
          };
          setMessages(prev => [...prev, aiMsg]);
        }
      } else {
        // No actionable intent — generate contextual response
        const response = generateContextualResponse(text, itemType, itemTitle, itemDescription, currentAgent);
        const aiMsg: ChatMessage = { role: 'assistant', content: response, timestamp: Date.now(), agentId: currentAgent.id };
        setMessages(prev => [...prev, aiMsg]);
      }
      setIsTyping(false);
    }, 400 + Math.random() * 600);
  }

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
            >
              <Bot size={10} />
              {qa.label}
            </button>
          ))}
        </div>

        {/* Chat messages */}
        <div className="max-h-[240px] overflow-y-auto space-y-2 min-h-[40px]">
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
                    : 'bg-muted'
              )}>
                {msg.content}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-2 justify-start">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px]">
                {currentAgent.emoji}
              </div>
              <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground animate-pulse">
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
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          />
          <Button size="sm" className="h-7 w-7 p-0" onClick={() => handleSend()} disabled={!input.trim()}>
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </Section>
  );
}
