/**
 * AI 团队能力向量模型 —— 基于任务历史构建成员能力画像
 * 对标 Skill2Vec + ClickUp Brain 团队分析
 *
 * 核心能力：
 * 1. 能力维度建模：从任务标签/类型/优先级推断成员能力向量
 * 2. 能力缺口识别：目标需求 vs 团队能力的差距
 * 3. 最佳匹配推荐：基于能力向量的人-任务匹配
 * 4. 能力成长追踪：历史能力变化趋势
 *
 * 双模式：
 * - 确定性计算（无需 LLM）：基于统计的能力向量推断
 * - LLM 深度分析：语义理解驱动的能力评估
 */
import type { AppState, Member, Goal, Project, Task } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { handleError } from '@/lib/errorHandler';

// ===== 类型 =====

/** 能力维度 */
export type CapabilityDimension =
  | 'planning' | 'execution' | 'review'
  | 'frontend' | 'backend' | 'design' | 'data' | 'ops'
  | 'leadership' | 'communication' | 'analysis'
  | 'testing' | 'documentation';

export const DIMENSION_LABELS: Record<CapabilityDimension, string> = {
  planning: '规划', execution: '执行', review: '复盘',
  frontend: '前端', backend: '后端', design: '设计', data: '数据', ops: '运维',
  leadership: '领导力', communication: '沟通', analysis: '分析',
  testing: '测试', documentation: '文档',
};

export interface CapabilityVector {
  /** 成员ID */
  memberId: string;
  /** 成员名称 */
  memberName: string;
  /** 角色标签 */
  role: string;
  /** 各维度得分 0-100 */
  dimensions: Record<CapabilityDimension, number>;
  /** 主要能力标签（得分>50的维度） */
  strengths: CapabilityDimension[];
  /** 能力缺口（得分<30的维度） */
  gaps: CapabilityDimension[];
  /** 经验指标（完成的任务数/项目数） */
  experience: { completedTasks: number; completedProjects: number; completedGoals: number };
  /** 负荷系数（当前活跃 vs 容量） */
  loadFactor: number;
  /** 综合能力评分 */
  overallScore: number;
}

export interface TeamCapabilityMap {
  /** 各成员能力向量 */
  members: CapabilityVector[];
  /** 团队能力热力图（各维度的平均分） */
  teamDimensions: Record<CapabilityDimension, number>;
  /** 团队优势维度 */
  teamStrengths: CapabilityDimension[];
  /** 团队能力缺口 */
  teamGaps: CapabilityDimension[];
  /** 能力集中度（高维度集中在少数人） */
  concentrationRisks: Array<{ dimension: CapabilityDimension; memberNames: string[] }>;
  /** 是否来自 LLM */
  fromLLM: boolean;
  /** 生成时间 */
  generatedAt: string;
}

// ===== 能力推断规则 =====

/** 标签 → 能力维度映射 */
const TAG_DIMENSION_MAP: Record<string, CapabilityDimension[]> = {
  '规划': ['planning'], '设计': ['design', 'planning'], '执行': ['execution'],
  '检查': ['review'], '交付': ['execution'], '跟踪': ['execution', 'communication'],
  '前端': ['frontend'], '后端': ['backend'], 'UI': ['design', 'frontend'],
  'UX': ['design'], 'API': ['backend'], '数据库': ['data', 'backend'],
  '运维': ['ops'], '部署': ['ops'], '测试': ['testing'],
  '文档': ['documentation'], '分析': ['analysis', 'data'],
  '安全': ['ops', 'backend'], '性能': ['backend', 'ops'],
  '重构': ['backend', 'frontend'], '修复': ['execution', 'testing'],
  '需求': ['analysis', 'communication'], '评审': ['review', 'analysis'],
  '沟通': ['communication'], '管理': ['leadership', 'planning'],
  '领导': ['leadership'], '复盘': ['review', 'analysis'],
  '数据': ['data'], 'BI': ['data', 'analysis'],
};

/** 任务优先级 → 执行力加成 */
const PRIORITY_EXECUTION_BONUS: Record<string, number> = {
  urgent: 8, high: 5, medium: 2, low: 0,
};

