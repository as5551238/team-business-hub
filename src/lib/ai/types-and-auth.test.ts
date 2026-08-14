/**
 * AI 类型 + 成本路由 + 认证桥 — 纯函数单元测试
 * 覆盖：detectTaskComplexity / hasPermission / matchCondition / mapLegacyPermission
 *       + authBridge 三种登录方式的格式校验与状态流转
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { detectTaskComplexity } from '@/lib/ai/types';
import { hasPermission, matchCondition, mapLegacyPermission } from '@/store/shared';
import { wechatOAuthLogin, phoneOtpLogin, emailMagicLink, setAuthState, getAuthState } from '@/lib/authBridge';
import type { Member } from '@/types';
import type { Permission } from '@/types';

// ===== detectTaskComplexity =====
describe('detectTaskComplexity', () => {
  it('含复杂关键词返回 complex', () => {
    expect(detectTaskComplexity('请帮我做架构设计')).toBe('complex');
    expect(detectTaskComplexity('安全评审报告')).toBe('complex');
    expect(detectTaskComplexity('system strategy analysis')).toBe('complex');
  });

  it('含中等关键词返回 moderate', () => {
    expect(detectTaskComplexity('请分析这个数据')).toBe('moderate');
    expect(detectTaskComplexity('改进建议')).toBe('moderate');
    expect(detectTaskComplexity('风险评估')).toBe('moderate');
  });

  it('简单 prompt 返回 simple', () => {
    expect(detectTaskComplexity('你好')).toBe('simple');
    expect(detectTaskComplexity('格式化这个文本')).toBe('simple');
    expect(detectTaskComplexity('')).toBe('simple');
  });

  it('复杂优先于中等（当两者都匹配时）', () => {
    // "安全分析" 同时包含 complex 词 "安全" 和 moderate 词 "分析"
    expect(detectTaskComplexity('安全分析')).toBe('complex');
  });

  it('大小写不敏感', () => {
    expect(detectTaskComplexity('ARCHITECTURE review')).toBe('complex');
    expect(detectTaskComplexity('Performance 分析')).toBe('moderate');
  });
});

// ===== hasPermission =====
function makeState(memberOverrides: Record<string, any> = {}) {
  return {
    members: [{ id: 'u1', name: 'Admin', role: 'admin', status: 'active', ...memberOverrides }],
    teamMembers: [],
    currentTeamId: 't1',
    currentUser: { id: 'u1', role: 'admin' },
  } as any;
}

describe('hasPermission', () => {
  it('admin 角色直通所有权限', () => {
    const state = makeState();
    expect(hasPermission(state, 'u1', 'goals_view' as Permission)).toBe(true);
    expect(hasPermission(state, 'u1', 'settings_manage' as Permission)).toBe(true);
  });

  it('member 角色应受限', () => {
    const state = makeState({ role: 'member' });
    expect(hasPermission(state, 'u1', 'goals_view' as Permission)).toBe(true);
    expect(hasPermission(state, 'u1', 'settings_manage' as Permission)).toBe(false);
  });

  it('不存在的成员返回 false', () => {
    const state = makeState();
    expect(hasPermission(state, 'nonexistent', 'goals_view' as Permission)).toBe(false);
  });

  it('custom permissions with deny_all 应拦截', () => {
    const state = {
      members: [{ id: 'u2', name: 'Restricted', role: 'member', status: 'active' }],
      teamMembers: [{ memberId: 'u2', teamId: 't1', permissions: ['deny_all'] }],
      currentTeamId: 't1',
      currentUser: { id: 'u2', role: 'member' },
    } as any;
    expect(hasPermission(state, 'u2', 'goals_view' as Permission)).toBe(false);
  });

  it('custom permissions 应覆盖角色默认值', () => {
    const state = {
      members: [{ id: 'u2', name: 'Custom', role: 'member', status: 'active' }],
      teamMembers: [{ memberId: 'u2', teamId: 't1', permissions: ['goals_view'] }],
      currentTeamId: 't1',
      currentUser: { id: 'u2', role: 'member' },
    } as any;
    expect(hasPermission(state, 'u2', 'goals_view' as Permission)).toBe(true);
    // 其他权限不在 custom list 中 → false
    expect(hasPermission(state, 'u2', 'tasks_delete' as Permission)).toBe(false);
  });
});

// ===== matchCondition =====
describe('matchCondition', () => {
  it('eq 精确匹配', () => {
    expect(matchCondition('eq', 'done', 'done')).toBe(true);
    expect(matchCondition('eq', 'done', 'todo')).toBe(false);
  });

  it('neq 不等匹配', () => {
    expect(matchCondition('neq', 'done', 'todo')).toBe(true);
    expect(matchCondition('neq', 'done', 'done')).toBe(false);
  });

  it('contains 包含匹配', () => {
    expect(matchCondition('contains', '前端开发任务', '前端')).toBe(true);
    expect(matchCondition('contains', '后端开发', '前端')).toBe(false);
  });

  it('empty 空值检测', () => {
    expect(matchCondition('empty', null, '')).toBe(true);
    expect(matchCondition('empty', '', '')).toBe(true);
    expect(matchCondition('empty', [], '')).toBe(true);
    expect(matchCondition('empty', 'value', '')).toBe(false);
  });

  it('not_empty 非空值检测', () => {
    expect(matchCondition('not_empty', 'value', '')).toBe(true);
    expect(matchCondition('not_empty', null, '')).toBe(false);
  });

  it('gt/lt 数值比较', () => {
    expect(matchCondition('gt', 10, '5')).toBe(true);
    expect(matchCondition('gt', 3, '5')).toBe(false);
    expect(matchCondition('lt', 3, '5')).toBe(true);
    expect(matchCondition('lt', 10, '5')).toBe(false);
  });

  it('未知操作符返回 false', () => {
    expect(matchCondition('unknown', 'x', 'y')).toBe(false);
  });
});

// ===== mapLegacyPermission =====
describe('mapLegacyPermission', () => {
  it('旧权限名映射正确', () => {
    expect(mapLegacyPermission('view_goals')).toBe('goals_view');
    expect(mapLegacyPermission('edit_goals')).toBe('goals_edit');
    expect(mapLegacyPermission('manage_team')).toBe('team_manage');
  });

  it('未知旧名返回 null', () => {
    expect(mapLegacyPermission('nonexistent')).toBeNull();
  });
});

// ===== authBridge =====
describe('authBridge', () => {
  const testMembers: Partial<Member>[] = [
    { id: 'm1', name: 'A', wechatId: 'wx_123', phone: '18612345678', email: 'a@test.com', role: 'admin', status: 'active' } as Partial<Member>,
  ];

  beforeEach(() => {
    setAuthState('idle');
  });

  it('微信登录：找到匹配返回 member id', async () => {
    const result = await wechatOAuthLogin('wx_123', testMembers as Member[]);
    expect(result).toBe('m1');
    expect(getAuthState()).toBe('authenticated');
  });

  it('微信登录：未找到返回 null', async () => {
    const result = await wechatOAuthLogin('wx_unknown', testMembers as Member[]);
    expect(result).toBeNull();
    expect(getAuthState()).toBe('error');
  });

  it('手机 OTP 登录：格式校验', async () => {
    // 无效手机号
    const bad1 = await phoneOtpLogin('123', '123456', testMembers as Member[]);
    expect(bad1).toBeNull();
    // 无效 OTP
    const bad2 = await phoneOtpLogin('18612345678', '12', testMembers as Member[]);
    expect(bad2).toBeNull();
  });

  it('手机 OTP 登录：有效凭据成功', async () => {
    const result = await phoneOtpLogin('18612345678', '123456', testMembers as Member[]);
    expect(result).toBe('m1');
    expect(getAuthState()).toBe('authenticated');
  });

  it('邮箱魔法链接：格式校验', async () => {
    const bad = await emailMagicLink('not-an-email', testMembers as Member[]);
    expect(bad).toBeNull();
  });

  it('邮箱魔法链接：有效邮箱成功', async () => {
    const result = await emailMagicLink('a@test.com', testMembers as Member[]);
    expect(result).toBe('m1');
    expect(getAuthState()).toBe('authenticated');
  });

  it('auth state 正确流转', () => {
    setAuthState('authenticating');
    expect(getAuthState()).toBe('authenticating');
    setAuthState('error');
    expect(getAuthState()).toBe('error');
  });
});
