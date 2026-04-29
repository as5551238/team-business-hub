import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore, useMemberLookup, useActiveMembers, usePermissions } from '@/store/useStore';
import { uploadFile, deleteFile, BUCKET_NAMES } from '@/supabase/storage';
import type { Goal, Project, Task, Comment, TrackingRecord, ItemLink, KeyResult, ItemType, RepeatCycle } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  X, Target, FolderKanban, CheckSquare, Calendar, Users, Tag, Link2,
  MessageSquare, FileText, Paperclip, Plus, Trash2, ChevronRight, Clock,
  Edit2, Save, Bell
} from 'lucide-react';
import { genId } from '@/store/utils';

interface ItemDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'goal' | 'project' | 'task';
  itemId: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planning: { label: '规划中', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '进行中', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
  paused: { label: '已暂停', color: 'bg-gray-100 text-gray-700' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-700' },
  todo: { label: '待办', color: 'bg-gray-100 text-gray-600' },
  done: { label: '已完成', color: 'bg-green-100 text-green-700' },
  blocked: { label: '已阻塞', color: 'bg-red-100 text-red-700' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'bg-slate-100 text-slate-600' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700' },
  high: { label: '高', color: 'bg-orange-100 text-orange-700' },
  urgent: { label: '紧急', color: 'bg-red-100 text-red-700' },
};

const REPEAT_LABELS: Record<RepeatCycle, string> = {
  none: '不重复', daily: '每天', weekly: '每周', biweekly: '每两周', monthly: '每月', quarterly: '每季度', yearly: '每年',
};

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

export function ItemDetailPanel({ isOpen, onClose, itemType, itemId }: ItemDetailPanelProps) {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const canDelete = (itemType === 'goal' ? can('delete_goals') : itemType === 'project' ? can('delete_projects') : can('delete_tasks'));
  const canEdit = (itemType === 'goal' ? can('edit_goals') : itemType === 'project' ? can('edit_projects') : can('edit_tasks'));
  const panelRef = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const goal = itemType === 'goal' ? state.goals.find(g => g.id === itemId) : null;
  const project = itemType === 'project' ? state.projects.find(p => p.id === itemId) : null;
  const task = itemType === 'task' ? state.tasks.find(t => t.id === itemId) : null;

  const { getName } = useMemberLookup();
  const { activeMembers } = useActiveMembers();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newTrackingDate, setNewTrackingDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTrackingContent, setNewTrackingContent] = useState('');
  const [newTrackingResult, setNewTrackingResult] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');
  const [addLinkType, setAddLinkType] = useState<ItemType>('goal');
  const [addLinkTargetId, setAddLinkTargetId] = useState('');
  const [addLinkLabel, setAddLinkLabel] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [editingKrId, setEditingKrId] = useState<string | null>(null);
  const [krDraft, setKrDraft] = useState<Partial<KeyResult>>({});
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');

  const item = goal || project || task;
  const status = goal?.status || project?.status || task?.status || '';
  const priority = goal?.priority || project?.priority || task?.priority || 'medium';
  const description = goal?.description || project?.description || task?.description || '';
  const tags = goal?.tags || project?.tags || task?.tags || [];
  const category = goal?.category || project?.category || task?.category || '';
  const startDate = goal?.startDate || project?.startDate || '';
  const endDate = goal?.endDate || project?.endDate || '';
  const dueDate = task?.dueDate || null;
  const reminderDate = task?.reminderDate || null;
  const repeatCycle = goal?.repeatCycle || project?.repeatCycle || task?.repeatCycle || 'none';
  const leaderId = goal?.leaderId || project?.leaderId || task?.leaderId || '';
  const supporterIds = goal?.supporterIds || project?.supporterIds || task?.supporterIds || [];
  const attachments = goal?.attachments || project?.attachments || task?.attachments || [];
  const trackingRecords = goal?.trackingRecords || project?.trackingRecords || task?.trackingRecords || [];
  const summary = goal?.summary || project?.summary || task?.summary || '';

  const links = useMemo(() => state.itemLinks.filter(l => (l.sourceId === itemId && l.sourceType === itemType) || (l.targetId === itemId && l.targetType === itemType)), [state.itemLinks, itemId, itemType]);

  const comments = useMemo(() => state.comments.filter(c => c.itemId === itemId && c.itemType === itemType).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [state.comments, itemId, itemType]);

  const childGoals = useMemo(() => itemType === 'goal' ? state.goals.filter(g => g.parentId === itemId) : [], [state.goals, itemId, itemType]);
  const childProjects = useMemo(() => itemType === 'project' ? state.projects.filter(p => p.parentId === itemId) : [], [state.projects, itemId, itemType]);
  const childTasks = useMemo(() => itemType === 'task' ? state.tasks.filter(t => t.parentId === itemId) : [], [state.tasks, itemId, itemType]);
  const subtasks = task?.subtasks || [];

  const allCategories = useMemo(() => state.categories.filter(c => c.appliesTo.includes(itemType)), [state.categories, itemType]);

  const filteredMentionMembers = useMemo(() => {
    const active = state.members.filter(m => m.status === 'active');
    if (!mentionSearch) return active;
    const q = mentionSearch.toLowerCase();
    return active.filter(m => m.name.toLowerCase().includes(q) || (m.nickname || '').toLowerCase().includes(q));
  }, [state.members, mentionSearch]);

  const highlightMentions = useCallback((content: string) => {
    const parts = content.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const name = part.slice(1);
        const isMember = state.members.some(m => m.name === name || m.nickname === name);
        if (isMember) return <span key={i} className="text-blue-600 font-medium">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }, [state.members]);

  useEffect(() => {
    if (item) setTitleDraft(item.title);
  }, [item?.title]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
        setPriorityOpen(false);
        setMentionOpen(false);
      }
    }
    if (statusOpen || priorityOpen || mentionOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusOpen, priorityOpen, mentionOpen]);

  function updateItem(updates: Record<string, any>) {
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
    updateItem({ status: newStatus });
    setStatusOpen(false);
  }

  function handlePriorityChange(newPriority: string) {
    updateItem({ priority: newPriority });
    setPriorityOpen(false);
  }

  function handleDescriptionBlur(val: string) {
    if (val !== description) updateItem({ description: val });
  }

  function handleSummaryBlur(val: string) {
    if (val !== summary) updateItem({ summary: val });
  }

  function handleParentChange(field: string, value: string | null) {
    if (field === 'parentId') updateItem({ parentId: value });
    else if (field === 'goalId') updateItem({ goalId: value });
    else if (field === 'projectId') updateItem({ projectId: value });
  }

  function handleDateChange(field: string, value: string) {
    updateItem({ [field]: value || null });
  }

  function handleRepeatChange(val: RepeatCycle) {
    updateItem({ repeatCycle: val });
  }

  function handleLeaderChange(val: string) {
    updateItem({ leaderId: val });
  }

  function toggleSupporter(memberId: string) {
    const next = supporterIds.includes(memberId) ? supporterIds.filter(id => id !== memberId) : [...supporterIds, memberId];
    updateItem({ supporterIds: next });
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
    if (val && !tags.includes(val)) {
      updateItem({ tags: [...tags, val] });
      if (!state.tags.find(t => t.name === val)) {
        dispatch({ type: 'ADD_TAG', payload: { name: val, color: `hsl(${Math.random() * 360}, 70%, 60%)`, createdAt: new Date().toISOString() } });
      }
    }
    setCustomTagInput('');
  }

  function handleAddLink() {
    if (!addLinkTargetId) return;
    dispatch({ type: 'ADD_ITEM_LINK', payload: { sourceId: itemId, sourceType: itemType, targetId: addLinkTargetId, targetType: addLinkType, label: addLinkLabel || undefined, createdAt: new Date().toISOString() } });
    setAddLinkTargetId('');
    setAddLinkLabel('');
    setShowAddLink(false);
  }

  function handleDeleteLink(linkId: string) {
    dispatch({ type: 'DELETE_ITEM_LINK', payload: linkId });
  }

  function handleAddTracking() {
    if (!newTrackingContent.trim()) return;
    const record: TrackingRecord = { id: genId('tr'), date: newTrackingDate, content: newTrackingContent.trim(), result: newTrackingResult.trim(), recordedBy: state.currentUser?.id || '', createdAt: new Date().toISOString() };
    updateItem({ trackingRecords: [...trackingRecords, record] });
    setNewTrackingContent('');
    setNewTrackingResult('');
  }

  function handleDeleteTracking(recordId: string) {
    updateItem({ trackingRecords: trackingRecords.filter(r => r.id !== recordId) });
  }

  function parseMentions(content: string): string[] {
    const regex = /@(\S+)/g;
    const ids: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const member = state.members.find(m => m.name === name || m.nickname === name);
      if (member && !ids.includes(member.id)) ids.push(member.id);
    }
    return ids;
  }

  function insertMention(memberName: string) {
    const textarea = commentInputRef.current;
    if (!textarea) {
      setNewComment(prev => prev + `@${memberName} `);
      setMentionOpen(false);
      setMentionSearch('');
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = newComment.substring(0, start);
    const after = newComment.substring(end);
    const inserted = `@${memberName} `;
    setNewComment(before + inserted + after);
    setMentionOpen(false);
    setMentionSearch('');
    setTimeout(() => {
      if (textarea) {
        const pos = start + inserted.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      }
    }, 0);
  }

  function handleAddComment() {
    if (!newComment.trim()) return;
    const mentionedIds = parseMentions(newComment);
    dispatch({ type: 'ADD_COMMENT', payload: { itemId, itemType, memberId: state.currentUser?.id || '', memberName: state.currentUser?.name || '未知', content: newComment.trim(), mentionedMemberIds: mentionedIds, isRead: false, followUpRequired: false, followUpStatus: 'none' as const } });
    setNewComment('');
  }

  function handleDeleteComment(commentId: string) {
    dispatch({ type: 'DELETE_COMMENT', payload: commentId });
  }

  function handleToggleFollowUp(commentId: string) {
    const comment = state.comments.find(c => c.id === commentId);
    if (!comment) return;
    const nextStatus: 'none' | 'pending' | 'completed' = comment.followUpStatus === 'none' ? 'pending' : comment.followUpStatus === 'pending' ? 'completed' : 'none';
    dispatch({ type: 'UPDATE_COMMENT', payload: { id: commentId, updates: { followUpRequired: nextStatus !== 'none', followUpStatus: nextStatus } } });
  }

  function handleStartEditComment(commentId: string) {
    const comment = state.comments.find(c => c.id === commentId);
    if (!comment) return;
    setEditingCommentId(commentId);
    setEditingCommentContent(comment.content);
  }

  function handleSaveEditComment() {
    if (!editingCommentId || !editingCommentContent.trim()) return;
    const mentionedIds = parseMentions(editingCommentContent);
    dispatch({ type: 'UPDATE_COMMENT', payload: { id: editingCommentId, updates: { content: editingCommentContent.trim(), mentionedMemberIds: mentionedIds } } });
    setEditingCommentId(null);
    setEditingCommentContent('');
  }

  function handleAddKR() {
    if (itemType !== 'goal' || !goal) return;
    if ((goal.keyResults || []).length >= 5) return;
    const kr: KeyResult = { id: genId('kr'), title: '新关键结果', targetValue: 100, currentValue: 0, unit: '%', selected: true };
    updateItem({ keyResults: [...goal.keyResults, kr] });
  }

  function handleUpdateKR(krId: string, updates: Partial<KeyResult>) {
    if (itemType !== 'goal' || !goal) return;
    updateItem({ keyResults: goal.keyResults.map(kr => kr.id === krId ? { ...kr, ...updates } : kr) });
  }

  function handleDeleteKR(krId: string) {
    if (itemType !== 'goal' || !goal) return;
    updateItem({ keyResults: goal.keyResults.filter(kr => kr.id !== krId) });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      const path = `${itemType}/${itemId}/${Date.now()}_${file.name}`;
      const url = await uploadFile(BUCKET_NAMES.attachments, path, file);
      if (url) {
        const attachment = { id: genId('att'), name: file.name, type: file.type, size: file.size, url, uploadedBy: state.currentUser?.id || '', uploadedAt: new Date().toISOString() };
        updateItem({ attachments: [...attachments, attachment] });
      }
    } catch (err) {
      console.error('File upload failed:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeleteAttachment(attId: string, attUrl: string) {
    const urlParts = attUrl.split('/');
    const bucketIdx = urlParts.indexOf(BUCKET_NAMES.attachments);
    if (bucketIdx >= 0) {
      const filePath = urlParts.slice(bucketIdx + 1).join('/');
      await deleteFile(BUCKET_NAMES.attachments, [filePath]);
    }
    updateItem({ attachments: attachments.filter(a => a.id !== attId) });
  }

  const { goalDescendants, availableParentGoals, availableParentProjects, availableParentTasks } = useMemo(() => {
    const goalD = goal ? collectDescendantIds(state.goals, itemId) : new Set<string>();
    const projectD = project ? collectDescendantIds(state.projects, itemId) : new Set<string>();
    const taskD = task ? collectDescendantIds(state.tasks, itemId) : new Set<string>();
    return {
      goalDescendants: goalD,
      availableParentGoals: state.goals.filter(g => g.id !== itemId && !goalD.has(g.id)),
      availableParentProjects: state.projects.filter(p => p.id !== itemId && !projectD.has(p.id)),
      availableParentTasks: state.tasks.filter(t => t.id !== itemId && !taskD.has(t.id)),
    };
  }, [state.goals, state.projects, state.tasks, itemId, goal, project, task]);

  const linkTargets = useMemo(() => {
    const targets: { id: string; title: string; type: ItemType }[] = [];
    state.goals.forEach(g => { if (g.id !== itemId) targets.push({ id: g.id, title: g.title, type: 'goal' }); });
    state.projects.forEach(p => { if (p.id !== itemId) targets.push({ id: p.id, title: p.title, type: 'project' }); });
    state.tasks.forEach(t => { if (t.id !== itemId) targets.push({ id: t.id, title: t.title, type: 'task' }); });
    return targets;
  }, [state.goals, state.projects, state.tasks, itemId]);

  if (!item) return null;

  function getItemTitle(id: string, type: ItemType) {
    if (type === 'goal') return state.goals.find(g => g.id === id)?.title || id;
    if (type === 'project') return state.projects.find(p => p.id === id)?.title || id;
    return state.tasks.find(t => t.id === id)?.title || id;
  }

  function getTypeIcon(type: ItemType) {
    if (type === 'goal') return <Target className="w-3.5 h-3.5" />;
    if (type === 'project') return <FolderKanban className="w-3.5 h-3.5" />;
    return <CheckSquare className="w-3.5 h-3.5" />;
  }

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/30 z-40 hidden md:block" onClick={onClose} />}
      <div ref={panelRef} className={cn('fixed bg-white border-border shadow-xl z-50 flex flex-col transition-transform duration-300 inset-0 md:inset-auto md:top-0 md:right-0 md:h-full md:w-[480px] md:border-l', isOpen ? 'translate-x-0' : 'translate-x-full')}>
        <div className="overflow-y-auto flex-1">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border sticky top-0 bg-white z-10">
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
                      <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded shadow-lg z-20 py-1 min-w-[100px]">
                        {Object.entries(STATUS_MAP).map(([key, val]) => (
                          <button key={key} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-accent', key === status && 'font-semibold')} onClick={() => handleStatusChange(key)}>{val.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={cn('px-2 py-0.5 rounded text-xs font-medium cursor-pointer', PRIORITY_MAP[priority]?.color || 'bg-gray-100 text-gray-600')} onClick={() => setPriorityOpen(!priorityOpen)}>{PRIORITY_MAP[priority]?.label || priority}</button>
                    {priorityOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded shadow-lg z-20 py-1 min-w-[80px]">
                        {Object.entries(PRIORITY_MAP).map(([key, val]) => (
                          <button key={key} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-accent', key === priority && 'font-semibold')} onClick={() => handlePriorityChange(key)}>{val.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={onClose}><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="px-4 sm:px-5 py-1.5 border-b border-border/50 flex items-center gap-2">
            {canDelete && <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer" onClick={() => { if (confirm(itemType === 'goal' ? '确认删除该目标？' : itemType === 'project' ? '确认删除该项目？关联任务将解除项目关联。' : '确认删除该任务？')) { const action = itemType === 'goal' ? 'DELETE_GOAL' : itemType === 'project' ? 'DELETE_PROJECT' : 'DELETE_TASK'; dispatch({ type: action as any, payload: itemId }); onClose(); } }}><Trash2 size={13} /> 删除{itemType === 'goal' ? '目标' : itemType === 'project' ? '项目' : '任务'}</button>}
          </div>

          <Section title="背景信息">
            <Textarea className="w-full min-h-[80px] text-sm" placeholder="输入描述信息..." defaultValue={description} onBlur={e => handleDescriptionBlur(e.target.value)} />
          </Section>

          <Section title="归属关系">
            {itemType === 'goal' && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">父目标</label>
                <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-white" value={(goal as Goal)?.parentId || ''} onChange={e => handleParentChange('parentId', e.target.value || null)}>
                  <option value="">无</option>
                  {availableParentGoals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </div>
            )}
            {itemType === 'project' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">父项目</label>
                  <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-white mt-1" value={(project as Project)?.parentId || ''} onChange={e => handleParentChange('parentId', e.target.value || null)}>
                    <option value="">无</option>
                    {availableParentProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">关联目标</label>
                  <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-white mt-1" value={(project as Project)?.goalId || ''} onChange={e => handleParentChange('goalId', e.target.value || null)}>
                    <option value="">无</option>
                    {state.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                </div>
                {(project as Project)?.goalId && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Target className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">{getItemTitle((project as Project).goalId!, 'goal')}</span>
                  </div>
                )}
              </div>
            )}
            {itemType === 'task' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">父任务</label>
                  <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-white mt-1" value={(task as Task)?.parentId || ''} onChange={e => handleParentChange('parentId', e.target.value || null)}>
                    <option value="">无</option>
                    {availableParentTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">所属项目</label>
                  <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-white mt-1" value={(task as Task)?.projectId || ''} onChange={e => handleParentChange('projectId', e.target.value || null)}>
                    <option value="">无</option>
                    {state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">关联目标</label>
                  <select className="w-full text-sm border border-input rounded px-2 py-1.5 bg-white mt-1" value={(task as Task)?.goalId || ''} onChange={e => handleParentChange('goalId', e.target.value || null)}>
                    <option value="">无</option>
                    {state.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(task as Task)?.projectId && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded"><FolderKanban className="w-3 h-3" />{getItemTitle((task as Task).projectId!, 'project')}</span>
                  )}
                  {(task as Task)?.goalId && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded"><Target className="w-3 h-3" />{getItemTitle((task as Task).goalId!, 'goal')}</span>
                  )}
                </div>
              </div>
            )}
          </Section>

          <Section title="四象限归属">
            <div className={cn('px-3 py-2 rounded border text-sm', QUADRANT_COLORS[getQuadrant(priority, dueDate, endDate)])}>{getQuadrant(priority, dueDate, endDate)}</div>
          </Section>

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
                    <label className="text-xs text-muted-foreground">截止日期</label>
                    <input type="date" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" value={dueDate || ''} onChange={e => handleDateChange('dueDate', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">提醒日期</label>
                    <input type="date" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" value={reminderDate || ''} onChange={e => handleDateChange('reminderDate', e.target.value)} />
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">重复周期</label>
                <select className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1 bg-white" value={repeatCycle} onChange={e => handleRepeatChange(e.target.value as RepeatCycle)}>
                  {Object.entries(REPEAT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>
          </Section>

          <Section title="人员配置" icon={<Users className="w-3.5 h-3.5" />}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">主导人</label>
                <select className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1 bg-white" value={leaderId} onChange={e => handleLeaderChange(e.target.value)}>
                  <option value="">未指定</option>
                  {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">协作人</label>
                <div className="mt-1 space-y-1 max-h-[160px] overflow-y-auto">
                  {activeMembers.map(m => (
                    <label key={m.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                      <Checkbox checked={supporterIds.includes(m.id)} onCheckedChange={() => toggleSupporter(m.id)} />
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">{m.name.charAt(0)}</div>
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="标签 & 分类" icon={<Tag className="w-3.5 h-3.5" />}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">分类</label>
                {allCategories.length > 0 ? (
                  <select className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1 bg-white" value={category} onChange={e => handleCategoryChange(e.target.value)}>
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
                  <Button variant="outline" size="sm" className="h-7" onClick={addCustomTag} disabled={!customTagInput.trim()}><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </div>
          </Section>

          <Section title="脉络图" icon={<Link2 className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              {links.length === 0 && <p className="text-xs text-muted-foreground">暂无关联</p>}
              {links.map(link => {
                const isSource = link.sourceId === itemId;
                const otherId = isSource ? link.targetId : link.sourceId;
                const otherType = isSource ? link.targetType : link.sourceType;
                return (
                  <div key={link.id} className="flex items-center gap-2 text-sm">
                    {getTypeIcon(otherType)}
                    <span className="flex-1 truncate">{getItemTitle(otherId, otherType)}</span>
                    {link.label && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-accent rounded">{link.label}</span>}
                    <span className="text-xs text-muted-foreground">{isSource ? '\u2192' : '\u2190'}</span>
                    <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" onClick={() => handleDeleteLink(link.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                );
              })}
              {showAddLink ? (
                <div className="space-y-2 p-2 border rounded bg-accent/30">
                  <select className="w-full text-sm border border-input rounded px-2 py-1 bg-white" value={addLinkType} onChange={e => { setAddLinkType(e.target.value as ItemType); setAddLinkTargetId(''); }}>
                    <option value="goal">目标</option>
                    <option value="project">项目</option>
                    <option value="task">任务</option>
                  </select>
                  <select className="w-full text-sm border border-input rounded px-2 py-1 bg-white" value={addLinkTargetId} onChange={e => setAddLinkTargetId(e.target.value)}>
                    <option value="">选择...</option>
                    {linkTargets.filter(t => t.type === addLinkType).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <input type="text" className="w-full text-sm border border-input rounded px-2 py-1" placeholder="标签（可选）" value={addLinkLabel} onChange={e => setAddLinkLabel(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddLink} disabled={!addLinkTargetId}>确认</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddLink(false)}>取消</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddLink(true)}><Plus className="w-3.5 h-3.5" />添加关联</Button>
              )}
            </div>
          </Section>

          {itemType === 'goal' && goal && (
            <Section title="关键结果">
              <div className="space-y-3">
                {(goal.keyResults || []).map(kr => {
                  const pct = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
                  return (
                    <div key={kr.id} className="border rounded p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={kr.selected} onCheckedChange={() => handleUpdateKR(kr.id, { selected: !kr.selected })} />
                        {editingKrId === kr.id ? (
                          <input className="flex-1 text-sm border border-input rounded px-1.5 py-0.5" value={krDraft.title || ''} onChange={e => setKrDraft({ ...krDraft, title: e.target.value })} onBlur={() => { handleUpdateKR(kr.id, { title: krDraft.title || kr.title }); setEditingKrId(null); }} onKeyDown={e => { if (e.key === 'Enter') { handleUpdateKR(kr.id, { title: krDraft.title || kr.title }); setEditingKrId(null); } }} autoFocus />
                        ) : (
                          <span className="flex-1 text-sm cursor-pointer hover:text-primary" onClick={() => { setEditingKrId(kr.id); setKrDraft({ title: kr.title }); }}>{kr.title}</span>
                        )}
                        <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" onClick={() => handleDeleteKR(kr.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="number" className="w-16 border border-input rounded px-1.5 py-0.5 text-sm" value={kr.currentValue} onChange={e => handleUpdateKR(kr.id, { currentValue: Number(e.target.value) })} />
                        <span>/</span>
                        <input type="number" className="w-16 border border-input rounded px-1.5 py-0.5 text-sm" value={kr.targetValue} onChange={e => handleUpdateKR(kr.id, { targetValue: Number(e.target.value) })} />
                        <input type="text" className="w-10 border border-input rounded px-1.5 py-0.5 text-sm" value={kr.unit} onChange={e => handleUpdateKR(kr.id, { unit: e.target.value })} />
                        <span className="ml-auto font-medium">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
                {(goal.keyResults || []).length < 5 ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddKR}><Plus className="w-3.5 h-3.5" />添加关键结果</Button>
                ) : (
                  <span className="text-xs text-muted-foreground">最多创建5个关键结果</span>
                )}
              </div>
            </Section>
          )}

          {(childGoals.length > 0 || childProjects.length > 0 || childTasks.length > 0 || subtasks.length > 0) && (
            <Section title="子项进度">
              <div className="space-y-2">
                {childGoals.map(cg => {
                  const leader = state.members.find(m => m.id === cg.leaderId);
                  return (
                    <div key={cg.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
                      <Target className="w-3.5 h-3.5 text-blue-500" />
                      <span className="flex-1 truncate">{cg.title}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[cg.status]?.color)}>{STATUS_MAP[cg.status]?.label}</span>
                      <Progress value={cg.progress} className="w-12 h-1.5" />
                      <span className="text-xs text-muted-foreground w-7 text-right">{cg.progress}%</span>
                      {leader && <span className="text-[10px] text-muted-foreground">{leader.name}</span>}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  );
                })}
                {childProjects.map(cp => {
                  const leader = state.members.find(m => m.id === cp.leaderId);
                  return (
                    <div key={cp.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
                      <FolderKanban className="w-3.5 h-3.5 text-orange-500" />
                      <span className="flex-1 truncate">{cp.title}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[cp.status]?.color)}>{STATUS_MAP[cp.status]?.label}</span>
                      <Progress value={cp.progress} className="w-12 h-1.5" />
                      <span className="text-xs text-muted-foreground w-7 text-right">{cp.progress}%</span>
                      {leader && <span className="text-[10px] text-muted-foreground">{leader.name}</span>}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  );
                })}
                {childTasks.map(ct => (
                  <div key={ct.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
                    <CheckSquare className="w-3.5 h-3.5 text-green-500" />
                    <span className="flex-1 truncate">{ct.title}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[ct.status]?.color)}>{STATUS_MAP[ct.status]?.label}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px]', PRIORITY_MAP[ct.priority]?.color)}>{PRIORITY_MAP[ct.priority]?.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                ))}
                {subtasks.map(st => (
                  <div key={st.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent">
                    <Checkbox checked={st.completed} onCheckedChange={() => dispatch({ type: 'TOGGLE_SUBTASK', payload: { taskId: itemId, subtaskId: st.id } })} />
                    <span className={cn('flex-1 truncate', st.completed && 'line-through text-muted-foreground')}>{st.title}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px]', PRIORITY_MAP[st.priority]?.color)}>{PRIORITY_MAP[st.priority]?.label}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="跟踪记录" icon={<FileText className="w-3.5 h-3.5" />}>
            <div className="space-y-3">
              {trackingRecords.map(record => (
                <div key={record.id} className="border rounded p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{record.date}</span>
                    <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" onClick={() => handleDeleteTracking(record.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                  <p className="text-sm">{record.content}</p>
                  {record.result && <p className="text-xs text-muted-foreground bg-accent/50 rounded p-1">结果: {record.result}</p>}
                </div>
              ))}
              <div className="space-y-2 p-2 border rounded bg-accent/20">
                <input type="date" className="w-full text-sm border border-input rounded px-2 py-1" value={newTrackingDate} onChange={e => setNewTrackingDate(e.target.value)} />
                <Textarea className="min-h-[60px] text-sm" placeholder="记录内容..." value={newTrackingContent} onChange={e => setNewTrackingContent(e.target.value)} />
                <Textarea className="min-h-[40px] text-sm" placeholder="结果（可选）" value={newTrackingResult} onChange={e => setNewTrackingResult(e.target.value)} />
                <Button size="sm" className="h-7 text-xs" onClick={handleAddTracking} disabled={!newTrackingContent.trim()}><Plus className="w-3.5 h-3.5" />添加记录</Button>
              </div>
            </div>
          </Section>

          <Section title="讨论框" icon={<MessageSquare className="w-3.5 h-3.5" />}>
            <div className="space-y-3">
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {comments.length === 0 && <p className="text-xs text-muted-foreground">暂无评论</p>}
                {comments.map(c => (
                  <div key={c.id} className="group relative">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary shrink-0">{c.memberName.charAt(0)}</div>
                      <span className="text-xs font-medium shrink-0">{c.memberName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
                      {c.followUpStatus && c.followUpStatus !== 'none' && (
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] shrink-0', c.followUpStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700')}>
                          {c.followUpStatus === 'pending' ? '跟进中' : '已跟进'}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                        <button className="p-0.5 hover:bg-accent rounded cursor-pointer" title="切换跟进状态" onClick={() => handleToggleFollowUp(c.id)}><Bell className="w-3 h-3 text-muted-foreground" /></button>
                        {c.memberId === state.currentUser?.id && (
                          <button className="p-0.5 hover:bg-accent rounded cursor-pointer" title="编辑" onClick={() => handleStartEditComment(c.id)}><Edit2 className="w-3 h-3 text-muted-foreground" /></button>
                        )}
                        {c.memberId === state.currentUser?.id && (
                          <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" title="删除" onClick={() => handleDeleteComment(c.id)}><Trash2 className="w-3 h-3 text-destructive" /></button>
                        )}
                      </div>
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="mt-1 ml-7 space-y-1">
                        <textarea className="w-full text-sm border border-input rounded px-2 py-1 min-h-[40px] resize-none" value={editingCommentContent} onChange={e => setEditingCommentContent(e.target.value)} />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSaveEditComment}><Save className="w-3 h-3 mr-1" />保存</Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setEditingCommentId(null)}>取消</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm mt-1 ml-7 whitespace-pre-wrap break-words">{highlightMentions(c.content)}</p>
                    )}
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>
              <div className="space-y-2">
                <textarea ref={commentInputRef} className="w-full text-sm border border-input rounded px-2 py-1.5 min-h-[60px] resize-none" placeholder="发表评论，输入@提及成员..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddComment(); } }} />
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button className="px-2 py-1 text-xs border border-border rounded hover:bg-accent cursor-pointer" onClick={() => setMentionOpen(!mentionOpen)}>@成员</button>
                    {mentionOpen && (
                      <div className="absolute bottom-full left-0 mb-1 w-48 bg-white border border-border rounded shadow-lg z-20">
                        <input className="w-full text-xs border-b border-border px-2 py-1.5 rounded-t" placeholder="搜索成员..." value={mentionSearch} onChange={e => setMentionSearch(e.target.value)} />
                        <div className="max-h-[120px] overflow-y-auto">
                          {filteredMentionMembers.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">无匹配</p>}
                          {filteredMentionMembers.map(m => (
                            <button key={m.id} className="w-full text-left px-2 py-1 text-xs hover:bg-accent cursor-pointer" onClick={() => insertMention(m.name)}>{m.name}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button size="sm" className="h-8 ml-auto" onClick={handleAddComment} disabled={!newComment.trim()}>发送</Button>
                </div>
              </div>
            </div>
          </Section>

          <Section title="项目总结">
            <Textarea className="w-full min-h-[60px] text-sm" placeholder="输入总结..." defaultValue={summary} onBlur={e => handleSummaryBlur(e.target.value)} />
          </Section>

          <Section title="附件" icon={<Paperclip className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-2 text-sm p-1.5 border rounded hover:bg-accent/50">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:text-primary hover:underline">{att.name}</a>
                  <span className="text-[10px] text-muted-foreground">{formatFileSize(att.size)}</span>
                  <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" onClick={() => handleDeleteAttachment(att.id, att.url)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()}><Plus className="w-3.5 h-3.5" />上传文件</Button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-3">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function collectDescendantIds(items: { id: string; parentId: string | null }[], rootId: string): Set<string> {
  const descendants = new Set<string>();
  const children = items.filter(i => i.parentId === rootId);
  for (const child of children) {
    descendants.add(child.id);
    const sub = collectDescendantIds(items, child.id);
    sub.forEach(id => descendants.add(id));
  }
  return descendants;
}
