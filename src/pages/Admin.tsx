import { useState } from 'react';
import { Users, Wrench, Calendar, Settings as SettingsIcon } from 'lucide-react';
import { TeamTab } from './admin/TeamTab';
import { ToolboxTab } from './admin/ToolboxTab';
import { ScheduleTab } from './admin/ScheduleTab';
import { SettingsTab } from './admin/SettingsTab';
import type { AdminTab } from './admin/constants';

const tabItems: { key: AdminTab; label: string; icon: typeof Users }[] = [
  { key: 'team', label: '团队', icon: Users },
  { key: 'toolbox', label: '工具箱', icon: Wrench },
  { key: 'schedule', label: '日程', icon: Calendar },
  { key: 'settings', label: '设置', icon: SettingsIcon },
];

export default function Admin({ activeTab }: { activeTab?: string }) {
  const [tab, setTab] = useState<AdminTab>((activeTab as AdminTab) || 'team');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {tabItems.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm rounded-lg border border-border transition-colors flex items-center gap-1.5 whitespace-nowrap ${tab === t.key ? 'bg-primary text-primary-foreground font-medium' : 'bg-white hover:bg-muted/50'}`}>
              <Icon size={16} />{t.label}
            </button>
          );
        })}
      </div>
      {tab === 'team' && <TeamTab />}
      {tab === 'toolbox' && <ToolboxTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
