import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import type { ItemType } from '@/types';
import { smartSearch } from '@/lib/ai/aiSmartSearch';
import type { SearchResult } from '@/lib/ai/aiSmartSearch';
import { SmartSearchResult } from './SmartSearchResult';
import {
  Search, Target, FolderKanban, CheckSquare, Plus, LayoutDashboard,
  BarChart3, Settings, Brain, StickyNote, User, Layers, ArrowRight, Clock, BookOpen
} from 'lucide-react';

type CommandGroup = 'actions' | 'navigation' | 'smartsearch' | 'items' | 'views' | 'members' | 'ai';

interface CommandItem {
  id: string;
  label: string;
  group: CommandGroup;
  icon: React.ReactNode;
  shortcut?: string;
  keywords: string[];
  action: () => void;
}

interface SmartSearchEntry {
  id: string;
  group: 'smartsearch';
  searchResult: SearchResult;
  action: () => void;
}

type PaletteItem = CommandItem | SmartSearchEntry;

const GROUP_LABELS: Record<CommandGroup, string> = {
  actions: '动作',
  navigation: '导航',
  smartsearch: '搜索结果',
  items: '事项',
  views: '视图',
  members: '成员',
  ai: 'AI 助手',
};

const GROUP_ORDER: Record<CommandGroup, number> = {
  actions: 0, navigation: 1, ai: 2, smartsearch: 3, items: 4, views: 5, members: 6,
};

function fuzzyMatch(items: CommandItem[], query: string): CommandItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase().trim();
  const scored: { item: CommandItem; score: number }[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    let score = 0;
    if (label === q) score = 1.0;
    else if (label.startsWith(q)) score = 0.9;
    else if (label.includes(q)) score = 0.8;
    else if (item.keywords.some(kw => kw.toLowerCase().includes(q))) score = 0.6;
    else {
      let qi = 0;
      for (const ch of label) { if (ch === q[qi]) qi++; if (qi === q.length) { score = 0.4; break; } }
    }
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => {
    const gd = GROUP_ORDER[a.item.group] - GROUP_ORDER[b.item.group];
    return gd !== 0 ? gd : b.score - a.score;
  });
  return scored.map(s => s.item).slice(0, 50);
}

function mergePaletteItems(fuzzyItems: CommandItem[], smartEntries: SmartSearchEntry[]): PaletteItem[] {
  const result: PaletteItem[] = [];
  for (const item of fuzzyItems) {
    if (item.group === 'actions' || item.group === 'navigation' || item.group === 'ai') result.push(item);
  }
  for (const entry of smartEntries) result.push(entry);
  for (const item of fuzzyItems) {
    if (item.group !== 'actions' && item.group !== 'navigation' && item.group !== 'ai' && item.group !== 'smartsearch') result.push(item);
  }
  return result;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onPageChange: (page: string) => void;
  onNavigateItem?: (id: string, type: ItemType) => void;
  onCreateItem?: (type: 'goal' | 'project' | 'task') => void;
}

