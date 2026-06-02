/**
 * 模板市场 — 项目模板一键部署、模板创作、模板浏览
 * Phase 3-5: Templates (免费模板市场，不含付费)
 */
import { useState, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import {
  LayoutTemplate,
  Search,
  Download,
  Plus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Briefcase,
  GraduationCap,
  Heart,
  Lightbulb,
  Rocket,
  CheckCircle2,
  Eye,
  Clock,
  Star,
  Tag,
  FileText,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

// ===== 类型定义 =====

type TemplateCategory = 'business' | 'education' | 'personal' | 'startup' | 'all';

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  author: string;
  rating: number;
  useCount: number;
  tags: string[];
  goals: Array<{ title: string; keyResults: string[] }>;
  projects: Array<{ title: string; taskCount: number }>;
  preview: string;
}

// ===== 模板目录 =====

const TEMPLATE_CATALOG: ProjectTemplate[] = [
  {
    id: 'tpl-okr-quarterly',
    name: '季度OKR管理',
    description: '标准季度OKR管理模板，包含目标设定、KR追踪、周报汇总标准流程',
    category: 'business',
    author: 'TBH Team',
    rating: 4.7,
    useCount: 342,
    tags: ['OKR', '季度', '目标管理', '标准流程'],
    goals: [
      { title: 'Q3 产品增长目标', keyResults: ['月活用户增长30%', '付费转化率提升至5%', 'NPS评分达到45+'] },
      { title: 'Q3 技术架构升级', keyResults: ['核心接口P99<200ms', '系统可用性99.9%', '技术债减少50%'] },
    ],
    projects: [{ title: '增长实验', taskCount: 12 }, { title: '架构优化', taskCount: 8 }],
    preview: '季度OKR标准模板，3个目标×3个KR，配套周报和复盘流程',
  },
  {
    id: 'tpl-product-launch',
    name: '产品发布管理',
    description: '新产品发布全流程管理模板，从需求确认到上线监控',
    category: 'startup',
    author: 'TBH Team',
    rating: 4.5,
    useCount: 198,
    tags: ['产品发布', '项目管理', '上线', '新功能'],
    goals: [
      { title: 'V2.0 成功发布', keyResults: ['0个P0bug', '发布当天稳定性99.5%', '用户满意度4.0+'] },
    ],
    projects: [{ title: '需求确认', taskCount: 6 }, { title: '开发冲刺', taskCount: 15 }, { title: '测试验收', taskCount: 10 }, { title: '上线监控', taskCount: 4 }],
    preview: '产品发布全流程，4个项目阶段，35个标准任务，0个P0bug目标',
  },
  {
    id: 'tpl-team-onboarding',
    name: '新人入职引导',
    description: '新成员入职标准化模板，覆盖环境配置、培训、试用评估',
    category: 'business',
    author: 'TBH Team',
    rating: 4.3,
    useCount: 156,
    tags: ['入职', '培训', '新人', '标准化'],
    goals: [
      { title: '新人30天独立上手', keyResults: ['7天内完成环境配置', '14天内独立完成首个任务', '30天通过试用期评估'] },
    ],
    projects: [{ title: '第1周：环境与认知', taskCount: 8 }, { title: '第2周：实践任务', taskCount: 6 }, { title: '第3-4周：独立贡献', taskCount: 5 }],
    preview: '30天新人入职引导，3个项目阶段，19个标准任务',
  },
  {
    id: 'tpl-course-project',
    name: '课程项目管理',
    description: '教育场景项目管理模板，适用于课程作业、毕业设计、小组项目',
    category: 'education',
    author: 'Community',
    rating: 4.0,
    useCount: 89,
    tags: ['教育', '课程', '毕业设计', '团队协作'],
    goals: [
      { title: '课程项目完成', keyResults: ['按时提交中期报告', '最终答辩评分≥85', '团队贡献度均衡'] },
    ],
    projects: [{ title: '选题与规划', taskCount: 4 }, { title: '开发与实现', taskCount: 10 }, { title: '文档与答辩', taskCount: 5 }],
    preview: '课程项目模板，3个阶段，19个任务，含中期检查和答辩准备',
  },
  {
    id: 'tpl-personal-growth',
    name: '个人成长计划',
    description: '个人技能提升和习惯养成模板，覆盖学习、健身、阅读等维度',
    category: 'personal',
    author: 'Community',
    rating: 4.2,
    useCount: 215,
    tags: ['个人', '习惯', '成长', '学习'],
    goals: [
      { title: '年度技能提升', keyResults: ['掌握2项新技能', '获得1项认证', '完成3个实战项目'] },
      { title: '健康习惯养成', keyResults: ['每周运动3次', '每日睡眠7小时+', '体重维持目标范围'] },
    ],
    projects: [{ title: '技能学习', taskCount: 8 }, { title: '健康习惯', taskCount: 6 }],
    preview: '个人成长双维度模板：技能提升+健康习惯，14个跟踪任务',
  },
  {
    id: 'tpl-startup-mvp',
    name: 'MVP 快速验证',
    description: '初创产品MVP验证模板，快速验证想法、收集反馈、迭代决策',
    category: 'startup',
    author: 'TBH Team',
    rating: 4.6,
    useCount: 127,
    tags: ['创业', 'MVP', '验证', '精益'],
    goals: [
      { title: 'MVP 验证通过', keyResults: ['2周内完成MVP', '获得50个种子用户', '核心假设验证率≥60%'] },
    ],
    projects: [{ title: '假设定义', taskCount: 3 }, { title: '最小开发', taskCount: 8 }, { title: '用户验证', taskCount: 5 }, { title: '复盘决策', taskCount: 3 }],
    preview: '精益创业MVP模板，4阶段19任务，核心假设→最小开发→用户验证→决策',
  },
];

const CATEGORY_CONFIG: Record<TemplateCategory, { label: string; icon: typeof Briefcase; color: string }> = {
  business: { label: '企业管理', icon: Briefcase, color: 'text-blue-600 bg-blue-100' },
  education: { label: '教育学习', icon: GraduationCap, color: 'text-purple-600 bg-purple-100' },
  personal: { label: '个人生活', icon: Heart, color: 'text-pink-600 bg-pink-100' },
  startup: { label: '创业创新', icon: Rocket, color: 'text-orange-600 bg-orange-100' },
  all: { label: '全部', icon: LayoutTemplate, color: 'text-gray-600 bg-gray-100' },
};

// ===== 子组件 =====

function TemplateCard({
  template,
  isExpanded,
  onToggle,
  onDeploy,
}: {
  template: ProjectTemplate;
  isExpanded: boolean;
  onToggle: () => void;
  onDeploy: (id: string) => void;
}) {
  const catConfig = CATEGORY_CONFIG[template.category];
  const CatIcon = catConfig.icon;
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${isExpanded ? 'ring-1 ring-primary/30' : ''}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${catConfig.color}`}>
          <CatIcon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{template.name}</span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{template.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Download size={10} />{template.useCount}</span>
          <span className="text-[10px] text-amber-500 flex items-center gap-0.5"><Star size={10} className="fill-amber-400" />{template.rating}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 bg-muted/5">
          <p className="text-xs text-muted-foreground leading-relaxed">{template.preview}</p>

          {/* 目标和KR */}
          <div className="space-y-2">
            {template.goals.map((goal, gi) => (
              <div key={gi} className="border rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles size={12} className="text-primary" />
                  {goal.title}
                </div>
                {goal.keyResults.map((kr, ki) => (
                  <div key={ki} className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                    {kr}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 项目概览 */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground">包含项目</div>
            <div className="flex flex-wrap gap-2">
              {template.projects.map((p, pi) => (
                <div key={pi} className="flex items-center gap-1 px-2 py-1 rounded bg-card border text-[11px]">
                  <FileText size={10} className="text-muted-foreground" />
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground">({p.taskCount}个任务)</span>
                </div>
              ))}
            </div>
          </div>

          {/* 标签 */}
          <div className="flex flex-wrap gap-1">
            {template.tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">#{tag}</span>
            ))}
          </div>

          {/* 操作 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onDeploy(template.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              <Download size={12} />一键部署
            </button>
            <span className="text-[10px] text-muted-foreground">作者: {template.author}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 主组件 =====

export function TemplateMarketTab() {
  const { dispatch } = useStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory>('all');
  const [deployedIds, setDeployedIds] = useState<Set<string>>(new Set());

  const filteredTemplates = useMemo(() => {
    let list = TEMPLATE_CATALOG;
    if (categoryFilter !== 'all') {
      list = list.filter(t => t.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }
    return list;
  }, [categoryFilter, searchQuery]);

  const handleDeploy = useCallback((templateId: string) => {
    const template = TEMPLATE_CATALOG.find(t => t.id === templateId);
    if (!template) return;

    // 创建目标
    for (const goalDef of template.goals) {
      const goalId = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      dispatch({
        type: 'ADD_GOAL',
        payload: {
          id: goalId,
          title: goalDef.title,
          description: `来自模板: ${template.name}`,
          status: 'todo',
          priority: 'medium',
          keyResults: goalDef.keyResults.map((kr, i) => ({
            id: `kr-${Date.now()}-${i}`,
            title: kr,
            currentValue: 0,
            targetValue: 100,
          })),
          createdAt: new Date().toISOString(),
        },
      });
    }

    // 创建项目
    for (const projDef of template.projects) {
      dispatch({
        type: 'ADD_PROJECT',
        payload: {
          id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: projDef.title,
          description: `来自模板: ${template.name}`,
          status: 'todo',
          priority: 'medium',
          createdAt: new Date().toISOString(),
        },
      });
    }

    setDeployedIds(prev => new Set([...prev, templateId]));
  }, [dispatch]);

  return (
    <div className="space-y-4">
      {/* 概览 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><LayoutTemplate size={12} />模板总数</div>
          <div className="text-xl font-bold">{TEMPLATE_CATALOG.length}</div>
        </div>
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Download size={12} />总部署次数</div>
          <div className="text-xl font-bold text-green-600">{TEMPLATE_CATALOG.reduce((s, t) => s + t.useCount, 0)}</div>
        </div>
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Lightbulb size={12} />分类数</div>
          <div className="text-xl font-bold">{Object.keys(CATEGORY_CONFIG).length - 1}</div>
        </div>
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CheckCircle2 size={12} />已部署</div>
          <div className="text-xl font-bold text-blue-600">{deployedIds.size}</div>
        </div>
      </div>

      {/* 搜索 + 筛选 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索模板名称、描述、标签..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {(Object.entries(CATEGORY_CONFIG) as [TemplateCategory, typeof CATEGORY_CONFIG.business][]).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${categoryFilter === key ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                <Icon size={10} />{config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 模板列表 */}
      <div className="space-y-2">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {searchQuery ? `未找到匹配 "${searchQuery}" 的模板` : '暂无模板'}
          </div>
        ) : (
          filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              isExpanded={expandedId === template.id}
              onToggle={() => setExpandedId(expandedId === template.id ? null : template.id)}
              onDeploy={handleDeploy}
            />
          ))
        )}
      </div>

      {/* 自定义模板提示 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
        <h4 className="font-semibold text-sm flex items-center gap-2"><Plus size={14} />创建自定义模板</h4>
        <p className="text-xs text-blue-700">
          选择现有的目标和项目，将其打包为可复用的模板。自定义模板存储在本地，可导出分享给团队。未来版本将支持模板市场发布。
        </p>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          onClick={() => {
            alert('自定义模板创作功能即将推出，敬请期待！');
          }}
        >
          <Plus size={12} />创建模板
        </button>
      </div>
    </div>
  );
}
