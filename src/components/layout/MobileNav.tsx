/**
 * MobileNav — 移动端底部导航
 * 从 Layout.tsx 抽出
 */
import React from 'react';
import { useStore } from '@/store/useStore';
import { hasPermission } from '@/store/reducer';
import { isFeatureVisible, recordAction } from '@/lib/progressiveDisclosure';
import type { Page } from './Layout';
import { LayoutDashboard, Target, FolderKanban, CheckSquare, BarChart3, Settings, BookOpen, Plus, Menu } from 'lucide-react';

const mobileNavItems: { page: Page; label: string; icon: React.ReactNode; shortLabel: string; requirePermission?: string }[] = [
  { page: 'dashboard', label: '工作台', icon: <LayoutDashboard size={20} />, shortLabel: '工作' },
  { page: 'goals', label: '目标管理', icon: <Target size={20} />, shortLabel: '目标' },
  { page: 'projects', label: '项目中心', icon: <FolderKanban size={20} />, shortLabel: '项目' },
  { page: 'tasks', label: '任务中心', icon: <CheckSquare size={20} />, shortLabel: '任务' },
];

interface MobileNavProps {
  currentPage: Page;
  onPageClick: (page: Page) => void;
  setSidebarOpen: (v: boolean) => void;
  setQuickCreateType: (t: 'task' | 'goal' | 'project') => void;
  setQuickCreateOpen: (v: boolean) => void;
}

export default function MobileNav({ currentPage, onPageClick, setSidebarOpen, setQuickCreateType, setQuickCreateOpen }: MobileNavProps) {
  const { state } = useStore();
  const user = state.currentUser;

  const visibleItems = mobileNavItems.filter(item => {
    if (item.requirePermission && (!user || (user.role !== 'admin' && !hasPermission(state, user.id, item.requirePermission as never)))) return false;
    return isFeatureVisible(item.page);
  });

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex items-center justify-around h-14 px-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {visibleItems.map(item => (
        <button key={item.page} onClick={() => { onPageClick(item.page); recordAction(); }}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${currentPage === item.page ? 'text-primary' : 'text-muted-foreground'}`}>
          {item.icon}
          <span className="text-[10px] mt-0.5">{item.shortLabel}</span>
        </button>
      ))}
      <button onClick={() => { setQuickCreateType('task'); setQuickCreateOpen(true); }}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white shadow-lg -mt-4" aria-label="快速创建">
        <Plus size={20} />
      </button>
      <button onClick={() => onPageClick('insight')}
        className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${currentPage === 'insight' ? 'text-primary' : 'text-muted-foreground'}`}>
        <BarChart3 size={20} />
        <span className="text-[10px] mt-0.5">洞察</span>
      </button>
      <button onClick={() => setSidebarOpen(true)}
        className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground">
        <Menu size={20} />
        <span className="text-[10px] mt-0.5">更多</span>
      </button>
    </nav>
  );
}
