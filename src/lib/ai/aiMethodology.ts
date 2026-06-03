/**
 * AI 方法论推荐引擎 —— 基于团队现状智能推荐管理方法论
 * 对标飞书 OKR 助手 + ClickUp Brain 流程优化建议
 *
 * 核心能力：
 * 1. 团队管理模式诊断 → 识别当前痛点和模式
 * 2. 方法论适配推荐 → OKR/PDCA/Scrum/Kanban/敏捷等
 * 3. 执行路径建议 → 如何落地推荐的方法论
 * 4. 个性化调整 → 基于团队规模、行业、阶段的定制化
 *
 * 双模式：
 * - 确定性推荐（无需 LLM）：基于规则的模式匹配和建议
 * - LLM 深度推荐：语义理解驱动的综合方法论推荐
 */
import type { AppState } from '@/types';
import { callLLM } from './llmService';
import { loadAIConfig } from './types';
import { buildAIContext, type AIProjectContext } from './aiContextEngine';
import { handleError } from '@/lib/errorHandler';

// ===== 类型 =====

export type MethodologyId = 'okr' | 'pdca' | 'scrum' | 'kanban' | 'agile' | 'waterfall' | 'lean' | 'six_sigma';

export interface MethodologyStep {
  step: number;
  title: string;
  description: string;
 /** 预估执行天数 */
  estimatedDays: number;
  /** 关键成功因素 */
  successCriteria: string[];
}

export interface MethodologyRecommendation {
  /** 方法论ID */
  id: MethodologyId;
  /** 方法论名称 */
  name: string;
  /** 适配度 0-100 */
  fitnessScore: number;
  /** 推荐理由 */
  reason: string;
  /** 预期收益 */
  expectedBenefits: string[];
  /** 适用条件 */
  applicableWhen: string[];
  /** 不适用条件 */
  notApplicableWhen: string[];
  /** 执行步骤 */
  steps: MethodologyStep[];
  /** 需要的工具/资源 */
  requirements: string[];
  /** 与当前团队的适配度标签 */
  fitTags: string[];
}

export interface TeamPattern {
  /** 团队规模类别 */
  sizeCategory: 'micro' | 'small' | 'medium' | 'large';
  /** 平均目标数/人 */
  goalsPerMember: number;
  /** 平均任务数/人 */
  tasksPerMember: number;
  /** 逾期率 */
  overdueRate: number;
  /** 阻塞率 */
  blockedRate: number;
  /** KR偏移率 */
  krOffTrackRate: number;
  /** 协作密度（跨人协作项目占比） */
  collaborationDensity: number;
  /** 进度方差（大=执行不一致） */
  progressVariance: number;
  /** 负载均衡度 0-100（100=完全均衡） */
  loadBalance: number;
  /** 诊断标签 */
  diagnosisTags: string[];
}

export interface MethodologyResult {
  /** 团队模式诊断 */
  teamPattern: TeamPattern;
  /** 推荐列表（按适配度排序） */
  recommendations: MethodologyRecommendation[];
  /** 核心痛点 */
  painPoints: string[];
  /** 是否来自 LLM */
  fromLLM: boolean;
  /** 生成时间 */
  generatedAt: string;
}

interface LLMMethodologyResponse {
  recommendations?: Array<{ id?: string; name?: string; fitnessScore?: number; reason?: string; expectedBenefits?: string[]; applicableWhen?: string[]; notApplicableWhen?: string[]; steps?: Array<{ title?: string; description?: string; estimatedDays?: number; successCriteria?: string[] }>; requirements?: string[]; fitTags?: string[] }>;
  painPoints?: string[];
  [key: string]: unknown;
}

// ===== 方法论知识库 =====

