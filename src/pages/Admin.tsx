import { useState, Component, type ReactNode, type ErrorInfo } from 'react';
import { Users, Wrench, Calendar, Settings as SettingsIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import { TeamTab } from './admin/TeamTab';
import { ToolboxTab } from './admin/ToolboxTab';
import { ScheduleTab } from './admin/ScheduleTab';
import { SettingsTab } from './admin/SettingsTab';
import type { AdminTab } from './admin/constants';
import { useStore } from '@/store/useStore';

const tabItems: { key: AdminTab; label: string; icon: typeof Users }[] = [
  { key: 'team', label: '团队', icon: Users },
  { key: 'toolbox', label: '工具箱', icon: Wrench },
  { key: 'schedule', label: '日程', icon: Calendar },
  { key: 'settings', label: '设置', icon: SettingsIcon },
];

class TabErrorBoundary extends Component<{ children: ReactNode; name: string }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`TabErrorBoundary [${this.props.name}]:`, error, info.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <div className="text-sm font-medium">{this.props.name}加载出错</div>
          <div className="text-xs max-w-md text-center">{this.state.error?.message || ''}</div>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">
            <RefreshCw size={14} /> 重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TAB_LABELS: Record<AdminTab, string> = { team: '团队管理', toolbox: '工具箱', schedule: '日程管理', settings: '系统设置' };

export default function Admin({ activeTab }: { activeTab?: string }) {
  const { state } = useStore();
  const role = state.currentUser?.role || 'member';
  const isAdmin = role === 'admin';
  const isManager = isAdmin || role === 'manager' || role === 'leader';

  const visibleTabs = tabItems.filter(t => {
    if (t.key === 'settings') return isAdmin;
    if (t.key === 'team') return isManager;
    return true;
  });
  const [tab, setTab] = useState<AdminTab>((activeTab as AdminTab) || (visibleTabs[0]?.key || 'toolbox'));

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {visibleTabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm rounded-lg border border-border transition-colors flex items-center gap-1.5 whitespace-nowrap ${tab === t.key ? 'bg-primary text-primary-foreground font-medium' : 'bg-white hover:bg-muted/50'}`}>
              <Icon size={16} />{t.label}
            </button>
          );
        })}
      </div>
      {tab === 'team' && <TabErrorBoundary key="team" name={TAB_LABELS.team}><TeamTab /></TabErrorBoundary>}
      {tab === 'toolbox' && <TabErrorBoundary key="toolbox" name={TAB_LABELS.toolbox}><ToolboxTab /></TabErrorBoundary>}
      {tab === 'schedule' && <TabErrorBoundary key="schedule" name={TAB_LABELS.schedule}><ScheduleTab /></TabErrorBoundary>}
      {tab === 'settings' && <TabErrorBoundary key="settings" name={TAB_LABELS.settings}><SettingsTab /></TabErrorBoundary>}
    </div>
  );
}