/** 角色默认能力基线 */
const ROLE_BASELINE: Record<string, Partial<Record<CapabilityDimension, number>>> = {
  admin: { leadership: 50, planning: 40, communication: 40, analysis: 30 },
  manager: { leadership: 40, planning: 40, communication: 35, execution: 25, review: 20 },
  leader: { leadership: 30, execution: 35, communication: 25, planning: 25 },
  member: { execution: 30, communication: 15, planning: 10 },
};

// ===== 确定性能力向量计算 =====

/** 从任务集合推断成员能力得分 */
function inferDimensions(memberTasks: Task[], role: string): Record<CapabilityDimension, number> {
  const dims: Record<CapabilityDimension, number> = {
    planning: 0, execution: 0, review: 0,
    frontend: 0, backend: 0, design: 0, data: 0, ops: 0,
    leadership: 0, communication: 0, analysis: 0,
    testing: 0, documentation: 0,
  };

  const baseline = ROLE_BASELINE[role] || ROLE_BASELINE.member || {};
  for (const [dim, score] of Object.entries(baseline)) {
    dims[dim as CapabilityDimension] = Math.max(dims[dim as CapabilityDimension], score);
  }

  for (const task of memberTasks) {
    const tags = task.tags ?? [];

    // 标签驱动的维度加分
    for (const tag of tags) {
      const mappedDims = TAG_DIMENSION_MAP[tag];
      if (mappedDims) {
        for (const dim of mappedDims) {
          dims[dim] += task.status === 'done' ? 5 : 3;
        }
      }
    }

    // 通用维度推断
    if (task.status === 'done') {
      dims.execution += 3;
      dims[PRIORITY_EXECUTION_BONUS[task.priority] !== undefined ? 'execution' : 'execution'] += PRIORITY_EXECUTION_BONUS[task.priority] || 0;
    }

    // 标题关键词推断
    const title = task.title.toLowerCase();
    if (/规划|计划|方案|设计|架构/.test(title)) dims.planning += 4;
    if (/评审|检查|复盘|回顾/.test(title)) dims.review += 4;
    if (/测试|验证|QA/.test(title)) dims.testing += 4;
    if (/文档|说明|readme/.test(title)) dims.documentation += 4;
    if (/前端|页面|组件|UI/.test(title)) dims.frontend += 4;
    if (/后端|接口|API|服务/.test(title)) dims.backend += 4;
    if (/数据|报表|分析|BI/.test(title)) dims.data += 4;
    if (/运维|部署|监控|CI/.test(title)) dims.ops += 4;
    if (/沟通|协调|对接|同步/.test(title)) dims.communication += 4;
    if (/管理|分配|跟踪|推进/.test(title)) dims.leadership += 3;

    // 多支持者 → 沟通力
    if ((task.supporterIds ?? []).length > 1) dims.communication += 2;
  }

  // 截断到 0-100
  for (const key of Object.keys(dims) as CapabilityDimension[]) {
    dims[key] = Math.min(100, Math.max(0, Math.round(dims[key])));
  }

  return dims;
}

/** 计算成员能力向量 */
function buildMemberCapability(member: Member, state: AppState, ctx: AIProjectContext): CapabilityVector {
  const memberTasks = state.tasks.filter(t => t.leaderId === member.id || (t.supporterIds ?? []).includes(member.id));
  const completedTasks = memberTasks.filter(t => t.status === 'done');
  const activeTasks = memberTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');

  const memberGoals = state.goals.filter(g => g.leaderId === member.id);
  const memberProjects = state.projects.filter(p => p.leaderId === member.id);

  const dimensions = inferDimensions(memberTasks, member.role);

  // 领导力加成：如果负责目标和项目
  if (memberGoals.length > 0) dimensions.leadership = Math.min(100, dimensions.leadership + memberGoals.length * 5);
  if (memberProjects.length > 0) dimensions.leadership = Math.min(100, dimensions.leadership + memberProjects.length * 3);

  const strengths = (Object.keys(dimensions) as CapabilityDimension[]).filter(d => dimensions[d] >= 50).sort((a, b) => dimensions[b] - dimensions[a]);
  const gaps = (Object.keys(dimensions) as CapabilityDimension[]).filter(d => dimensions[d] < 15 && dimensions[d] > 0);

  // 容量估算：基于历史完成速率
  const avgTaskDays = completedTasks.length > 0 ? 3 : 5; // 简化：无历史则默认5天/任务
  const capacity = Math.floor(22 / avgTaskDays); // 月容量
  const loadFactor = capacity > 0 ? Math.round(activeTasks.length / capacity * 100) : 0;

  // 综合评分：加权各维度
  const dimValues = Object.values(dimensions);
  const overallScore = Math.round(dimValues.reduce((s, v) => s + v, 0) / dimValues.length);

  return {
    memberId: member.id, memberName: member.name || member.nickname, role: member.role,
    dimensions, strengths, gaps,
    experience: {
      completedTasks: completedTasks.length,
      completedProjects: memberProjects.filter(p => p.status === 'done').length,
      completedGoals: memberGoals.filter(g => g.status === 'done').length,
    },
    loadFactor, overallScore,
  };
}