const METHODOLOGY_DB: Array<{
  id: MethodologyId;
  name: string;
  description: string;
  fitConditions: Array<{ tag: string; weight: number }>;
  unfitConditions: string[];
  benefits: string[];
  steps: Array<{ title: string; description: string; days: number; criteria: string[] }>;
  requirements: string[];
}> = [
  {
    id: 'okr',
    name: 'OKR 目标与关键结果',
    description: '通过目标(O)和可量化的关键结果(KR)驱动团队聚焦',
    fitConditions: [
      { tag: '目标多且分散', weight: 30 },
      { tag: 'KR偏移', weight: 35 },
      { tag: '缺少量化', weight: 25 },
      { tag: '跨目标协作', weight: 15 },
    ],
    unfitConditions: ['任务极细碎', '纯执行型团队'],
    benefits: ['聚焦核心目标', '量化成果可追踪', '促进跨团队对齐', '周期性复盘校正'],
    steps: [
      { title: '制定季度OKR', description: '团队共创3-5个Objective，每个O配2-5个KR', days: 3, criteria: ['每个KR可量化', 'O激励人心', 'KR有挑战但可达'] },
      { title: 'OKR对齐与承诺', description: '上下左右对齐，确保团队目标一致', days: 2, criteria: ['与上级O对齐', '跨组依赖已确认', '全员理解承诺'] },
      { title: '周度Check-in', description: '每周更新KR进度，标记信心指数', days: 0, criteria: ['每周更新', '信心指数标注', '阻塞项上报'] },
      { title: '月中调整', description: '根据进展调整KR或执行策略', days: 1, criteria: ['偏移KR已识别', '调整方案已确认'] },
      { title: '季度复盘评分', description: '评分0-1，总结经验教训', days: 1, criteria: ['每个KR已评分', '经验教训已记录', '下季度OKR方向已明确'] },
    ],
    requirements: ['目标管理模块支持KR', '定期回顾机制', '团队OKR文化'],
  },
  {
    id: 'pdca',
    name: 'PDCA 戴明环',
    description: '计划→执行→检查→行动的持续改进循环',
    fitConditions: [
      { tag: '进度停滞', weight: 25 },
      { tag: '缺少可量化', weight: 20 },
      { tag: '执行不一致', weight: 30 },
      { tag: '逾期率高', weight: 20 },
    ],
    unfitConditions: ['创新探索型', '需求极不稳定'],
    benefits: ['结构化改进流程', '问题驱动的持续优化', '数据支撑决策', '每次循环都有提升'],
    steps: [
      { title: 'Plan-计划', description: '明确改进目标、指标和方案', days: 2, criteria: ['目标清晰', '指标可测量', '方案可执行'] },
      { title: 'Do-执行', description: '按计划实施，记录过程数据', days: 7, criteria: ['按计划执行', '过程数据完整', '异常已记录'] },
      { title: 'Check-检查', description: '对比结果与目标，分析偏差原因', days: 1, criteria: ['偏差已量化', '根因已分析', '有效措施已识别'] },
      { title: 'Act-行动', description: '标准化成功经验，改进不足之处', days: 2, criteria: ['成功经验已标准化', '改进措施已纳入下轮', '团队已共识'] },
    ],
    requirements: ['数据收集能力', '定期检查机制', '改进文化'],
  },
  {
    id: 'scrum',
    name: 'Scrum 敏捷框架',
    description: '以Sprint为迭代周期，通过每日站会和迭代评审驱动交付',
    fitConditions: [
      { tag: '小团队', weight: 20 },
      { tag: '执行不一致', weight: 25 },
      { tag: '进度停滞', weight: 20 },
      { tag: '逾期率高', weight: 20 },
    ],
    unfitConditions: ['项目周期极长', '需求完全确定不动', '纯运营团队'],
    benefits: ['快速迭代反馈', '每日同步阻塞', 'Sprint目标聚焦', '透明化进度'],
    steps: [
      { title: 'Sprint规划', description: '选择Sprint目标，拆解Sprint Backlog', days: 1, criteria: ['Sprint目标明确', 'Backlog已估算', '团队承诺'] },
      { title: '每日站会', description: '15分钟同步：做了什么/做什么/阻塞', days: 0, criteria: ['每日准时', '阻塞即时暴露', '会后跟进'] },
      { title: 'Sprint执行', description: '按Backlog交付，持续集成', days: 10, criteria: ['每日有进展', '阻塞及时解决', '质量门禁通过'] },
      { title: 'Sprint评审', description: '演示成果，收集反馈', days: 1, criteria: ['成果可演示', '反馈已记录', 'Product Backlog已更新'] },
      { title: 'Sprint回顾', description: '团队自省，识别改进项', days: 1, criteria: ['改进项可执行', '下Sprint纳入', '团队参与度>80%'] },
    ],
    requirements: ['迭代管理模块', '站会纪律', 'Product Owner角色'],
  },
  {
    id: 'kanban',
    name: '看板方法',
    description: '可视化工作流，限制WIP，通过拉动式推进优化流程',
    fitConditions: [
      { tag: '负载不均衡', weight: 35 },
      { tag: '任务多且杂', weight: 25 },
      { tag: '瓶颈不明', weight: 25 },
      { tag: '执行不一致', weight: 15 },
    ],
    unfitConditions: ['项目制强交付', '需求固定不变'],
    benefits: ['瓶颈可视化', 'WIP限制减少并行', '流转效率可度量', '渐进式改进'],
    steps: [
      { title: '绘制价值流', description: '定义工作流阶段和列', days: 1, criteria: ['阶段定义清晰', '流转规则明确'] },
      { title: '设置WIP限制', description: '每列设置在制品上限', days: 1, criteria: ['WIP数合理', '团队已共识'] },
      { title: '管理流动', description: '拉动式推进，监控累积流图', days: 0, criteria: ['每日流动', '阻塞预警', '前置时间监控'] },
      { title: '反馈环', description: '每日站会+每周回顾+每月改进', days: 0, criteria: ['三个反馈环运行', '每次有改进动作'] },
      { title: '实验性改进', description: '基于数据持续优化', days: 0, criteria: ['改进假设→验证→标准化'] },
    ],
    requirements: ['看板视图', 'WIP限制功能', '累积流图'],
  },
  {
    id: 'lean',
    name: '精益管理',
    description: '消除浪费，最大化价值流动，持续改进',
    fitConditions: [
      { tag: '负载不均衡', weight: 30 },
      { tag: '逾期率高', weight: 25 },
      { tag: '任务多且杂', weight: 20 },
      { tag: '瓶颈不明', weight: 25 },
    ],
    unfitConditions: ['创新探索期', '资源充足无压力'],
    benefits: ['消除浪费提升效率', '聚焦价值创造', '流程持续优化', '减少不必要工作'],
    steps: [
      { title: '价值流映射', description: '识别所有流程步骤，区分增值和非增值', days: 2, criteria: ['全流程已映射', '浪费已标注'] },
      { title: '消除浪费', description: '消除等待、过度处理、返工等7种浪费', days: 5, criteria: ['浪费类型已识别', '消除方案已执行'] },
      { title: '建立拉动', description: '按需启动工作，避免推式堆积', days: 3, criteria: ['拉动信号明确', 'WIP限制生效'] },
      { title: '追求完美', description: '持续改善（Kaizen），永不满足', days: 0, criteria: ['改善提案机制', '每周至少一个改善'] },
    ],
    requirements: ['流程可视化', '浪费识别能力', '改善文化'],
  },
];

