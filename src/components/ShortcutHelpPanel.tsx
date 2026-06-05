import React, { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutHelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  items: { keys: string; desc: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '导航',
    items: [
      { keys: '1-7', desc: '快速跳转页面' },
      { keys: 'j / ↓', desc: '下移选中项' },
      { keys: 'k / ↑', desc: '上移选中项' },
      { keys: 'Enter', desc: '打开选中项' },
      { keys: '[ / ]', desc: '切换侧栏模式' },
      { keys: 'g + 字母', desc: 'Vim式导航 (gd=仪表盘, go=目标...)' },
    ],
  },
  {
    title: '创建与编辑',
    items: [
      { keys: '⌘N', desc: '新建任务' },
      { keys: '⌘⇧N', desc: '新建目标' },
      { keys: '⌘⇧P', desc: '新建项目' },
      { keys: 'c', desc: '快速创建任务' },
      { keys: 'e', desc: '编辑选中项' },
      { keys: 'd', desc: '删除选中项' },
    ],
  },
  {
    title: '操作',
    items: [
      { keys: '⌘D', desc: '复制选中项' },
      { keys: '⌘E', desc: '归档选中项' },
      { keys: 'x', desc: '切换完成状态' },
      { keys: '⌘Z', desc: '撤销' },
      { keys: '⌘Y', desc: '重做' },
      { keys: '⌘S', desc: '保存' },
    ],
  },
  {
    title: '视图与搜索',
    items: [
      { keys: '/', desc: '聚焦搜索框' },
      { keys: '⌘K', desc: '命令面板' },
      { keys: '⌘F', desc: '聚焦筛选框' },
      { keys: 't / v / l', desc: '切换视图 (表格/看板/列表)' },
      { keys: 'b', desc: '批量选择模式' },
      { keys: 'f', desc: '筛选' },
    ],
  },
  {
    title: '面板',
    items: [
      { keys: 'Esc', desc: '关闭面板/下拉/对话框' },
      { keys: '?', desc: '显示此帮助' },
      { keys: '⌘G', desc: '甘特图' },
      { keys: '⌘,', desc: '管理后台' },
    ],
  },
];

export function ShortcutHelpPanel({ isOpen, onClose }: ShortcutHelpPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      // Focus trap
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Auto-focus close button
    setTimeout(() => { const btn = panelRef.current?.querySelector<HTMLButtonElement>('button'); btn?.focus(); }, 50);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[70]" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-label="键盘快捷键帮助" aria-modal={true}
        className="fixed inset-0 z-[71] flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-slide-up">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-base">键盘快捷键</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors" aria-label="关闭">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-3">
            {SHORTCUT_GROUPS.map(group => (
              <div key={group.title} className="mb-4 last:mb-0">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.title}</h3>
                <div className="space-y-1">
                  {group.items.map(item => (
                    <div key={item.keys} className="flex items-center justify-between py-1">
                      <span className="text-sm text-foreground">{item.desc}</span>
                      <kbd className="px-2 py-0.5 text-xs font-mono bg-muted rounded border border-border text-muted-foreground">{item.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-border text-[10px] text-muted-foreground text-center">
            按 Esc 关闭
          </div>
        </div>
      </div>
    </>
  );
}
