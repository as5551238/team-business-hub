/**
 * Agent Marketplace — 可发现、安装、卸载、浏览能力型Agent
 * Phase 3-2: Agent 市场
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Bot,
  Search,
  Download,
  Trash2,
  Star,
  Eye,
  ChevronDown,
  ChevronRight,
  Package,
  CheckCircle2,
  Tag,
  Users,
  Zap,
  Shield,
  BarChart3,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

// ===== 类型定义 =====

type AgentCategory = 'productivity' | 'analytics' | 'security' | 'collaboration' | 'automation' | 'integration';

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  category: AgentCategory;
  version: string;
  author: string;
  rating: number; // 0-5
  installCount: number;
  protocol: 'MCP' | 'A2A' | 'REST';
  capabilities: string[];
  tags: string[];
  status: 'stable' | 'beta' | 'experimental';
  size: string; // e.g. "12KB"
}

// ===== 市场目录 =====

const MARKETPLACE_CATALOG: MarketplaceAgent[] = [
  {
    id: 'tbh-core',
    name: 'TBH Core Agent',
    description: '团队业务中台核心智能体，提供目标管理、项目协作、任务分配等基础能力',
    longDescription: '核心智能体，管理目标/项目/任务全生命周期。支持创建、编辑、删除、分配、状态流转等操作，通过 MCP 协议提供标准化工具接口。',
    category: 'productivity',
    version: '2.1.0',
    author: 'TBH Team',
    rating: 4.8,
    installCount: 128,
    protocol: 'MCP',
    capabilities: ['goal_manage', 'project_manage', 'task_assign', 'member_lookup', 'batch_operation'],
    tags: ['核心', '必装', 'MCP'],
    status: 'stable',
    size: '24KB',
  },
  {
    id: 'tbh-risk',
    name: 'Risk Radar Agent',
    description: '风险识别与预警智能体，V2引擎支持进度感知+级联传播预测',
    longDescription: '全方位风险扫描引擎：延期预测(进度感知V2)、级联传播预测、资源瓶颈检测、OKR达成概率评估。综合加权输出风险雷达图和可操作建议。',
    category: 'analytics',
    version: '2.0.0',
    author: 'TBH Team',
    rating: 4.6,
    installCount: 95,
    protocol: 'MCP',
    capabilities: ['risk_scan', 'delay_predict', 'cascade_predict', 'resource_bottleneck', 'okr_tracking'],
    tags: ['风险', '预测', 'V2'],
    status: 'stable',
    size: '18KB',
  },
  {
    id: 'tbh-ai-review',
    name: 'AI Review Agent',
    description: '复盘与洞察生成智能体，周期复盘+趋势分析+预测性建议',
    longDescription: '基于历史数据的智能复盘引擎，自动生成周期性回顾报告，识别趋势与异常，提供改进建议。支持 LLM 深度模式。',
    category: 'analytics',
    version: '1.5.0',
    author: 'TBH Team',
    rating: 4.3,
    installCount: 72,
    protocol: 'A2A',
    capabilities: ['review_generate', 'trend_analysis', 'prediction', 'suggestion'],
    tags: ['复盘', '分析', 'LLM'],
    status: 'stable',
    size: '15KB',
  },
  {
    id: 'tbh-security',
    name: 'Security Guardian',
    description: '安全合规智能体，等保基线自查、权限审计、敏感数据扫描',
    longDescription: '安全左移的守护者：自动检测 RLS 配置、权限越权、敏感字段泄露、SQL注入风险。生成等保合规评分和修复建议。',
    category: 'security',
    version: '1.0.0',
    author: 'TBH Security',
    rating: 4.1,
    installCount: 38,
    protocol: 'MCP',
    capabilities: ['rls_audit', 'permission_scan', 'sensitive_data_detect', 'compliance_check'],
    tags: ['安全', '等保', '合规'],
    status: 'beta',
    size: '22KB',
  },
  {
    id: 'tbh-collab',
    name: 'Collaboration Hub',
    description: '实时协作智能体，@mention追踪、未读提醒、跨团队协同',
    longDescription: '增强团队协作体验：智能 @mention 建议、未读消息红点追踪、跨团队项目协同、协作冲突检测与自动合并建议。',
    category: 'collaboration',
    version: '1.2.0',
    author: 'TBH Team',
    rating: 4.0,
    installCount: 56,
    protocol: 'A2A',
    capabilities: ['mention_track', 'unread_alert', 'cross_team_sync', 'conflict_detect'],
    tags: ['协作', '通知', '同步'],
    status: 'stable',
    size: '14KB',
  },
  {
    id: 'tbh-auto',
    name: 'Automation Engine',
    description: '自动化流程引擎，条件触发+动作链+定时任务',
    longDescription: '可视化自动化编排：基于事件的条件触发器、多步骤动作链、cron定时任务、审批流自动推进。零代码配置。',
    category: 'automation',
    version: '1.8.0',
    author: 'TBH Team',
    rating: 4.4,
    installCount: 83,
    protocol: 'MCP',
    capabilities: ['event_trigger', 'action_chain', 'cron_schedule', 'approval_automation'],
    tags: ['自动化', '流程', '触发器'],
    status: 'stable',
    size: '28KB',
  },
  {
    id: 'ext-figma',
    name: 'Figma Design Agent',
    description: '设计稿同步智能体，Figma设计稿解析为开发参数（待接入）',
    longDescription: '将 Figma 设计稿自动解析为前端组件参数、颜色变量、间距规范。支持设计变更检测和版本对比。',
    category: 'integration',
    version: '0.3.0',
    author: 'Community',
    rating: 3.2,
    installCount: 12,
    protocol: 'REST',
    capabilities: ['design_parse', 'asset_export', 'version_diff'],
    tags: ['设计', 'Figma', '外部'],
    status: 'experimental',
    size: '8KB',
  },
  {
    id: 'ext-gitlab',
    name: 'GitLab CI Agent',
    description: '持续集成监控智能体，追踪管道状态和部署日志（待接入）',
    longDescription: '实时监控 GitLab CI/CD 管道状态，自动关联部署日志到任务，失败时创建 bug 任务。支持 Webhook 实时推送。',
    category: 'integration',
    version: '0.5.0',
    author: 'Community',
    rating: 3.5,
    installCount: 18,
    protocol: 'REST',
    capabilities: ['pipeline_monitor', 'deploy_log', 'failure_create_task'],
    tags: ['CI/CD', 'GitLab', '部署'],
    status: 'experimental',
    size: '10KB',
  },
  {
    id: 'ext-wechat-work',
    name: '企微通知 Agent',
    description: '企业微信消息推送智能体，自动推送任务更新和风险预警',
    longDescription: '通过企业微信 Webhook 实时推送任务变更、风险预警、每日摘要。支持自定义推送规则和静默时段。',
    category: 'integration',
    version: '1.0.0',
    author: 'Community',
    rating: 4.2,
    installCount: 45,
    protocol: 'REST',
    capabilities: ['wechat_push', 'custom_rule', 'quiet_hours', 'daily_digest'],
    tags: ['企微', '通知', '推送'],
    status: 'stable',
    size: '6KB',
  },
  {
    id: 'ext-bi-dashboard',
    name: 'BI Dashboard Agent',
    description: '商业智能看板智能体，自动生成数据报表和可视化图表',
    longDescription: '自动从任务、目标、成员数据生成多维度报表：燃尽图、完成率趋势、资源利用热力图、OKR 进度仪表盘。',
    category: 'analytics',
    version: '0.8.0',
    author: 'Community',
    rating: 3.8,
    installCount: 29,
    protocol: 'A2A',
    capabilities: ['report_generate', 'chart_render', 'data_export', 'schedule_report'],
    tags: ['报表', 'BI', '可视化'],
    status: 'beta',
    size: '16KB',
  },
];

// ===== 常量 =====

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  productivity: '效率提升',
  analytics: '数据分析',
  security: '安全合规',
  collaboration: '协作沟通',
  automation: '自动化',
  integration: '外部集成',
};

const CATEGORY_ICONS: Record<AgentCategory, typeof Zap> = {
  productivity: Sparkles,
  analytics: BarChart3,
  security: Shield,
  collaboration: Users,
  automation: Zap,
  integration: ExternalLink,
};

const STATUS_COLORS: Record<string, string> = {
  stable: 'bg-green-100 text-green-700',
  beta: 'bg-yellow-100 text-yellow-700',
  experimental: 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS: Record<string, string> = {
  stable: '稳定版',
  beta: '测试版',
  experimental: '实验版',
};

// ===== 已安装Agent持久化 =====

const STORAGE_KEY = 'tbh-installed-agents';

function loadInstalled(): Set<string> {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return new Set(JSON.parse(s));
  } catch {}
  // Default: core agents are installed
  return new Set(['tbh-core', 'tbh-risk', 'tbh-ai-review']);
}

function saveInstalled(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

// ===== 子组件 =====

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={10}
          className={i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
        />
      ))}
      <span className="text-[10px] text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

function AgentCard({
  agent,
  isInstalled,
  onInstall,
  onUninstall,
  isExpanded,
  onToggle,
}: {
  agent: MarketplaceAgent;
  isInstalled: boolean;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const CatIcon = CATEGORY_ICONS[agent.category];
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${isExpanded ? 'ring-1 ring-primary/30' : ''}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${agent.protocol === 'MCP' ? 'bg-blue-100 text-blue-600' : agent.protocol === 'A2A' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'}`}>
          <Bot size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{agent.name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[agent.status]}`}>
              {STATUS_LABELS[agent.status]}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground">{agent.installCount}次安装</span>
          {isInstalled ? (
            <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
              <CheckCircle2 size={12} />已装
            </span>
          ) : (
            <Download size={14} className="text-primary" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 bg-muted/5">
          <p className="text-xs text-muted-foreground leading-relaxed">{agent.longDescription}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <CatIcon size={12} className="text-muted-foreground" />
              <span className="text-muted-foreground">类别:</span>
              <span>{CATEGORY_LABELS[agent.category]}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag size={12} className="text-muted-foreground" />
              <span className="text-muted-foreground">版本:</span>
              <span>v{agent.version}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Package size={12} className="text-muted-foreground" />
              <span className="text-muted-foreground">协议:</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${agent.protocol === 'MCP' ? 'bg-blue-100 text-blue-700' : agent.protocol === 'A2A' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                {agent.protocol}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Eye size={12} className="text-muted-foreground" />
              <span className="text-muted-foreground">体积:</span>
              <span>{agent.size}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-muted-foreground" />
              <span className="text-muted-foreground">作者:</span>
              <span>{agent.author}</span>
            </div>
            <div>
              <StarRating rating={agent.rating} />
            </div>
          </div>

          {/* 能力标签 */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground">能力</div>
            <div className="flex flex-wrap gap-1">
              {agent.capabilities.map(cap => (
                <span key={cap} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-mono">
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* 标签 */}
          <div className="flex flex-wrap gap-1">
            {agent.tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                #{tag}
              </span>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1">
            {isInstalled ? (
              <button
                type="button"
                onClick={() => onUninstall(agent.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={12} />卸载
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onInstall(agent.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <Download size={12} />安装
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 主组件 =====

export function AgentMarketplaceTab() {
  const [installed, setInstalled] = useState<Set<string>>(loadInstalled);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AgentCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<'market' | 'installed'>('market');

  const handleInstall = useCallback((id: string) => {
    setInstalled(prev => {
      const next = new Set(prev);
      next.add(id);
      saveInstalled(next);
      return next;
    });
  }, []);

  const handleUninstall = useCallback((id: string) => {
    if (id === 'tbh-core') return; // 核心Agent不可卸载
    setInstalled(prev => {
      const next = new Set(prev);
      next.delete(id);
      saveInstalled(next);
      return next;
    });
  }, []);

  const filteredAgents = useMemo(() => {
    let list = viewMode === 'installed'
      ? MARKETPLACE_CATALOG.filter(a => installed.has(a.id))
      : MARKETPLACE_CATALOG;

    if (categoryFilter !== 'all') {
      list = list.filter(a => a.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q)) ||
        a.capabilities.some(c => c.toLowerCase().includes(q))
      );
    }
    return list;
  }, [viewMode, categoryFilter, searchQuery, installed]);

  const stats = useMemo(() => ({
    total: MARKETPLACE_CATALOG.length,
    installed: installed.size,
    stable: MARKETPLACE_CATALOG.filter(a => a.status === 'stable').length,
    categories: [...new Set(MARKETPLACE_CATALOG.map(a => a.category))].length,
  }), [installed]);

  return (
    <div className="space-y-4">
      {/* 概览统计 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Package size={12} />市场总数</div>
          <div className="text-xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CheckCircle2 size={12} />已安装</div>
          <div className="text-xl font-bold text-green-600">{stats.installed}</div>
        </div>
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Shield size={12} />稳定版</div>
          <div className="text-xl font-bold text-blue-600">{stats.stable}</div>
        </div>
        <div className="bg-card rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Zap size={12} />类别数</div>
          <div className="text-xl font-bold">{stats.categories}</div>
        </div>
      </div>

      {/* 搜索 + 筛选 + 视图切换 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索 Agent 名称、能力、标签..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value as AgentCategory | 'all')}
        >
          <option value="all">全部类别</option>
          {(Object.entries(CATEGORY_LABELS) as [AgentCategory, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('market')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'market' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            <Package size={12} />市场
          </button>
          <button
            onClick={() => setViewMode('installed')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'installed' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            <CheckCircle2 size={12} />已安装({stats.installed})
          </button>
        </div>
      </div>

      {/* Agent 列表 */}
      <div className="space-y-2">
        {filteredAgents.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {searchQuery ? `未找到匹配 "${searchQuery}" 的 Agent` : '暂无 Agent'}
          </div>
        ) : (
          filteredAgents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isInstalled={installed.has(agent.id)}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              isExpanded={expandedId === agent.id}
              onToggle={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
            />
          ))
        )}
      </div>

      {/* 底部说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-[11px] text-blue-700">
          <strong>Agent 市场</strong>：发现和安装扩展智能体。每个 Agent 通过 MCP/A2A/REST 协议与中台交互，安装后自动注册到 Agent 发现中心。核心 Agent (TBH Core) 不可卸载。
        </p>
      </div>
    </div>
  );
}