// ===== 确定性方法论推荐 =====

/** 诊断团队模式 */
function diagnoseTeamPattern(ctx: AIProjectContext): TeamPattern {
  const activeMembers = ctx.memberLoads.filter(m => m.activeItems > 0);
  const memberCount = Math.max(activeMembers.length, 1);

  const sizeCategory: TeamPattern['sizeCategory'] = memberCount <= 3 ? 'micro' : memberCount <= 7 ? 'small' : memberCount <= 15 ? 'medium' : 'large';

  const activeItems = ctx.items.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const activeGoals = activeItems.filter(i => i.type === 'goal');
  const tasks = activeItems.filter(i => i.type === 'task');

  const goalsPerMember = activeGoals.length / memberCount;
  const tasksPerMember = tasks.length / memberCount;

  const overdueRate = activeItems.length > 0 ? activeItems.filter(i => i.isOverdue).length / activeItems.length : 0;
  const blockedRate = activeItems.length > 0 ? activeItems.filter(i => i.blockedByCount > 0).length / activeItems.length : 0;

  // KR偏移率
  let totalKR = 0;
  let offTrackKR = 0;
  for (const g of activeGoals) {
    if (g.keyResults) {
      totalKR += g.keyResults.length;
      offTrackKR += g.keyResults.filter(kr => kr.pct < 50).length;
    }
  }
  const krOffTrackRate = totalKR > 0 ? offTrackKR / totalKR : 0;

  // 协作密度：有多人参与的项目占比
  const goalsWithSupporters = activeGoals.filter(g => g.supporterNames.length > 0).length;
  const collaborationDensity = activeGoals.length > 0 ? goalsWithSupporters / activeGoals.length : 0;

  // 进度方差
  const progressValues = activeItems.map(i => i.progress);
  const avgProgress = progressValues.length > 0 ? progressValues.reduce((a, b) => a + b, 0) / progressValues.length : 0;
  const progressVariance = progressValues.length > 0
    ? Math.sqrt(progressValues.reduce((s, p) => s + (p - avgProgress) ** 2, 0) / progressValues.length)
    : 0;

  // 负载均衡度
  const loads = activeMembers.map(m => m.activeItems);
  const avgLoad = loads.length > 0 ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
  const loadStdDev = loads.length > 0
    ? Math.sqrt(loads.reduce((s, l) => s + (l - avgLoad) ** 2, 0) / loads.length)
    : 0;
  const loadBalance = avgLoad > 0 ? Math.max(0, Math.round(100 - (loadStdDev / avgLoad) * 100)) : 100;

  // 诊断标签
  const diagnosisTags: string[] = [];
  if (overdueRate > 0.3) diagnosisTags.push('逾期率高');
  if (blockedRate > 0.2) diagnosisTags.push('阻塞严重');
  if (krOffTrackRate > 0.4) diagnosisTags.push('KR偏移');
  if (loadBalance < 50) diagnosisTags.push('负载不均衡');
  if (progressVariance > 35) diagnosisTags.push('执行不一致');
  if (progressVariance < 10 && avgProgress < 30) diagnosisTags.push('进度停滞');
  if (activeGoals.length > memberCount * 2) diagnosisTags.push('目标多且分散');
  if (tasks.length > memberCount * 8) diagnosisTags.push('任务多且杂');
  if (collaborationDensity > 0.5) diagnosisTags.push('跨目标协作');
  if (avgProgress < 0.3) diagnosisTags.push('缺少可量化');
  if (sizeCategory === 'micro' || sizeCategory === 'small') diagnosisTags.push('小团队');
  if (blockedRate < 0.05 && loadBalance > 80) diagnosisTags.push('瓶颈不明');

  if (diagnosisTags.length === 0) diagnosisTags.push('运行良好');

  return {
    sizeCategory, goalsPerMember: Math.round(goalsPerMember * 10) / 10,
    tasksPerMember: Math.round(tasksPerMember * 10) / 10,
    overdueRate: Math.round(overdueRate * 100), blockedRate: Math.round(blockedRate * 100),
    krOffTrackRate: Math.round(krOffTrackRate * 100), collaborationDensity: Math.round(collaborationDensity * 100),
    progressVariance: Math.round(progressVariance), loadBalance, diagnosisTags,
  };
}

