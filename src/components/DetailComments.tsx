import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { uploadFile, BUCKET_NAMES } from '@/supabase/storage';
import type { ItemType } from '@/types';
import { Button } from '@/components/ui/button';
import { MessageSquare, Edit2, Save, Trash2, Bell, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { genId } from '@/store/utils';
import { Section } from './detail-shared';
import { sendUrgentNotification, isNotificationGranted } from '@/lib/browserNotify';
import DOMPurify from 'dompurify';
import { aiCapabilities, invokeAiCapability } from '@/lib/aiCommentAssistant';

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
  updateItem: (updates: Record<string, any>) => void;
  attachments: any[];
  newComment: string;
  setNewComment: React.Dispatch<React.SetStateAction<string>>;
  setUploadStatus: (s: 'idle' | 'uploading' | 'success' | 'error') => void;
}

export function DetailComments({ itemId, itemType, canEdit, updateItem, attachments, newComment, setNewComment, setUploadStatus }: DetailCommentsProps) {
  const { state, dispatch } = useStore();
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const aiDropdownRef = useRef<HTMLDivElement>(null);

  const comments = useMemo(() => state.comments.filter(c => c.itemId === itemId && c.itemType === itemType).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [state.comments, itemId, itemType]);

  // Count unread comments (comments not by current user and not yet read by current user, or that mention current user)
  const unreadCommentCount = useMemo(() => comments.filter(c => {
    if (c.memberId === state.currentUser?.id) return false;
    if (c.isRead) return false;
    return (c.mentionedMemberIds ?? []).includes(state.currentUser?.id || '') || c.memberId !== state.currentUser?.id;
  }).length, [comments, state.currentUser?.id]);

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
  }, [comments.length]);

  // Mark unread comments as read when this panel is visible
  useEffect(() => {
    const unreadOthers = comments.filter(c => !c.isRead && c.memberId !== state.currentUser?.id);
    if (unreadOthers.length === 0) return;
    const timer = setTimeout(() => {
      for (const c of unreadOthers) {
        dispatch({ type: 'UPDATE_COMMENT', payload: { id: c.id, updates: { isRead: true } } });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [comments.length, state.currentUser?.id, dispatch]);

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

  function insertMention(memberName: string) {
    const textarea = commentInputRef.current;
    if (!textarea) {
      setNewComment(prev => prev + `@${memberName} `);
      setMentionOpen(false);
      setMentionSearch('');
      return;
    }
    const start = textarea.selectionStart;
    const before = newComment.substring(0, start);
    const after = newComment.substring(textarea.selectionEnd);
    const mentionPrefix = before.lastIndexOf('@');
    const cleanedBefore = mentionPrefix >= 0 ? before.substring(0, mentionPrefix) : before;
    const inserted = `@${memberName} `;
    setNewComment(cleanedBefore + inserted + after);
    setMentionOpen(false);
    setMentionSearch('');
    setTimeout(() => {
      if (textarea) {
        const pos = cleanedBefore.length + inserted.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      }
    }, 0);
  }

  function handleAddComment() {
    if (!newComment.trim()) return;
    if (newComment.trim() === '@AI') {
      setAiDropdownOpen(true);
      return;
    }
    const mentionedIds = parseMentions(newComment);
    dispatch({ type: 'ADD_COMMENT', payload: { itemId, itemType, memberId: state.currentUser?.id || '', memberName: state.currentUser?.name || '未知', content: newComment.trim(), mentionedMemberIds: mentionedIds, isRead: false, followUpRequired: false, followUpStatus: 'none' as const } });
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
    } catch {
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
          {comments.length === 0 && <p className="text-xs text-muted-foreground">暂无评论</p>}
          {comments.map(c => {
            const isAi = c.memberId === '__ai_assistant__';
            return (
            <div key={c.id} className={cn('group relative', isAi && 'bg-blue-50/60 rounded-lg px-2 py-1 -mx-2')}>
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
                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
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
                <div className="text-sm mt-1 ml-7 break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.content, memberNameSet) }} />
              )}
            </div>
            );
          })}
          <div ref={commentsEndRef} />
        </div>
        <div className="space-y-2">
          <textarea ref={commentInputRef} className="w-full text-sm border border-input rounded px-2 py-1.5 min-h-[60px] resize-none" placeholder="发表评论，输入@提及成员，输入@AI召唤助手，支持粘贴图片..." value={newComment} onChange={e => { setNewComment(e.target.value); const val = e.target.value; const cursorPos = e.target.selectionStart; const textBefore = val.substring(0, cursorPos); if (/@AI\s?$/.test(textBefore)) { setAiDropdownOpen(true); } else { setAiDropdownOpen(false); } }} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddComment(); } }} onPaste={handlePasteImage} />
          <div className="flex items-center gap-2">
            <div className="relative" ref={mentionRef}>
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
            <div className="relative" ref={aiDropdownRef}>
              <button className="px-2 py-1 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50 cursor-pointer" onClick={() => setAiDropdownOpen(!aiDropdownOpen)}>@AI</button>
              {aiDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-52 bg-white border border-border rounded shadow-lg z-20">
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