/** 计算团队能力热力图 */
function computeTeamDimensionAvg(members: CapabilityVector[]): Record<CapabilityDimension, number> {
  const dims: Record<CapabilityDimension, number> = {
    planning: 0, execution: 0, review: 0,
    frontend: 0, backend: 0, design: 0, data: 0, ops: 0,
    leadership: 0, communication: 0, analysis: 0,
    testing: 0, documentation: 0,
  };
  if (members.length === 0) return dims;

  for (const dim of Object.keys(dims) as CapabilityDimension[]) {
    dims[dim] = Math.round(members.reduce((s, m) => s + m.dimensions[dim], 0) / members.length);
  }
  return dims;
}

/** 识别能力集中度风险（某维度只1-2人有高分） */
function identifyConcentrationRisks(members: CapabilityVector[]): Array<{ dimension: CapabilityDimension; memberNames: string[] }> {
  const risks: Array<{ dimension: CapabilityDimension; memberNames: string[] }> = [];
  const allDims = Object.keys(DIMENSION_LABELS) as CapabilityDimension[];

  for (const dim of allDims) {
    const highScorers = members.filter(m => m.dimensions[dim] >= 50);
    if (highScorers.length > 0 && highScorers.length <= 2) {
      risks.push({ dimension: dim, memberNames: highScorers.map(m => m.memberName) });
    }
  }
  return risks;
}

/** 确定性团队能力建模主函数 */
export function buildTeamCapabilityLocal(state: AppState): TeamCapabilityMap {
  const ctx = buildAIContext(state);
  const activeMembers = state.members.filter(m => m.status === 'active');

  const members = activeMembers.map(m => buildMemberCapability(m, state, ctx));
  const teamDimensions = computeTeamDimensionAvg(members);
  const teamStrengths = (Object.keys(teamDimensions) as CapabilityDimension[]).filter(d => teamDimensions[d] >= 40).sort((a, b) => teamDimensions[b] - teamDimensions[a]);
  const teamGaps = (Object.keys(teamDimensions) as CapabilityDimension[]).filter(d => teamDimensions[d] < 15).sort((a, b) => teamDimensions[a] - teamDimensions[b]);
  const concentrationRisks = identifyConcentrationRisks(members);

  return {
    members, teamDimensions, teamStrengths, teamGaps,
    concentrationRisks, fromLLM: false,
    generatedAt: new Date().toISOString(),
  };
}

// ===== LLM 深度能力评估 =====

