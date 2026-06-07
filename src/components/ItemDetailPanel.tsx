import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { usePermissions } from '@/store/hooks';
import { uploadFile, deleteFile, BUCKET_NAMES } from '@/supabase/storage';
import type { TrackingRecord, RepeatCycle } from '@/types';
import { useCollabPresence } from '@/lib/collab';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { X, Trash2, Clock, Tag, Paperclip, Plus, Edit2, Eye } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { genId } from '@/store/utils';
import { Section, STATUS_MAP, PRIORITY_MAP, REPEAT_LABELS } from './detail-shared';
import { DetailKRs } from './DetailKRs';
import { DetailComments } from './DetailComments';
import { DetailLinks } from './DetailLinks';
import { DetailRelationships } from './DetailRelationships';
import { DetailProjectSections } from './DetailProjectSections';
import { DetailChildItems } from './DetailChildItems';
import { DetailPeople } from './DetailPeople';
import { ApprovalPanel } from './ApprovalPanel';
import { AiChatPanel } from './AiChatPanel';

class DetailPanelErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return (
      <div className="p-6 text-center">
        <EmptyState title="面板加载失败" compact />
        <button className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50" onClick={() => this.setState({ hasError: false })}>重试</button>
      </div>
    );
    return this.props.children;
  }
}

interface ItemDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'goal' | 'project' | 'task';
  itemId: string;
  inline?: boolean;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getQuadrant(priority: string, dueDate: string | null | undefined, endDate: string | null | undefined): string {
  const ref = dueDate || endDate;
  const now = new Date();
  const isUrgent = priority === 'urgent' || priority === 'high';
  const isNear = ref ? (new Date(ref).getTime() - now.getTime()) < 7 * 24 * 60 * 60 * 1000 : false;
  const isImportant = priority === 'high' || priority === 'urgent' || isUrgent;
  if (isImportant && (isUrgent || isNear)) return '紧急重要';
  if (isImportant && !isNear) return '重要不紧急';
  if (!isImportant && isNear) return '紧急不重要';
  return '不紧急不重要';
}

const QUADRANT_COLORS: Record<string, string> = {
  '紧急重要': 'bg-red-50 border-red-200 text-red-700',
  '重要不紧急': 'bg-blue-50 border-blue-200 text-blue-700',
  '紧急不重要': 'bg-yellow-50 border-yellow-200 text-yellow-700',
  '不紧急不重要': 'bg-gray-50 border-gray-200 text-gray-600',
};

