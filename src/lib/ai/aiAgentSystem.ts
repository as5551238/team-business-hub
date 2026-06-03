/**
 * AI Agent system — Persona-driven AI roles that can execute real actions
 *
 * Each agent has a persona, system prompt, and set of allowed AI actions.
 * When the user asks an agent to do something, it parses the intent
 * and executes the matching AI action from aiActions.ts.
 */
import { AI_ACTION_MAP, AI_ACTIONS, type AiAnalysisAction } from './aiActions';
import type { AppState } from '@/store/reducer';
import type { Action } from '@/store/reducer';
import { handleError } from '@/lib/errorHandler';

// ===== Agent Persona Definitions =====

export interface AiAgentPersona {
  id: string;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  allowedActions: string[];  // action IDs this agent can execute
  greeting: string;
  quickActions: { label: string; prompt: string; actionId?: string }[];
}

export const AI_AGENTS: AiAgentPersona[] = [
  {
    id: 'pm-agent',
    name: 'PM 助手',
    emoji: '📋',
    description: '项目管理专家 — 分解任务、排优先级、追踪风险',
    systemPrompt: 'You are a project management assistant. Help the user break down work, prioritize, and track progress. When the user asks you to create, assign, or update items, execute the corresponding action.',
    allowedActions: ['create_task', 'create_goal', 'update_task_status', 'update_task_priority', 'update_task_assignee', 'batch_update_task_status', 'smart_assign', 'get_overdue_tasks', 'get_goal_progress'],
    greeting: '你好！我是PM助手，可以帮你管理任务、目标和工作进度。试试说"创建一个任务"或"查看逾期任务"。',
    quickActions: [
      { label: '创建任务', prompt: '帮我创建一个任务', actionId: 'create_task' },
      { label: '查看逾期', prompt: '查看当前有哪些任务逾期了', actionId: 'get_overdue_tasks' },
      { label: '智能分配', prompt: '帮我智能分配这个任务', actionId: 'smart_assign' },
      { label: '目标进度', prompt: '查看目标进度概况', actionId: 'get_goal_progress' },
    ],
  },
  {
    id: 'review-agent',
    name: '复盘专家',
    emoji: '🔍',
    description: '复盘与质量专家 — 分析问题、评估风险、生成洞察',
    systemPrompt: 'You are a review and quality expert. Analyze items for risks, suggest improvements, and help with retrospectives. Execute analysis and update actions when requested.',
    allowedActions: ['get_risk_items', 'get_team_load', 'get_overdue_tasks', 'get_goal_progress', 'update_kr_value', 'update_task_status', 'auto_complete_goal'],
    greeting: '你好！我是复盘专家，可以帮你分析风险、评估团队负载、检查目标进度。试试说"分析风险"或"查看团队负载"。',
    quickActions: [
      { label: '风险检测', prompt: '分析当前项目的风险项', actionId: 'get_risk_items' },
      { label: '团队负载', prompt: '查看团队成员的工作负载', actionId: 'get_team_load' },
      { label: '自动完成', prompt: '检查是否有可以自动完成的目标', actionId: 'auto_complete_goal' },
    ],
  },
  {
    id: 'stats-agent',
    name: '数据分析师',
    emoji: '📊',
    description: '数据与统计专家 — 进度分析、负载统计、趋势预测',
    systemPrompt: 'You are a data analyst. Provide statistics, progress analysis, and trend predictions. When asked for data, execute the corresponding analysis action.',
    allowedActions: ['get_goal_progress', 'get_team_load', 'get_overdue_tasks', 'get_risk_items'],
    greeting: '你好！我是数据分析师，可以提供进度数据、负载统计和趋势分析。试试说"显示进度"或"团队负载如何"。',
    quickActions: [
      { label: '进度概览', prompt: '显示所有目标的进度概况', actionId: 'get_goal_progress' },
      { label: '负载统计', prompt: '统计团队成员的工作量分布', actionId: 'get_team_load' },
      { label: '逾期分析', prompt: '分析逾期任务分布', actionId: 'get_overdue_tasks' },
    ],
  },
];

export const AI_AGENT_MAP = new Map(AI_AGENTS.map(a => [a.id, a]));

// ===== AI Memory — User preference profile =====

const AI_MEMORY_KEY = 'tbh-ai-memory';

interface AiMemory {
  preferredAgent: string;
  frequentActions: Record<string, number>;  // actionId → count
  lastInteraction: string;  // ISO date
  customInstructions: string;
}

