import type { Member, Goal, Project, Task, Notification, Activity, Category, Template, ScheduleEvent, Note } from '@/types';

// ==================== 大规模数据生成器 ====================

let idCounter = Date.now();
function gid(prefix: string) { return `${prefix}_${++idCounter}`; }

// 随机工具
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(start: string, end: string): string {
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  return new Date(s + Math.random() * (e - s)).toISOString().split('T')[0];
}
function formatDate(d: Date): string { return d.toISOString().split('T')[0]; }
function offsetDate(base: string, days: number): string {
  const d = new Date(base); d.setDate(d.getDate() + days);
  return formatDate(d);
}

// ==================== 成员 (22人) ====================
export function generateMembers(): Member[] {
  return [
    { id: 'm01', name: '张明', nickname: '明哥', wechatId: 'zhangming_wx', phone: '13800001001', role: 'admin', department: '管理层', avatar: '张明', email: 'zhangming@team.com', status: 'active', joinDate: '2024-01-15', permissions: [] },
    { id: 'm02', name: '李华', nickname: '华子', wechatId: 'lihua_wx', phone: '13800001002', role: 'admin', department: '管理层', avatar: '李华', email: 'lihua@team.com', status: 'active', joinDate: '2024-01-20', permissions: [] },
    { id: 'm03', name: '王芳', nickname: '芳姐', wechatId: 'wangfang_wx', phone: '13800001003', role: 'manager', department: '产品部', avatar: '王芳', email: 'wangfang@team.com', status: 'active', joinDate: '2024-02-01', permissions: [] },
    { id: 'm04', name: '赵强', nickname: '强哥', wechatId: 'zhaoqiang_wx', phone: '13800001004', role: 'manager', department: '技术部', avatar: '赵强', email: 'zhaoqiang@team.com', status: 'active', joinDate: '2024-02-10', permissions: [] },
    { id: 'm05', name: '陈丽', nickname: '丽姐', wechatId: 'chenli_wx', phone: '13800001005', role: 'manager', department: '市场部', avatar: '陈丽', email: 'chenli@team.com', status: 'active', joinDate: '2024-02-15', permissions: [] },
    { id: 'm06', name: '刘伟', nickname: '伟哥', wechatId: 'liuwei_wx', phone: '13800001006', role: 'manager', department: '运营部', avatar: '刘伟', email: 'liuwei@team.com', status: 'active', joinDate: '2024-03-01', permissions: [] },
    { id: 'm07', name: '周雪', nickname: '雪姐', wechatId: 'zhouxue_wx', phone: '13800001007', role: 'manager', department: '客服部', avatar: '周雪', email: 'zhouxue@team.com', status: 'active', joinDate: '2024-03-10', permissions: [] },
    { id: 'm08', name: '孙鹏', nickname: '鹏鹏', wechatId: 'sunpeng_wx', phone: '13800001008', role: 'member', department: '技术部', avatar: '孙鹏', email: 'sunpeng@team.com', status: 'active', joinDate: '2024-03-15', permissions: [] },
    { id: 'm09', name: '吴佳', nickname: '佳佳', wechatId: 'wujia_wx', phone: '13800001009', role: 'member', department: '技术部', avatar: '吴佳', email: 'wujia@team.com', status: 'active', joinDate: '2024-04-01', permissions: [] },
    { id: 'm10', name: '郑凯', nickname: '凯哥', wechatId: 'zhengkai_wx', phone: '13800001010', role: 'member', department: '技术部', avatar: '郑凯', email: 'zhengkai@team.com', status: 'active', joinDate: '2024-04-10', permissions: [] },
    { id: 'm11', name: '黄蕾', nickname: '蕾蕾', wechatId: 'huanglei_wx', phone: '13800001011', role: 'member', department: '产品部', avatar: '黄蕾', email: 'huanglei@team.com', status: 'active', joinDate: '2024-04-15', permissions: [] },
    { id: 'm12', name: '林杰', nickname: '杰哥', wechatId: 'linjie_wx', phone: '13800001012', role: 'member', department: '产品部', avatar: '林杰', email: 'linjie@team.com', status: 'active', joinDate: '2024-05-01', permissions: [] },
    { id: 'm13', name: '杨帆', nickname: '帆帆', wechatId: 'yangfan_wx', phone: '13800001013', role: 'member', department: '市场部', avatar: '杨帆', email: 'yangfan@team.com', status: 'active', joinDate: '2024-05-10', permissions: [] },
    { id: 'm14', name: '徐静', nickname: '静静', wechatId: 'xujing_wx', phone: '13800001014', role: 'member', department: '市场部', avatar: '徐静', email: 'xujing@team.com', status: 'active', joinDate: '2024-05-15', permissions: [] },
    { id: 'm15', name: '何磊', nickname: '磊哥', wechatId: 'helei_wx', phone: '13800001015', role: 'member', department: '运营部', avatar: '何磊', email: 'helei@team.com', status: 'active', joinDate: '2024-06-01', permissions: [] },
    { id: 'm16', name: '马婷', nickname: '婷婷', wechatId: 'mating_wx', phone: '13800001016', role: 'member', department: '运营部', avatar: '马婷', email: 'mating@team.com', status: 'active', joinDate: '2024-06-10', permissions: [] },
    { id: 'm17', name: '罗浩', nickname: '浩子', wechatId: 'luohao_wx', phone: '13800001017', role: 'member', department: '客服部', avatar: '罗浩', email: 'luohao@team.com', status: 'active', joinDate: '2024-06-15', permissions: [] },
    { id: 'm18', name: '谢芳', nickname: '芳芳', wechatId: 'xiefang_wx', phone: '13800001018', role: 'member', department: '客服部', avatar: '谢芳', email: 'xiefang@team.com', status: 'active', joinDate: '2024-07-01', permissions: [] },
    { id: 'm19', name: '韩超', nickname: '超哥', wechatId: 'hanchao_wx', phone: '13800001019', role: 'member', department: '财务部', avatar: '韩超', email: 'hanchao@team.com', status: 'active', joinDate: '2024-07-10', permissions: [] },
    { id: 'm20', name: '唐敏', nickname: '敏敏', wechatId: 'tangmin_wx', phone: '13800001020', role: 'member', department: '财务部', avatar: '唐敏', email: 'tangmin@team.com', status: 'active', joinDate: '2024-07-15', permissions: [] },
    { id: 'm21', name: '冯涛', nickname: '涛哥', wechatId: 'fengtao_wx', phone: '13800001021', role: 'member', department: '人力资源部', avatar: '冯涛', email: 'fengtao@team.com', status: 'active', joinDate: '2024-08-01', permissions: [] },
    { id: 'm22', name: '曹颖', nickname: '颖颖', wechatId: 'caoying_wx', phone: '13800001022', role: 'member', department: '人力资源部', avatar: '曹颖', email: 'caoying@team.com', status: 'active', joinDate: '2024-08-10', permissions: [] },
  ];
}

