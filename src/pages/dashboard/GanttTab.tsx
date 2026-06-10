/**
 * 甘特图 Tab — 甘特图预览 + 打开全屏按钮
 */
import { GlobalGanttView } from '../admin/GlobalGanttTab';
import type { DashboardTabProps } from './shared';

export default function GanttTab({ onOpenGantt }: DashboardTabProps) {
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground">项目甘特图</span>
          <button className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" onClick={onOpenGantt}>打开甘特图</button>
        </div>
        <div className="p-2 max-h-[600px] overflow-auto">
          <GlobalGanttView />
        </div>
      </div>
    </div>
  );
}