/** 计算方法论适配度 */
function computeFitness(methodology: typeof METHODOLOGY_DB[0], pattern: TeamPattern): number {
  let score = 0;
  for (const cond of methodology.fitConditions) {
    if (pattern.diagnosisTags.includes(cond.tag)) {
      score += cond.weight;
    }
  }
  // 不适条件惩罚
  for (const unfit of methodology.unfitConditions) {
    if (pattern.diagnosisTags.includes(unfit)) {
      score -= 20;
    }
  }
  return Math.max(0, Math.min(100, score));
}

/** 生成核心痛点 */
function extractPainPoints(pattern: TeamPattern): string[] {
  const points: string[] = [];
  if (pattern.overdueRate > 30) points.push(`逾期率高达${pattern.overdueRate}%，交付节奏不稳定`);
  if (pattern.blockedRate > 20) points.push(`${pattern.blockedRate}%的工作项被阻塞，流动性差`);
  if (pattern.krOffTrackRate > 40) points.push(`${pattern.krOffTrackRate}%的KR偏移，目标达成风险高`);
  if (pattern.loadBalance < 50) points.push(`负载均衡度仅${pattern.loadBalance}，部分成员过载严重`);
  if (pattern.progressVariance > 35) points.push('执行一致性差，不同项目进度差异大');
  if (pattern.goalsPerMember > 3) points.push('人均目标过多，难以聚焦');
  if (points.length === 0) points.push('整体运行良好，当前管理方式基本适配');
  return points;
}

