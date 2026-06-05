import type { ReviewModel } from '@/types';

/**
 * 10大复盘模型注册表
 * R1-4 MLOO 复盘模型库框架
 */
export const REVIEW_MODELS: ReviewModel[] = [
  {
    id: 'swot',
    name: 'SWOT分析',
    nameEn: 'SWOT Analysis',
    category: 'strategy',
    description: '从优势、劣势、机会、威胁四个维度全面分析战略态势，适用于季度/年度战略复盘',
    steps: [
      { index: 1, title: '优势 (Strengths)', description: '我们做对了什么？有哪些核心竞争力？', inputType: 'list', placeholder: '列出内部优势...', aiAutoFill: true },
      { index: 2, title: '劣势 (Weaknesses)', description: '哪些方面表现不足？资源/能力有哪些短板？', inputType: 'list', placeholder: '列出内部劣势...', aiAutoFill: true },
      { index: 3, title: '机会 (Opportunities)', description: '外部环境中有哪些可以利用的趋势或市场机会？', inputType: 'list', placeholder: '列出外部机会...', aiAutoFill: true },
      { index: 4, title: '威胁 (Threats)', description: '外部有哪些风险、竞争或不利因素？', inputType: 'list', placeholder: '列出外部威胁...', aiAutoFill: true },
    ],
    applicableScenarios: ['战略复盘', '季度规划', '市场变化', '竞争分析'],
    aiPrompt: '基于目标执行数据和团队表现，从SWOT四个维度进行全面分析，识别关键战略要素。',
  },
  {
    id: 'pdca',
    name: 'PDCA循环',
    nameEn: 'PDCA Cycle',
    category: 'process',
    description: '计划-执行-检查-行动四步循环，适用于流程改进和持续优化',
    steps: [
      { index: 1, title: 'Plan (计划)', description: '原计划是什么？预期目标和实施路径？', inputType: 'text', placeholder: '回顾原计划...', aiAutoFill: true },
      { index: 2, title: 'Do (执行)', description: '实际执行了什么？执行过程与计划有何偏差？', inputType: 'text', placeholder: '描述实际执行情况...' },
      { index: 3, title: 'Check (检查)', description: '结果与预期对比如何？差距有多大？', inputType: 'text', placeholder: '对比预期和实际结果...', aiAutoFill: true },
      { index: 4, title: 'Act (行动)', description: '下一步怎么改？哪些经验需要标准化？', inputType: 'text', placeholder: '制定改进行动...' },
    ],
    applicableScenarios: ['流程复盘', '迭代回顾', '持续改进', '质量提升'],
    aiPrompt: '基于计划与执行偏差，分析根因并建议改进措施，形成PDCA闭环。',
  },
  {
    id: 'grai',
    name: 'GRAI复盘法',
    nameEn: 'GRAI Method',
    category: 'goal',
    description: '目标回看-结果评估-原因分析-规律提炼，专为OKR目标复盘设计',
    steps: [
      { index: 1, title: 'Goal (目标回看)', description: '当初设定的目标是什么？关键结果指标是什么？', inputType: 'text', placeholder: '回顾原始OKR...', aiAutoFill: true },
      { index: 2, title: 'Result (结果评估)', description: '实际达成了多少？评分结果如何？', inputType: 'text', placeholder: '评估实际结果...', aiAutoFill: true },
      { index: 3, title: 'Analysis (原因分析)', description: '为什么达成/未达成？主客观原因分别是什么？', inputType: 'text', placeholder: '分析原因...' },
      { index: 4, title: 'Insight (规律提炼)', description: '有什么规律可循？下次可以怎么做得更好？', inputType: 'text', placeholder: '提炼规律和经验...' },
    ],
    applicableScenarios: ['OKR复盘', '季度回顾', '目标回顾', '周期总结'],
    aiPrompt: '基于OKR目标和关键结果数据，回看目标→评估结果→分析原因→提炼规律，给出改进建议。',
  },
  {
    id: 'aar',
    name: 'AAR事后复盘',
    nameEn: 'After Action Review',
    category: 'goal',
    description: '美军标准复盘法：目标回顾-事实陈述-差距分析-改进行动，适用于项目复盘',
    steps: [
      { index: 1, title: '目标回顾', description: '我们原计划达成什么？', inputType: 'text', placeholder: '回顾原始目标...', aiAutoFill: true },
      { index: 2, title: '事实陈述', description: '实际发生了什么？', inputType: 'text', placeholder: '描述实际发生的事实...' },
      { index: 3, title: '差距分析', description: '为什么会有差距？', inputType: 'text', placeholder: '分析差距原因...' },
      { index: 4, title: '改进行动', description: '下次怎么做更好？', inputType: 'text', placeholder: '制定改进措施...' },
    ],
    applicableScenarios: ['项目复盘', '事件回顾', '关键节点复盘'],
    aiPrompt: '以AAR标准流程复盘项目执行情况，识别差距并给出具体改进行动。',
  },
  {
    id: '5whys',
    name: '5Why分析法',
    nameEn: '5 Whys Analysis',
    category: 'problem',
    description: '连续5次追问"为什么"，层层深入找到问题根因',
    steps: [
      { index: 1, title: '第1个为什么', description: '为什么会出现这个问题？', inputType: 'text', placeholder: '描述表面原因...' },
      { index: 2, title: '第2个为什么', description: '为什么会发生第1层原因？', inputType: 'text', placeholder: '往下追问...' },
      { index: 3, title: '第3个为什么', description: '为什么会发生第2层原因？', inputType: 'text', placeholder: '继续深入...' },
      { index: 4, title: '第4个为什么', description: '为什么会发生第3层原因？', inputType: 'text', placeholder: '接近根因...' },
      { index: 5, title: '第5个为什么', description: '最根本的原因是什么？', inputType: 'text', placeholder: '找到根因...' },
    ],
    applicableScenarios: ['问题分析', '故障复盘', '质量异常', '目标未达成'],
    aiPrompt: '对问题描述进行5层递进追问，从表面现象深入到根本原因，每层追问都要有数据支撑。',
  },
  {
    id: 'fishbone',
    name: '鱼骨图分析',
    nameEn: 'Fishbone Diagram',
    category: 'problem',
    description: '从人/机/料/法/环/测六个维度系统性分析问题原因',
    steps: [
      { index: 1, title: '人员 (People)', description: '人员技能、态度、培训方面是否有问题？', inputType: 'text', placeholder: '人员维度分析...' },
      { index: 2, title: '设备/工具 (Machine)', description: '工具、系统、设备是否存在问题？', inputType: 'text', placeholder: '设备工具维度分析...' },
      { index: 3, title: '材料/数据 (Material)', description: '输入数据、素材、资源是否充足/准确？', inputType: 'text', placeholder: '材料数据维度分析...' },
      { index: 4, title: '方法 (Method)', description: '流程、方法、标准是否存在问题？', inputType: 'text', placeholder: '方法流程维度分析...' },
      { index: 5, title: '环境 (Environment)', description: '外部环境、组织氛围是否有影响？', inputType: 'text', placeholder: '环境维度分析...' },
      { index: 6, title: '测量 (Measurement)', description: '指标定义、数据采集是否合理？', inputType: 'text', placeholder: '测量维度分析...' },
    ],
    applicableScenarios: ['问题诊断', '质量分析', '流程异常', '系统性问题'],
    aiPrompt: '从人/机/料/法/环/测六个维度系统性分析问题根因，给出结构化的鱼骨图分析报告。',
  },
  {
    id: 'kpt',
    name: 'KPT复盘',
    nameEn: 'KPT Method',
    category: 'lightweight',
    description: '保持/问题/尝试三步轻量复盘，适用于日常快速回顾',
    steps: [
      { index: 1, title: 'Keep (保持)', description: '哪些做法值得继续保持？', inputType: 'list', placeholder: '值得保持的做法...' },
      { index: 2, title: 'Problem (问题)', description: '遇到了什么问题？', inputType: 'list', placeholder: '遇到的问题...' },
      { index: 3, title: 'Try (尝试)', description: '下次准备尝试什么新做法？', inputType: 'list', placeholder: '新尝试方案...' },
    ],
    applicableScenarios: ['日复盘', '周复盘', '站会回顾', '快速复盘'],
    aiPrompt: '以KPT轻量复盘法快速回顾，识别保持项、问题项和尝试项，突出可执行改进行动。',
  },
  {
    id: 'kiss',
    name: 'KISS复盘',
    nameEn: 'KISS Method',
    category: 'lightweight',
    description: '保持/改进/开始/停止四步复盘，比KPT更精细的轻量方法',
    steps: [
      { index: 1, title: 'Keep (保持)', description: '哪些做得好，应该继续？', inputType: 'list', placeholder: '继续保持的...' },
      { index: 2, title: 'Improve (改进)', description: '哪些可以做得更好？', inputType: 'list', placeholder: '需要改进的...' },
      { index: 3, title: 'Start (开始)', description: '应该开始做什么新事情？', inputType: 'list', placeholder: '开始新尝试...' },
      { index: 4, title: 'Stop (停止)', description: '哪些做法应该立即停止？', inputType: 'list', placeholder: '需要停止的...' },
    ],
    applicableScenarios: ['迭代复盘', '周复盘', '团队回顾', '方法调优'],
    aiPrompt: '以KISS四维复盘法分析，明确保持/改进/开始/停止四个方向的具体行动项。',
  },
  {
    id: 'bsc',
    name: '平衡计分卡',
    nameEn: 'Balanced Scorecard',
    category: 'comprehensive',
    description: '从财务/客户/流程/学习成长四个维度全面评估，适用于年度全面复盘',
    steps: [
      { index: 1, title: '财务视角', description: '成本控制、收入增长、ROI如何？', inputType: 'text', placeholder: '财务维度评估...', aiAutoFill: true },
      { index: 2, title: '客户视角', description: '客户满意度、市场份额、用户体验如何？', inputType: 'text', placeholder: '客户维度评估...' },
      { index: 3, title: '流程视角', description: '内部流程效率、质量、创新如何？', inputType: 'text', placeholder: '流程维度评估...' },
      { index: 4, title: '学习成长', description: '团队能力提升、知识积累、创新如何？', inputType: 'text', placeholder: '学习成长维度评估...' },
    ],
    applicableScenarios: ['年度复盘', '全面评估', '战略回顾', '组织发展'],
    aiPrompt: '以平衡计分卡四维度全面评估团队表现，从财务、客户、流程、学习成长四个角度给出综合分析和建议。',
  },
  {
    id: 'okr_scoring',
    name: 'OKR评分复盘',
    nameEn: 'OKR Scoring Review',
    category: 'comprehensive',
    description: '目标评分+信心度+下轮建议，专为OKR周期结束设计',
    steps: [
      { index: 1, title: '目标评分', description: '对每个关键结果打分 (0.0-1.0)，评估达成度', inputType: 'text', placeholder: '按KR逐项评分...', aiAutoFill: true },
      { index: 2, title: '信心度评估', description: '对下个周期类似目标的信心度 (0-100%)', inputType: 'text', placeholder: '评估信心度...' },
      { index: 3, title: '下轮建议', description: '基于本周期经验，对下个周期OKR制定有什么建议？', inputType: 'text', placeholder: '下轮OKR建议...' },
    ],
    applicableScenarios: ['OKR周期结束', '季度评分', '周期复盘', '目标校准'],
    aiPrompt: '基于OKR关键结果的实际达成数据，给出0-1评分，评估信心度，并为下轮OKR制定提供数据驱动的建议。',
  },
];

/** Get a model by id */
export function getReviewModel(id: string): ReviewModel | undefined {
  return REVIEW_MODELS.find(m => m.id === id);
}

/** Category labels for display */
export const CATEGORY_LABELS: Record<string, string> = {
  strategy: '战略复盘',
  process: '流程复盘',
  goal: '目标复盘',
  problem: '问题诊断',
  lightweight: '轻量复盘',
  comprehensive: '全面复盘',
};

export const CATEGORY_COLORS: Record<string, string> = {
  strategy: 'bg-purple-100 text-purple-700',
  process: 'bg-blue-100 text-blue-700',
  goal: 'bg-emerald-100 text-emerald-700',
  problem: 'bg-red-100 text-red-700',
  lightweight: 'bg-amber-100 text-amber-700',
  comprehensive: 'bg-indigo-100 text-indigo-700',
};
