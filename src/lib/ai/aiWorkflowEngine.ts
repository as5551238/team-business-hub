/**
 * AI Workflow Engine — Parse natural-language workflow intent into AutomationRule
 *
 * Example inputs:
 *   "当任务逾期时自动通知管理员" → trigger=overdue, action=escalation
 *   "当KR进度落后时智能分配" → trigger=kr_lag, action=ai_action:smart_assign
 *   "当目标完成时创建复盘任务" → trigger=status_change(done), action=create_subtask
 */
import type { AutomationRule, AutomationTrigger, AutomationAction, ItemType } from '@/types';
import { genId } from '@/store/utils';
import { AI_ACTION_MAP } from './aiActions';

interface ParsedWorkflow {
  name: string;
  itemType: ItemType;
  trigger: AutomationTrigger;
  condition: { field: string; operator: string; value: string };
  actions: { type: AutomationAction; config: Record<string, string> }[];
}

// Trigger keyword mapping
const TRIGGER_MAP: Record<string, { trigger: AutomationTrigger; condition: Partial<ParsedWorkflow['condition']> }> = {
  '逾期|过期|超期': { trigger: 'overdue', condition: { field: 'status', operator: 'neq', value: 'done' } },
  '到期|即将到期': { trigger: 'due_arrive', condition: { field: 'dueDate', operator: 'not_empty', value: '' } },
  '完成|已完成|done': { trigger: 'status_change', condition: { field: 'status', operator: 'eq', value: 'done' } },
  '创建|新建|添加': { trigger: 'item_created', condition: { field: 'title', operator: 'not_empty', value: '' } },
  '状态变更|状态改变': { trigger: 'status_change', condition: { field: 'status', operator: 'neq', value: '' } },
  'KR落后|KR延迟|进度落后': { trigger: 'kr_lag', condition: { field: 'currentValue', operator: 'lt', value: '70' } },
  '阻塞|blocked': { trigger: 'status_change', condition: { field: 'status', operator: 'eq', value: 'blocked' } },
  '高优先级|紧急': { trigger: 'field_change', condition: { field: 'priority', operator: 'eq', value: 'S' } },
};

// Action keyword mapping
const ACTION_MAP: Record<string, { type: AutomationAction; config: Record<string, string> }> = {
  '通知|提醒|告知': { type: 'notify', config: { title: '自动通知', message: '' } },
  '升级|上报|esca': { type: 'escalation', config: { message: '' } },
  '智能分配|自动分配|smart.?assign': { type: 'ai_action', config: { actionId: 'smart_assign' } },
  '自动完成|auto.?complete': { type: 'ai_action', config: { actionId: 'auto_complete_goal' } },
  '创建子任务|新建子任务': { type: 'create_subtask', config: { title: '跟进任务' } },
  '指派|分配给|assign': { type: 'assign', config: { memberId: '' } },
  '修改|设置|更新': { type: 'set_field', config: { field: '', value: '' } },
  '风险检测|风险扫描': { type: 'ai_action', config: { actionId: 'get_risk_items' } },
  '负载分析|团队负载': { type: 'ai_action', config: { actionId: 'get_team_load' } },
};

// Item type mapping
const ITEM_MAP: Record<string, ItemType> = {
  '任务': 'task',
  '目标': 'goal',
  '项目': 'project',
};

/**
 * Parse natural language workflow description into a structured AutomationRule
 */
export function parseWorkflowIntent(text: string): ParsedWorkflow | null {
  let matchedTrigger: AutomationTrigger | null = null;
  let matchedCondition: Partial<ParsedWorkflow['condition']> = {};

  // Match trigger
  for (const [pattern, def] of Object.entries(TRIGGER_MAP)) {
    if (new RegExp(pattern, 'i').test(text)) {
      matchedTrigger = def.trigger;
      matchedCondition = def.condition;
      break;
    }
  }

  if (!matchedTrigger) return null;

  // Match actions (can have multiple)
  const matchedActions: { type: AutomationAction; config: Record<string, string> }[] = [];
  for (const [pattern, def] of Object.entries(ACTION_MAP)) {
    if (new RegExp(pattern, 'i').test(text)) {
      matchedActions.push({ ...def, config: { ...def.config } });
    }
  }
  if (matchedActions.length === 0) {
    // Default to notify if no action matched
    matchedActions.push({ type: 'notify', config: { title: '自动通知', message: '' } });
  }

  // Match item type
  let itemType: ItemType = 'task'; // default
  for (const [pattern, type] of Object.entries(ITEM_MAP)) {
    if (text.includes(pattern)) {
      itemType = type;
      break;
    }
  }

  // Update notify/escalation config with contextual message
  for (const action of matchedActions) {
    if (action.type === 'notify') {
      action.config.message = `工作流自动触发：${text}`;
    } else if (action.type === 'escalation') {
      action.config.message = `需要关注：${text}`;
    }
  }

  const condition: ParsedWorkflow['condition'] = {
    field: matchedCondition.field || 'status',
    operator: matchedCondition.operator || 'neq',
    value: matchedCondition.value || '',
  };

  return {
    name: text.length > 20 ? text.slice(0, 20) + '...' : text,
    itemType,
    trigger: matchedTrigger,
    condition,
    actions: matchedActions,
  };
}

/**
 * Convert parsed workflow into a full AutomationRule ready for dispatch
 */
export function createRuleFromIntent(text: string): AutomationRule | null {
  const parsed = parseWorkflowIntent(text);
  if (!parsed) return null;

  return {
    id: genId('ar'),
    name: parsed.name,
    enabled: true,
    itemType: parsed.itemType,
    trigger: parsed.trigger,
    condition: parsed.condition as AutomationRule['condition'],
    actions: parsed.actions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get a human-readable summary of available workflow patterns
 * (used by AI chat to suggest workflows to users)
 */
export function getWorkflowPatternSummary(): string {
  const triggers = Object.keys(TRIGGER_MAP).map(p => `- 触发: ${p.replace(/\|/g, '/')}`).join('\n');
  const actions = Object.keys(ACTION_MAP).map(p => `- 动作: ${p.replace(/\|/g, '/')}`).join('\n');
  return `可用工作流模式:\n${triggers}\n${actions}\n\n示例: "当任务逾期时自动通知管理员"`;
}
