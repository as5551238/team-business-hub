/**
 * PageShell — 页面统一骨架
 * 标准化每个页面的 标题/Tab/筛选/操作 布局
 * 支持：默认标题、自定义标题区、标准Tabs、自定义Tab组件、筛选栏、视图模式、操作按钮
 */
import React, { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageShellTab {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface PageShellViewMode {
  key: string;
  label: string;
  icon: ReactNode;
}

interface PageShellProps {
  /** 页面标题（与 headerContent 互斥） */
  title?: string;
  /** 标题图标 */
  icon?: ReactNode;
  /** 自定义标题区内容（覆盖 title/icon） */
  headerContent?: ReactNode;
  /** 右侧操作按钮区 */
  actions?: ReactNode;

  /** 标准 Tab 列表（与 tabsComponent 互斥） */
  tabs?: PageShellTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** 自定义 Tab 切换组件，如 ViewModeSwitch（覆盖 tabs） */
  tabsComponent?: ReactNode;

  /** 筛选栏内容 */
  filters?: ReactNode;

  /** 视图模式图标按钮（显示在标题行右侧） */
  viewModes?: PageShellViewMode[];
  activeViewMode?: string;
  onViewModeChange?: (key: string) => void;

  children: ReactNode;
  className?: string;
  /** 内容区不自带 padding */
  noPadding?: boolean;
}

export default function PageShell({
  title, icon, headerContent, actions,
  tabs, activeTab, onTabChange, tabsComponent,
  filters,
  viewModes, activeViewMode, onViewModeChange,
  children, className, noPadding,
}: PageShellProps) {
  const hasHeader = headerContent || title;
  const hasTabs = tabsComponent || (tabs && tabs.length > 0);

  return (
    <div className={cn('flex flex-col h-full animate-fade-in', className)}>
      {/* Page Header */}
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 pt-4 md:pt-5 pb-2 flex-shrink-0">
          <div className="flex-1 min-w-0">
            {headerContent || (
              <div className="flex items-center gap-2">
                {icon && <span className="text-primary">{icon}</span>}
                <h1 className="text-xl font-bold">{title}</h1>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {viewModes && viewModes.length > 0 && (
              <div className="hidden sm:flex items-center gap-1">
                {viewModes.map(vm => (
                  <button key={vm.key} onClick={() => onViewModeChange?.(vm.key)}
                    className={cn('p-1.5 rounded-md transition-colors', activeViewMode === vm.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
                    title={vm.label}>
                    {vm.icon}
                  </button>
                ))}
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      {/* Tabs / ViewModeSwitch */}
      {hasTabs && (
        <div className="flex-shrink-0 px-4 md:px-6 pb-2">
          {tabsComponent || (
            <div className="flex items-center gap-1 overflow-x-auto">
              {tabs!.map(tab => (
                <button key={tab.key} onClick={() => onTabChange?.(tab.key)}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0',
                    activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground')}>
                  {tab.icon && <span className="inline-flex mr-1 align-middle">{tab.icon}</span>}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toolbar (filters) */}
      {filters && (
        <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2 flex-shrink-0">
          {filters}
        </div>
      )}

      {/* Content */}
      <div className={cn('flex-1 min-h-0', noPadding ? '' : 'px-4 md:px-6 pb-20 md:pb-4')}>
        {children}
      </div>
    </div>
  );
}
