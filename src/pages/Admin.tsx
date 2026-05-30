import { useState, lazy, Suspense, useEffect } from 'react';
import { Users, Wrench, Calendar, Settings as SettingsIcon, GitBranch, Zap, Globe, Target, Bot, Server, Shield, BarChart3, Terminal, CreditCard } from 'lucide-react';
import type { AdminTab } from './admin/constants';
import { useStore } from '@/store/useStore';
import { TabErrorBoundary, TabLoader } from '@/components/TabErrorBoundary';
import ViewModeSwitch from '@/components/ViewModeSwitch';

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

const tabItems: { key: AdminTab; label: string; icon: typeof Users }[] = [
  { key: 'team', label: '团队', icon: Users },
  { key: 'flow', label: '流程配置', icon: GitBranch },
  { key: 'automation', label: '自动化', icon: Zap },
  { key: 'kpi', label: 'KPI', icon: Target },
  { key: 'riskradar', label: '风险雷达', icon: Shield },
  { key: 'teamload', label: '团队负载', icon: BarChart3 },
  { key: 'mcptools', label: 'MCP工具', icon: Terminal },
  { key: 'agent', label: 'Agent审计', icon: Bot },
  { key: 'integrations', label: '集成', icon: Globe },
  { key: 'deploy', label: '部署', icon: Server },
  { key: 'toolbox', label: '工具箱', icon: Wrench },
  { key: 'schedule', label: '日程', icon: Calendar },
  { key: 'billing', label: '订阅计费', icon: CreditCard },
  { key: 'settings', label: '设置', icon: SettingsIcon },
];

const TAB_LABELS: Record<AdminTab, string> = { team: '团队管理', toolbox: '工具箱', schedule: '日程管理', settings: '系统设置', flow: '流程配置', automation: '自动化规则', integrations: '集成管理', kpi: 'KPI 看板', agent: 'Agent 审计', deploy: '私有化部署', riskradar: '风险雷达', teamload: '团队负载', mcptools: 'MCP 工具', billing: '订阅计费' };


export default function Admin({ activeTab }: { activeTab?: string }) {
  const { state } = useStore();
  const role = state.currentUser?.role || 'member';
  const isAdmin = role === 'admin';
  const isManager = isAdmin || role === 'manager' || role === 'leader';

  const visibleTabs = tabItems.filter(t => {
    if (t.key === 'settings') return isAdmin;
    if (t.key === 'team') return isManager;
    if (t.key === 'flow' || t.key === 'automation' || t.key === 'integrations' || t.key === 'kpi') return isManager;
    if (t.key === 'agent' || t.key === 'deploy') return isAdmin;
    if (t.key === 'billing') return isAdmin;
    return true;
  });
  const [tab, setTab] = useState<AdminTab>((activeTab as AdminTab) || 'team');

  // 监听 CommandPalette 事件：打开风险雷达/团队负载
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

  return (
    <div className="h-full flex flex-col p-4 md:p-6 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold">系统管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">管理团队配置、流程与系统设置</p>
      </div>
      <ViewModeSwitch items={visibleTabs.map(t => ({ value: t.key, label: t.label, icon: t.icon }))} value={tab} onChange={v => setTab(v as AdminTab)} size="sm" />
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
        {tab === 'teamload' && <TabErrorBoundary key="teamload" name={TAB_LABELS.teamload}><Suspense fallback={<TabLoader />}><TeamLoadTab /></Suspense></TabErrorBoundary>}
        {tab === 'mcptools' && <TabErrorBoundary key="mcptools" name={TAB_LABELS.mcptools}><Suspense fallback={<TabLoader />}><McpToolsTab /></Suspense></TabErrorBoundary>}
        {tab === 'billing' && <TabErrorBoundary key="billing" name={TAB_LABELS.billing}><Suspense fallback={<TabLoader />}><BillingTab /></Suspense></TabErrorBoundary>}
      </div>
    </div>
  );
}