export function ItemDetailPanel({ isOpen, onClose, itemType, itemId, inline }: ItemDetailPanelProps) {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();

  const canDelete = (itemType === 'goal' ? can('goals_delete') : itemType === 'project' ? can('projects_delete') : can('tasks_delete'));
  const canEdit = (itemType === 'goal' ? can('goals_edit') : itemType === 'project' ? can('projects_edit') : can('tasks_edit'));

  // Edit lock via collab presence — track all viewers via editingOn field
  const { onlineUsers, trackEditing } = useCollabPresence(state.currentUser?.id || '', state.currentUser?.name || '');
  // All other users currently viewing this item
  const otherViewers = useMemo(() => onlineUsers.filter(u => u.id !== state.currentUser?.id && u.editingOn && u.editingOn.itemId === itemId && u.editingOn.itemType === itemType), [onlineUsers, state.currentUser?.id, itemId, itemType]);
  // The first viewer with potential edit access is the "edit lock" user
  const editLockUser = otherViewers.length > 0 ? otherViewers[0] : undefined;

  // Auto-clear edit lock when panel closes — always track viewing presence
  useEffect(() => {
    if (isOpen) {
      trackEditing({ itemId, itemType });
    } else {
      trackEditing(null);
    }
    return () => { trackEditing(null); };
  }, [isOpen, itemId, itemType, trackEditing]);
  const focusTrapRef = useFocusTrap(isOpen, () => { if (!inline) onClose(); });
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [panelWidth, setPanelWidth] = useState(560);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current || !panelRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const next = Math.max(360, Math.min(900, resizeRef.current.startWidth + delta));
      panelRef.current.style.width = next + 'px';
    };
    const onUp = () => {
      if (resizeRef.current && panelRef.current) {
        setPanelWidth(parseInt(panelRef.current.style.width) || 480);
      }
      resizeRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // Cleanup upload timer on unmount
  useEffect(() => () => { if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current); }, []);

  const goal = itemType === 'goal' ? state.goals.find(g => g.id === itemId) : null;
  const project = itemType === 'project' ? state.projects.find(p => p.id === itemId) : null;
  const task = itemType === 'task' ? state.tasks.find(t => t.id === itemId) : null;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [newTrackingDate, setNewTrackingDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTrackingContent, setNewTrackingContent] = useState('');
  const [newTrackingResult, setNewTrackingResult] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');
  const [newComment, setNewComment] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'tracking' | 'comments'>('overview');

  const description = goal?.description || project?.description || task?.description || '';
  const summary = goal?.summary || project?.summary || task?.summary || '';

  const [localDescription, setLocalDescription] = useState(description);
  const [localSummary, setLocalSummary] = useState(summary);

  useEffect(() => { setLocalDescription(description); }, [description]);
  useEffect(() => { setLocalSummary(summary); }, [summary]);

  // Auto-save description: 800ms debounce after each keystroke
  const { flush: flushDescription } = useAutoSave(localDescription, {
    delay: 800,
    enabled: canEdit && localDescription !== description,
    onSave: (val) => { if (val !== description) updateItem({ description: val }); },
  });

  // Auto-save summary: 800ms debounce after each keystroke
  const { flush: flushSummary } = useAutoSave(localSummary, {
    delay: 800,
    enabled: canEdit && localSummary !== summary,
    onSave: (val) => { if (val !== summary) updateItem({ summary: val }); },
  });

  // Track pending auto-save changes for unsaved edits detection
  const descDirty = localDescription !== description;
  const summaryDirty = localSummary !== summary;
  const hasUnsavedEdits = !!(editingTitle || newComment || newTrackingContent || customTagInput.trim() !== '' || descDirty || summaryDirty);

  function handleClose() {
    // Flush any pending auto-saves before closing
    flushDescription();
    flushSummary();
    // Only confirm for truly unsaved non-auto-save edits (title, comment, tracking)
    const hasNonAutoEdits = !!(editingTitle || newComment || newTrackingContent || customTagInput.trim() !== '');
    if (hasNonAutoEdits && !confirm('有未保存的内容，确认关闭？')) return;
    onClose();
  }
  function handleOverlayClick() { handleClose(); }

  useEffect(() => {
    if (!hasUnsavedEdits) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedEdits]);

  const item = goal || project || task;
  const status = goal?.status || project?.status || task?.status || '';
  const priority = goal?.priority || project?.priority || task?.priority || 'medium';
  const tags = (goal?.tags || project?.tags || task?.tags) ?? [];
  const category = goal?.category || project?.category || task?.category || '';
  const startDate = goal?.startDate || project?.startDate || task?.startDate || '';
  const endDate = goal?.endDate || project?.endDate || '';
  const dueDate = task?.dueDate || null;
  const reminderDate = task?.reminderDate || null;
  const repeatCycle = goal?.repeatCycle || project?.repeatCycle || task?.repeatCycle || 'none';
  const attachments = goal?.attachments || project?.attachments || task?.attachments || [];
  const trackingRecords = goal?.trackingRecords || project?.trackingRecords || task?.trackingRecords || [];

  const allCategories = useMemo(() => state.categories.filter(c => c.appliesTo.includes(itemType)), [state.categories, itemType]);

  useEffect(() => {
    if (item) setTitleDraft(item.title);
  }, [item?.title]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
        setPriorityOpen(false);
      }
    }
    if (statusOpen || priorityOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusOpen, priorityOpen]);

  function updateItem(updates: Record<string, unknown>) {
    if (!canEdit) return;
    if (itemType === 'goal') dispatch({ type: 'UPDATE_GOAL', payload: { id: itemId, updates } });
    else if (itemType === 'project') dispatch({ type: 'UPDATE_PROJECT', payload: { id: itemId, updates } });
    else dispatch({ type: 'UPDATE_TASK', payload: { id: itemId, updates } });
  }

  function saveTitle() {
    if (titleDraft.trim() && titleDraft !== item?.title) {
      updateItem({ title: titleDraft.trim() });
    }
    setEditingTitle(false);
  }

  function handleStatusChange(newStatus: string) {
    const validStatuses = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'];
    const status = validStatuses.includes(newStatus) ? newStatus : 'todo';
    updateItem({ status });
    setStatusOpen(false);
  }

  function handlePriorityChange(newPriority: string) {
    updateItem({ priority: newPriority });
    setPriorityOpen(false);
  }

  // Description and summary are now auto-saved via useAutoSave (800ms debounce)
  // No explicit onBlur save needed — flush on panel close handles edge cases

  function handleDateChange(field: string, value: string) {
    updateItem({ [field]: value || null });
  }

  function handleRepeatChange(val: RepeatCycle) {
    updateItem({ repeatCycle: val });
  }

  function handleCategoryChange(val: string) {
    updateItem({ category: val });
  }

  function toggleTag(tagName: string) {
    const next = tags.includes(tagName) ? tags.filter(t => t !== tagName) : [...tags, tagName];
    updateItem({ tags: next });
  }

  function addCustomTag() {
    const val = customTagInput.trim();
    if (val && !tags.includes(val) && canEdit) {
      updateItem({ tags: [...tags, val] });
      if (!state.tags.find(t => t.name === val)) {
        dispatch({ type: 'ADD_TAG', payload: { name: val, color: `hsl(${Math.random() * 360}, 70%, 60%)`, createdAt: new Date().toISOString() } });
      }
    }
    setCustomTagInput('');
  }

  function handleAddTracking() {
    if (!newTrackingContent.trim()) return;
    const record: TrackingRecord = { id: genId('tr'), date: newTrackingDate, content: newTrackingContent.trim(), result: newTrackingResult.trim(), recordedBy: state.currentUser?.id || '', createdAt: new Date().toISOString() };
    updateItem({ trackingRecords: [...trackingRecords, record] });
    setNewTrackingContent('');
    setNewTrackingResult('');
  }

  function handleDeleteTracking(recordId: string) {
    if (!confirm('确认删除此跟踪记录？')) return;
    updateItem({ trackingRecords: trackingRecords.filter(r => r.id !== recordId) });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (file.size > 50 * 1024 * 1024) { setUploadStatus('error'); return; }
      setUploadStatus('uploading');
      const path = `${itemType}/${itemId}/${Date.now()}_${file.name}`;
      const url = await uploadFile(BUCKET_NAMES.attachments, path, file);
      if (url) {
        const attachment = { id: genId('att'), name: file.name, type: file.type, size: file.size, url, uploadedBy: state.currentUser?.id || '', uploadedAt: new Date().toISOString() };
        updateItem({ attachments: [...attachments, attachment] });
        setUploadStatus('success');
      } else {
        setUploadStatus('error');
        alert('附件上传失败：存储服务未配置或不可用，请联系管理员');
      }
    } catch (err) {
      console.error('File upload failed:', err);
      setUploadStatus('error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    uploadTimerRef.current = setTimeout(() => setUploadStatus('idle'), 3000);
  }

  async function handleDeleteAttachment(attId: string, attUrl: string) {
    if (!confirm('确认删除此附件？')) return;
    try {
      const urlParts = attUrl.split('/');
      const bucketIdx = urlParts.indexOf(BUCKET_NAMES.attachments);
      if (bucketIdx >= 0) {
        const filePath = urlParts.slice(bucketIdx + 1).join('/');
        await deleteFile(BUCKET_NAMES.attachments, [filePath]);
      }
      updateItem({ attachments: attachments.filter(a => a.id !== attId) });
    } catch (err) {
      // P3#33 fix: show error feedback instead of silent failure
      console.error('删除附件失败:', err);
      alert('删除附件失败，请稍后重试');
    }
  }

  async function handlePasteImage(e: React.ClipboardEvent) {
    // Try clipboardData.files first, then fall back to clipboardData.items (Chrome screenshot paste)
    let files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0 && e.clipboardData.items) {
      const imageItems = Array.from(e.clipboardData.items).filter(item => item.type.startsWith('image/'));
      const filePromises = imageItems.map(item => new Promise<File | null>(resolve => {
        item.getAsString(() => {}); // required for some browsers
        const blob = item.getAsFile();
        resolve(blob);
      }));
      const resolved = await Promise.all(filePromises);
      files = resolved.filter((f): f is File => f !== null);
    }
    if (files.length === 0) return;
    e.preventDefault();
    const newAttachments: typeof attachments = [];
    for (const file of files) {
      try {
        const name = file.name || `paste_${Date.now()}.png`;
        const path = `${itemType}/${itemId}/${Date.now()}_${name}`;
        const url = await uploadFile(BUCKET_NAMES.attachments, path, file);
        if (url) {
          const attachment = { id: genId('att'), name, type: file.type, size: file.size, url, uploadedBy: state.currentUser?.id || '', uploadedAt: new Date().toISOString() };
          newAttachments.push(attachment);
          const descArea = e.target as HTMLTextAreaElement;
          const pos = descArea.selectionStart;
          const md = `\n![${name}](${url})\n`;
          descArea.value = descArea.value.slice(0, pos) + md + descArea.value.slice(pos);
          setLocalDescription(descArea.value);
        } else {
          setUploadStatus('error');
        }
      } catch (err) {
        console.error('Paste image upload failed:', err);
        setUploadStatus('error');
      }
    }
    if (newAttachments.length > 0) {
      updateItem({ attachments: [...attachments, ...newAttachments] });
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = setTimeout(() => setUploadStatus('idle'), 3000);
    }
  }

  if (!item) return (
    <DetailPanelErrorBoundary>
    <>
      {!inline && isOpen && <div className="fixed inset-0 bg-black/30 z-40 hidden md:block" onClick={handleOverlayClick} />}
      <div className={cn(inline ? 'h-full flex flex-col border-l bg-card animate-slide-in-right items-center justify-center' : 'fixed bg-card border-border shadow-xl z-50 flex flex-col items-center justify-center transition-transform duration-300 inset-0 md:inset-auto md:top-0 md:right-0 md:h-full md:border-l', !inline && (isOpen ? 'translate-x-0' : 'translate-x-full'))} style={inline ? undefined : { width: typeof window !== 'undefined' && window.innerWidth >= 768 ? panelWidth : undefined }}>
        <div className="text-center p-6">
          <div className="text-3xl mb-3">📝</div>
          <div className="text-sm text-muted-foreground mb-3">该事项已被删除</div>
          <button onClick={() => onClose()} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted" aria-label="关闭面板">关闭面板</button>
        </div>
      </div>
    </>
    </DetailPanelErrorBoundary>
  );

  return (
    <DetailPanelErrorBoundary>
    <>
      {!inline && isOpen && <div className="fixed inset-0 bg-black/30 z-40 hidden md:block" onClick={handleOverlayClick} aria-hidden="true" />}
      <div ref={(el) => { (focusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current = el; (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }} role="dialog" aria-label={`${itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务'}详情`} aria-modal={!inline && isOpen ? true : undefined} className={cn(inline ? 'h-full flex flex-col border-l bg-card animate-slide-in-right' : 'fixed glass-elevated border-border z-50 flex flex-col transition-transform duration-300 inset-0 md:inset-auto md:top-0 md:right-0 md:h-full md:border-l', !inline && (isOpen ? 'translate-x-0' : 'translate-x-full'))} style={inline ? undefined : { width: typeof window !== 'undefined' && window.innerWidth >= 768 ? panelWidth : undefined }}>
        {inline && <div className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 active:bg-primary/30 z-10" onMouseDown={e => { e.preventDefault(); resizeRef.current = { startX: e.clientX, startWidth: panelRef.current?.offsetWidth || panelWidth }; }} />}
        {!inline && <div className="hidden md:block absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 active:bg-primary/40 z-10 group" onMouseDown={e => { e.preventDefault(); resizeRef.current = { startX: e.clientX, startWidth: panelRef.current?.offsetWidth || panelWidth }; }}><div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-border group-hover:bg-primary/50" /></div>}
        <div className="overflow-y-auto flex-1">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border sticky top-0 bg-card z-10">
            {editLockUser && (
              <div className="mb-2 px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: editLockUser.color + '30', color: editLockUser.color }}>{editLockUser.name.charAt(0)}</div>
                <span>{editLockUser.name} 正在编辑此{itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务'}</span>
              </div>
            )}
            {otherViewers.length > 0 && (
              <div className={cn('mb-2 px-2 py-1 rounded text-xs flex items-center gap-1.5', editLockUser ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')}>
                <Eye className="w-3 h-3 flex-shrink-0" />
                <div className="flex -space-x-1">
                  {otherViewers.slice(0, 3).map(u => (
                    <Tooltip key={u.id}><TooltipTrigger asChild><div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ring-1 ring-white" style={{ backgroundColor: u.color + '30', color: u.color }}>{u.name.charAt(0)}</div></TooltipTrigger><TooltipContent>{u.name}</TooltipContent></Tooltip>
                  ))}
                </div>
                <span>{otherViewers.map(u => u.name).slice(0, 2).join('、')}{otherViewers.length > 2 ? `等${otherViewers.length}人` : ''}正在查看</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {editingTitle ? (
                  <input className="text-base sm:text-lg font-semibold w-full border border-input rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring" value={titleDraft} onChange={e => setTitleDraft(e.target.value)} onBlur={saveTitle} onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }} autoFocus />
                ) : (
                  <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setEditingTitle(true)}>
                    <h2 className="text-base sm:text-lg font-semibold truncate flex-1">{item.title}</h2>
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <div className="relative">
                    <button className={cn('px-2 py-0.5 rounded text-xs font-medium cursor-pointer', STATUS_MAP[status]?.color || 'bg-gray-100 text-gray-600')} onClick={() => setStatusOpen(!statusOpen)}>{STATUS_MAP[status]?.label || status}</button>
                    {statusOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded shadow-lg z-20 py-1 min-w-[100px]">
                        {Object.entries(STATUS_MAP).map(([key, val]) => (
                          <button key={key} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-accent', key === status && 'font-semibold')} onClick={() => handleStatusChange(key)}>{val.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={cn('px-2 py-0.5 rounded text-xs font-medium cursor-pointer', PRIORITY_MAP[priority]?.color || 'bg-gray-100 text-gray-600')} onClick={() => setPriorityOpen(!priorityOpen)}>{PRIORITY_MAP[priority]?.label || priority}</button>
                    {priorityOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded shadow-lg z-20 py-1 min-w-[80px]">
                        {Object.entries(PRIORITY_MAP).map(([key, val]) => (
                          <button key={key} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-accent', key === priority && 'font-semibold')} onClick={() => handlePriorityChange(key)}>{val.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={handleClose} aria-label="关闭详情面板"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="px-4 sm:px-5 py-1.5 border-b border-border/50 flex items-center gap-2">
            {canDelete && <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer" onClick={() => { if (confirm(itemType === 'goal' ? '确认删除该目标？' : itemType === 'project' ? '确认删除该项目？关联任务将解除项目关联。' : '确认删除该任务？')) { const deleteType = { goal: 'DELETE_GOAL', project: 'DELETE_PROJECT', task: 'DELETE_TASK' } as const; dispatch({ type: deleteType[itemType], payload: itemId }); onClose(); } }}><Trash2 size={13} /> 删除{itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务'}</button>}
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-border px-4 sm:px-5 gap-0.5">
            {([
              { key: 'overview', label: '概览' },
              { key: 'details', label: '详情' },
              { key: 'tracking', label: '跟踪', badge: trackingRecords.length || undefined },
              { key: 'comments', label: '评论', badge: ((state.comments || []).filter(c => c.itemId === itemId).length) || undefined },
            ] as const).map(tab => (
              <button
                key={tab.key}
                className={cn('px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap', activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}{tab.badge ? ` (${tab.badge})` : ''}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="overflow-y-auto flex-1">
            {activeTab === 'overview' && (
              <>
                <Section title="背景信息">
                  <Textarea className="w-full min-h-[80px] text-sm" maxLength={5000} placeholder="输入描述信息，支持直接粘贴图片..." value={localDescription} onChange={e => setLocalDescription(e.target.value)} onPaste={handlePasteImage} />
                </Section>
                <DetailRelationships itemType={itemType} itemId={itemId} goal={goal} project={project} task={task} canEdit={canEdit} updateItem={updateItem} />
                <Section title="四象限归属">
                  <div className={cn('px-3 py-2 rounded border text-sm', QUADRANT_COLORS[getQuadrant(priority, dueDate, endDate)])}>{getQuadrant(priority, dueDate, endDate)}</div>
                </Section>
                <DetailPeople itemType={itemType} itemId={itemId} goal={goal} project={project} task={task} canEdit={canEdit} updateItem={updateItem} />
                <Section title="标签 & 分类" icon={<Tag className="w-3.5 h-3.5" />}>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">分类</label>
                      {allCategories.length > 0 ? (
                        <select className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1 bg-card" value={category} onChange={e => handleCategoryChange(e.target.value)}>
                          <option value="">未分类</option>
                          {allCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      ) : (
                        <input type="text" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" placeholder="输入分类" value={category} onChange={e => handleCategoryChange(e.target.value)} />
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">标签</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {state.tags.map(t => (
                          <button key={t.id} className={cn('px-2 py-0.5 rounded text-xs cursor-pointer transition-opacity', tags.includes(t.name) ? 'opacity-100 ring-1 ring-primary' : 'opacity-60')} style={{ backgroundColor: t.color + '22', color: t.color }} onClick={() => toggleTag(t.name)}>{t.name}</button>
                        ))}
                        {tags.filter(t => !state.tags.find(st => st.name === t)).map(t => (
                          <span key={t} className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{t}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input type="text" className="flex-1 text-sm border border-input rounded px-2 py-1" placeholder="添加自定义标签" value={customTagInput} onChange={e => setCustomTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }} />
                        <Button variant="outline" size="sm" className="h-7" onClick={addCustomTag} disabled={!customTagInput.trim()} aria-label="添加自定义标签"><Plus className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                </Section>
                <DetailLinks itemId={itemId} itemType={itemType} canEdit={canEdit} />
              </>
            )}

            {activeTab === 'details' && (
              <>
                <Section title="时间管理" icon={<Clock className="w-3.5 h-3.5" />}>
                  <div className="grid grid-cols-2 gap-3">
                    {(itemType === 'goal' || itemType === 'project') && (
                      <div className="contents">
                        <div>
                          <label className="text-xs text-muted-foreground">开始日期</label>
                          <input type="date" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" value={startDate} onChange={e => handleDateChange('startDate', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">结束日期</label>
                          <input type="date" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" value={endDate} onChange={e => handleDateChange('endDate', e.target.value)} />
                        </div>
                      </div>
                    )}
                    {itemType === 'task' && (
                      <div className="contents">
                        <div>
                          <label className="text-xs text-muted-foreground">开始日期</label>
                          <input type="date" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" value={startDate || ''} onChange={e => handleDateChange('startDate', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">截止日期</label>
                          <input type="date" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" value={dueDate || ''} onChange={e => handleDateChange('dueDate', e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-muted-foreground">提醒日期</label>
                          <input type="date" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" value={reminderDate || ''} onChange={e => handleDateChange('reminderDate', e.target.value)} />
                        </div>
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground">重复周期</label>
                      <select className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1 bg-card" value={repeatCycle} onChange={e => handleRepeatChange(e.target.value as RepeatCycle)}>
                        {Object.entries(REPEAT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                </Section>
                {itemType === 'project' && project && <DetailProjectSections project={project} startDate={startDate} endDate={endDate} />}
                {itemType === 'goal' && goal && <ApprovalPanel goalId={goal.id} approvalStatus={goal.approvalStatus ?? 'draft'} goalLeaderId={goal.leaderId} />}
                {itemType === 'goal' && goal && <DetailKRs goal={goal} canEdit={canEdit} updateItem={updateItem} />}
                <DetailChildItems itemId={itemId} itemType={itemType} task={task} />
                {item && <AiChatPanel itemId={itemId} itemType={itemType} itemTitle={item.title} itemDescription={item.description || ''} />}
                <Section title="项目总结">
                  <Textarea className="w-full min-h-[60px] text-sm" maxLength={3000} placeholder="输入总结..." value={localSummary} onChange={e => setLocalSummary(e.target.value)} />
                </Section>
                <Section title="附件" icon={<Paperclip className="w-3.5 h-3.5" />}>
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2 text-sm p-1.5 border rounded hover:bg-accent/50">
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                        <a href={att.url && (att.url.startsWith('http://') || att.url.startsWith('https://')) ? att.url : '#'} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:text-primary hover:underline">{att.name}</a>
                        <span className="text-[10px] text-muted-foreground">{formatFileSize(att.size)}</span>
                        <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" aria-label="删除附件" onClick={() => handleDeleteAttachment(att.id, att.url)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploadStatus === 'uploading'}>{uploadStatus === 'uploading' ? '上传中...' : <><Plus className="w-3.5 h-3.5" />上传文件</>}</Button>
                      {uploadStatus === 'success' && <span className="text-xs text-green-600">上传成功</span>}
                      {uploadStatus === 'error' && <span className="text-xs text-destructive">上传失败，请重试</span>}
                      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                    </div>
                  </div>
                </Section>
              </>
            )}

            {activeTab === 'tracking' && (
              <Section title="跟踪记录" icon={<Clock className="w-3.5 h-3.5" />}>
                <div className="space-y-3">
                  {trackingRecords.length === 0 && <EmptyState title="暂无跟踪记录" compact />}
                  {trackingRecords.map(record => (
                    <div key={record.id} className="border rounded p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">{record.date}</span>
                        <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" aria-label="删除跟踪记录" onClick={() => handleDeleteTracking(record.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                      <p className="text-sm">{record.content}</p>
                      {record.result && <p className="text-xs text-muted-foreground bg-accent/50 rounded p-1">结果: {record.result}</p>}
                    </div>
                  ))}
                  {canEdit && (
                    <div className="space-y-2 p-2 border rounded bg-accent/20">
                      <input type="date" className="w-full text-sm border border-input rounded px-2 py-1" value={newTrackingDate} onChange={e => setNewTrackingDate(e.target.value)} />
                      <Textarea className="min-h-[60px] text-sm" maxLength={2000} placeholder="记录内容..." value={newTrackingContent} onChange={e => setNewTrackingContent(e.target.value)} />
                      <Textarea className="min-h-[40px] text-sm" maxLength={2000} placeholder="结果（可选）" value={newTrackingResult} onChange={e => setNewTrackingResult(e.target.value)} />
                      <Button size="sm" className="h-7 text-xs" onClick={handleAddTracking} disabled={!newTrackingContent.trim()}><Plus className="w-3.5 h-3.5" />添加记录</Button>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {activeTab === 'comments' && (
              <DetailComments itemId={itemId} itemType={itemType} canEdit={canEdit} updateItem={updateItem} attachments={attachments} newComment={newComment} setNewComment={setNewComment} setUploadStatus={setUploadStatus} />
            )}
          </div>
        </div>
      </div>
    </>
    </DetailPanelErrorBoundary>
  );
}
