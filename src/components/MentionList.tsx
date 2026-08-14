import { forwardRef, useEffect, useImperativeHandle, useState, memo } from 'react';
import type { Member } from '@/types';

/**
 * Mention 成员选择列表（Phase1-P2 @提及通知）
 *
 * 设计要点：
 * - 键盘可达：↑↓ 导航、Enter 选中、Esc 关闭（符合方案「@提及需键盘可达」要求）
 * - 纯展示组件，由 @tiptap/suggestion 驱动生命周期
 * - 通过 forwardRef 暴露 onKeyDown 给 suggestion 调用
 */
export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: Member[];
  command: (member: Member) => void;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => { setSelectedIndex(0); }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') { setSelectedIndex(i => (i - 1 + items.length) % Math.max(items.length, 1)); return true; }
      if (event.key === 'ArrowDown') { setSelectedIndex(i => (i + 1) % Math.max(items.length, 1)); return true; }
      if (event.key === 'Enter') { if (items[selectedIndex]) command(items[selectedIndex]); return true; }
      return false;
    },
  }), [items, selectedIndex, command]);

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm text-muted-foreground min-w-[180px]">
        无匹配成员
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg py-1 min-w-[180px] max-h-[240px] overflow-y-auto">
      {items.map((member, i) => (
        <button
          key={member.id}
          type="button"
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${i === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
          onClick={() => command(member)}
        >
          <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center flex-shrink-0 font-medium">
            {(member.avatar || member.name || '?').slice(0, 1)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block truncate font-medium">{member.name || member.nickname || '未命名'}</span>
            {member.department && member.department !== '未分配' && (
              <span className="block text-[10px] text-muted-foreground truncate">{member.department}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});

export default memo(MentionList);