/** 确定性推荐主函数 */
export function recommendMethodologyLocal(state: AppState): MethodologyResult {
  const ctx = buildAIContext(state);
  const pattern = diagnoseTeamPattern(ctx);

  const recommendations: MethodologyRecommendation[] = METHODOLOGY_DB
    .map(m => {
      const fitnessScore = computeFitness(m, pattern);
      const fitTags = m.fitConditions
        .filter(c => pattern.diagnosisTags.includes(c.tag))
        .map(c => c.tag);

      return {
        id: m.id,
        name: m.name,
        fitnessScore,
        reason: fitnessScore >= 50
          ? `团队存在${fitTags.join('、')}问题，${m.name}可以有效解决`
          : `${m.name}与当前团队模式的匹配度一般`,
        expectedBenefits: m.benefits,
        applicableWhen: m.fitConditions.map(c => c.tag),
        notApplicableWhen: m.unfitConditions,
        steps: m.steps.map((s, i) => ({
          step: i + 1, title: s.title, description: s.description,
          estimatedDays: s.days, successCriteria: s.criteria,
        })),
        requirements: m.requirements,
        fitTags,
      };
    })
    .filter(r => r.fitnessScore >= 20)
    .sort((a, b) => b.fitnessScore - a.fitnessScore);

  return {
    teamPattern: pattern,
    recommendations,
    painPoints: extractPainPoints(pattern),
    fromLLM: false,
    generatedAt: new Date().toISOString(),
  };
}

// ===== LLM 深度方法论推荐 =====

function buildMethodologyPrompt(ctx: AIProjectContext, pattern: TeamPattern, localResult: MethodologyResult): string {
  const topRecs = localResult.recommendations.slice(0, 3).map(r =>
    `- ${r.name}（适配度${r.fitnessScore}%）: ${r.reason}`
  ).join('\n');

  return `你是团队管理方法论顾问。基于团队数据和确定性分析，进行深度方法论推荐。

## 团队模式诊断
- 规模: ${pattern.sizeCategory}（${ctx.memberCount}人）
- 逾期率: ${pattern.overdueRate}%，阻塞率: ${pattern.blockedRate}%
- KR偏移率: ${pattern.krOffTrackRate}%，负载均衡: ${pattern.loadBalance}%
- 进度方差: ${pattern.progressVariance}，协作密度: ${pattern.collaborationDensity}%
- 诊断标签: ${pattern.diagnosisTags.join('、')}

## 确定性推荐
${topRecs || '无'}

## 核心痛点
${localResult.painPoints.join('；')}

## 请深度分析
1. 团队当前管理模式的根本问题是什么？
2. 哪种方法论组合最适合？为什么？
3. 如何在现有工具基础上落地？
4. 有哪些行业案例支撑？

## 输出格式（严格 JSON）
{"recommendations":[{"id":"okr|pdca|scrum|kanban|agile|waterfall|lean|six_sigma","name":"方法论名称","fitnessScore":80,"reason":"推荐理由","expectedBenefits":["收益1"],"applicableWhen":["条件1"],"notApplicableWhen":["不适条件"],"steps":[{"step":1,"title":"步骤名","description":"步骤描述","estimatedDays":3,"successCriteria":["标准1"]}],"requirements":["需求1"],"fitTags":["标签1"]}],"painPoints":["痛点1"],"additionalInsight":"额外洞察"}`;
}