export function CommandPalette({ isOpen, onClose, onPageChange, onNavigateItem, onCreateItem }: CommandPaletteProps) {
  const { state } = useStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const showAiResult = useCallback((_mode: string) => {
    window.alert('AI功能开发中');
    onClose();
  }, [onClose]);

  const items: CommandItem[] = useMemo(() => {
    const result: CommandItem[] = [];

    // Actions
    result.push({ id: 'action-create-task', label: '创建任务', group: 'actions', icon: <Plus className="w-4 h-4" />, keywords: ['新建', '创建', '任务', 'new task', 'add'], action: () => { onCreateItem?.('task'); onClose(); } });
    result.push({ id: 'action-create-project', label: '创建项目', group: 'actions', icon: <Plus className="w-4 h-4" />, keywords: ['新建', '创建', '项目', 'new project'], action: () => { onCreateItem?.('project'); onClose(); } });
    result.push({ id: 'action-create-goal', label: '创建目标', group: 'actions', icon: <Plus className="w-4 h-4" />, keywords: ['新建', '创建', '目标', 'new goal', 'okr'], action: () => { onCreateItem?.('goal'); onClose(); } });

    // AI commands
    result.push({ id: 'ai-decompose', label: 'AI: 分解目标', group: 'ai', icon: <span>🎯</span>, keywords: ['ai', 'AI', '分解', '目标', 'decompose', '智能'], action: () => { showAiResult('decompose'); } });
    result.push({ id: 'ai-risk', label: 'AI: 评估风险', group: 'ai', icon: <span>⚠️</span>, keywords: ['ai', 'AI', '风险', '评估', 'risk', '智能'], action: () => { showAiResult('risk'); } });
    result.push({ id: 'ai-schedule', label: 'AI: 智能排期', group: 'ai', icon: <span>📅</span>, keywords: ['ai', 'AI', '排期', '日程', 'schedule', '智能'], action: () => { showAiResult('schedule'); } });

    // Navigation
    const pages: { key: string; label: string; icon: React.ReactNode; shortcut: string }[] = [
      { key: 'dashboard', label: '仪表盘', icon: <LayoutDashboard className="w-4 h-4" />, shortcut: '1' },
      { key: 'goals', label: '目标', icon: <Target className="w-4 h-4" />, shortcut: '2' },
      { key: 'projects', label: '项目', icon: <FolderKanban className="w-4 h-4" />, shortcut: '3' },
      { key: 'tasks', label: '任务', icon: <CheckSquare className="w-4 h-4" />, shortcut: '4' },
      { key: 'insight', label: '洞察', icon: <BarChart3 className="w-4 h-4" />, shortcut: '5' },
      { key: 'knowledge', label: '知识库', icon: <BookOpen className="w-4 h-4" />, shortcut: '' },
      { key: 'admin', label: '管理', icon: <Settings className="w-4 h-4" />, shortcut: '7' },
    ];
    for (const p of pages) {
      result.push({ id: `nav-${p.key}`, label: p.label, group: 'navigation', icon: p.icon, shortcut: p.shortcut, keywords: [p.label, p.key], action: () => { onPageChange(p.key); onClose(); } });
    }

    // Items (goals, projects, tasks)
    for (const g of state.goals.slice(0, 50)) {
      result.push({ id: `goal-${g.id}`, label: g.title, group: 'items', icon: <Target className="w-4 h-4" />, keywords: [g.title, '目标', g.status ?? '', g.category ?? ''], action: () => { onNavigateItem?.(g.id, 'goal'); onPageChange('goals'); onClose(); } });
    }
    for (const p of state.projects.slice(0, 50)) {
      result.push({ id: `project-${p.id}`, label: p.title, group: 'items', icon: <FolderKanban className="w-4 h-4" />, keywords: [p.title, '项目', p.status ?? ''], action: () => { onNavigateItem?.(p.id, 'project'); onPageChange('projects'); onClose(); } });
    }
    for (const t of state.tasks.slice(0, 80)) {
      result.push({ id: `task-${t.id}`, label: t.title, group: 'items', icon: <CheckSquare className="w-4 h-4" />, keywords: [t.title, '任务', t.status ?? ''], action: () => { onNavigateItem?.(t.id, 'task'); onPageChange('tasks'); onClose(); } });
    }

    // Members
    for (const m of state.members.filter(m => m.status === 'active').slice(0, 30)) {
      result.push({ id: `member-${m.id}`, label: m.name, group: 'members', icon: <User className="w-4 h-4" />, keywords: [m.name, m.nickname ?? '', m.department ?? '', m.role], action: () => { onPageChange('tasks'); onClose(); } });
    }

    return result;
  }, [state.goals, state.projects, state.tasks, state.members, onPageChange, onNavigateItem, onCreateItem, onClose, showAiResult]);

  const filtered = useMemo(() => fuzzyMatch(items, query), [items, query]);

  const smartEntries = useMemo<SmartSearchEntry[]>(() => {
    if (!query.trim()) return [];
    const results = smartSearch(state, query).results.slice(0, 5);
    return results.map(sr => ({
      id: `smart-${sr.item.type}-${sr.item.id}`,
      group: 'smartsearch' as const,
      searchResult: sr,
      action: () => { onNavigateItem?.(sr.item.id, sr.item.type); onPageChange(sr.item.type === 'goal' ? 'goals' : sr.item.type === 'project' ? 'projects' : 'tasks'); onClose(); },
    }));
  }, [state, query, onNavigateItem, onPageChange, onClose]);

  const allItems = useMemo(() => mergePaletteItems(filtered, smartEntries), [filtered, smartEntries]);

  useEffect(() => { if (isOpen) { previousFocusRef.current = document.activeElement as HTMLElement; setQuery(''); setSelectedIndex(0); setTimeout(() => inputRef.current?.focus(), 50); } else { previousFocusRef.current?.focus(); } }, [isOpen]);
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        inputRef.current?.focus();
      } else {
        const selected = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement;
        selected?.focus();
      }
    }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, allItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && allItems[selectedIndex]) { e.preventDefault(); allItems[selectedIndex].action(); }
  }, [allItems, selectedIndex, onClose]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="w-[640px] max-w-[90vw] max-h-[480px] bg-card dark:bg-gray-900 rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-label="命令面板" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={true}
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={allItems[selectedIndex]?.id ?? ''}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="输入命令或搜索事项..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="text-xs text-muted-foreground px-1.5 py-0.5 border border-border rounded">ESC</kbd>
        </div>
        {/* Results */}
        <div ref={listRef} id="command-palette-list" className="overflow-y-auto flex-1 p-2">
          {allItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">无匹配结果</p>}
          {(() => {
            let currentGroup: CommandGroup | null = null;
            return allItems.map((item, i) => {
              const group = item.group;
              const showGroup = group !== currentGroup;
              currentGroup = group;
              return (
                <React.Fragment key={item.id}>
                  {showGroup && <div className="text-xs font-medium text-muted-foreground px-3 py-1.5 mt-1">{GROUP_LABELS[group]}</div>}
                  {item.group === 'smartsearch' ? (
                    <div
                      role="option"
                      id={item.id}
                      aria-selected={i === selectedIndex}
                      data-selected={i === selectedIndex}
                      className={i === selectedIndex ? 'bg-accent text-accent-foreground rounded-lg' : ''}
                      onMouseEnter={() => setSelectedIndex(i)}
                    >
                      <SmartSearchResult item={item.searchResult.item} matchReasons={item.searchResult.matchReasons} onClick={item.action} />
                    </div>
                  ) : (
                    <div
                      role="option"
                      id={item.id}
                      aria-selected={i === selectedIndex}
                      data-selected={i === selectedIndex}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(i)}
                      tabIndex={-1}
                    >
                      <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut && <kbd className="text-xs text-muted-foreground px-1.5 py-0.5 border border-border rounded">{item.shortcut}</kbd>}
                    </div>
                  )}
                </React.Fragment>
              );
            });
          })()}
        </div>
        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
          <span><kbd className="px-1 border border-border rounded">↑↓</kbd> 导航</span>
          <span><kbd className="px-1 border border-border rounded">Enter</kbd> 执行</span>
          <span><kbd className="px-1 border border-border rounded">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
