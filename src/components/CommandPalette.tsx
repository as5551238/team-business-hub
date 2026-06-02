import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Target, FolderKanban, CheckSquare, Settings, LayoutDashboard, X, Plus, Zap, BarChart3, GitBranch, Users, Command, ArrowRight } from 'lucide-react';

// ===== 增强命令定义 =====

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: any;
  group: string;
  action: () => void;
  keywords?: string[]; // 模糊搜索关键词
}

export function CommandPalette({ open, onClose, onNavigate, onPageChange, onNavigateItem, onCreateItem }: {
  open: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onPageChange?: (page: string) => void;
  onNavigateItem?: (id: string, type: string) => void;
  onCreateItem?: (type: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = useMemo(() => [
    // 导航
    { id: 'nav-dashboard', label: '导航到工作台', shortcut: '1', icon: LayoutDashboard, group: '导航', action: () => onPageChange?.('dashboard'), keywords: ['仪表盘', '首页', 'dashboard'] },
    { id: 'nav-goals', label: '导航到目标管理', shortcut: '2', icon: Target, group: '导航', action: () => onPageChange?.('goals'), keywords: ['okr', 'kpi', '目标', 'goals'] },
    { id: 'nav-projects', label: '导航到项目中心', shortcut: '3', icon: FolderKanban, group: '导航', action: () => onPageChange?.('projects'), keywords: ['项目', 'project'] },
    { id: 'nav-tasks', label: '导航到任务中心', shortcut: '4', icon: CheckSquare, group: '导航', action: () => onPageChange?.('tasks'), keywords: ['任务', 'task', '待办'] },
    { id: 'nav-insight', label: '导航到数据洞察', shortcut: '5', icon: BarChart3, group: '导航', action: () => onPageChange?.('insight'), keywords: ['分析', '统计', '报表'] },
    { id: 'nav-admin', label: '导航到管理中心', shortcut: '6', icon: Settings, group: '导航', action: () => onPageChange?.('admin'), keywords: ['设置', '管理', 'admin'] },
    // 创建
    { id: 'create-task', label: '快速创建任务', shortcut: '⌘N', icon: Plus, group: '创建', action: () => onCreateItem?.('task'), keywords: ['新建', '任务', 'new task'] },
    { id: 'create-goal', label: '快速创建目标', shortcut: '⌘⇧N', icon: Target, group: '创建', action: () => onCreateItem?.('goal'), keywords: ['新建', '目标', 'new goal'] },
    { id: 'create-project', label: '快速创建项目', shortcut: '⌘⇧P', icon: FolderKanban, group: '创建', action: () => onCreateItem?.('project'), keywords: ['新建', '项目', 'new project'] },
    // 智能操作
    { id: 'action-gantt', label: '打开甘特图', shortcut: '⌘G', icon: GitBranch, group: '操作', action: () => window.dispatchEvent(new CustomEvent('tbh-open-gantt')), keywords: ['甘特', 'gantt', '排期'] },
    { id: 'action-predict', label: '查看风险雷达', shortcut: '', icon: Zap, group: '操作', action: () => { onPageChange?.('insight'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-open-risk-radar')), 300); }, keywords: ['风险', '预测', '延期', 'radar'] },
    { id: 'action-team', label: '团队资源负载', shortcut: '', icon: Users, group: '操作', action: () => { onPageChange?.('admin'); setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-open-team-load')), 300); }, keywords: ['团队', '负荷', '资源', '瓶颈'] },
  ], [onPageChange, onCreateItem]);

  // 模糊搜索
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter(c => {
      const labelMatch = c.label.toLowerCase().includes(q);
      const keywordMatch = c.keywords?.some(k => k.toLowerCase().includes(q)) || false;
      const shortcutMatch = c.shortcut?.toLowerCase().includes(q) || false;
      return labelMatch || keywordMatch || shortcutMatch;
    });
  }, [commands, query]);

  // 按组分组
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const c of filtered) {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    }
    return groups;
  }, [filtered]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && filtered[selectedIndex]) { filtered[selectedIndex].action(); onClose(); setQuery(''); }
    else if (e.key === 'Escape') { onClose(); setQuery(''); }
    // 数字键快速选择 (1-9)
    else if (/^[1-9]$/.test(e.key) && !query) {
      const idx = parseInt(e.key) - 1;
      if (filtered[idx]) { filtered[idx].action(); onClose(); setQuery(''); }
    }
  }, [filtered, selectedIndex, onClose]);

  // 滚动到选中项
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // 重置状态
  useEffect(() => { if (!open) { setQuery(''); setSelectedIndex(0); } }, [open]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl border w-[520px] max-h-[60vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Command size={16} className="text-muted-foreground" />
          <input
            type="text"
            className="flex-1 text-sm outline-none bg-transparent"
            placeholder="输入命令或关键词... (数字键快速选择)"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <kbd className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border">ESC</kbd>
        </div>
        <div className="max-h-[45vh] overflow-y-auto p-2" ref={listRef}>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">{group}</div>
              {items.map(cmd => {
                const idx = flatIndex++;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={cmd.id}
                    data-selected={isSelected}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-left transition-colors ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                    onClick={() => { cmd.action(); onClose(); setQuery(''); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <cmd.icon size={16} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.shortcut && <kbd className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border">{cmd.shortcut}</kbd>}
                    {isSelected && <ArrowRight size={12} className="text-primary" />}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">无匹配命令</p>}
        </div>
        <div className="border-t px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">↑↓</kbd> 导航</span>
          <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">↵</kbd> 执行</span>
          <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">1-9</kbd> 快速选择</span>
          <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
