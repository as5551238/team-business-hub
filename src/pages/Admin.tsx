import { useState, lazy, Suspense, useEffect } from 'react';
import { Users, Wrench, Calendar, Settings as SettingsIcon, GitBranch, Zap, Globe, Target, Bot, Server, Shield, BarChart3, Terminal, CreditCard, RotateCcw, Store, ShieldCheck, Radio, LayoutTemplate, ChevronDown, ChevronRight } from 'lucide-react';
import type { AdminTab } from './admin/constants';
import { useStore } from '@/store/useStore';
import { TabErrorBoundary, TabLoader } from '@/components/TabErrorBoundary';

const TeamTab = lazy(() => import('./admin/TeamTab').then(m => ({ default: m.TeamTab })));
const ToolboxTab = lazy(() => import('./admin/ToolboxTab').then(m => ({ default: m.ToolboxTab })));
const ScheduleTab = lazy(() => import('./admin/ScheduleTab').then(m => ({ default: m.ScheduleTab })));
const SettingsTab = lazy(() => import('./admin/SettingsTab').then(m => ({ default: m.SettingsTab })));
const FlowConfigTab = lazy(() => import('./admin/FlowConfigTab').then(m => ({ default: m.FlowConfigTab })));
const AutomationTab = lazy(() => import('./admin/AutomationTab').then(m => ({ default: m.AutomationTab })));
const IntegrationsTab = lazy(() => import('./admin/IntegrationsTab').then(m => ({ default: m.IntegrationsTab })));
const KpiTab = lazy(() => import('./admin/KpiTab').then(m => ({ default: m.KpiTab })));
const AgentAuditTab = lazy(() => import('./admin/AgentAuditTab').then(m => ({ default: m.AgentAuditTab })));
const DeployTab = lazy(() => import('./admin/DeployTab').then(m => ({ default: m.DeployTab })));
const RiskRadarTab = lazy(() => import('./admin/RiskRadarTab').then(m => ({ default: m.RiskRadarTab })));
const TeamLoadTab = lazy(() => import('./admin/TeamLoadTab').then(m => ({ default: m.TeamLoadTab })));
const McpToolsTab = lazy(() => import('./admin/McpToolsTab').then(m => ({ default: m.McpToolsTab })));
const BillingTab = lazy(() => import('./admin/BillingTab').then(m => ({ default: m.BillingTab })));
const RetroTrackingTab = lazy(() => import('./admin/RetroTrackingTab').then(m => ({ default: m.RetroTrackingTab })));
const AgentMarketplaceTab = lazy(() => import('./admin/AgentMarketplaceTab').then(m => ({ default: m.AgentMarketplaceTab })));
const ComplianceBaselineTab = lazy(() => import('./admin/ComplianceBaselineTab').then(m => ({ default: m.ComplianceBaselineTab })));
const CollabTab = lazy(() => import('./admin/CollabTab').then(m => ({ default: m.CollabTab })));
const TemplateMarketTab = lazy(() => import('./admin/TemplateMarketTab').then(m => ({ default: m.TemplateMarketTab })));

// --- Grouped tab structure: 5 sections instead of 19 flat tabs ---
interface TabItem { key: AdminTab; label: string; icon: typeof Users }
interface TabGroup { id: string; label: string; icon: typeof Users; tabs: TabItem[] }

const tabGroups: TabGroup[] = [
  {
    id: 'ops', label: '团队运营', icon: Users,
    tabs: [
      { key: 'team', label: '团队', icon: Users },
      { key: 'kpi', label: 'KPI', icon: Target },
      { key: 'riskradar', label: '风险雷达', icon: Shield },
      { key: 'teamload', label: '团队负载', icon: BarChart3 },
      { key: 'retro', label: '复盘跟踪', icon: RotateCcw },
    ],
  },
  {
    id: 'flow', label: '流程自动化', icon: GitBranch,
    tabs: [
      { key: 'flow', label: '流程配置', icon: GitBranch },
      { key: 'automation', label: '自动化', icon: Zap },
      { key: 'mcptools', label: 'MCP工具', icon: Terminal },
    ],
  },
  {
    id: 'ai', label: 'AI 与集成', icon: Bot,
    tabs: [
      { key: 'marketplace', label: 'Agent市场', icon: Store },
      { key: 'agent', label: 'Agent审计', icon: Bot },
      { key: 'integrations', label: '集成', icon: Globe },
      { key: 'collab', label: '实时协作', icon: Radio },
      { key: 'templates', label: '模板市场', icon: LayoutTemplate },
    ],
  },
  {
    id: 'infra', label: '系统运维', icon: Server,
    tabs: [
      { key: 'deploy', label: '部署', icon: Server },
      { key: 'compliance', label: '等保合规', icon: ShieldCheck },
      { key: 'billing', label: '订阅计费', icon: CreditCard },
      { key: 'settings', label: '设置', icon: SettingsIcon },
    ],
  },
  {
    id: 'tools', label: '工具', icon: Wrench,
    tabs: [
      { key: 'toolbox', label: '工具箱', icon: Wrench },
      { key: 'schedule', label: '日程', icon: Calendar },
    ],
  },
];

