import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Lightbulb, Target, AlertTriangle, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section } from './detail-shared';
import type { ItemType } from '@/types';

interface AiChatPanelProps {
  itemId: string;
  itemType: ItemType;
  itemTitle: string;
  itemDescription: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const QUICK_PROMPTS = [
  { icon: <Lightbulb className="w-3 h-3" />, label: '给建议', prompt: '请根据当前工作项的情况，给出改进建议' },
  { icon: <Target className="w-3 h-3" />, label: '分解', prompt: '请将这个工作项分解为更小的可执行步骤' },
  { icon: <AlertTriangle className="w-3 h-3" />, label: '风险', prompt: '请分析这个工作项的潜在风险和应对策略' },
  { icon: <UserCheck className="w-3 h-3" />, label: '匹配', prompt: '请推荐这个工作项最合适的负责人员' },
];

function generateLocalResponse(prompt: string, itemType: string, itemTitle: string, itemDescription: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('分解') || lower.includes('拆分') || lower.includes('步骤')) {
    return `关于"${itemTitle}"的分解建议：\n\n1. 明确核心目标和验收标准\n2. 梳理关键路径和依赖关系\n3. 按里程碑拆分为可衡量的阶段成果\n4. 为每个阶段指定负责人和截止日期\n5. 设置检查点，确保进度可控\n\n${itemDescription ? `结合描述"${itemDescription}"，建议优先关注最核心的价值交付部分。` : ''}`;
  }
  if (lower.includes('风险') || lower.includes('问题') || lower.includes('隐患')) {
    return `关于"${itemTitle}"的风险分析：\n\n🔴 高风险：进度延期、资源不足\n🟡 中风险：跨团队协作沟通、需求变更\n🟢 低风险：技术方案调整\n\n建议：设定里程碑检查点，每周同步进度，提前准备备选方案。`;
  }
  if (lower.includes('匹配') || lower.includes('负责') || lower.includes('指派')) {
    return `为"${itemTitle}"推荐负责人的考虑因素：\n\n1. 相关经验和专业技能匹配度\n2. 当前工作负载（是否有余力）\n3. 与项目其他成员的协作默契度\n4. 职级和权限是否匹配\n\n建议查看团队成员工作负载分布，选择当前负载较低且有相关经验的同学。`;
  }
  if (lower.includes('建议') || lower.includes('改进') || lower.includes('优化')) {
    return `针对"${itemTitle}"的改进建议：\n\n1. 确保目标和关键结果的量化指标清晰\n2. 定期同步进度，及时识别偏差\n3. 合理分配资源，避免瓶颈\n4. 建立反馈闭环，持续优化流程\n5. 记录经验教训，为后续项目积累知识`;
  }
  return `关于"${itemTitle}"的分析：\n\n这是一个${itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务'}，建议从以下几个维度思考：\n\n1. 目标清晰度 — 是否有量化的验收标准？\n2. 进度可控性 — 是否有里程碑和检查点？\n3. 风险预案 — 是否有应对策略？\n4. 资源充足性 — 人力和时间是否够用？\n5. 协作效率 — 信息是否及时同步？\n\n如需更深入的分析，可以选择上方的快捷指令。`;
}

export function AiChatPanel({ itemId, itemType, itemTitle, itemDescription }: AiChatPanelProps) {
  const { state } = useStore();
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
    // Simulate AI response with local intelligence
    setTimeout(() => {
      const response = generateLocalResponse(text, itemType, itemTitle, itemDescription);
      const aiMsg: ChatMessage = { role: 'assistant', content: response, timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 500 + Math.random() * 800);
  }

  const typeLabel = itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务';

  return (
    <Section title="AI 助手" icon={<Sparkles className="w-3.5 h-3.5" />}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map(qp => (
            <button
              key={qp.label}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-border hover:bg-accent transition-colors cursor-pointer"
              onClick={() => handleSend(qp.prompt)}
            >
              {qp.icon}
              {qp.label}
            </button>
          ))}
        </div>

        <div className="max-h-[240px] overflow-y-auto space-y-2 min-h-[40px]">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              问 AI 关于这个{typeLabel}的问题，或使用上方快捷指令
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}>
                {msg.content}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-2 justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground animate-pulse">
                AI 思考中...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={`问关于"${itemTitle}"的问题...`}
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
