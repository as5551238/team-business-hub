/**
 * QuickCreateModal — 快速创建对话框
 * E3: 交互3次操作原则
 *
 * 使用方式：Ctrl+N 弹出 → 输入标题 → Tab 切换字段 → Enter 提交
 * 3步完成：创建任务→指定负责人→设定截止日期
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import type { TaskStatus, TaskPriority, GoalType } from '@/types';
import { cn } from '@/lib/utils';
import { X, Plus, Target, FolderKanban, CheckSquare } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

type ItemType = 'task' | 'goal' | 'project';

interface QuickCreateModalProps {
  open: boolean;
  onClose: () => void;
  initialType?: ItemType;
}

export function QuickCreateModal({ open, onClose, initialType = 'task' }: QuickCreateModalProps) {
  const { state, dispatch } = useStore();
  const [type, setType] = useState<ItemType>(initialType);
  const [title, setTitle] = useState('');
  const [leaderId, setLeaderId] = useState(state.currentUser?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const titleRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap({ active: open, onEscape: onClose });

  useEffect(() => { if (open) { setTitle(''); setType(initialType); setLeaderId(state.currentUser?.id || ''); setDueDate(''); setPriority('medium'); } }, [open, initialType]);
  useEffect(() => { if (open) { setType(initialType); } }, [initialType]);

  // S3-2b: Smart defaults — auto-set dueDate to tomorrow for tasks
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const smartDueDate = type === 'task' && !dueDate ? tomorrow : dueDate;

  // Handle backdrop click — only close when clicking the backdrop itself
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!open) return null;

  const activeMembers = state.members.filter(m => m.status === 'active');

  function handleSubmit() {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    if (type === 'task') {
      // S3-2b: Use smartDueDate (tomorrow) if user didn't set a specific dueDate
      const taskDueDate = dueDate || smartDueDate;
      dispatch({ type: 'ADD_TASK', payload: { title: title.trim(), description: '', projectId: null, goalId: null, parentId: null, status: 'todo' as TaskStatus, priority, leaderId, supporterIds: [], tags: [], category: '', startDate: taskDueDate || null, dueDate: taskDueDate || null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', summary: '' } });
    } else if (type === 'goal') {
      dispatch({ type: 'ADD_GOAL', payload: { title: title.trim(), description: '', type: 'okr' as GoalType, status: 'todo' as TaskStatus, priority, parentId: null, level: 0, category: '', startDate: dueDate || '', endDate: dueDate || '', leaderId, supporterIds: [], tags: [], keyResults: [], selectedKRIds: [], attachments: [], trackingRecords: [], repeatCycle: 'none', progress: 0, summary: '' } });
    } else {
      dispatch({ type: 'ADD_PROJECT', payload: { title: title.trim(), description: '', goalId: null, parentId: null, status: 'todo' as TaskStatus, priority, leaderId, supporterIds: [], tags: [], category: '', startDate: dueDate || '', endDate: dueDate || '', attachments: [], trackingRecords: [], repeatCycle: 'none', taskCount: 0 } });
    }
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
    // Tab through fields naturally
  }

  const typeIcon = type === 'task' ? <CheckSquare size={14} /> : type === 'goal' ? <Target size={14} /> : <FolderKanban size={14} />;
  const typeLabel = type === 'task' ? '任务' : type === 'goal' ? '目标' : '项目';

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh] bg-black/30" onClick={handleBackdropClick} role="presentation">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={`快速创建${typeLabel}`} className="bg-card rounded-2xl shadow-2xl w-[min(480px,92vw)] overflow-hidden" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Header with type switcher */}
        <div className="flex items-center gap-1 px-4 pt-4 pb-2">
          {(['task', 'goal', 'project'] as ItemType[]).map(t => (
            <button key={t} onClick={() => setType(t)} role="tab" aria-selected={type === t} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', type === t ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              {t === 'task' ? <CheckSquare size={12} /> : t === 'goal' ? <Target size={12} /> : <FolderKanban size={12} />}
              {t === 'task' ? '任务' : t === 'goal' ? '目标' : '项目'}
            </button>
          ))}
          <button onClick={onClose} aria-label="关闭" className="ml-auto p-1 hover:bg-muted rounded-lg"><X size={16} /></button>
        </div>

        {/* Title input — auto-focused */}
        <div className="px-4 pb-2">
          <input ref={titleRef} type="text" aria-label={`${typeLabel}标题`} className="w-full text-lg font-medium border-none outline-none placeholder:text-muted-foreground/50" placeholder={`${typeLabel}标题... (Enter 提交)`} value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        {/* Quick fields — Tab navigable */}
        <div className="px-4 pb-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label htmlFor="qcm-leader" className="text-[10px] text-muted-foreground">负责人</label>
            <select id="qcm-leader" className="text-xs border border-input rounded-lg px-2 py-1 bg-card" value={leaderId} onChange={e => setLeaderId(e.target.value)}>
              {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="qcm-priority" className="text-[10px] text-muted-foreground">优先级</label>
            <select id="qcm-priority" className="text-xs border border-input rounded-lg px-2 py-1 bg-card" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
              <option value="urgent">紧急(S)</option>
              <option value="high">高(A)</option>
              <option value="medium">中(B)</option>
              <option value="low">低(C)</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="qcm-date" className="text-[10px] text-muted-foreground">{type === 'task' ? '截止日期' : '结束日期'}</label>
            <input id="qcm-date" type="date" className="text-xs border border-input rounded-lg px-2 py-1" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground" aria-hidden="true">Ctrl+N 任务 | Ctrl+Shift+N 目标 | Ctrl+Shift+P 项目 | Enter 提交 | Esc 关闭</span>
          <button onClick={handleSubmit} disabled={!title.trim()} aria-label={`创建${typeLabel}`} className="flex items-center gap-1 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
            <Plus size={12} />创建{typeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
