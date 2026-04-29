import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore, useViewingMember, useScheduleEvents, useNotes } from '@/store/useStore';
import type { RepeatCycle } from '@/types';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Edit2, Trash2,
  Clock, Tag, Link, Search, Pin, PinOff, Palette, StickyNote
} from 'lucide-react';
import { inputCls, emptyEvtForm, getCalendarDays, NOTE_COLORS, FOLDERS, repeatLabels, WEEKDAYS, PRESET_COLORS } from './constants';
import type { EvtForm, CalendarDay } from './constants';

export function ScheduleTab() {
  const { state } = useStore();
  const members = state.members || [];
  const goals = state.goals || [];
  const projects = state.projects || [];
  const tasks = state.tasks || [];
  const currentUser = state.currentUser;
  const { viewingMemberId } = useViewingMember();
  const { events, addEvent, updateEvent, deleteEvent } = useScheduleEvents(viewingMemberId || undefined);
  const { notes, addNote, updateNote, deleteNote } = useNotes(undefined);
  const [activeTab, setActiveTab] = useState<'calendar' | 'notes'>('calendar');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [form, setForm] = useState<EvtForm>(emptyEvtForm);
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
  const calendarDays = useMemo(() => getCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);
  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof events> = {};
    events.forEach(evt => {
      const start = evt.startDate.split('T')[0];
      const end = evt.endDate.split('T')[0];
      let d = new Date(start);
      const endD = new Date(end);
      while (d <= endD) { const key = d.toISOString().split('T')[0]; if (!map[key]) map[key] = []; map[key].push(evt); d.setDate(d.getDate() + 1); }
    });
    return map;
  }, [events]);

  useEffect(() => { if (selectedNote) { setEditingTitle(selectedNote.title); setEditingContent(selectedNote.content); setEditingColor(selectedNote.color); setEditingCategory(selectedNote.category || ''); } }, [selectedNote?.id]);
  function handleNoteSave() { if (!selectedNoteId || !selectedNote) return; if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { updateNote(selectedNoteId, { title: editingTitle.trim() || '无标题', content: editingContent, color: editingColor, category: editingCategory }); }, 500); }
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  function getMemberName(id: string) { return members.find(m => m.id === id)?.name || ''; }
  function getLinkedItemTitle(id: string, type: string | null) {
    if (!type || !id) return '';
    if (type === 'goal') return goals.find(g => g.id === id)?.title || '';
    if (type === 'project') return projects.find(p => p.id === id)?.title || '';
    if (type === 'task') return tasks.find(t => t.id === id)?.title || '';
    return '';
  }
  function openAdd(date: string) { setForm({ ...emptyEvtForm, startDate: date, endDate: date, memberId: currentUser?.id || '' }); setEditingId(null); setShowDialog(true); }
  function openEdit(id: string) { const evt = events.find(e => e.id === id); if (!evt) return; setForm({ title: evt.title, description: evt.description, startDate: evt.startDate.split('T')[0], endDate: evt.endDate.split('T')[0], allDay: evt.allDay, color: evt.color, linkedItemId: evt.linkedItemId || '', linkedItemType: evt.linkedItemType, repeatCycle: evt.repeatCycle, memberId: evt.memberId }); setEditingId(id); setShowDialog(true); }
  function handleSave() {
    if (!form.title.trim() || !form.startDate) return;
    const sd = form.allDay ? form.startDate : form.startDate + 'T09:00:00';
    const ed = form.allDay ? form.endDate : form.endDate + 'T10:00:00';
    if (editingId) { updateEvent(editingId, { title: form.title.trim(), description: form.description.trim(), startDate: sd, endDate: ed, allDay: form.allDay, color: form.color, linkedItemId: form.linkedItemId || null, linkedItemType: form.linkedItemType, repeatCycle: form.repeatCycle, memberId: form.memberId }); }
    else { addEvent({ title: form.title.trim(), description: form.description.trim(), startDate: sd, endDate: ed, allDay: form.allDay, color: form.color, linkedItemId: form.linkedItemId || null, linkedItemType: form.linkedItemType, repeatCycle: form.repeatCycle, memberId: form.memberId }); }
    setShowDialog(false); setEditingId(null);
  }
  function handleDeleteEvt(id: string, title: string) { if (!confirm(`确定要删除日程「${title}」吗？`)) return; deleteEvent(id); setSelectedEvent(null); }
  function prevMonth() { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else { setCurrentMonth(m => m - 1); } }
  function nextMonth() { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else { setCurrentMonth(m => m + 1); } }
  function goToday() { const now = new Date(); setCurrentYear(now.getFullYear()); setCurrentMonth(now.getMonth()); }
  function handleNewNote() { const folder = folderFilter === '全部' ? '工作' : folderFilter; const memberId = currentUser?.id || ''; addNote({ title: '新建笔记', content: '', folder, color: NOTE_COLORS[0], isPinned: false, linkedItemId: null, linkedItemType: null, createdBy: memberId, updatedBy: memberId }); }
  function handleDeleteNote(id: string, title: string) { if (!confirm(`确定要删除笔记「${title}」吗？`)) return; deleteNote(id); if (selectedNoteId === id) setSelectedNoteId(null); }
  function togglePin(id: string, current: boolean) { updateNote(id, { isPinned: !current }); }
  function handleFolderSelect(val: string) { if (val === '__new__') { const name = prompt('输入新文件夹名称：'); if (name && name.trim()) { setFolderFilter(name.trim()); } return; } setFolderFilter(val); setSelectedNoteId(null); }
  function formatTime(iso: string) { const d = new Date(iso); const now = new Date(); const diff = now.getTime() - d.getTime(); if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`; return `${d.getMonth() + 1}/${d.getDate()}`; }
  const selectedEvt = selectedEvent ? events.find(e => e.id === selectedEvent) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold">日程管理</h2><p className="text-sm text-muted-foreground mt-0.5">管理团队日程与重要事项</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveTab('calendar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'bg-primary text-primary-foreground' : 'bg-white text-muted-foreground border border-border hover:bg-muted'}`}><Calendar size={16} className="inline mr-1.5" /> 月历</button>
          <button onClick={() => setActiveTab('notes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notes' ? 'bg-primary text-primary-foreground' : 'bg-white text-muted-foreground border border-border hover:bg-muted'}`}><StickyNote size={16} className="inline mr-1.5" /> 记事本</button>
          {activeTab === 'calendar' && <button onClick={() => openAdd(new Date().toISOString().split('T')[0])} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={16} /> 新建日程</button>}
        </div>
      </div>

      {activeTab === 'calendar' && (
        <>
          <div className="bg-white rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button className="p-1.5 rounded-lg hover:bg-muted" onClick={prevMonth}><ChevronLeft size={18} /></button>
                <h3 className="text-base font-semibold min-w-[140px] text-center">{currentYear}年{currentMonth + 1}月</h3>
                <button className="p-1.5 rounded-lg hover:bg-muted" onClick={nextMonth}><ChevronRight size={18} /></button>
              </div>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted" onClick={goToday}><Calendar size={14} /> 今天</button>
            </div>
            <div className="grid grid-cols-7 border-b border-border">{WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                const dayEvents = eventsByDate[day.date] || [];
                const isMultiple = dayEvents.length > 3;
                return (
                  <div key={i} className={`min-h-[80px] md:min-h-[100px] border-b border-r border-border/50 p-1 cursor-pointer hover:bg-muted/30 transition-colors ${!day.isCurrentMonth ? 'bg-muted/20' : ''}`} onClick={() => openAdd(day.date)}>
                    <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${day.isToday ? 'bg-primary text-primary-foreground' : ''} ${!day.isCurrentMonth ? 'text-muted-foreground/40' : ''}`}>{day.day}</div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map(evt => (
                        <div key={evt.id} className="text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white" style={{ backgroundColor: evt.color }} onClick={e => { e.stopPropagation(); setSelectedEvent(evt.id); }}>{evt.title}</div>
                      ))}
                      {isMultiple && <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} 更多</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {selectedEvt && (
            <div className="bg-white rounded-xl border border-border shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedEvt.color }} /><h3 className="font-semibold text-sm">{selectedEvt.title}</h3></div>
                <div className="flex items-center gap-2">
                  <button className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80" onClick={() => openEdit(selectedEvt.id)}><Edit2 size={14} /> 编辑</button>
                  <button className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700" onClick={() => handleDeleteEvt(selectedEvt.id, selectedEvt.title)}><Trash2 size={14} /> 删除</button>
                  <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedEvent(null)}>X</button>
                </div>
              </div>
              {selectedEvt.description && <p className="text-sm text-muted-foreground">{selectedEvt.description}</p>}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock size={12} /> {selectedEvt.startDate.split('T')[0]} ~ {selectedEvt.endDate.split('T')[0]}</span>
                {selectedEvt.allDay && <span>全天</span>}
                <span className="flex items-center gap-1"><Tag size={12} /> {repeatLabels[selectedEvt.repeatCycle]}</span>
                <span>成员：{getMemberName(selectedEvt.memberId)}</span>
              </div>
              {selectedEvt.linkedItemId && selectedEvt.linkedItemType && <div className="flex items-center gap-1 text-xs text-primary"><Link size={12} /> 关联{selectedEvt.linkedItemType === 'goal' ? '目标' : selectedEvt.linkedItemType === 'project' ? '项目' : '任务'}：{getLinkedItemTitle(selectedEvt.linkedItemId, selectedEvt.linkedItemType)}</div>}
            </div>
          )}
          {showDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/50" onClick={() => setShowDialog(false)} />
              <div className="relative bg-white rounded-xl shadow-xl border border-border w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-border"><h3 className="font-semibold">{editingId ? '编辑日程' : '新建日程'}</h3></div>
                <div className="px-6 py-4 space-y-4">
                  <div><label className="block text-sm font-medium mb-1">标题 *</label><input className={inputCls} placeholder="日程标题" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div><label className="block text-sm font-medium mb-1">描述</label><textarea className={inputCls + ' min-h-[60px] resize-y'} placeholder="日程描述..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium mb-1">开始日期 *</label><input type="date" className={inputCls} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                    <div><label className="block text-sm font-medium mb-1">结束日期</label><input type="date" className={inputCls} value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" className="rounded" checked={form.allDay} onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))} />全天日程</label>
                  <div>
                    <label className="block text-sm font-medium mb-1">颜色</label>
                    <div className="flex gap-2">{PRESET_COLORS.map(c => <button key={c} className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110" style={{ backgroundColor: c, borderColor: form.color === c ? '#000' : 'transparent' }} onClick={() => setForm(f => ({ ...f, color: c }))} />)}</div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">重复</label>
                    <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.repeatCycle} onChange={e => setForm(f => ({ ...f, repeatCycle: e.target.value as RepeatCycle }))}>{Object.entries(repeatLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">关联项</label>
                    <div className="flex gap-2">
                      <select className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.linkedItemType || ''} onChange={e => setForm(f => ({ ...f, linkedItemType: (e.target.value || null) as EvtForm['linkedItemType'], linkedItemId: '' }))}>
                        <option value="">无</option><option value="goal">目标</option><option value="project">项目</option><option value="task">任务</option>
                      </select>
                      {form.linkedItemType && <select className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.linkedItemId} onChange={e => setForm(f => ({ ...f, linkedItemId: e.target.value }))}>
                        <option value="">选择...</option>
                        {form.linkedItemType === 'goal' && goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                        {form.linkedItemType === 'project' && projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        {form.linkedItemType === 'task' && tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>}
                    </div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">成员</label>
                    <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.memberId} onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))}>
                      <option value="">选择成员</option>{members.filter(m => m.status === 'active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
                  <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted" onClick={() => setShowDialog(false)}>取消</button>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave}>{editingId ? '保存' : '创建'}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'notes' && (
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
      )}
    </div>
  );
}