// ==================== 目标树 (10个顶级 + 拆解至110+) ====================
interface GoalTemplate {
  title: string;
  description: string;
  type: 'okr' | 'kpi' | 'milestone';
  status: 'in_progress' | 'completed' | 'planning' | 'paused';
  children?: GoalTemplate[];
}

const goalTemplates: GoalTemplate[] = [
  {
    title: '2026年业务收入增长50%', description: '年度核心目标，实现营收从5000万增长到7500万', type: 'okr', status: 'in_progress',
    children: [
      { title: '企业客户收入增长', description: '大客户签约和续费推动收入增长', type: 'okr', status: 'in_progress', children: [
        { title: '大客户拓展签约', description: '签约至少15家行业头部企业', type: 'okr', status: 'in_progress' },
        { title: '客户续费率提升至90%', description: '降低流失率，提升客户粘性', type: 'kpi', status: 'in_progress' },
        { title: '客单价提升30%', description: '通过增值服务提升客单价', type: 'kpi', status: 'in_progress' },
        { title: '客户成功体系建设', description: '建立客户成功团队和流程', type: 'milestone', status: 'in_progress' },
        { title: '行业解决方案打磨', description: '针对金融、教育、医疗行业定制方案', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '中小企业SaaS收入增长', description: '通过自助化产品和渠道拓展中小企业市场', type: 'okr', status: 'in_progress', children: [
        { title: '自助化产品上线', description: '推出标准版自助注册和使用', type: 'milestone', status: 'in_progress' },
        { title: '渠道合作伙伴拓展', description: '发展至少50家渠道合作伙伴', type: 'okr', status: 'in_progress' },
        { title: '在线获客能力建设', description: '建立SEO、SEM、内容营销获客体系', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '增值服务收入', description: '通过培训和咨询等增值服务创收', type: 'kpi', status: 'planning', children: [
        { title: '培训业务体系搭建', description: '推出线上线下结合的培训服务', type: 'milestone', status: 'planning' },
        { title: '咨询业务开拓', description: '提供数字化转型咨询服务', type: 'milestone', status: 'planning' },
      ]},
    ],
  },
  {
    title: '用户规模突破100万', description: '年度注册用户达到100万，月活达到50万', type: 'okr', status: 'in_progress',
    children: [
      { title: '注册用户增长', description: '通过各种渠道获取新用户', type: 'kpi', status: 'in_progress', children: [
        { title: '搜索引擎优化', description: 'SEO自然流量翻倍', type: 'milestone', status: 'in_progress' },
        { title: '社交媒体运营', description: '建立全网社媒矩阵', type: 'milestone', status: 'in_progress' },
        { title: '裂变增长体系', description: '搭建用户推荐裂变机制', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '月活用户提升', description: '提升用户活跃度和留存率', type: 'kpi', status: 'in_progress', children: [
        { title: '用户激活率提升至60%', description: '优化新手引导和首次体验', type: 'kpi', status: 'in_progress' },
        { title: '30日留存率提升至40%', description: '通过Push和消息召回', type: 'kpi', status: 'in_progress' },
        { title: '用户成长体系', description: '积分、等级、勋章体系', type: 'milestone', status: 'in_progress' },
      ]},
    ],
  },
  {
    title: '产品体验行业领先', description: 'NPS达到50+，核心场景满意度95%+', type: 'okr', status: 'in_progress',
    children: [
      { title: '核心功能体验升级', description: '重构核心业务流程的用户体验', type: 'milestone', status: 'in_progress', children: [
        { title: '目标管理模块重构', description: '全新的OKR管理和拆解体验', type: 'milestone', status: 'in_progress' },
        { title: '任务协作体验升级', description: '看板、列表、甘特多视图支持', type: 'milestone', status: 'in_progress' },
        { title: '移动端体验优化', description: '移动端页面性能和交互体验', type: 'milestone', status: 'in_progress' },
        { title: '消息通知系统重构', description: '智能通知和提醒机制', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '用户反馈体系', description: '建立完整的用户反馈收集和响应机制', type: 'milestone', status: 'in_progress', children: [
        { title: '应用内反馈系统', description: '一键反馈和NPS调查', type: 'milestone', status: 'completed' },
        { title: '用户调研常态化', description: '每月用户访谈和可用性测试', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '设计系统建设', description: '统一视觉设计语言和组件库', type: 'milestone', status: 'in_progress', children: [
        { title: '设计规范文档', description: '输出完整的设计规范', type: 'milestone', status: 'in_progress' },
        { title: '前端组件库2.0', description: '基于设计规范升级组件库', type: 'milestone', status: 'in_progress' },
      ]},
    ],
  },
  {
    title: '技术架构升级', description: '完成微服务架构迁移，系统可用性99.9%', type: 'okr', status: 'in_progress',
    children: [
      { title: '微服务架构迁移', description: '核心业务模块拆分为独立微服务', type: 'milestone', status: 'in_progress', children: [
        { title: '用户服务拆分', description: '用户中心独立部署', type: 'milestone', status: 'completed' },
        { title: '订单服务拆分', description: '订单系统独立部署', type: 'milestone', status: 'in_progress' },
        { title: '通知服务拆分', description: '消息通知独立服务', type: 'milestone', status: 'in_progress' },
        { title: 'API网关搭建', description: '统一API网关和服务治理', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '性能优化', description: '核心接口P95<200ms，页面加载<1.5s', type: 'kpi', status: 'in_progress', children: [
        { title: '数据库性能优化', description: '慢查询优化和索引调整', type: 'milestone', status: 'in_progress' },
        { title: '前端性能优化', description: '代码分割和资源加载优化', type: 'milestone', status: 'in_progress' },
        { title: 'CDN和缓存优化', description: '全球CDN和多级缓存策略', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '安全合规', description: '通过等保三级认证', type: 'milestone', status: 'in_progress', children: [
        { title: '安全审计', description: '完成安全漏洞修复', type: 'milestone', status: 'in_progress' },
        { title: '合规认证', description: '等保三级认证通过', type: 'milestone', status: 'in_progress' },
      ]},
      { title: 'DevOps流程建设', description: 'CI/CD全流程自动化', type: 'milestone', status: 'in_progress', children: [
        { title: '自动化测试覆盖', description: '核心模块测试覆盖率达到80%', type: 'kpi', status: 'in_progress' },
        { title: '灰度发布能力', description: '支持灰度发布和A/B测试', type: 'milestone', status: 'in_progress' },
      ]},
    ],
  },
  {
    title: '团队能力建设', description: '团队规模扩展至50人，建立人才培养体系', type: 'okr', status: 'in_progress',
    children: [
      { title: '团队扩充', description: '完成核心岗位招聘', type: 'kpi', status: 'in_progress', children: [
        { title: '技术团队扩充', description: '招聘10名技术人才', type: 'kpi', status: 'in_progress' },
        { title: '产品团队扩充', description: '招聘5名产品人才', type: 'kpi', status: 'in_progress' },
        { title: '市场团队扩充', description: '招聘5名市场人才', type: 'kpi', status: 'in_progress' },
      ]},
      { title: '培训体系搭建', description: '建立内部培训和知识分享体系', type: 'milestone', status: 'in_progress', children: [
        { title: '新人入职培训', description: '标准化新人入职培训流程', type: 'milestone', status: 'completed' },
        { title: '技术分享会', description: '双周技术分享会制度', type: 'milestone', status: 'in_progress' },
        { title: '管理培训计划', description: '储备干部培养计划', type: 'milestone', status: 'planning' },
      ]},
      { title: '绩效管理优化', description: '建立OKR+360度评估体系', type: 'milestone', status: 'in_progress', children: [
        { title: 'OKR落地执行', description: '全员OKR对齐和跟踪', type: 'milestone', status: 'in_progress' },
        { title: '360度评估体系', description: '季度360度绩效评估', type: 'milestone', status: 'in_progress' },
      ]},
    ],
  },
  {
    title: '品牌影响力提升', description: '行业知名度Top10，媒体曝光量翻倍', type: 'okr', status: 'in_progress',
    children: [
      { title: '内容营销体系', description: '建立专业内容产出和分发能力', type: 'milestone', status: 'in_progress', children: [
        { title: '公众号运营', description: '公众号粉丝突破5万', type: 'kpi', status: 'in_progress' },
        { title: '行业白皮书发布', description: '发布3份行业白皮书', type: 'milestone', status: 'in_progress' },
        { title: '视频内容制作', description: '建立短视频内容矩阵', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '行业活动参与', description: '参加至少10场行业峰会和展会', type: 'kpi', status: 'in_progress', children: [
        { title: '行业展会参展', description: '参加5场大型行业展会', type: 'milestone', status: 'in_progress' },
        { title: '自办行业大会', description: '举办年度用户大会', type: 'milestone', status: 'planning' },
      ]},
    ],
  },
  {
    title: '客户满意度达到95%', description: 'NPS达到50+，客户投诉率降低50%', type: 'kpi', status: 'in_progress',
    children: [
      { title: '客服响应效率', description: '平均响应时间<5分钟', type: 'kpi', status: 'in_progress', children: [
        { title: '智能客服系统', description: '上线AI智能客服', type: 'milestone', status: 'in_progress' },
        { title: '工单系统优化', description: '工单处理流程自动化', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '客户成功体系', description: '建立主动服务和客户健康度监控', type: 'milestone', status: 'in_progress', children: [
        { title: '客户健康度模型', description: '建立客户健康度评分体系', type: 'milestone', status: 'in_progress' },
        { title: '主动服务机制', description: '定期客户回访和关怀', type: 'milestone', status: 'in_progress' },
        { title: '客户社区建设', description: '建立用户社区和自助服务体系', type: 'milestone', status: 'in_progress' },
      ]},
    ],
  },
  {
    title: '运营效率翻倍', description: '通过自动化和流程优化提升运营效率', type: 'okr', status: 'in_progress',
    children: [
      { title: '运营自动化建设', description: '核心运营流程自动化', type: 'milestone', status: 'in_progress', children: [
        { title: '数据报表自动化', description: '日报周报月报自动生成', type: 'milestone', status: 'in_progress' },
        { title: '营销自动化', description: '自动化营销活动管理', type: 'milestone', status: 'in_progress' },
        { title: '财务自动化', description: '发票和财务流程自动化', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '流程优化', description: '梳理和优化核心业务流程', type: 'milestone', status: 'in_progress', children: [
        { title: '审批流程优化', description: '简化内部审批流程', type: 'milestone', status: 'in_progress' },
        { title: '跨部门协作优化', description: '建立高效的跨部门协作机制', type: 'milestone', status: 'in_progress' },
      ]},
    ],
  },
  {
    title: '数据驱动决策体系', description: '建立完善的数据分析和BI平台', type: 'milestone', status: 'in_progress',
    children: [
      { title: '数据平台建设', description: '搭建企业级数据仓库和BI平台', type: 'milestone', status: 'in_progress', children: [
        { title: '数据仓库搭建', description: '统一数据仓库建设', type: 'milestone', status: 'in_progress' },
        { title: 'BI报表平台', description: '自助式BI分析平台', type: 'milestone', status: 'in_progress' },
        { title: '数据治理体系', description: '数据标准和质量管理', type: 'milestone', status: 'in_progress' },
      ]},
      { title: '数据分析能力', description: '建立数据分析团队和方法论', type: 'milestone', status: 'in_progress', children: [
        { title: '数据分析团队', description: '招聘3名数据分析师', type: 'kpi', status: 'in_progress' },
        { title: '数据指标体系', description: '建立北极星指标和指标字典', type: 'milestone', status: 'in_progress' },
      ]},
    ],
  },
  {
    title: 'Q1目标复盘', description: '完成Q1所有目标的复盘和总结', type: 'milestone', status: 'completed', children: [
      { title: '营收目标复盘', description: '分析Q1营收完成情况', type: 'milestone', status: 'completed' },
      { title: '产品目标复盘', description: '分析Q1产品迭代和用户反馈', type: 'milestone', status: 'completed' },
      { title: '团队目标复盘', description: '分析Q1团队建设和人才发展', type: 'milestone', status: 'completed' },
    ],
  },
];

export function generateGoals(members: Member[]): Goal[] {
  const goals: Goal[] = [];
  const baseDate = '2026-04-01';
  const activeMembers = members.filter(m => m.status === 'active');

  function flattenTemplates(templates: GoalTemplate[], parentId: string | null, level: number) {
    templates.forEach(t => {
      const startDate = level === 0 ? '2026-04-01' : offsetDate(baseDate, randInt(0, 30));
      const endDate = t.status === 'completed'
        ? offsetDate(startDate, randInt(10, 30))
        : offsetDate(startDate, randInt(60, 180));
      const owner = pick(activeMembers);
      const progress = t.status === 'completed' ? 100 : t.status === 'planning' ? 0 : randInt(5, 80);

      const krs = level <= 1 && Math.random() > 0.3 ? [
        { id: gid('kr'), title: '关键指标', targetValue: randInt(3, 100) * 10, currentValue: Math.round(randInt(1, progress) / 100 * randInt(3, 100) * 10), unit: pick(['%', '个', '万元', '人', '分']), selected: false },
      ] : [];

      const goal: Goal = {
        id: gid('g'), title: t.title, description: t.description,
        type: t.type, status: t.status, parentId, level,
        startDate, endDate, leaderId: owner.id,
        supporterIds: [pick(activeMembers).id, pick(activeMembers).id].filter((v, i, a) => a.indexOf(v) === i),
        keyResults: krs, progress,
        priority: 'medium', tags: [], category: '', attachments: [], trackingRecords: [], repeatCycle: 'none', selectedKRIds: [],
        createdAt: offsetDate(startDate, -randInt(1, 14)),
        updatedAt: offsetDate(baseDate, randInt(-3, 0)),
      };
      goals.push(goal);
      if (t.children) flattenTemplates(t.children, goal.id, level + 1);
    });
  }

  flattenTemplates(goalTemplates, null, 0);
  return goals;
}

// ==================== 项目 (110+) ====================
const projectTemplates: { title: string; desc: string; status: 'in_progress' | 'completed' | 'planning' }[] = [
  // 目标1-企业客户
  { title: '大客户A合作签约', desc: '推进与金融行业龙头A的深度合作', status: 'in_progress' },
  { title: '大客户B方案设计', desc: '为教育行业客户B定制解决方案', status: 'in_progress' },
  { title: '大客户C需求对接', desc: '医疗行业客户C需求分析和方案规划', status: 'in_progress' },
  { title: '客户续费率优化计划', desc: '通过客户关怀和增值服务降低流失', status: 'in_progress' },
  { title: '增值服务产品化', desc: '将培训和咨询打包为标准化产品', status: 'planning' },
  { title: '金融行业解决方案V2', desc: '金融行业专属功能迭代', status: 'in_progress' },
  { title: '教育行业解决方案V2', desc: '教育行业专属功能迭代', status: 'in_progress' },
  { title: '医疗行业解决方案V1', desc: '医疗行业解决方案首次发布', status: 'in_progress' },
  // 目标2-中小企业
  { title: '自助注册产品上线', desc: '标准版自助注册和使用流程', status: 'in_progress' },
  { title: '渠道合作体系搭建', desc: '代理商招募和赋能体系', status: 'in_progress' },
  { title: 'SEO内容营销平台', desc: '企业SEO内容管理系统', status: 'in_progress' },
  { title: '社交媒体自动化', desc: '多平台自动发布和分析工具', status: 'in_progress' },
  // 目标3-产品体验
  { title: '目标管理模块重构', desc: '全新OKR管理和目标拆解体验', status: 'in_progress' },
  { title: '任务协作体验升级', desc: '多视图任务管理', status: 'in_progress' },
  { title: '移动端性能优化', desc: '移动端加载速度和交互优化', status: 'in_progress' },
  { title: '消息通知系统重构', desc: '智能通知和提醒机制', status: 'in_progress' },
  { title: '应用内反馈系统', desc: '用户反馈收集和NPS调查', status: 'completed' },
  { title: '设计规范V2.0', desc: '统一视觉设计语言', status: 'in_progress' },
  { title: '前端组件库升级', desc: '基于设计规范升级组件库', status: 'in_progress' },
  // 目标4-技术架构
  { title: '用户服务微服务化', desc: '用户中心独立部署', status: 'completed' },
  { title: '订单服务微服务化', desc: '订单系统独立部署', status: 'in_progress' },
  { title: '通知服务微服务化', desc: '消息通知独立服务', status: 'in_progress' },
  { title: 'API网关建设', desc: '统一API网关和服务治理', status: 'in_progress' },
  { title: '数据库性能优化', desc: '慢查询优化和索引调整', status: 'in_progress' },
  { title: '前端性能优化专项', desc: '代码分割和资源优化', status: 'in_progress' },
  { title: 'CDN和缓存策略', desc: '全球CDN和多级缓存', status: 'in_progress' },
  { title: '安全漏洞修复', desc: '安全审计和漏洞修复', status: 'in_progress' },
  { title: '等保三级认证', desc: '信息安全等级保护认证', status: 'in_progress' },
  { title: '自动化测试覆盖', desc: '核心模块测试覆盖率提升', status: 'in_progress' },
  { title: '灰度发布平台', desc: '支持灰度发布和A/B测试', status: 'in_progress' },
  // 目标5-团队
  { title: 'Q2技术招聘', desc: '招聘5名技术人才', status: 'in_progress' },
  { title: 'Q2产品招聘', desc: '招聘3名产品人才', status: 'in_progress' },
  { title: '新人培训流程', desc: '标准化入职培训', status: 'completed' },
  { title: '技术分享制度', desc: '双周技术分享会', status: 'in_progress' },
  { title: 'OKR管理工具推广', desc: '全员使用OKR管理工具', status: 'in_progress' },
  { title: '绩效评估系统', desc: '360度绩效评估系统', status: 'in_progress' },
  // 目标6-品牌
  { title: '公众号内容运营', desc: '每周3篇高质量内容', status: 'in_progress' },
  { title: '行业白皮书-企业管理', desc: '发布企业管理数字化白皮书', status: 'in_progress' },
  { title: '行业白皮书-项目管理', desc: '发布项目管理趋势白皮书', status: 'in_progress' },
  { title: '短视频内容矩阵', desc: '抖音/视频号内容制作', status: 'in_progress' },
  { title: '行业展会参展计划', desc: '5场大型展会参展', status: 'in_progress' },
  // 目标7-客户满意
  { title: '智能客服系统', desc: 'AI智能客服上线', status: 'in_progress' },
  { title: '工单系统优化', desc: '工单处理自动化', status: 'in_progress' },
  { title: '客户健康度模型', desc: '客户健康评分体系', status: 'in_progress' },
  { title: '用户社区建设', desc: '用户社区和自助服务', status: 'in_progress' },
  // 目标8-运营
  { title: '数据报表自动化', desc: '自动生成各类报表', status: 'in_progress' },
  { title: '营销自动化平台', desc: '自动化营销活动管理', status: 'in_progress' },
  { title: '财务流程自动化', desc: '发票和报销自动化', status: 'in_progress' },
  { title: '审批流程优化', desc: '简化内部审批', status: 'in_progress' },
  // 目标9-数据
  { title: '数据仓库建设', desc: '统一数据仓库', status: 'in_progress' },
  { title: 'BI报表平台', desc: '自助式BI分析', status: 'in_progress' },
  { title: '数据治理体系', desc: '数据标准和质量管理', status: 'in_progress' },
  { title: '数据指标字典', desc: '北极星指标和指标体系', status: 'in_progress' },
  // 补充项目凑够110+
  { title: '内部知识库建设', desc: '团队知识沉淀和共享', status: 'planning' },
  { title: '竞品监控体系', desc: '自动化竞品分析', status: 'in_progress' },
  { title: '国际化多语言支持', desc: '英语和日语版本', status: 'planning' },
  { title: '数据迁移工具', desc: '客户数据导入导出工具', status: 'in_progress' },
  { title: '开放API平台', desc: '对外开放API接口', status: 'planning' },
  { title: '移动端App开发', desc: '原生移动端应用', status: 'planning' },
  { title: '桌面客户端开发', desc: 'Windows/Mac桌面客户端', status: 'planning' },
  { title: 'AI助手集成', desc: 'AI智能助手功能', status: 'in_progress' },
  { title: '第三方集成生态', desc: '企业微信/钉钉/飞书集成', status: 'in_progress' },
  { title: '日志监控平台', desc: '统一日志和监控告警', status: 'in_progress' },
  { title: '灾备方案建设', desc: '数据备份和容灾方案', status: 'in_progress' },
  { title: '权限体系升级', desc: '细粒度权限控制', status: 'in_progress' },
  { title: '审计日志系统', desc: '操作审计和安全日志', status: 'in_progress' },
  { title: 'Q1复盘报告', desc: 'Q1业务复盘', status: 'completed' },
  { title: '年度规划制定', desc: '2026年度业务规划', status: 'completed' },
  { title: '企业文化活动', desc: '团建和文化活动', status: 'in_progress' },
  { title: '办公环境优化', desc: '新办公室选址和装修', status: 'completed' },
  { title: '供应商评估优化', desc: '核心供应商评估和优化', status: 'in_progress' },
  { title: '法务合同管理', desc: '合同管理流程优化', status: 'in_progress' },
  { title: '知识产权保护', desc: '商标和专利申请', status: 'in_progress' },
  { title: '内部工具平台', desc: '内部效率工具开发', status: 'in_progress' },
  { title: '官网改版', desc: '企业官网全面改版', status: 'in_progress' },
  { title: '产品定价策略', desc: '产品定价体系优化', status: 'in_progress' },
  { title: '合作伙伴大会', desc: '年度合作伙伴大会', status: 'planning' },
  { title: 'Q2营收冲刺计划', desc: 'Q2营收目标冲刺', status: 'in_progress' },
  { title: '新客户获取计划', desc: '批量获客活动', status: 'in_progress' },
  { title: '产品路线图更新', desc: 'Q3产品路线图制定', status: 'in_progress' },
  { title: '技术债清理', desc: '历史代码优化', status: 'in_progress' },
  { title: '文档体系建设', desc: 'API文档和产品文档', status: 'in_progress' },
  { title: '用户调研报告', desc: '月度用户调研', status: 'in_progress' },
  { title: '竞品分析报告', desc: '季度竞品分析', status: 'in_progress' },
  { title: '财务预算编制', desc: 'Q3财务预算', status: 'in_progress' },
  { title: '人才梯队建设', desc: '核心岗位继任计划', status: 'planning' },
  { title: '实习生培养计划', desc: '暑期实习生计划', status: 'in_progress' },
  { title: '服务器成本优化', desc: '云资源成本降低30%', status: 'in_progress' },
  { title: '数据安全审计', desc: '年度数据安全审计', status: 'in_progress' },
  { title: '产品内测计划', desc: '核心功能内测', status: 'in_progress' },
  { title: '用户大会筹备', desc: '年度用户大会筹备', status: 'planning' },
  { title: '渠道激励政策', desc: '代理商激励政策制定', status: 'in_progress' },
  { title: '客户案例库建设', desc: '典型客户案例收集和展示', status: 'in_progress' },
];

export function generateProjects(members: Member[], goals: Goal[]): Project[] {
  const activeMembers = members.filter(m => m.status === 'active');
  const activeGoals = goals.filter(g => g.status === 'in_progress' && g.level <= 1);
  const projects: Project[] = [];

  projectTemplates.forEach((pt, i) => {
    const goal = i < activeGoals.length ? activeGoals[i] : pick(activeGoals);
    const owner = pick(activeMembers);
    const teamSize = randInt(2, 5);
    const team = [owner.id, ...activeMembers.filter(m => m.id !== owner.id).slice(0, teamSize - 1).map(m => m.id)];
    const startDate = pt.status === 'completed' ? offsetDate('2026-03-01', randInt(0, 20)) : offsetDate('2026-04-01', randInt(0, 30));
    const endDate = pt.status === 'completed' ? offsetDate(startDate, randInt(15, 40)) : offsetDate(startDate, randInt(30, 120));
    const progress = pt.status === 'completed' ? 100 : pt.status === 'planning' ? 0 : randInt(5, 75);

    projects.push({
      id: gid('p'), title: pt.title, description: pt.desc,
      goalId: goal.id, status: pt.status,
      startDate, endDate, leaderId: owner.id,
      supporterIds: team, parentId: null, taskCount: 0, progress,
      priority: 'medium', tags: [], category: '', attachments: [], trackingRecords: [], repeatCycle: 'none',
      createdAt: offsetDate(startDate, -randInt(1, 7)),
      updatedAt: offsetDate('2026-04-22', randInt(-5, 0)),
    });
  });

  const nonCompletedProjects = projects.filter(p => p.status !== 'completed');
  const subProjectCount = Math.max(1, Math.floor(nonCompletedProjects.length * 0.15));
  for (let i = 0; i < subProjectCount; i++) {
    const child = nonCompletedProjects[i % nonCompletedProjects.length];
    const parentCandidates = nonCompletedProjects.filter(p => p.id !== child.id);
    if (parentCandidates.length > 0) {
      child.parentId = pick(parentCandidates).id;
    }
  }

  return projects;
}

// ==================== 任务 (500+) ====================
const taskTemplates: { title: string; desc: string; priority: 'low' | 'medium' | 'high' | 'urgent'; tags: string[] }[] = [
  { title: '需求文档编写', desc: '编写详细的需求规格说明书', priority: 'high', tags: ['文档', '需求'] },
  { title: '原型设计', desc: '高保真原型设计和评审', priority: 'high', tags: ['设计', '原型'] },
  { title: '技术方案设计', desc: '编写技术方案和架构设计文档', priority: 'high', tags: ['技术', '方案'] },
  { title: '接口开发', desc: '后端API接口开发和联调', priority: 'medium', tags: ['开发', 'API'] },
  { title: '前端页面开发', desc: '前端页面和交互实现', priority: 'medium', tags: ['开发', '前端'] },
  { title: '单元测试编写', desc: '编写单元测试用例', priority: 'medium', tags: ['测试', '质量'] },
  { title: '集成测试', desc: '端到端集成测试', priority: 'high', tags: ['测试', '质量'] },
  { title: '性能测试', desc: '性能基准测试和优化', priority: 'medium', tags: ['测试', '性能'] },
  { title: 'Code Review', desc: '代码审查和优化建议', priority: 'medium', tags: ['开发', '质量'] },
  { title: 'Bug修复', desc: '问题排查和修复', priority: 'high', tags: ['开发', 'Bug'] },
  { title: '文档更新', desc: '更新相关技术文档', priority: 'low', tags: ['文档'] },
  { title: '周报编写', desc: '本周工作总结', priority: 'low', tags: ['日常'] },
  { title: '会议准备', desc: '会议议程和材料准备', priority: 'medium', tags: ['会议'] },
  { title: '数据分析报告', desc: '数据收集和分析报告', priority: 'medium', tags: ['数据', '分析'] },
  { title: '竞品调研', desc: '竞品功能对比分析', priority: 'medium', tags: ['调研'] },
  { title: '用户访谈', desc: '用户需求深度访谈', priority: 'medium', tags: ['用户', '调研'] },
  { title: 'UI设计稿', desc: '视觉设计稿输出和评审', priority: 'high', tags: ['设计', 'UI'] },
  { title: '数据库优化', desc: '数据库查询和索引优化', priority: 'high', tags: ['技术', '数据库'] },
  { title: '部署上线', desc: '生产环境部署和验证', priority: 'urgent', tags: ['运维', '发布'] },
  { title: '培训材料编写', desc: '培训课件和材料编写', priority: 'low', tags: ['培训'] },
  { title: '方案评审', desc: '组织方案评审会议', priority: 'high', tags: ['会议', '评审'] },
  { title: '需求评审', desc: '组织需求评审会', priority: 'high', tags: ['会议', '需求'] },
  { title: '供应商对接', desc: '与供应商沟通对接', priority: 'medium', tags: ['合作'] },
  { title: '合同审核', desc: '合同条款审核和确认', priority: 'high', tags: ['法务', '合同'] },
  { title: '预算编制', desc: '季度预算编制', priority: 'medium', tags: ['财务'] },
  { title: '招聘需求确认', desc: '与业务方确认招聘需求', priority: 'medium', tags: ['人力', '招聘'] },
  { title: '面试安排', desc: '候选人面试安排', priority: 'low', tags: ['人力', '招聘'] },
  { title: '团建活动策划', desc: '团建活动方案策划', priority: 'low', tags: ['文化'] },
  { title: '安全巡检', desc: '系统安全巡检和报告', priority: 'high', tags: ['安全'] },
  { title: '客户拜访', desc: '客户现场拜访和沟通', priority: 'high', tags: ['客户', '销售'] },
];

const subtaskTemplates = [
  '资料收集', '初稿编写', '内部评审', '修改完善', '终稿确认',
  '方案设计', '开发实现', '自测验证', '联调测试', '上线部署',
  '竞品分析', '需求确认', '计划制定', '执行推进', '总结汇报',
];

export function generateTasks(members: Member[], projects: Project[], goals: Goal[]): Task[] {
  const activeMembers = members.filter(m => m.status === 'active');
  const tasks: Task[] = [];
  const today = '2026-04-22';
  let taskIdx = 0;

  projects.forEach(project => {
    // 每个项目 3-8 个任务
    const taskCount = project.status === 'completed' ? randInt(3, 5) : randInt(4, 8);
    const doneRatio = project.status === 'completed' ? 1.0 : project.status === 'planning' ? 0 : Math.random() * 0.5;

    for (let i = 0; i < taskCount; i++) {
      const tmpl = taskTemplates[taskIdx % taskTemplates.length];
      taskIdx++;

      const statusRoll = Math.random();
      let status: Task['status'];
      if (project.status === 'completed') {
        status = 'done';
      } else if (statusRoll < doneRatio) {
        status = 'done';
      } else if (statusRoll < doneRatio + 0.4) {
        status = 'in_progress';
      } else {
        status = 'todo';
      }

      const startDate = offsetDate(project.startDate, randInt(0, 7));
      const dueDate = offsetDate(startDate, randInt(3, 30));
      const isOverdue = status !== 'done' && dueDate < today;

      const subtaskCount = randInt(0, 5);
      const projectSupporters = [...project.supporterIds, project.leaderId]
        .map(id => activeMembers.find(m => m.id === id))
        .filter(Boolean) as Member[];
      const assignee = projectSupporters.length > 0 ? pick(projectSupporters) : pick(activeMembers);
      const subtasks = Array.from({ length: subtaskCount }, (_, si) => ({
        id: gid('st'),
        title: subtaskTemplates[(taskIdx + si) % subtaskTemplates.length],
        completed: status === 'done' ? true : si < Math.floor(subtaskCount * 0.3 * Math.random() + 0.3),
        priority: 'medium' as const,
        dueDate: offsetDate(startDate, randInt(si * 3, si * 3 + 7)),
        reminderDate: Math.random() > 0.7 ? offsetDate(dueDate, -1) : null,
        leaderId: assignee.id,
        supporterIds: [] as string[],
        tags: [] as string[],
        attachments: [],
        trackingRecords: [],
        repeatCycle: 'none' as const,
        createdAt: startDate,
      }));

      const supporters = projectSupporters.filter(m => m.id !== assignee.id);
      const supporterIds = Array.from({ length: Math.min(randInt(1, 3), supporters.length) }, () => pick(supporters).id)
        .filter((v, i, a) => a.indexOf(v) === i);

      tasks.push({
        id: gid('t'),
        title: `${project.title} - ${tmpl.title}`,
        description: tmpl.desc,
        projectId: project.id,
        goalId: goals.find(g => g.id === project.goalId)?.id || null,
        parentId: null,
        status,
        priority: isOverdue ? pick(['urgent', 'high']) : tmpl.priority,
        leaderId: assignee.id,
        supporterIds,
        category: '', attachments: [], trackingRecords: [], repeatCycle: 'none',
        dueDate,
        reminderDate: Math.random() > 0.6 ? offsetDate(dueDate, -randInt(1, 3)) : null,
        completedAt: status === 'done' ? offsetDate(today, randInt(-10, -1)) : null,
        subtasks,
        tags: tmpl.tags,
        createdAt: offsetDate(startDate, -randInt(1, 5)),
        updatedAt: status === 'done' ? offsetDate(today, randInt(-5, -1)) : offsetDate(today, randInt(-3, 0)),
      });
    }
  });

  return tasks;
}

// ==================== 通知和活动 ====================
export function generateNotifications(tasks: Task[], members: Member[]): Notification[] {
  const notifications: Notification[] = [];
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < '2026-04-22');

  overdueTasks.slice(0, 10).forEach(t => {
    notifications.push({
      id: gid('n'), type: 'overdue', title: '任务已逾期',
      message: `「${t.title}」已超过截止日期，请尽快处理`,
      relatedId: t.id, relatedType: 'task',
      memberId: t.leaderId, read: Math.random() > 0.5,
      createdAt: new Date(Date.now() - randInt(0, 86400000)).toISOString(),
    });
  });

  const todayTasks = tasks.filter(t => t.status !== 'done' && t.dueDate === '2026-04-22');
  todayTasks.slice(0, 8).forEach(t => {
    notifications.push({
      id: gid('n'), type: 'reminder', title: '今日待办提醒',
      message: `「${t.title}」今日到期`,
      relatedId: t.id, relatedType: 'task',
      memberId: t.leaderId, read: Math.random() > 0.5,
      createdAt: '2026-04-22T08:00:00',
    });
  });

  return notifications;
}

export function generateActivities(tasks: Task[], goals: Goal[], projects: Project[], members: Member[]): Activity[] {
  const activities: Activity[] = [];
  const recentDone = tasks.filter(t => t.status === 'done' && t.completedAt).slice(0, 20);

  recentDone.forEach(t => {
    activities.push({
      id: gid('a'), memberId: t.leaderId, action: 'completed',
      targetType: 'task', targetId: t.id, targetTitle: t.title,
      details: '标记任务为已完成', createdAt: t.completedAt || new Date().toISOString(),
    });
  });

  return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
}

// ==================== 一键生成全部数据 ====================
export function generateAllData() {
  const members = generateMembers();
  const goals = generateGoals(members);
  const projects = generateProjects(members, goals);
  const tasks = generateTasks(members, projects, goals);
  const notifications = generateNotifications(tasks, members);
  const activities = generateActivities(tasks, goals, projects, members);

  return { members, goals, projects, tasks, notifications, activities, categories: [], templates: [], scheduleEvents: [], notes: [] };
}
