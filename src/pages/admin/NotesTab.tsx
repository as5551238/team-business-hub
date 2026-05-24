import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore, useNotes } from '@/store/useStore';
import {
  Plus, Trash2, Tag, Search, Pin, PinOff, Palette, StickyNote
} from 'lucide-react';
import { NOTE_COLORS, FOLDERS } from './constants';

export function NotesTab() {
  const { state } = useStore();
  const currentUser = state.currentUser;
  const { notes, addNote, updateNote, deleteNote } = useNotes(undefined);
  const [folderFilter, setFolderFilter] = useState('全部');
  const [noteSearch, setNoteSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('全部分类');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [editingColor, setEditingColor] = useState(NOTE_COLORS[0]);
  const [editingCategory, setEditingCategory] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => { if (selectedNote) { setEditingTitle(selectedNote.title); setEditingContent(selectedNote.content); setEditingColor(selectedNote.color); setEditingCategory(selectedNote.category || ''); } }, [selectedNote?.id]);
  function handleNoteSave() { if (!selectedNoteId || !selectedNote) return; if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { updateNote(selectedNoteId, { title: editingTitle.trim() || '无标题', content: editingContent, color: editingColor, category: editingCategory }); }, 500); }
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  function handleNewNote() { const folder = folderFilter === '全部' ? '工作' : folderFilter; const memberId = currentUser?.id || ''; addNote({ title: '新建笔记', content: '', folder, color: NOTE_COLORS[0], isPinned: false, linkedItemId: null, linkedItemType: null, createdBy: memberId, updatedBy: memberId }); }
  function handleDeleteNote(id: string, title: string) { if (!confirm(`确定要删除笔记「${title}」吗？`)) return; deleteNote(id); if (selectedNoteId === id) setSelectedNoteId(null); }
  function togglePin(id: string, current: boolean) { updateNote(id, { isPinned: !current }); }
  function handleFolderSelect(val: string) { if (val === '__new__') { const name = prompt('输入新文件夹名称：'); if (name && name.trim()) { setFolderFilter(name.trim()); } return; } setFolderFilter(val); setSelectedNoteId(null); }
  function formatTime(iso: string) { const d = new Date(iso); const now = new Date(); const diff = now.getTime() - d.getTime(); if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`; return `${d.getMonth() + 1}/${d.getDate()}`; }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold">记事本</h2><p className="text-sm text-muted-foreground mt-0.5">记录灵感、笔记与待办事项</p></div>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
          <div className="relative flex-1 min-w-[150px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="搜索笔记..." value={noteSearch} onChange={e => setNoteSearch(e.target.value)} />
          </div>
          <select className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={folderFilter} onChange={e => handleFolderSelect(e.target.value)}>{FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}<option value="__new__">+ 新建文件夹</option></select>
          <select className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="全部分类">全部分类</option>{noteCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <button onClick={handleNewNote} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新建笔记</button>
        </div>
        <div className="flex" style={{ minHeight: '500px' }}>
          <div className="w-[200px] border-r border-border overflow-y-auto flex-shrink-0 hidden sm:block">
            {sortedNotes.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">暂无笔记</div>}
            {sortedNotes.map(note => (
              <div key={note.id} className={`px-3 py-2.5 cursor-pointer border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedNoteId === note.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`} onClick={() => setSelectedNoteId(note.id)}>
                <div className="flex items-center gap-1.5 mb-0.5"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: note.color === '#ffffff' ? '#d1d5db' : note.color }} /><span className={`text-sm truncate flex-1 ${note.isPinned ? 'font-bold' : 'font-medium'}`}>{note.isPinned && <Pin size={10} className="inline mr-1 text-primary" />}{note.title || '无标题'}</span></div>
                <div className="text-xs text-muted-foreground truncate">{note.content.slice(0, 30) || '空内容'}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">{note.category && <span className="px-1 py-0.5 bg-primary/10 text-primary rounded">{note.category}</span>}<span className="px-1 py-0.5 bg-muted rounded">{note.folder}</span><span>{formatTime(note.updatedAt)}</span></div>
              </div>
            ))}
          </div>
          <div className="flex-1 flex flex-col">
            {selectedNote ? (
              <>
                <div className="flex items-center gap-2 p-3 border-b border-border">
                  <input className="flex-1 text-base font-semibold border-none outline-none bg-transparent" placeholder="笔记标题" value={editingTitle} onChange={e => { setEditingTitle(e.target.value); handleNoteSave(); }} onBlur={handleNoteSave} />
                  <button className="p-1.5 rounded-lg hover:bg-muted" onClick={() => togglePin(selectedNote.id, selectedNote.isPinned)}>{selectedNote.isPinned ? <PinOff size={16} className="text-primary" /> : <Pin size={16} className="text-muted-foreground" />}</button>
                  <button className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600" onClick={() => handleDeleteNote(selectedNote.id, selectedNote.title)}><Trash2 size={16} /></button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border/50">
                  <Palette size={12} className="text-muted-foreground" />{NOTE_COLORS.map(c => <button key={c} className="w-5 h-5 rounded-full border transition-transform hover:scale-110" style={{ backgroundColor: c, borderColor: editingColor === c ? '#6366f1' : '#e5e7eb' }} onClick={() => { setEditingColor(c); updateNote(selectedNote.id, { color: c }); }} />)}<span className="mx-1 text-border">|</span>
                  <Tag size={12} className="text-muted-foreground flex-shrink-0" /><input className="text-xs border border-border rounded px-1.5 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="分类" value={editingCategory} onChange={e => { setEditingCategory(e.target.value); handleNoteSave(); }} onBlur={handleNoteSave} />
                </div>
                <textarea className="flex-1 w-full p-4 text-sm border-none outline-none resize-none bg-transparent" placeholder="开始书写..." value={editingContent} onChange={e => { setEditingContent(e.target.value); handleNoteSave(); }} onBlur={handleNoteSave} />
              </>
            ) : <div className="flex-1 flex items-center justify-center text-muted-foreground"><div className="text-center"><StickyNote size={48} className="mx-auto mb-2 opacity-30" /><p className="text-sm">选择或新建一条笔记</p></div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
