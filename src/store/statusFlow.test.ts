import { describe, it, expect } from 'vitest';
import type { AppState, StatusFlowRule } from '@/types';

// Import the real function
import { validateStatusFlow } from './shared';

function makeRule(from: string, to: string, itemType = 'task', enabled = true): StatusFlowRule {
  return {
    id: `rule_${from}_${to}`,
    name: `${from}→${to}`,
    fromStatus: from,
    toStatus: to,
    itemType,
    enabled,
    autoActions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeState(rules: StatusFlowRule[], role = 'admin'): AppState {
  return {
    statusFlowRules: rules,
    currentUser: { id: 'u1', name: 'Admin', role, phone: '', status: 'active' },
    goals: [], projects: [], tasks: [], members: [], notifications: [],
    activities: [], itemLinks: [], categories: [], templates: [],
    scheduleEvents: [], notes: [], reviews: [], comments: [], tags: [],
    bookmarks: [], savedViews: [], sprints: [], knowledge: [],
    installedAgents: [],
  } as unknown as AppState;
}

describe('validateStatusFlow', () => {
  it('允许已启用规则的状态转换', () => {
    const state = makeState([makeRule('todo', 'in_progress'), makeRule('in_progress', 'done')]);
    const result = validateStatusFlow(state, 't1', 'task', 'todo', 'in_progress');
    expect(result.allowed).toBe(true);
  });

  it('无匹配规则时默认允许（admin角色）', () => {
    const state = makeState([makeRule('todo', 'in_progress')]);
    // No rule for todo→done, but admin bypasses
    const result = validateStatusFlow(state, 't1', 'task', 'todo', 'done');
    // admin没有匹配规则时返回allowed: true (default behavior when rule not found)
    expect(result.allowed).toBe(true);
  });

  it('相同from和to状态直接允许', () => {
    const state = makeState([]);
    const result = validateStatusFlow(state, 't1', 'task', 'todo', 'todo');
    expect(result.allowed).toBe(true);
  });

  it('空规则时admin仍可操作', () => {
    const state = makeState([]);
    const result = validateStatusFlow(state, 't1', 'task', 'todo', 'in_progress');
    // 无规则时默认允许（向后兼容）
    expect(result.allowed).toBe(true);
  });

  it('member角色受规则限制', () => {
    const state = makeState([makeRule('todo', 'in_progress')], 'member');
    const result = validateStatusFlow(state, 't1', 'task', 'todo', 'in_progress');
    // member + enabled rule → depends on allowedRoles (none set = all allowed)
    expect(result.allowed).toBe(true);
  });
});