function buildCapabilityPrompt(ctx: AIProjectContext, localResult: TeamCapabilityMap): string {
  const memberSummaries = localResult.members.slice(0, 8).map(m =>
    `- ${m.memberName}(${m.role}): 强项[${m.strengths.slice(0, 3).map(s => DIMENSION_LABELS[s]).join(',')}] 缺口[${m.gaps.slice(0, 2).map(g => DIMENSION_LABELS[g]).join(',')}] 经验${m.experience.completedTasks}任务 负荷${m.loadFactor}%`
  ).join('\n');

  const concentrationInfo = localResult.concentrationRisks.slice(0, 5).map(r =>
    `- ${DIMENSION_LABELS[r.dimension]}能力集中在: ${r.memberNames.join(', ')}`
  ).join('\n');

  return `你是团队能力评估专家。基于统计数据和团队上下文，进行深度能力评估。

## 团队概况
- 成员数: ${ctx.memberCount}
- 活跃目标/项目/任务: ${ctx.items.filter(i => i.type === 'goal' && i.status !== 'done').length}/${ctx.items.filter(i => i.type === 'project' && i.status !== 'done').length}/${ctx.items.filter(i => i.type === 'task' && i.status !== 'done').length}

## 确定性能力评估
${memberSummaries}

## 能力集中度风险
${concentrationInfo || '无'}

## 团队优势/缺口
- 优势: ${localResult.teamStrengths.slice(0, 3).map(s => DIMENSION_LABELS[s]).join('、')}
- 缺口: ${localResult.teamGaps.slice(0, 3).map(g => DIMENSION_LABELS[g]).join('、') || '无'}

## 请深度分析
1. 统计推断可能遗漏的隐性能力（如跨领域、创新、学习者特征）
2. 能力组合的协同效应（谁和谁搭配效果好）
3. 能力短板的补全建议（培训/招聘/调配）
4. 能力集中度风险的缓解策略

## 输出格式（严格 JSON）
{"members":[{"memberId":"","memberName":"","hiddenstrengths":["能力1"],"collaborationSynergy":{"withMemberId":"","reason":""}}],"teamInsights":{"synergies":[{"pair":"A+B","reason":""}],"trainingRecommendations":[{"dimension":"","priority":"","suggestion":""}],"concentrationMitigations":[{"dimension":"","action":""}]},"overallAssessment":"整体评估"}`;
}

export async function buildTeamCapabilityDeep(state: AppState): Promise<TeamCapabilityMap> {
  const localResult = buildTeamCapabilityLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return localResult;

  try {
    const ctx = buildAIContext(state);
    const prompt = buildCapabilityPrompt(ctx, localResult);
    const raw = await callLLM(prompt, config);
    if (!raw) return localResult;

    let parsed: { members?: Array<{ memberId?: string; memberName?: string; hiddenstrengths?: unknown[] }> } | null = null;
    try { parsed = JSON.parse(raw); } catch (e) { handleError(e, { module: 'aiTeamCapability', operation: 'PARSE_LLM_JSON', severity: 'warn' });
      const match = raw.match(/\{[\s\S]*"members"[\s\S]*\}/);
      if (match) try { parsed = JSON.parse(match[0]); } catch (e2) { handleError(e2, { module: 'aiTeamCapability', operation: 'PARSE_LLM_JSON_FALLBACK', severity: 'warn' }); }
    }
    if (!parsed) return localResult;

    // LLM 补充的隐性能力融入成员向量
    if (Array.isArray(parsed.members)) {
      for (const llmM of parsed.members) {
        const member = localResult.members.find(m => m.memberId === llmM.memberId || m.memberName === llmM.memberName);
        if (member && Array.isArray(llmM.hiddenstrengths)) {
          // 隐性能力映射到现有维度（模糊匹配）
          for (const hs of llmM.hiddenstrengths) {
            const hsLower = String(hs).toLowerCase();
            for (const [dim, label] of Object.entries(DIMENSION_LABELS)) {
              if (hsLower.includes(label.toLowerCase()) || label.includes(hs)) {
                member.dimensions[dim as CapabilityDimension] = Math.min(100, member.dimensions[dim as CapabilityDimension] + 10);
              }
            }
          }
          // 重新计算优势和缺口
          member.strengths = (Object.keys(member.dimensions) as CapabilityDimension[]).filter(d => member.dimensions[d] >= 50).sort((a, b) => member.dimensions[b] - member.dimensions[a]);
          member.gaps = (Object.keys(member.dimensions) as CapabilityDimension[]).filter(d => member.dimensions[d] < 15 && member.dimensions[d] > 0);
        }
      }
    }

    // 重新计算团队维度
    localResult.teamDimensions = computeTeamDimensionAvg(localResult.members);
    localResult.teamStrengths = (Object.keys(localResult.teamDimensions) as CapabilityDimension[]).filter(d => localResult.teamDimensions[d] >= 40).sort((a, b) => localResult.teamDimensions[b] - localResult.teamDimensions[a]);
    localResult.teamGaps = (Object.keys(localResult.teamDimensions) as CapabilityDimension[]).filter(d => localResult.teamDimensions[d] < 15).sort((a, b) => localResult.teamDimensions[a] - localResult.teamDimensions[b]);
    localResult.concentrationRisks = identifyConcentrationRisks(localResult.members);
    localResult.fromLLM = true;

    return localResult;
  } catch {
    return localResult;
  }
}
