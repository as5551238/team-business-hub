import { useState, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useStore } from '@/store/useStore';
import { useViewingMember, useScheduleEvents } from '@/store/hooks';
import type { RepeatCycle, OutlookCalendarEvent } from '@/types';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Edit2, Trash2,
  Clock, Tag, Link, Mail
} from 'lucide-react';
import { inputCls, emptyEvtForm, getCalendarDays, repeatLabels, WEEKDAYS, PRESET_COLORS } from './constants';
import type { EvtForm } from './constants';

const OUTLOOK_EVENT_COLOR = '#F97316'; // orange-500 for Outlook events

export function ScheduleTab() {
  const { state } = useStore();
  const members = state.members || [];
  const goals = state.goals || [];
  const projects = state.projects || [];
  const tasks = state.tasks || [];
  const currentUser = state.currentUser;
  const { viewingMemberId } = useViewingMember();
  const { events, addEvent, updateEvent, deleteEvent } = useScheduleEvents(viewingMemberId || undefined);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [form, setForm] = useState<EvtForm>(emptyEvtForm);
  const [showOutlook, setShowOutlook] = useState(true);
  const [selectedOutlookEvent, setSelectedOutlookEvent] = useState<string | null>(null);

  const outlookEvents = state.outlookCalendarEvents || [];

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

  const outlookEventsByDate = useMemo(() => {
    if (!showOutlook) return {};
    const map: Record<string, OutlookCalendarEvent[]> = {};
    outlookEvents.forEach(evt => {
      const start = evt.startTime.split('T')[0];
      const end = evt.endTime.split('T')[0];
      let d = new Date(start);
      const endD = new Date(end);
      while (d <= endD) { const key = d.toISOString().split('T')[0]; if (!map[key]) map[key] = []; map[key].push(evt); d.setDate(d.getDate() + 1); }
    });
    return map;
  }, [outlookEvents, showOutlook]);

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
  const selectedEvt = selectedEvent ? events.find(e => e.id === selectedEvent) : null;
  const selectedOutlookEvt = selectedOutlookEvent ? outlookEvents.find(e => e.id === selectedOutlookEvent) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold">日程管理</h2><p className="text-sm text-muted-foreground mt-0.5">管理团队日程与重要事项</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => openAdd(new Date().toISOString().split('T')[0])} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={16} /> 新建日程</button>
          {outlookEvents.length > 0 && (
            <button onClick={() => setShowOutlook(!showOutlook)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${showOutlook ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              <Mail size={14} /> Outlook 日程 ({outlookEvents.length})
            </button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button className="p-1.5 rounded-lg hover:bg-muted" onClick={prevMonth} aria-label="上一月"><ChevronLeft size={18} /></button>
            <h3 className="text-base font-semibold min-w-[140px] text-center">{currentYear}年{currentMonth + 1}月</h3>
            <button className="p-1.5 rounded-lg hover:bg-muted" onClick={nextMonth} aria-label="下一月"><ChevronRight size={18} /></button>
          </div>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted" onClick={goToday}><Calendar size={14} /> 今天</button>
        </div>
        <div className="grid grid-cols-7 border-b border-border">{WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayEvents = eventsByDate[day.date] || [];
            const dayOutlookEvents = outlookEventsByDate[day.date] || [];
            const allEventCount = dayEvents.length + dayOutlookEvents.length;
            const isMultiple = allEventCount > 3;
            return (
              <div key={i} className={`min-h-[80px] md:min-h-[100px] border-b border-r border-border/50 p-1 cursor-pointer hover:bg-muted/30 transition-colors ${!day.isCurrentMonth ? 'bg-muted/20' : ''}`} onClick={() => openAdd(day.date)}>
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${day.isToday ? 'bg-primary text-primary-foreground' : ''} ${!day.isCurrentMonth ? 'text-muted-foreground/40' : ''}`}>{day.day}</div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, isMultiple ? 2 : 3).map(evt => (
                    <div key={evt.id} className="text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white" style={{ backgroundColor: evt.color }} onClick={e => { e.stopPropagation(); setSelectedEvent(evt.id); setSelectedOutlookEvent(null); }}>{evt.title}</div>
                  ))}
                  {showOutlook && dayOutlookEvents.slice(0, isMultiple ? 1 : 2).map(evt => (
                    <div key={evt.id} className="text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white flex items-center gap-0.5" style={{ backgroundColor: OUTLOOK_EVENT_COLOR }} onClick={e => { e.stopPropagation(); setSelectedOutlookEvent(evt.id); setSelectedEvent(null); }}>
                      <Mail size={8} />{evt.subject}
                    </div>
                  ))}
                  {isMultiple && <div className="text-[10px] text-muted-foreground px-1">+{allEventCount - 3} 更多</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedEvt && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-3">
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
      {selectedOutlookEvt && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: OUTLOOK_EVENT_COLOR }} />
              <Mail size={14} className="text-orange-500" />
              <h3 className="font-semibold text-sm">{selectedOutlookEvt.subject}</h3>
            </div>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedOutlookEvent(null)}>X</button>
          </div>
          {selectedOutlookEvt.bodyPreview && <p className="text-sm text-muted-foreground truncate">{selectedOutlookEvt.bodyPreview}</p>}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={12} /> {selectedOutlookEvt.startTime.split('T')[0]} ~ {selectedOutlookEvt.endTime.split('T')[0]}</span>
            {selectedOutlookEvt.isAllDay && <span>全天</span>}
            {selectedOutlookEvt.location && <span>{selectedOutlookEvt.location}</span>}
            {selectedOutlookEvt.isRecurring && <span className="text-orange-500">循环事件</span>}
            {selectedOutlookEvt.sensitivity === 'private' && <span className="text-red-500">私密</span>}
          </div>
          {selectedOutlookEvt.outlookLink && (
            <a href={selectedOutlookEvt.outlookLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <Link size={12} /> 在 Outlook 中打开
            </a>
          )}
        </div>
      )}
      <Dialog open={showDialog} onOpenChange={(v) => { if (!v) setShowDialog(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle className="font-semibold">{editingId ? '编辑日程' : '新建日程'}</DialogTitle>
            <DialogDescription className="sr-only">{editingId ? '编辑日程表单' : '新建日程表单'}</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            <div><label className="block text-sm font-medium mb-1">标题 *</label><input className={inputCls} placeholder="日程标题" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><label className="block text-sm font-medium mb-1">描述</label><textarea className={inputCls + ' min-h-[60px] resize-y'} placeholder="日程描述..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium mb-1">开始日期 *</label><input type="date" className={inputCls} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><label className="block text-sm font-medium mb-1">结束日期</label><input type="date" className={inputCls} value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2 text-sm"><Switch checked={form.allDay} onCheckedChange={v => setForm(f => ({ ...f, allDay: v }))} /><span>全天日程</span></div>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
