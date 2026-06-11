/**
 * 意图解析兜底表单 — 当 LLM 置信度低时，提供结构化表单替代模糊回复
 *
 * 设计原则（DR-51 主动优先 + 兜底原则）：
 * - 优先让用户自然语言输入（已被意图解析器处理）
 * - 解析失败时降级为表单，确保操作始终可达
 * - 表单预填从 LLM 提取的参数（即使置信度低，也有参考价值）
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Plus, ListChecks, AlertCircle } from 'lucide-react';
import type { ParsedIntent } from '@/lib/ai/intentParser';
import type { AppType, TaskPriority, GoalType } from '@/types';

interface FallbackFormProps {
  intent: ParsedIntent;
  onSubmit: (formData: Record<string, unknown>) => void;
  onCancel: () => void;
  /** 当前上下文的 item 类型 */
  contextItemType?: string;
}

/** 任务创建兜底表单 */
function TaskFallbackForm({ intent, onSubmit, onCancel }: FallbackFormProps) {
  const prefill = intent.params || {};
  const [title, setTitle] = useState((prefill.title as string) || '');
  const [priority, setPriority] = useState<TaskPriority>((prefill.priority as TaskPriority) || 'B');
  const [dueDate, setDueDate] = useState((prefill.dueDate as string) || '');
  const [description, setDescription] = useState((prefill.description as string) || '');

  return (
    <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        <AlertCircle size={12} />
        AI 未能完全理解，请补充任务信息
      </div>
      <input
        className="w-full border border-input rounded px-2 py-1.5 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="任务标题 *"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <textarea
        className="w-full border border-input rounded px-2 py-1.5 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        placeholder="描述（可选）"
        rows={2}
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">优先级</label>
          <select
            className="w-full border border-input rounded px-2 py-1 text-xs bg-card"
            value={priority}
            onChange={e => setPriority(e.target.value as TaskPriority)}
          >
            <option value="S">S-紧急</option>
            <option value="A">A-高</option>
            <option value="B">B-中</option>
            <option value="C">C-低</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">截止日期</label>
          <input
            type="date"
            className="w-full border border-input rounded px-2 py-1 text-xs bg-card"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => {
          if (!title.trim()) return;
          onSubmit({ actionId: 'create_task', title: title.trim(), priority, dueDate: dueDate || null, description: description.trim() });
        }}>
          <Plus size={10} className="mr-1" />创建任务
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

/** 目标创建兜底表单 */
function GoalFallbackForm({ intent, onSubmit, onCancel }: FallbackFormProps) {
  const prefill = intent.params || {};
  const [title, setTitle] = useState((prefill.title as string) || '');
  const [type, setType] = useState<GoalType>((prefill.type as GoalType) || 'operational');
  const [endDate, setEndDate] = useState((prefill.endDate as string) || '');

  return (
    <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        <AlertCircle size={12} />
        AI 未能完全理解，请补充目标信息
      </div>
      <input
        className="w-full border border-input rounded px-2 py-1.5 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="目标标题 *"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">类型</label>
          <select
            className="w-full border border-input rounded px-2 py-1 text-xs bg-card"
            value={type}
            onChange={e => setType(e.target.value as GoalType)}
          >
            <option value="strategic">战略目标</option>
            <option value="operational">运营目标</option>
            <option value="personal">个人目标</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">截止日期</label>
          <input
            type="date"
            className="w-full border border-input rounded px-2 py-1 text-xs bg-card"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => {
          if (!title.trim()) return;
          onSubmit({ actionId: 'create_goal', title: title.trim(), type, endDate: endDate || '' });
        }}>
          <Plus size={10} className="mr-1" />创建目标
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

/** 查询兜底 — 快捷选择 */
function QueryFallbackForm({ intent, onSubmit, onCancel }: FallbackFormProps) {
  const queries = [
    { label: '逾期任务', actionId: 'get_overdue_tasks', icon: '⏰' },
    { label: '团队负载', actionId: 'get_team_load', icon: '📊' },
    { label: '目标进度', actionId: 'get_goal_progress', icon: '🎯' },
    { label: '风险检测', actionId: 'get_risk_items', icon: '⚠️' },
  ];

  return (
    <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
        <ListChecks size={12} />
        选择要查询的内容
      </div>
      <div className="flex flex-wrap gap-1.5">
        {queries.map(q => (
          <button
            key={q.actionId}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors cursor-pointer"
            onClick={() => onSubmit({ actionId: q.actionId })}
          >
            <span>{q.icon}</span>
            {q.label}
          </button>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onCancel}>
        取消
      </Button>
    </div>
  );
}

/** 兜底表单入口 — 根据意图类型自动选择子表单 */
export function FallbackForm({ intent, onSubmit, onCancel, contextItemType }: FallbackFormProps) {
  // 根据意图或 actionId 推断表单类型
  const actionId = intent.actionId || '';
  const isTaskCreate = actionId === 'create_task' || actionId.includes('task') && intent.type === 'action';
  const isGoalCreate = actionId === 'create_goal' || actionId.includes('goal') && intent.type === 'action';

  if (intent.type === 'query') {
    return <QueryFallbackForm intent={intent} onSubmit={onSubmit} onCancel={onCancel} />;
  }
  if (isGoalCreate) {
    return <GoalFallbackForm intent={intent} onSubmit={onSubmit} onCancel={onCancel} />;
  }
  // 默认显示任务创建表单（最常见操作）
  return <TaskFallbackForm intent={intent} onSubmit={onSubmit} onCancel={onCancel} />;
}
