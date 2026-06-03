/**
 * Breadcrumb — 面包屑导航组件
 * S2-5: 提供层级导航，支持页面→详情→父级回溯
 */
import React, { useMemo } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import type { Page } from '@/components/layout/Layout';
import { useAppNavigate } from '@/lib/routes';
import { useStore } from '@/store/useStore';

interface BreadcrumbItem {
  label: string;
  page?: Page;
  itemId?: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  currentPage: Page;
  itemId?: string | null;
}

/** 页面标签映射 */
const PAGE_LABELS: Record<Page, string> = {
  dashboard: '工作台',
  goals: '目标管理',
  projects: '项目中心',
  tasks: '任务中心',
  insight: '数据洞察',
  knowledge: '知识库',
  admin: '管理中心',
  privacy: '隐私政策',
};

export function Breadcrumb({ currentPage, itemId }: BreadcrumbProps) {
  const { goToPage, goToItem } = useAppNavigate();
  const { state } = useStore();

  const items = useMemo<BreadcrumbItem[]>(() => {
    const crumbs: BreadcrumbItem[] = [];

    // 首页（非工作台时显示）
    if (currentPage !== 'dashboard') {
      crumbs.push({
        label: '工作台',
        page: 'dashboard',
        onClick: () => goToPage('dashboard'),
      });
    }

    // 当前三级页面标签
    const pageLabel = PAGE_LABELS[currentPage];
    if (currentPage !== 'dashboard') {
      crumbs.push({
        label: pageLabel,
        page: currentPage,
        onClick: () => goToPage(currentPage),
      });
    }

    // 详情层级：从 itemId 反查条目名称和父级
    if (itemId) {
      // 查找当前条目
      const goal = state.goals.find(g => g.id === itemId);
      const project = state.projects.find(p => p.id === itemId);
      const task = state.tasks.find(t => t.id === itemId);

      if (goal) {
        // 目标详情 — 目标管理 > 目标名
        crumbs.push({
          label: goal.title,
          itemId: goal.id,
          onClick: () => goToItem('goal', goal.id),
        });
      } else if (project) {
        // 项目详情 — 如果有关联目标，先显示父目标
        if (project.goalId) {
          const parentGoal = state.goals.find(g => g.id === project.goalId);
          if (parentGoal) {
            // 插入父目标（替换当前页面级"项目中心"后面）
            crumbs.push({
              label: parentGoal.title,
              itemId: parentGoal.id,
              onClick: () => goToItem('goal', parentGoal.id),
            });
          }
        }
        crumbs.push({
          label: project.title,
          itemId: project.id,
          onClick: () => goToItem('project', project.id),
        });
      } else if (task) {
        // 任务详情 — 如果有关联项目，先显示父项目
        if (task.projectId) {
          const parentProject = state.projects.find(p => p.id === task.projectId);
          if (parentProject) {
            crumbs.push({
              label: parentProject.title,
              itemId: parentProject.id,
              onClick: () => goToItem('project', parentProject.id),
            });
            // 如果项目还有父目标
            if (parentProject.goalId) {
              const grandGoal = state.goals.find(g => g.id === parentProject.goalId);
              if (grandGoal) {
                crumbs.push({
                  label: grandGoal.title,
                  itemId: grandGoal.id,
                  onClick: () => goToItem('goal', grandGoal.id),
                });
              }
            }
          }
        }
        crumbs.push({
          label: task.title,
          itemId: task.id,
          onClick: () => goToItem('task', task.id),
        });
      }
    }

    return crumbs;
  }, [currentPage, itemId, state.goals, state.projects, state.tasks, goToPage, goToItem]);

  if (items.length <= 1) {
    // 只有一个层级时直接显示文字，不用面包屑
    return (
      <h1 className="text-base font-semibold">
        {PAGE_LABELS[currentPage]}
      </h1>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="面包屑导航">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={`${item.page || ''}-${item.itemId || ''}-${i}`}>
            {i === 0 && (
              <Home size={14} className="text-muted-foreground flex-shrink-0" />
            )}
            {i > 0 && (
              <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
            )}
            {isLast ? (
              <span className="font-semibold text-foreground truncate max-w-[200px]" title={item.label}>
                {item.label}
              </span>
            ) : (
              <button
                onClick={item.onClick}
                className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]"
                title={item.label}
              >
                {item.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
