import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { uploadFile, BUCKET_NAMES } from '@/supabase/storage';
import type { ItemType, Attachment, Task } from '@/types';
import { Button } from '@/components/ui/button';
import { MessageSquare, Edit2, Save, Trash2, Bell, Sparkles, ListChecks, CornerDownRight, Paperclip } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { handleError } from '@/lib/errorHandler';
import { genId } from '@/store/utils';
import { Section } from './detail-shared';
import { sendUrgentNotification, isNotificationGranted } from '@/lib/browserNotify';
import DOMPurify from 'dompurify';
import { aiCapabilities, invokeAiCapability } from '@/lib/aiCommentAssistant';
import { useCollabPresence } from '@/lib/collab';

/** Regex: detect @mention at end of text before cursor — matches @name trailing at word boundary */
const MENTION_AT_END_RE = /(?:^|\s)@(\S*)$/;

/** Regex: detect @AI trigger at cursor position */
const AI_TRIGGER_RE = /@AI\s?$/;

/** Simple markdown→HTML (bold, italic, code, code block, links, line breaks, @mention) */
function renderMarkdown(text: string, memberNames?: Set<string>): string {
  let html = text
    // Code blocks (```...```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-100 text-xs p-2 rounded overflow-x-auto my-1"><code>$2</code></pre>')
    // Inline code (`...`)
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-xs px-1 py-0.5 rounded">$1</code>')
    // Bold (**...**)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic (*...*)
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">$1</a>')
    // @mention highlighting
    .replace(/@(\S+)/g, (_, name) => {
      if (memberNames?.has(name)) return `<span class="text-blue-600 font-medium">@${name}</span>`;
      return `@${name}`;
    })
    // Line breaks
    .replace(/\n/g, '<br/>');
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em', 'code', 'pre', 'a', 'br', 'span'], ALLOWED_ATTR: ['href', 'target', 'rel', 'class'] });
}

interface DetailCommentsProps {
  itemId: string;
  itemType: ItemType;
  canEdit: boolean;
  updateItem: (updates: Record<string, unknown>) => void;
  attachments: Attachment[];
  newComment: string;
  setNewComment: React.Dispatch<React.SetStateAction<string>>;
  setUploadStatus: (s: 'idle' | 'uploading' | 'success' | 'error') => void;
}