const TAB_LABELS: Record<AdminTab, string> = { team: '团队管理', toolbox: '工具箱', schedule: '日程管理', settings: '系统设置', flow: '流程配置', automation: '自动化规则', integrations: '集成管理', kpi: 'KPI 看板', agent: 'Agent 审计', deploy: '私有化部署', riskradar: '风险雷达', teamload: '团队负载', mcptools: 'MCP 工具', billing: '订阅计费', retro: '复盘跟踪', marketplace: 'Agent 市场', compliance: '等保合规', collab: '实时协作', templates: '模板市场' };

// Permission check per tab
const tabVisibility: Record<AdminTab, 'admin' | 'manager' | 'all'> = {
  team: 'manager', flow: 'manager', automation: 'manager', integrations: 'manager', kpi: 'manager',
  agent: 'admin', deploy: 'admin', settings: 'admin', billing: 'admin',
  marketplace: 'manager', compliance: 'manager', collab: 'manager', templates: 'all',
  retro: 'manager', riskradar: 'all', teamload: 'all', mcptools: 'manager', toolbox: 'all', schedule: 'all',
};

export default function Admin({ activeTab }: { activeTab?: string }) {
  const { state } = useStore();
  const role = state.currentUser?.role || 'member';
  const isAdmin = role === 'admin';
  const isManager = isAdmin || role === 'manager' || role === 'leader';

  const hasAccess = (tab: AdminTab) => {
    const v = tabVisibility[tab];
    if (v === 'all') return true;
    if (v === 'manager') return isManager;
    return isAdmin;
  };

  // Filter groups: only show groups that have at least one visible tab
  const visibleGroups = tabGroups.map(g => ({
    ...g,
    tabs: g.tabs.filter(t => hasAccess(t.key)),
  })).filter(g => g.tabs.length > 0);

  // Find initial tab
  const [tab, setTab] = useState<AdminTab>(() => {
    if (activeTab && hasAccess(activeTab as AdminTab)) return activeTab as AdminTab;
    return visibleGroups[0]?.tabs[0]?.key || 'team';
  });

  // Find which group the current tab belongs to
  const currentGroup = visibleGroups.find(g => g.tabs.some(t => t.key === tab));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (currentGroup) s.add(currentGroup.id);
    return s;
  });

  // Listen for CommandPalette events
  useEffect(() => {
    const handler1 = () => setTab('riskradar');
    const handler2 = () => setTab('teamload');
    window.addEventListener('tbh-open-risk-radar', handler1);
    window.addEventListener('tbh-open-team-load', handler2);
    return () => {
      window.removeEventListener('tbh-open-risk-radar', handler1);
      window.removeEventListener('tbh-open-team-load', handler2);
    };
  }, []);

  // When tab changes, expand its group
  const handleTabChange = (newTab: AdminTab) => {
    setTab(newTab);
    const grp = visibleGroups.find(g => g.tabs.some(t => t.key === newTab));
    if (grp) setExpandedGroups(prev => new Set([...prev, grp.id]));
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div className="h-full flex animate-fade-in">
      {/* Sidebar navigation with grouped sections */}
      <nav className="w-56 md-lg:w-48 lg:w-56 flex-shrink-0 border-r border-border bg-white overflow-y-auto p-3 space-y-1 hidden md:block">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2">管理中心</h2>
        {visibleGroups.map(group => (
          <div key={group.id}>
            <button
              onClick={() => toggleGroup(group.id)}
              className={`w-full flex items-center gap-2 px-2 py-2 text-xs font-semibold rounded-lg transition-colors hover:bg-muted ${currentGroup?.id === group.id ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <group.icon size={14} />
              <span className="flex-1 text-left">{group.label}</span>
              {expandedGroups.has(group.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {expandedGroups.has(group.id) && group.tabs.map(t => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={`w-full flex items-center gap-2 pl-7 pr-2 py-1.5 text-sm rounded-lg transition-colors ${tab === t.key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <t.icon size={14} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Mobile tab selector (replaces sidebar on small screens) */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 bg-white border-b border-border px-2 py-1 flex gap-1 overflow-x-auto">
        {visibleGroups.flatMap(g => g.tabs).map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            className={`flex items-center gap-1 px-2 py-1 text-xs whitespace-nowrap rounded transition-colors ${tab === t.key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}>
            <t.icon size={12} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6 md:pt-4 pt-10">
        <div className="mb-4">
          <h1 className="text-xl font-bold">{TAB_LABELS[tab]}</h1>
        </div>
        <div key={tab} className="animate-fade-in">
          {tab === 'team' && <TabErrorBoundary key="team" name={TAB_LABELS.team}><Suspense fallback={<TabLoader />}><TeamTab /></Suspense></TabErrorBoundary>}
          {tab === 'toolbox' && <TabErrorBoundary key="toolbox" name={TAB_LABELS.toolbox}><Suspense fallback={<TabLoader />}><ToolboxTab /></Suspense></TabErrorBoundary>}
          {tab === 'schedule' && <TabErrorBoundary key="schedule" name={TAB_LABELS.schedule}><Suspense fallback={<TabLoader />}><ScheduleTab /></Suspense></TabErrorBoundary>}
          {tab === 'settings' && <TabErrorBoundary key="settings" name={TAB_LABELS.settings}><Suspense fallback={<TabLoader />}><SettingsTab /></Suspense></TabErrorBoundary>}
          {tab === 'flow' && <TabErrorBoundary key="flow" name={TAB_LABELS.flow}><Suspense fallback={<TabLoader />}><FlowConfigTab /></Suspense></TabErrorBoundary>}
          {tab === 'automation' && <TabErrorBoundary key="automation" name={TAB_LABELS.automation}><Suspense fallback={<TabLoader />}><AutomationTab /></Suspense></TabErrorBoundary>}
          {tab === 'integrations' && <TabErrorBoundary key="integrations" name={TAB_LABELS.integrations}><Suspense fallback={<TabLoader />}><IntegrationsTab /></Suspense></TabErrorBoundary>}
          {tab === 'kpi' && <TabErrorBoundary key="kpi" name={TAB_LABELS.kpi}><Suspense fallback={<TabLoader />}><KpiTab /></Suspense></TabErrorBoundary>}
          {tab === 'agent' && <TabErrorBoundary key="agent" name={TAB_LABELS.agent}><Suspense fallback={<TabLoader />}><AgentAuditTab /></Suspense></TabErrorBoundary>}
          {tab === 'deploy' && <TabErrorBoundary key="deploy" name={TAB_LABELS.deploy}><Suspense fallback={<TabLoader />}><DeployTab /></Suspense></TabErrorBoundary>}
          {tab === 'riskradar' && <TabErrorBoundary key="riskradar" name={TAB_LABELS.riskradar}><Suspense fallback={<TabLoader />}><RiskRadarTab /></Suspense></TabErrorBoundary>}
          {tab === 'teamload' && <TabErrorBoundary key="teamload" name={'团队负载'}><Suspense fallback={<TabLoader />}><TeamLoadTab /></Suspense></TabErrorBoundary>}
          {tab === 'mcptools' && <TabErrorBoundary key="mcptools" name={TAB_LABELS.mcptools}><Suspense fallback={<TabLoader />}><McpToolsTab /></Suspense></TabErrorBoundary>}
          {tab === 'billing' && <TabErrorBoundary key="billing" name={TAB_LABELS.billing}><Suspense fallback={<TabLoader />}><BillingTab /></Suspense></TabErrorBoundary>}
          {tab === 'retro' && <TabErrorBoundary key="retro" name={TAB_LABELS.retro}><Suspense fallback={<TabLoader />}><RetroTrackingTab /></Suspense></TabErrorBoundary>}
          {tab === 'marketplace' && <TabErrorBoundary key="marketplace" name={TAB_LABELS.marketplace}><Suspense fallback={<TabLoader />}><AgentMarketplaceTab /></Suspense></TabErrorBoundary>}
          {tab === 'compliance' && <TabErrorBoundary key="compliance" name={TAB_LABELS.compliance}><Suspense fallback={<TabLoader />}><ComplianceBaselineTab /></Suspense></TabErrorBoundary>}
          {tab === 'collab' && <TabErrorBoundary key="collab" name={TAB_LABELS.collab}><Suspense fallback={<TabLoader />}><CollabTab /></Suspense></TabErrorBoundary>}
          {tab === 'templates' && <TabErrorBoundary key="templates" name={TAB_LABELS.templates}><Suspense fallback={<TabLoader />}><TemplateMarketTab /></Suspense></TabErrorBoundary>}
        </div>
      </div>
    </div>
  );
}