function loadAiMemory(): AiMemory {
  try {
    const raw = localStorage.getItem(AI_MEMORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { handleError(e, { module: 'aiAgentSystem', operation: 'LOAD_MEMORY', severity: 'debug' }); }
  return { preferredAgent: 'pm-agent', frequentActions: {}, lastInteraction: '', customInstructions: '' };
}

function saveAiMemory(memory: AiMemory) {
  try { localStorage.setItem(AI_MEMORY_KEY, JSON.stringify(memory)); } catch (e) { handleError(e, { module: 'aiAgentSystem', operation: 'SAVE_MEMORY', severity: 'debug' }); }
}

/** Record that an AI action was executed, updating user preference profile */
export function recordAiAction(actionId: string) {
  const memory = loadAiMemory();
  memory.frequentActions[actionId] = (memory.frequentActions[actionId] || 0) + 1;
  memory.lastInteraction = new Date().toISOString();
  saveAiMemory(memory);
}

/** Get the user's preferred agent based on their action history */
export function getPreferredAgent(): AiAgentPersona {
  const memory = loadAiMemory();
  const agent = AI_AGENT_MAP.get(memory.preferredAgent);
  if (agent) return agent;
  // Infer from most-used actions
  const topAction = Object.entries(memory.frequentActions).sort((a, b) => b[1] - a[1])[0];
  if (topAction) {
    for (const agent of AI_AGENTS) {
      if (agent.allowedActions.includes(topAction[0])) return agent;
    }
  }
  return AI_AGENTS[0];
}

/** Get AI memory for display */
export function getAiMemory(): AiMemory {
  return loadAiMemory();
}

/** Set user's preferred agent */
export function setPreferredAgent(agentId: string) {
  const memory = loadAiMemory();
  memory.preferredAgent = agentId;
  saveAiMemory(memory);
}

/** Set custom instructions for AI */
export function setAiCustomInstructions(instructions: string) {
  const memory = loadAiMemory();
  memory.customInstructions = instructions;
  saveAiMemory(memory);
}

// ===== Intent Parsing → Action Execution =====

/**
 * Parse a user message to determine which AI action to execute.
 * Returns null if no actionable intent is detected.
 */
export function parseActionIntent(text: string): { actionId: string; params: Record<string, string> } | null {
  const t = text.toLowerCase();

  // Create task
  if (t.includes('创建任务') || t.includes('新建任务') || t.includes('添加任务')) {
    const title = text.replace(/^(帮我|请|帮我)?(创建|新建|添加)一个?任务/, '').trim() || '新任务';
    return { actionId: 'create_task', params: { title } };
  }

  // Create goal
  if (t.includes('创建目标') || t.includes('新建目标') || t.includes('添加目标')) {
    const title = text.replace(/^(帮我|请|帮我)?(创建|新建|添加)一个?目标/, '').trim() || '新目标';
    return { actionId: 'create_goal', params: { title } };
  }

  // Smart assign
  if (t.includes('智能分配') || t.includes('自动分配') || t.includes('推荐负责人')) {
    return { actionId: 'smart_assign', params: {} };
  }

  // Get overdue
  if (t.includes('逾期') || t.includes('过期') || t.includes('超期')) {
    return { actionId: 'get_overdue_tasks', params: {} };
  }

  // Get risk
  if (t.includes('风险') || t.includes('隐患') || t.includes('问题分析')) {
    return { actionId: 'get_risk_items', params: {} };
  }

  // Get team load
  if (t.includes('负载') || t.includes('工作量') || t.includes('忙闲')) {
    return { actionId: 'get_team_load', params: {} };
  }

  // Get goal progress
  if (t.includes('目标进度') || t.includes('进度概况') || t.includes('okr进展')) {
    return { actionId: 'get_goal_progress', params: {} };
  }

  // Auto complete goal
  if (t.includes('自动完成') || t.includes('完成目标')) {
    return { actionId: 'auto_complete_goal', params: {} };
  }

  // Update task status
  if (t.includes('完成') && t.includes('任务')) {
    return { actionId: 'update_task_status', params: { status: 'done' } };
  }

  // Update assignee
  if (t.includes('指派') || t.includes('分配给')) {
    return { actionId: 'update_task_assignee', params: {} };
  }

  return null;
}

/**
 * Execute a parsed AI action intent.
 * Returns the dispatch action (or error), and a human-readable result description.
 */
export function executeAiAction(
  actionId: string,
  params: Record<string, string>,
  state: AppState,
): { action: Action | AiAnalysisAction | { error: string } | null; description: string } {
  const aiAction = AI_ACTION_MAP.get(actionId);
  if (!aiAction) return { action: null, description: `未知操作: ${actionId}` };

  const result = aiAction.execute(state, params);
  recordAiAction(actionId);

  if (result && 'error' in result) {
    return { action: result, description: `操作失败: ${result.error}` };
  }

  // Generate human-readable description
  const descriptions: Record<string, string> = {
    create_task: `已创建任务「${params.title || '新任务'}」`,
    create_goal: `已创建目标「${params.title || '新目标'}」`,
    update_task_status: `已更新任务状态为「${params.status || 'done'}」`,
    update_task_priority: `已更新任务优先级为「${params.priority || 'B'}」`,
    update_task_assignee: `已更新任务负责人`,
    smart_assign: '已根据团队负载智能分配任务',
    get_overdue_tasks: '已查询逾期任务列表',
    get_risk_items: '已完成风险检测分析',
    get_team_load: '已生成团队负载报告',
    get_goal_progress: '已查询目标进度概况',
    auto_complete_goal: '已检查并完成满足条件的目标',
    batch_update_task_status: `已批量更新任务状态为「${params.status || 'done'}」`,
  };

  return {
    action: result,
    description: descriptions[actionId] || `已执行操作: ${aiAction.name}`,
  };
}
