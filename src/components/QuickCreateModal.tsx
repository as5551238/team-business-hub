/**
 * QuickCreateModal — 快速创建对话框
 * R10: 迁移到 shadcn Dialog，自动焦点管理+ESC关闭
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import type { TaskStatus, TaskPriority, GoalType, GoalStatus, ProjectStatus } from '@/types';
import { cn } from '@/lib/utils';
import { Plus, Target, FolderKanban, CheckSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SimpleSelect } from '@/components/ui/simple-select';

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

  useEffect(() => { if (open) { setTitle(''); setType(initialType); setLeaderId(state.currentUser?.id || ''); setDueDate(''); setPriority('medium'); setTimeout(() => titleRef.current?.focus(), 100); } }, [open, initialType]);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const smartDueDate = type === 'task' && !dueDate ? tomorrow : dueDate;
  const activeMembers = state.members.filter(m => m.status === 'active');

  function handleSubmit() {
    if (!title.trim()) return;
    if (type === 'task') {
      const taskDueDate = dueDate || smartDueDate;
      dispatch({ type: 'ADD_TASK', payload: { title: title.trim(), description: '', projectId: null, goalId: null, parentId: null, status: 'todo' as TaskStatus, priority, leaderId, supporterIds: [], tags: [], category: '', startDate: taskDueDate || null, dueDate: taskDueDate || null, reminderDate: null, completedAt: null, subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', summary: '' } });
    } else if (type === 'goal') {
      dispatch({ type: 'ADD_GOAL', payload: { title: title.trim(), description: '', type: 'okr' as GoalType, status: 'todo' as GoalStatus, priority, parentId: null, level: 0, category: '', startDate: dueDate || '', endDate: dueDate || '', leaderId, supporterIds: [], tags: [], keyResults: [], selectedKRIds: [], attachments: [], trackingRecords: [], repeatCycle: 'none', progress: 0, summary: '' } });
    } else {
      dispatch({ type: 'ADD_PROJECT', payload: { title: title.trim(), description: '', goalId: null, parentId: null, status: 'todo' as ProjectStatus, priority, leaderId, supporterIds: [], tags: [], category: '', startDate: dueDate || '', endDate: dueDate || '', attachments: [], trackingRecords: [], repeatCycle: 'none', taskCount: 0 } });
    }
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const typeIcon = type === 'task' ? <CheckSquare size={14} /> : type === 'goal' ? <Target size={14} /> : <FolderKanban size={14} />;
  const typeLabel = type === 'task' ? '任务' : type === 'goal' ? '目标' : '项目';

  const priorityOptions = [
    { value: 'urgent', label: '紧急(S)' },
    { value: 'high', label: '高(A)' },
    { value: 'medium', label: '中(B)' },
    { value: 'low', label: '低(C)' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0" onOpenAutoFocus={(e) => { e.preventDefault(); titleRef.current?.focus(); }}>
        {/* Header with type switcher */}
        <DialogHeader className="sr-only">
          <DialogTitle>快速创建{typeLabel}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1 px-4 pt-4 pb-2">
          {(['task', 'goal', 'project'] as ItemType[]).map(t => (
            <button key={t} onClick={() => setType(t)} role="tab" aria-selected={type === t} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', type === t ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              {t === 'task' ? <CheckSquare size={12} /> : t === 'goal' ? <Target size={12} /> : <FolderKanban size={12} />}
              {t === 'task' ? '任务' : t === 'goal' ? '目标' : '项目'}
            </button>
          ))}
        </div>

        {/* Title input */}
        <div className="px-4 pb-2">
          <input ref={titleRef} type="text" aria-label={`${typeLabel}标题`} className="w-full text-lg font-medium border-none outline-none placeholder:text-muted-foreground/50" placeholder={`${typeLabel}标题... (Enter 提交)`} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={handleKeyDown} />
        </div>

        {/* Quick fields */}
        <div className="px-4 pb-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">负责人</span>
            <SimpleSelect value={leaderId} onValueChange={setLeaderId} options={activeMembers.map(m => ({ value: m.id, label: m.name }))} className="h-7 text-xs w-[100px]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">优先级</span>
            <SimpleSelect value={priority} onValueChange={v => setPriority(v as TaskPriority)} options={priorityOptions} className="h-7 text-xs w-[80px]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">{type === 'task' ? '截止日期' : '结束日期'}</span>
            <input type="date" className="text-xs border border-input rounded-lg px-2 py-1" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-between rounded-b-lg">
          <span className="text-[10px] text-muted-foreground" aria-hidden="true">Ctrl+N 任务 | Ctrl+Shift+N 目标 | Ctrl+Shift+P 项目 | Enter 提交</span>
          <button onClick={handleSubmit} disabled={!title.trim()} aria-label={`创建${typeLabel}`} className="flex items-center gap-1 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
            <Plus size={12} />创建{typeLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
