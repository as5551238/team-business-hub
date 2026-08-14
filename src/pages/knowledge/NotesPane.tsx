import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useNotes } from '@/store/hooks';
import { genId } from '@/store/utils';
import {
  Plus, Trash2, Tag, Search, Pin, PinOff, Palette, StickyNote, Share2, Eye, Maximize2
} from 'lucide-react';
import { NOTE_COLORS, FOLDERS } from '../admin/constants';
import { cn } from '@/lib/utils';
import RichTextEditor from '@/components/RichTextEditor';
import NoteOverlay from '@/components/NoteOverlay';
import DOMPurify from 'dompurify';
import { sendWeChatMessage } from '@/supabase/wechat';

/**
 * 统一笔记面板（Phase1-P1 合并 NotesView/NotesTab，消除~95%重复代码）
 *
 * 设计：单组件 + isAdmin prop
 * - 用户端（Knowledge页）与管理端（Admin页）共用同一套列表/编辑/富文本/分享逻辑
 * - 视觉差异（图标尺寸/圆点大小）已统一为中间值，功能完全一致
 */
export function NotesPane({ isAdmin = false }: { isAdmin?: boolean }) {
  const { state, dispatch } = useStore();
  const currentUser = state.currentUser;
  const members = state.members;
  const { notes, addNote, updateNote, deleteNote } = useNotes(undefined);
  const [folderFilter, setFolderFilter] = useState('全部');
  const [noteSearch, setNoteSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('全部分类');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [editingColor, setEditingColor] = useState(NOTE_COLORS[0]);
  const [editingCategory, setEditingCategory] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // P1-RECOVERY: latest editor HTML + whether the user actually edited the editor body.
  // Prevents the historical race where the editor mounted with stale/empty content and
  // subsequent title/category saves overwrote the real note content with empty text.
  const latestContentRef = useRef('');
  const editorEditRef = useRef(false);
  // Track mention IDs per note to avoid duplicate notifications
  const mentionHistoryRef = useRef<Record<string, Set<string>>>({});
  const currentMentionsRef = useRef<string[]>([]);

  const noteCategories = useMemo(() => { const cats = new Set<string>(); notes.forEach(n => { if (n.category) cats.add(n.category); }); return Array.from(cats); }, [notes]);
  const filteredNotes = useMemo(() => {
    let result = notes;
    if (folderFilter !== '全部') result = result.filter(n => n.folder === folderFilter);
    if (categoryFilter !== '全部分类') result = result.filter(n => n.category === categoryFilter);
    if (!noteSearch.trim()) return result;
    const q = noteSearch.toLowerCase();
    return result.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, noteSearch, categoryFilter, folderFilter]);
  const sortedNotes = useMemo(() => [...filteredNotes].sort((a, b) => { if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1; return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); }), [filteredNotes]);
  const selectedNote = selectedNoteId ? notes.find(n => n.id === selectedNoteId) : null;

  useEffect(() => { if (selectedNote) { setEditingTitle(selectedNote.title); setEditingContent(selectedNote.content); latestContentRef.current = selectedNote.content; editorEditRef.current = false; setEditingColor(selectedNote.color); setEditingCategory(selectedNote.category || ''); currentMentionsRef.current = []; mentionHistoryRef.current[selectedNote.id] = new Set(); } }, [selectedNote?.id]);
  function handleMentionsChange(ids: string[]) { currentMentionsRef.current = ids; }
  function dispatchMentionNotifications(noteId: string, noteTitle: string) {
    const newIds = currentMentionsRef.current;
    const history = mentionHistoryRef.current[noteId] || new Set();
    const freshIds = newIds.filter(id => !history.has(id) && id !== currentUser?.id);
    if (freshIds.length === 0) return;
    for (const mid of freshIds) {
      dispatch({ type: 'ADD_NOTIFICATION', payload: { id: genId('n'), type: 'mentioned', title: '有人@了你', message: `${currentUser?.name || '团队成员'} 在笔记「${noteTitle}」中提及了你`, relatedId: noteId, relatedType: 'note', memberId: mid, read: false, createdAt: new Date().toISOString() } });
      history.add(mid);
    }
    mentionHistoryRef.current[noteId] = history;
  }
  function handleNoteSave() { if (!selectedNoteId || !selectedNote) return; if (debounceRef.current) clearTimeout(debounceRef.current); const id = selectedNoteId; let content = latestContentRef.current; if (!editorEditRef.current && !content && selectedNote.content) content = selectedNote.content; const title = editingTitle.trim() || '无标题'; const color = editingColor; const category = editingCategory; const noteTitle = title; debounceRef.current = setTimeout(() => { updateNote(id, { title, content, color, category }); dispatchMentionNotifications(id, noteTitle); }, 500); }
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  function handleNewNote() { const folder = folderFilter === '全部' ? '工作' : folderFilter; const memberId = currentUser?.id || ''; addNote({ title: '新建笔记', content: '', folder, color: NOTE_COLORS[0], isPinned: false, category: '', tags: [], linkedItemId: null, linkedItemType: null, createdBy: memberId, updatedBy: memberId }); }
  function handleDeleteNote(id: string, title: string) { if (!confirm(`确定要删除笔记「${title}」吗？`)) return; deleteNote(id); if (selectedNoteId === id) setSelectedNoteId(null); }
  function togglePin(id: string, current: boolean) { updateNote(id, { isPinned: !current }); }
  function handleFolderSelect(val: string) { if (val === '__new__') { const name = prompt('输入新文件夹名称：'); if (name && name.trim()) { setFolderFilter(name.trim()); } return; } setFolderFilter(val); setSelectedNoteId(null); }
  function formatTime(iso: string) { const d = new Date(iso); const now = new Date(); const diff = now.getTime() - d.getTime(); if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`; return `${d.getMonth() + 1}/${d.getDate()}`; }

  // WeChat share
  async function handleShareWechat() {
    if (!selectedNote) return;
    setShareStatus('发送中...');
    try {
      const textContent = selectedNote.content.replace(/<[^>]*>/g, '').slice(0, 500);
      const message = `📝 ${selectedNote.title}\n\n${textContent}${selectedNote.content.length > 500 ? '...' : ''}\n\n——来自团队业务中台·笔记`;
      const ok = await sendWeChatMessage(message);
      setShareStatus(ok ? '✓ 发送成功' : '✗ 发送失败');
    } catch {
      setShareStatus('✗ 发送失败');
    }
    setTimeout(() => setShareStatus(null), 3000);
  }

  // Share via WeChat personal (URL scheme)
  function handleSharePersonal() {
    if (!selectedNote) return;
    const textContent = selectedNote.content.replace(/<[^>]*>/g, '').slice(0, 500);
    const text = encodeURIComponent(`📝 ${selectedNote.title}\n\n${textContent}${selectedNote.content.length > 500 ? '...' : ''}\n\n——来自团队业务中台·笔记`);
    window.open(`weixin://dl/business/?t=${text}`, '_blank');
    setShareStatus('已尝试打开微信，请在微信中选择联系人');
    setTimeout(() => setShareStatus(null), 4000);
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="搜索笔记..." value={noteSearch} onChange={e => setNoteSearch(e.target.value)} />
        </div>
        <select className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={folderFilter} onChange={e => handleFolderSelect(e.target.value)}>{FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}<option value="__new__">+ 新建文件夹</option></select>
        <select className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="全部分类">全部分类</option>{noteCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <button onClick={handleNewNote} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新建笔记</button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-[200px] border-r border-border overflow-y-auto flex-shrink-0 hidden sm:block">
          {sortedNotes.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">暂无笔记</div>}
          {sortedNotes.map(note => (
            <div key={note.id} className={`px-3 py-2.5 cursor-pointer border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedNoteId === note.id ? 'bg-primary/5 border-l-[3px] border-l-primary' : note.color !== '#ffffff' ? 'border-l-[3px]' : ''}`} onClick={() => setSelectedNoteId(note.id)} style={{ borderLeftColor: selectedNoteId === note.id ? undefined : (note.color !== '#ffffff' ? note.color : undefined) }}>
              <div className="flex items-center gap-1.5 mb-0.5"><div className="w-3 h-3 rounded flex-shrink-0 border border-gray-200" style={{ backgroundColor: note.color === '#ffffff' ? '#fff' : note.color }} /><span className={`text-sm truncate flex-1 ${note.isPinned ? 'font-bold' : 'font-medium'}`}>{note.isPinned && <Pin size={10} className="inline mr-1 text-primary" />}{note.title || '无标题'}</span></div>
              <div className="text-xs text-muted-foreground truncate">{note.content.replace(/<[^>]*>/g, '').slice(0, 30) || '空内容'}</div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">{note.category && <span className="px-1 py-0.5 bg-primary/10 text-primary rounded">{note.category}</span>}<span className="px-1 py-0.5 bg-muted rounded">{note.folder}</span><span>{formatTime(note.updatedAt)}</span></div>
            </div>
          ))}
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          {selectedNote ? (
            <>
              <div className="flex items-center gap-2 p-3 border-b border-border flex-shrink-0">
                <input className="flex-1 text-base font-semibold border-none outline-none bg-transparent" placeholder="笔记标题" value={editingTitle} onChange={e => { setEditingTitle(e.target.value); handleNoteSave(); }} onBlur={handleNoteSave} />
                <button className={`p-1.5 rounded-lg hover:bg-muted ${showPreview ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`} onClick={() => setShowPreview(!showPreview)} title={showPreview ? '编辑模式' : '只读预览'}><Eye size={16} /></button>
                <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" onClick={() => setOverlayOpen(true)} title="展开到浮动窗口"><Maximize2 size={16} /></button>
                <button className="p-1.5 rounded-lg hover:bg-muted" onClick={() => togglePin(selectedNote.id, selectedNote.isPinned)}>{selectedNote.isPinned ? <PinOff size={16} className="text-primary" /> : <Pin size={16} className="text-muted-foreground" />}</button>
                <div className="relative group">
                  <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="分享到微信"><Share2 size={16} /></button>
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 z-50 hidden group-hover:block min-w-[160px]">
                    <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2" onClick={handleShareWechat}><Share2 size={13} /> 分享到企业微信群</button>
                    <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2" onClick={handleSharePersonal}><Share2 size={13} /> 分享到微信好友</button>
                    <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2" onClick={() => {
                      if (!selectedNote) return;
                      const textContent = selectedNote.content.replace(/<[^>]*>/g, '');
                      navigator.clipboard.writeText(`📝 ${selectedNote.title}\n\n${textContent}`).then(() => { setShareStatus('✓ 已复制到剪贴板'); setTimeout(() => setShareStatus(null), 2000); });
                    }}><Tag size={13} /> 复制内容</button>
                  </div>
                </div>
                {shareStatus && <span className="text-xs text-muted-foreground">{shareStatus}</span>}
                <button className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600" onClick={() => handleDeleteNote(selectedNote.id, selectedNote.title)}><Trash2 size={16} /></button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border/50 flex-shrink-0">
                <Palette size={13} className="text-muted-foreground" />{NOTE_COLORS.map(c => <button key={c} className={cn('w-5.5 h-5.5 rounded-full border-2 transition-transform hover:scale-110', editingColor === c ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-gray-300')} style={{ backgroundColor: c }} onClick={() => { setEditingColor(c); updateNote(selectedNote.id, { color: c }); }} />)}<span className="mx-1 text-border">|</span>
                <Tag size={12} className="text-muted-foreground flex-shrink-0" /><input className="text-xs border border-border rounded px-1.5 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="分类" value={editingCategory} onChange={e => { setEditingCategory(e.target.value); handleNoteSave(); }} onBlur={handleNoteSave} />
              </div>
              {showPreview ? (
                <div className="flex-1 w-full p-4 text-sm overflow-y-auto prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editingContent) }} />
              ) : (
                <RichTextEditor
                  key={selectedNoteId}
                  initialContent={selectedNote?.content ?? ''}
                  onChange={(html) => { latestContentRef.current = html; if (html !== selectedNote?.content) editorEditRef.current = true; setEditingContent(html); handleNoteSave(); }}
                  onMentionsChange={handleMentionsChange}
                  members={members}
                  placeholder="开始书写..."
                />
              )}
            </>
          ) : <div className="flex-1 flex items-center justify-center text-muted-foreground"><div className="text-center"><StickyNote size={48} className="mx-auto mb-2 opacity-30" /><p className="text-sm">选择或新建一条笔记</p></div></div>}
        </div>
      </div>

      {/* 浮动/全屏笔记覆盖层 */}
      {selectedNote && (
        <NoteOverlay
          open={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          title={editingTitle}
          onTitleChange={(t) => { setEditingTitle(t); handleNoteSave(); }}
          accentColor={editingColor !== '#ffffff' ? editingColor : undefined}
          toolbarExtras={
            <>
              <button className={`p-1 rounded hover:bg-muted ${showPreview ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`} onClick={() => setShowPreview(!showPreview)} title={showPreview ? '编辑模式' : '只读预览'}><Eye size={14} /></button>
              <button className="p-1 rounded-lg hover:bg-muted" onClick={() => togglePin(selectedNote.id, selectedNote.isPinned)}>{selectedNote.isPinned ? <PinOff size={14} className="text-primary" /> : <Pin size={14} className="text-muted-foreground" />}</button>
            </>
          }
        >
          <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border/50 flex-shrink-0">
              <Palette size={13} className="text-muted-foreground" />{NOTE_COLORS.map(c => <button key={c} className={cn('w-5 h-5 rounded-full border-2 transition-transform hover:scale-110', editingColor === c ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-gray-300')} style={{ backgroundColor: c }} onClick={() => { setEditingColor(c); updateNote(selectedNote.id, { color: c }); }} />)}<span className="mx-1 text-border">|</span>
              <Tag size={12} className="text-muted-foreground flex-shrink-0" /><input className="text-xs border border-border rounded px-1.5 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="分类" value={editingCategory} onChange={e => { setEditingCategory(e.target.value); handleNoteSave(); }} onBlur={handleNoteSave} />
            </div>
            {showPreview ? (
              <div className="flex-1 w-full p-4 text-sm overflow-y-auto prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editingContent) }} />
            ) : (
              <RichTextEditor
                key={`overlay-${selectedNoteId}`}
                initialContent={selectedNote?.content ?? ''}
                onChange={(html) => { latestContentRef.current = html; if (html !== selectedNote?.content) editorEditRef.current = true; setEditingContent(html); handleNoteSave(); }}
                onMentionsChange={handleMentionsChange}
                members={members}
                placeholder="开始书写..."
              />
            )}
          </div>
        </NoteOverlay>
      )}
    </div>
  );
}