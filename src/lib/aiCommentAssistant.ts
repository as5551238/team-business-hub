export interface AiCapability {
  id: string;
  name: string;
  desc: string;
}

export const aiCapabilities: AiCapability[] = [
  { id: 'decompose', name: '目标分解', desc: '将目标分解为可执行的KR和任务' },
  { id: 'risk', name: '风险评估', desc: '分析当前目标/项目的风险因素' },
  { id: 'match', name: '智能匹配', desc: '推荐最合适的负责人' },
];

interface AiContext {
  itemType: string;
  itemId: string;
  itemTitle: string;
  itemDescription: string;
}

interface AiResult {
  result: string;
  structured?: Record<string, unknown>;
}

function generateDecomposeResponse(title: string, description: string): AiResult {
  const krs = [
    `完成"${title}"的核心方案设计`,
    `实现关键功能模块并验证`,
    `达成量化的业务指标`,
  ];
  const result = `建议分解为以下关键结果:\n${krs.map((kr, i) => `${i + 1}. ${kr}`).join('\n')}\n\n可进一步拆分为可执行任务，根据"${title}"的具体范围调整各KR的目标值。`;
  return {
    result,
    structured: {
      type: 'decompose',
      keyResults: krs.map((kr, i) => ({ order: i + 1, title: kr })),
    },
  };
}

function generateRiskResponse(title: string, _description: string): AiResult {
  const result = `风险分析:\n高风险因素: 目标"${title}"的截止日期可能较紧，需确保资源充足\n中风险因素: 跨部门协作可能出现沟通延迟；关键人员变动可能影响进度\n低风险因素: 技术方案尚需验证，建议提前进行可行性评估\n\n建议: 设定里程碑检查点，定期复盘风险状态。`;
  return {
    result,
    structured: {
      type: 'risk',
      risks: [
        { level: 'high', factor: '截止日期较紧' },
        { level: 'medium', factor: '跨部门协作延迟' },
        { level: 'low', factor: '技术方案待验证' },
      ],
    },
  };
}

function generateMatchResponse(title: string, _description: string): AiResult {
  const result = `推荐负责人:\n基于"${title}"的技能需求、团队负荷和历史绩效分析:\n1. 建议优先考虑当前负荷较低的成员担任负责人\n2. 如涉及多领域，可设置主负责人+协助人的组合\n3. 匹配度评分将参考成员历史完成率、专业领域和当前可用容量`;
  return {
    result,
    structured: {
      type: 'match',
      suggestions: [
        { rank: 1, reason: '技能匹配度高，当前负荷低' },
        { rank: 2, reason: '历史绩效优秀，领域相关' },
        { rank: 3, reason: '跨功能协作经验丰富' },
      ],
    },
  };
}

export async function invokeAiCapability(capabilityId: string, context: AiContext): Promise<AiResult> {
  await new Promise(resolve => setTimeout(resolve, 300));

  switch (capabilityId) {
    case 'decompose':
      return generateDecomposeResponse(context.itemTitle, context.itemDescription);
    case 'risk':
      return generateRiskResponse(context.itemTitle, context.itemDescription);
    case 'match':
      return generateMatchResponse(context.itemTitle, context.itemDescription);
    default:
      return { result: `未知AI能力: ${capabilityId}` };
  }
}