export function DetailComments({ itemId, itemType, canEdit, updateItem, attachments, newComment, setNewComment, setUploadStatus }: DetailCommentsProps) {
  const { state, dispatch } = useStore();
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [commentAttachments, setCommentAttachments] = useState<Attachment[]>([]);
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const aiDropdownRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collab presence for typing indicator
  const { onlineUsers, trackTyping } = useCollabPresence(state.currentUser?.id || '', state.currentUser?.name || '');
  const typingUsers = useMemo(() => onlineUsers.filter(u => u.id !== state.currentUser?.id && u.typingOn && u.typingOn.itemId === itemId && u.typingOn.itemType === itemType), [onlineUsers, state.currentUser?.id, itemId, itemType]);

  /** Broadcast typing status with 3s auto-clear */
  function handleTypingBroadcast() {
    trackTyping({ itemId, itemType });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => trackTyping(null), 3000);
  }

  const allComments = useMemo(() => state.comments.filter(c => c.itemId === itemId && c.itemType === itemType).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [state.comments, itemId, itemType]);

  // Top-level comments (no parentId) sorted newest-first
  const topLevelComments = useMemo(() => allComments.filter(c => !c.parentId).reverse(), [allComments]);

  // Replies indexed by parentId
  const repliesByParentId = useMemo(() => {
    const map = new Map<string, typeof allComments>();
    for (const c of allComments) {
      if (c.parentId) {
        const arr = map.get(c.parentId) || [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    }
    return map;
  }, [allComments]);

  // Count unread comments (comments not by current user and not yet read by current user, or that mention current user)
  const unreadCommentCount = useMemo(() => allComments.filter(c => {
    if (c.memberId === state.currentUser?.id) return false;
    if (c.isRead) return false;
    return (c.mentionedMemberIds ?? []).includes(state.currentUser?.id || '') || c.memberId !== state.currentUser?.id;
  }).length, [allComments, state.currentUser?.id]);

  const filteredMentionMembers = useMemo(() => {
    const active = state.members.filter(m => m.status === 'active');
    if (!mentionSearch) return active;
    const q = mentionSearch.toLowerCase();
    return active.filter(m => m.name.toLowerCase().includes(q) || (m.nickname || '').toLowerCase().includes(q));
  }, [state.members, mentionSearch]);

  const memberNameSet = useMemo(() => new Set(state.members.map(m => m.name)), [state.members]);

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
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allComments.length]);

  // Mark unread comments as read when this panel is visible
  useEffect(() => {
    const unreadOthers = allComments.filter(c => !c.isRead && c.memberId !== state.currentUser?.id);
    if (unreadOthers.length === 0) return;
    const timer = setTimeout(() => {
      for (const c of unreadOthers) {
        dispatch({ type: 'UPDATE_COMMENT', payload: { id: c.id, updates: { isRead: true } } });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [allComments.length, state.currentUser?.id, dispatch]);

  useEffect(() => {
    if (!mentionOpen) return;
    function handleClick(e: MouseEvent) {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setMentionOpen(false);
        setMentionSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mentionOpen]);

  useEffect(() => {
    if (!aiDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (aiDropdownRef.current && !aiDropdownRef.current.contains(e.target as Node)) {
        setAiDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [aiDropdownOpen]);

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

  /** Detect @mention context at cursor position — returns search term or null */
  function getMentionContext(text: string, cursorPos: number): string | null {
    const textBefore = text.substring(0, cursorPos);
    const match = MENTION_AT_END_RE.exec(textBefore);
    if (!match) return null;
    const term = match[1];
    if (term.toLowerCase().startsWith('ai') && term.length <= 2) return null;
    return term;
  }

  function insertMention(memberName: string) {
    const textarea = commentInputRef.current;
    if (!textarea) {
      setNewComment(prev => prev + `@${memberName} `);
      setMentionOpen(false);
      setMentionSearch('');
      setMentionSelectedIndex(0);
      return;
    }
    const start = textarea.selectionStart;
    const before = newComment.substring(0, start);
    const after = newComment.substring(textarea.selectionEnd);
    // Find the @ that triggered the mention — replace from there
    const atIdx = before.lastIndexOf('@');
    const cleanedBefore = atIdx >= 0 ? before.substring(0, atIdx) : before;
    const inserted = `@${memberName} `;
    setNewComment(cleanedBefore + inserted + after);
    setMentionOpen(false);
    setMentionSearch('');
    setMentionSelectedIndex(0);
    setTimeout(() => {
      if (textarea) {
        const pos = cleanedBefore.length + inserted.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      }
    }, 0);
  }

  function handleAddComment() {
    if (!newComment.trim() && commentAttachments.length === 0) return;
    if (newComment.trim() === '@AI') {
      setAiDropdownOpen(true);
      return;
    }
    const mentionedIds = parseMentions(newComment);
    dispatch({ type: 'ADD_COMMENT', payload: { itemId, itemType, memberId: state.currentUser?.id || '', memberName: state.currentUser?.name || '未知', content: newComment.trim(), mentionedMemberIds: mentionedIds, isRead: false, followUpRequired: false, followUpStatus: 'none' as const, ...(replyingTo ? { parentId: replyingTo } : {}), attachments: commentAttachments } });
    const itemTitle = state.goals.find(g => g.id === itemId)?.title || state.projects.find(p => p.id === itemId)?.title || state.tasks.find(t => t.id === itemId)?.title || '';
    for (const mid of mentionedIds) {
      if (mid !== state.currentUser?.id) {
        dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'nmen_' + itemId + '_' + mid + '_' + Date.now(), type: 'mentioned' as const, title: '你被提及了', message: `${state.currentUser?.name || '未知'} 在「${itemTitle}」中@了你`, relatedId: itemId, relatedType: itemType, memberId: mid, read: false, createdAt: new Date().toISOString() } });
        if (isNotificationGranted()) {
          sendUrgentNotification('你被提及了', { body: `${state.currentUser?.name || '未知'} 在「${itemTitle}」中@了你` });
        }
      }
    }
    setNewComment('');
    setReplyingTo(null);
    setCommentAttachments([]);
    trackTyping(null);
  }

  async function handleAiCapability(capId: string) {
    setAiDropdownOpen(false);
    setAiLoading(true);
    setNewComment('');
    const item = state.goals.find(g => g.id === itemId) || state.projects.find(p => p.id === itemId) || state.tasks.find(t => t.id === itemId);
    const cap = aiCapabilities.find(c => c.id === capId);
    try {
      const { result } = await invokeAiCapability(capId, {
        itemType,
        itemId,
        itemTitle: item?.title ?? '',
        itemDescription: item && 'description' in item ? (item as { description: string }).description : '',
      });
      dispatch({
        type: 'ADD_COMMENT',
        payload: {
          itemId,
          itemType,
          memberId: '__ai_assistant__',
          memberName: 'AI助手',
          content: `**${cap?.name ?? ''}**\n\n${result}`,
          mentionedMemberIds: [],
          isRead: false,
          followUpRequired: false,
          followUpStatus: 'none' as const,
        },
      });
    } catch (e) {
      handleError(e, { module: 'DetailComments', operation: 'AI_ANALYSIS', severity: 'warn' });
      dispatch({
        type: 'ADD_COMMENT',
        payload: {
          itemId,
          itemType,
          memberId: '__ai_assistant__',
          memberName: 'AI助手',
          content: `**${cap?.name ?? ''}**\n\nAI分析暂时不可用，请稍后再试。`,
          mentionedMemberIds: [],
          isRead: false,
          followUpRequired: false,
          followUpStatus: 'none' as const,
        },
      });
    } finally {
      setAiLoading(false);
    }
  }

  function handleDeleteComment(commentId: string) {
    if (!confirm('确认删除此评论？')) return;
    dispatch({ type: 'DELETE_COMMENT', payload: commentId });
  }

  function handleToggleFollowUp(commentId: string) {
    if (!canEdit) return;
    const comment = state.comments.find(c => c.id === commentId);
    if (!comment) return;
    const nextStatus: 'none' | 'pending' | 'completed' = comment.followUpStatus === 'none' ? 'pending' : comment.followUpStatus === 'pending' ? 'completed' : 'none';
    dispatch({ type: 'UPDATE_COMMENT', payload: { id: commentId, updates: { followUpRequired: nextStatus !== 'none', followUpStatus: nextStatus } } });
  }

  function handleConvertToTask(commentId: string) {
    if (!canEdit) return;
    const comment = state.comments.find(c => c.id === commentId);
    if (!comment) return;
    const title = comment.content.length > 50 ? comment.content.substring(0, 50) + '...' : comment.content;
    const taskPayload: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
      title,
      description: `由评论转任务创建（原始评论: ${comment.content}）`,
      projectId: comment.itemType === 'project' ? comment.itemId : null,
      goalId: comment.itemType === 'goal' ? comment.itemId : null,
      parentId: comment.itemType === 'task' ? comment.itemId : null,
      status: 'todo' as const,
      priority: 'medium' as const,
      leaderId: comment.memberId,
      supporterIds: comment.mentionedMemberIds || [],
      tags: [],
      category: '',
      startDate: null,
      dueDate: null,
      reminderDate: null,
      completedAt: null,
      subtasks: [],
      attachments: [],
      trackingRecords: [],
      repeatCycle: 'none' as const,
      blockedBy: [],
      sprintId: null,
      discussionThreadId: null,
      summary: '',
      teamId: state.currentTeamId || '',
    };
    dispatch({ type: 'ADD_TASK', payload: taskPayload });
    dispatch({ type: 'UPDATE_COMMENT', payload: { id: commentId, updates: { followUpRequired: true, followUpStatus: 'completed' as const } } });
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

  async function handlePasteImage(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    const newAttachments: typeof attachments = [];
    for (const file of files) {
      try {
        const path = `${itemType}/${itemId}/${Date.now()}_${file.name}`;
        const url = await uploadFile(BUCKET_NAMES.attachments, path, file);
        if (url) {
          const attachment = { id: genId('att'), name: file.name, type: file.type, size: file.size, url, uploadedBy: state.currentUser?.id || '', uploadedAt: new Date().toISOString() };
          newAttachments.push(attachment);
          setNewComment(prev => prev + `\n![${file.name}](${url})`);
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
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  }

  return (
    <Section title="讨论框" icon={<MessageSquare className="w-3.5 h-3.5" />} badge={unreadCommentCount > 0 ? unreadCommentCount : undefined}>
      <div className="space-y-3">
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {topLevelComments.length === 0 && <EmptyState title="暂无评论" compact />}
          {topLevelComments.map(c => {
            const isAi = c.memberId === '__ai_assistant__';
            const replies = repliesByParentId.get(c.id) || [];
            const isReplying = replyingTo === c.id;
            return (
            <div key={c.id}>
              <div className={cn('group relative', isAi && 'bg-blue-50/60 rounded-lg px-2 py-1 -mx-2')}>
                <div className="flex items-center gap-2">
                  <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0', isAi ? 'bg-blue-100 text-blue-700' : 'bg-primary/10 text-primary')}>{isAi ? <Sparkles className="w-3 h-3" /> : c.memberName.charAt(0)}</div>
                  <span className="text-xs font-medium shrink-0">{c.memberName}</span>
                  {isAi && <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 shrink-0">AI助手的建议</span>}
                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
                  {c.followUpStatus && c.followUpStatus !== 'none' && (
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] shrink-0', c.followUpStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700')}>
                      {c.followUpStatus === 'pending' ? '跟进中' : '已跟进'}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <button className="p-0.5 hover:bg-accent rounded cursor-pointer text-muted-foreground hover:text-primary" title="回复" onClick={() => { setReplyingTo(isReplying ? null : c.id); commentInputRef.current?.focus(); }}><CornerDownRight className="w-3 h-3" /></button>
                    {!isAi && <button className="p-0.5 hover:bg-accent rounded cursor-pointer text-muted-foreground hover:text-primary" title="转为任务" onClick={() => handleConvertToTask(c.id)}><ListChecks className="w-3 h-3" /></button>}
                    {!isAi && <button className="p-0.5 hover:bg-accent rounded cursor-pointer" title="切换跟进状态" onClick={() => handleToggleFollowUp(c.id)}><Bell className="w-3 h-3 text-muted-foreground" /></button>}
                    {!isAi && c.memberId === state.currentUser?.id && (
                      <button className="p-0.5 hover:bg-accent rounded cursor-pointer" title="编辑" onClick={() => handleStartEditComment(c.id)}><Edit2 className="w-3 h-3 text-muted-foreground" /></button>
                    )}
                    {!isAi && c.memberId === state.currentUser?.id && (
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
                  <div>
                    <div className="text-sm mt-1 ml-7 break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.content, memberNameSet) }} />
                    {c.attachments && c.attachments.length > 0 && (
                      <div className="mt-1 ml-7 flex flex-wrap gap-1.5">
                        {c.attachments.map(a => (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-accent transition-colors">
                            <Paperclip className="w-2.5 h-2.5" />
                            <span className="truncate max-w-[120px]">{a.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {isReplying && (
                  <div className="mt-1 ml-7 text-[10px] text-muted-foreground flex items-center gap-1">
                    <CornerDownRight className="w-3 h-3" />
                    <span>回复 {c.memberName}</span>
                    <button className="text-muted-foreground hover:text-primary underline ml-1" onClick={() => setReplyingTo(null)}>取消</button>
                  </div>
                )}
              </div>
              {/* Nested replies */}
              {replies.length > 0 && (
                <div className="ml-7 mt-1 space-y-2 border-l-2 border-muted pl-3">
                  {replies.map(r => {
                    const isAiR = r.memberId === '__ai_assistant__';
                    return (
                      <div key={r.id} className={cn('group relative', isAiR && 'bg-blue-50/60 rounded-lg px-2 py-1 -mx-2')}>
                        <div className="flex items-center gap-2">
                          <div className={cn('w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-medium shrink-0', isAiR ? 'bg-blue-100 text-blue-700' : 'bg-primary/10 text-primary')}>{isAiR ? <Sparkles className="w-2.5 h-2.5" /> : r.memberName.charAt(0)}</div>
                          <span className="text-[11px] font-medium shrink-0">{r.memberName}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
                          <div className="ml-auto flex items-center gap-1 shrink-0">
                            {!isAiR && r.memberId === state.currentUser?.id && (
                              <button className="p-0.5 hover:bg-accent rounded cursor-pointer" title="编辑" onClick={() => handleStartEditComment(r.id)}><Edit2 className="w-2.5 h-2.5 text-muted-foreground" /></button>
                            )}
                            {!isAiR && r.memberId === state.currentUser?.id && (
                              <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" title="删除" onClick={() => handleDeleteComment(r.id)}><Trash2 className="w-2.5 h-2.5 text-destructive" /></button>
                            )}
                          </div>
                        </div>
                        {editingCommentId === r.id ? (
                          <div className="mt-1 ml-5 space-y-1">
                            <textarea className="w-full text-xs border border-input rounded px-2 py-1 min-h-[30px] resize-none" value={editingCommentContent} onChange={e => setEditingCommentContent(e.target.value)} />
                            <div className="flex gap-1">
                              <Button size="sm" className="h-5 text-[10px] px-2" onClick={handleSaveEditComment}><Save className="w-2.5 h-2.5 mr-1" />保存</Button>
                              <Button size="sm" variant="outline" className="h-5 text-[10px] px-2" onClick={() => setEditingCommentId(null)}>取消</Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-xs mt-0.5 ml-5 break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content, memberNameSet) }} />
                            {r.attachments && r.attachments.length > 0 && (
                              <div className="mt-0.5 ml-5 flex flex-wrap gap-1">
                                {r.attachments.map(a => (
                                  <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-muted hover:bg-accent transition-colors">
                                    <Paperclip className="w-2 h-2" />
                                    <span className="truncate max-w-[100px]">{a.name}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
          <div ref={commentsEndRef} />
        </div>
        {typingUsers.length > 0 && (
          <div className="text-[11px] text-muted-foreground italic px-1">
            {typingUsers.map(u => u.name).join('、')} 正在输入...
          </div>
        )}
        <div className="space-y-2">
          <textarea ref={commentInputRef} className="w-full text-sm border border-input rounded px-2 py-1.5 min-h-[60px] resize-none" placeholder={replyingTo ? '回复评论，输入@提及成员...' : '发表评论，输入@提及成员，输入@AI召唤助手，支持粘贴图片...'} value={newComment} onChange={e => { setNewComment(e.target.value); handleTypingBroadcast(); const val = e.target.value; const cursorPos = e.target.selectionStart; const textBefore = val.substring(0, cursorPos); if (AI_TRIGGER_RE.test(textBefore)) { setAiDropdownOpen(true); } else { setAiDropdownOpen(false); } const mentionCtx = getMentionContext(val, cursorPos); if (mentionCtx !== null) { setMentionOpen(true); setMentionSearch(mentionCtx); setMentionSelectedIndex(0); } else if (mentionOpen && !val.includes('@')) { setMentionOpen(false); setMentionSearch(''); } }} onKeyDown={e => { if (mentionOpen && filteredMentionMembers.length > 0) { if (e.key === 'ArrowDown') { e.preventDefault(); setMentionSelectedIndex(i => Math.min(i + 1, filteredMentionMembers.length - 1)); return; } if (e.key === 'ArrowUp') { e.preventDefault(); setMentionSelectedIndex(i => Math.max(i - 1, 0)); return; } if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentionMembers[mentionSelectedIndex].name); return; } if (e.key === 'Escape') { e.preventDefault(); setMentionOpen(false); setMentionSearch(''); return; } } if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddComment(); } }} onPaste={handlePasteImage} />
           <div className="flex items-center gap-2">
             <input type="file" className="hidden" id="comment-attach-input" multiple onChange={async e => { const files = Array.from(e.target.files || []); for (const file of files) { try { const path = `${itemType}/${itemId}/${Date.now()}_${file.name}`; const url = await uploadFile(BUCKET_NAMES.attachments, path, file); if (url) { setCommentAttachments(prev => [...prev, { id: genId('att'), name: file.name, type: file.type, size: file.size, url, uploadedBy: state.currentUser?.id || '', uploadedAt: new Date().toISOString() }]); } } catch (err) { handleError(err, { module: 'DetailComments', operation: 'ATTACH_UPLOAD', severity: 'warn' }); } } e.target.value = ''; }} />
             <button className="px-2 py-1 text-xs border border-border rounded hover:bg-accent cursor-pointer" title="上传附件" onClick={() => document.getElementById('comment-attach-input')?.click()}><Paperclip className="w-3.5 h-3.5" /></button>
             {commentAttachments.length > 0 && (
               <div className="flex items-center gap-1 flex-wrap">
                 {commentAttachments.map(a => (
                   <span key={a.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted">
                     <Paperclip className="w-2.5 h-2.5" />
                     <span className="truncate max-w-[80px]">{a.name}</span>
                     <button className="ml-0.5 text-muted-foreground hover:text-destructive" onClick={() => setCommentAttachments(prev => prev.filter(x => x.id !== a.id))}>x</button>
                   </span>
                 ))}
               </div>
             )}
             <div className="relative" ref={mentionRef}>
              <button className="px-2 py-1 text-xs border border-border rounded hover:bg-accent cursor-pointer" onClick={() => setMentionOpen(!mentionOpen)}>@成员</button>
              {mentionOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-card border border-border rounded-lg shadow-lg z-20">
                  <input className="w-full text-xs border-b border-border px-2 py-1.5 rounded-t-lg" placeholder="搜索成员..." value={mentionSearch} onChange={e => { setMentionSearch(e.target.value); setMentionSelectedIndex(0); }} autoFocus />
                  <div className="max-h-[160px] overflow-y-auto py-0.5">
                    {filteredMentionMembers.length === 0 && <EmptyState title="无匹配" compact />}
                    {filteredMentionMembers.map((m, idx) => (
                      <button key={m.id} className={cn('w-full flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer text-left', idx === mentionSelectedIndex ? 'bg-accent' : 'hover:bg-accent')} onClick={() => insertMention(m.name)}>
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{(m.name || '?')[0]}</div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{m.name}</span>
                          <span className="ml-1 text-muted-foreground">{m.role === 'admin' ? '管理员' : m.role === 'manager' ? '经理' : m.role === 'leader' ? '负责人' : ''}</span>
                        </div>
                        {m.department && <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">{m.department}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative" ref={aiDropdownRef}>
              <button className="px-2 py-1 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50 cursor-pointer" onClick={() => setAiDropdownOpen(!aiDropdownOpen)}>@AI</button>
              {aiDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-52 bg-card border border-border rounded shadow-lg z-20">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">选择AI能力</div>
                  <div className="py-1">
                    {aiCapabilities.map(cap => (
                      <button key={cap.id} className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent cursor-pointer" onClick={() => handleAiCapability(cap.id)} disabled={aiLoading}>
                        <div className="font-medium">{cap.name}</div>
                        <div className="text-muted-foreground text-[10px]">{cap.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button size="sm" className="h-8 ml-auto" onClick={handleAddComment} disabled={!newComment.trim() || aiLoading}>
              {aiLoading ? 'AI思考中...' : '发送'}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