export async function recommendMethodologyDeep(state: AppState): Promise<MethodologyResult> {
  const localResult = recommendMethodologyLocal(state);
  const config = loadAIConfig();
  if (!config.enabled || !config.apiKey) return localResult;

  try {
    const ctx = buildAIContext(state);
    const pattern = diagnoseTeamPattern(ctx);
    const prompt = buildMethodologyPrompt(ctx, pattern, localResult);
    const raw = await callLLM(prompt, config);
    if (!raw) return localResult;

    let parsed: LLMMethodologyResponse | null = null;    try { parsed = JSON.parse(raw); } catch (e) { handleError(e, { module: 'aiMethodology', operation: 'PARSE_LLM_JSON', severity: 'warn' });
      const match = raw.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
      if (match) try { parsed = JSON.parse(match[0]); } catch (e2) { handleError(e2, { module: 'aiMethodology', operation: 'PARSE_LLM_JSON_FALLBACK', severity: 'warn' }); }
    }
    if (!parsed?.recommendations) return localResult;

    const validIds = ['okr', 'pdca', 'scrum', 'kanban', 'agile', 'waterfall', 'lean', 'six_sigma'];

    const llmRecs: MethodologyRecommendation[] = (parsed.recommendations ?? []).map(r => ({
      id: validIds.includes(r.id ?? '') ? r.id as MethodologyId : 'okr',
      name: String(r.name || '未知方法论').slice(0, 50),
      fitnessScore: Math.min(100, Math.max(0, Number(r.fitnessScore) || 50)),
      reason: String(r.reason || '').slice(0, 300),
      expectedBenefits: Array.isArray(r.expectedBenefits) ? r.expectedBenefits.map(String).slice(0, 5) : [],
      applicableWhen: Array.isArray(r.applicableWhen) ? r.applicableWhen.map(String).slice(0, 5) : [],
      notApplicableWhen: Array.isArray(r.notApplicableWhen) ? r.notApplicableWhen.map(String).slice(0, 3) : [],
      steps: Array.isArray(r.steps) ? r.steps.slice(0, 6).map((s, i) => ({
        step: i + 1, title: String(s.title || '').slice(0, 50),
        description: String(s.description || '').slice(0, 200),
        estimatedDays: Number(s.estimatedDays) || 3,
        successCriteria: Array.isArray(s.successCriteria) ? s.successCriteria.map(String).slice(0, 3) : [],
      })) : [],
      requirements: Array.isArray(r.requirements) ? r.requirements.map(String).slice(0, 5) : [],
      fitTags: Array.isArray(r.fitTags) ? r.fitTags.map(String).slice(0, 5) : [],
    }));

    // 合并：LLM 结果补充到本地结果之后，避免重复
    const existingIds = new Set(localResult.recommendations.map(r => r.id));
    const newLlmRecs = llmRecs.filter(r => !existingIds.has(r.id));
    const allRecs = [...localResult.recommendations, ...newLlmRecs].sort((a, b) => b.fitnessScore - a.fitnessScore);

    // 合并痛点
    const localPains = new Set(localResult.painPoints);
    const llmPains = Array.isArray(parsed.painPoints) ? (parsed.painPoints as string[]).filter(p => !localPains.has(p)) : [];
    const allPains = [...localResult.painPoints, ...llmPains.slice(0, 2)];

    return {
      teamPattern: localResult.teamPattern,
      recommendations: allRecs,
      painPoints: allPains,
      fromLLM: true,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return localResult;
  }
}
