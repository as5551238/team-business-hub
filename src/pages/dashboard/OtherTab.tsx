/**
 * 其他 Tab — 快捷操作 + 常用网址 + 团队工作量 + 最近动态
 */
import { useState, useMemo, useEffect } from 'react';
import { Target, FolderKanban, ListTodo, Plus, Users, Zap, Globe, Search, Edit2, Trash2, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { handleError } from '@/lib/errorHandler';

import { useBookmarks } from '@/store/hooks';
import { actionLabels, useFilteredData } from './shared';
import { RecycleBin } from './RecycleBin';
import type { Bookmark as BookmarkType } from '@/types';
import type { DashboardTabProps } from './shared';

// ── 书签本地常量 ──
const DEFAULT_CATEGORIES = ['全部', '工作', '学习', '工具', '参考'];
const BOOKMARK_LS_KEY = 'tbh-bookmarks-list';

function loadBookmarksFromLS(): BookmarkType[] {
  try { const r = localStorage.getItem(BOOKMARK_LS_KEY); return r ? JSON.parse(r) : []; } catch (e) { handleError(e, { module: 'OtherTab', operation: 'LOAD_BOOKMARKS', severity: 'debug' }); return []; }
}
function saveBookmarksToLS(bms: BookmarkType[]) {
  try { localStorage.setItem(BOOKMARK_LS_KEY, JSON.stringify(bms)); } catch (e) { handleError(e, { module: 'OtherTab', operation: 'SAVE_BOOKMARKS', severity: 'debug' }); }
}

// ── 书签 Widget ──
function BookmarksWidget() {
  const { bookmarks, addBookmark, updateBookmark, deleteBookmark, reorderBookmarks } = useBookmarks();
  const [activeCat, setActiveCat] = useState('全部');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formCategory, setFormCategory] = useState('工作');
  const [formIcon, setFormIcon] = useState('');
  const [searchText, setSearchText] = useState('');

  const allCategories = useMemo(() => {
    const cats = new Set(DEFAULT_CATEGORIES.slice(1));
    bookmarks.forEach(b => { if (b.category) cats.add(b.category); });
    return ['全部', ...Array.from(cats).sort()];
  }, [bookmarks]);

  const filtered = useMemo(() => {
    let list = [...bookmarks].sort((a, b) => a.order - b.order);
    if (activeCat !== '全部') list = list.filter(b => b.category === activeCat);
    if (searchText.trim()) { const q = searchText.trim().toLowerCase(); list = list.filter(b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)); }
    return list;
  }, [bookmarks, activeCat, searchText]);

  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (synced) return;
    if (bookmarks.length === 0) {
      const ls = loadBookmarksFromLS();
      if (ls.length > 0) { reorderBookmarks(ls); setSynced(true); }
      else { setSynced(true); }
    } else {
      saveBookmarksToLS(bookmarks);
      setSynced(true);
    }
  }, [bookmarks, reorderBookmarks, synced]);

  function handleSave() {
    if (!formTitle.trim() || !formUrl.trim()) return;
    const trimmed = formUrl.trim();
    if (trimmed.toLowerCase().startsWith('javascript:') || trimmed.toLowerCase().startsWith('data:')) return;
    const url = trimmed.startsWith('http') ? trimmed : 'https://' + trimmed;
    if (editId) {
      updateBookmark(editId, { title: formTitle.trim(), url, category: formCategory, icon: formIcon });
      setEditId(null);
    } else {
      addBookmark({ title: formTitle.trim(), url, category: formCategory, icon: formIcon || '🔗', order: bookmarks.length });
    }
    setFormTitle(''); setFormUrl(''); setFormCategory('工作'); setFormIcon(''); setShowAdd(false);
  }

  function handleEdit(bm: BookmarkType) {
    setEditId(bm.id); setFormTitle(bm.title); setFormUrl(bm.url); setFormCategory(bm.category); setFormIcon(bm.icon); setShowAdd(true);
  }

  function handleMoveUp(idx: number) {
    if (idx <= 0) return;
    const sorted = [...bookmarks].sort((a, b) => a.order - b.order);
    const reordered = [...sorted];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    reorderBookmarks(reordered.map((b, i) => ({ ...b, order: i })));
  }

  function handleMoveDown(idx: number) {
    if (idx >= filtered.length - 1) return;
    const sorted = [...bookmarks].sort((a, b) => a.order - b.order);
    const reordered = [...sorted];
    const realIdx = sorted.indexOf(filtered[idx]);
    const realNext = sorted.indexOf(filtered[idx + 1]);
    [reordered[realIdx], reordered[realNext]] = [reordered[realNext], reordered[realIdx]];
    reorderBookmarks(reordered.map((b, i) => ({ ...b, order: i })));
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2"><Globe size={18} className="text-indigo-500" /><h2 className="font-semibold text-sm md:text-base">常用网址</h2><span className="text-xs text-muted-foreground">{bookmarks.length}个</span></div>
        <button className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1" onClick={() => { setShowAdd(true); setEditId(null); setFormTitle(''); setFormUrl(''); setFormCategory('工作'); setFormIcon(''); }}><Plus size={12} />添加</button>
      </div>
      <div className="px-4 md:px-5 py-3 flex items-center gap-2 flex-wrap border-b border-border">
        {allCategories.slice(0, 6).map(cat => (
          <button key={cat} className={`text-xs px-2.5 py-1 rounded-full transition-colors ${activeCat === cat ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`} onClick={() => setActiveCat(cat)}>{cat}</button>
        ))}
        <div className="ml-auto relative"><Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="text" className="pl-6 pr-2 py-1 text-xs border border-border rounded-md bg-muted/30 w-28 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="搜索..." value={searchText} onChange={e => setSearchText(e.target.value)} /></div>
      </div>
      {showAdd && (
        <div className="px-4 md:px-5 py-3 border-b border-border bg-muted/30 space-y-2">
          <div className="flex items-center gap-2">
            <input type="text" className="flex-1 text-xs border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="网站标题" value={formTitle} onChange={e => setFormTitle(e.target.value)} />
            <input type="text" className="flex-1 text-xs border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="网址 (https://...)" value={formUrl} onChange={e => setFormUrl(e.target.value)} />
            <span className="text-xs">emoji图标:</span><input type="text" className="w-12 text-xs border border-border rounded-lg px-2 py-1.5 text-center" value={formIcon} onChange={e => setFormIcon(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <select className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card" value={formCategory} onChange={e => setFormCategory(e.target.value)}>{DEFAULT_CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}</select>
            <button className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave}>{editId ? '保存' : '添加'}</button>
            <button className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted" onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      )}
      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {filtered.length === 0 && <div className="px-5 py-10 text-center text-muted-foreground text-sm">{searchText ? '未找到匹配网址' : '暂无常用网址，点击添加'}</div>}
        {filtered.map((bm, idx) => (
          <div key={bm.id} className="px-4 md:px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors group">
            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-0.5 hover:bg-muted rounded disabled:opacity-30" disabled={idx === 0 && activeCat === '全部'} onClick={() => handleMoveUp(idx)}><ChevronUp size={12} /></button>
              <button className="p-0.5 hover:bg-muted rounded disabled:opacity-30" disabled={idx === filtered.length - 1 && activeCat === '全部'} onClick={() => handleMoveDown(idx)} aria-label="下移"><ChevronDown size={12} /></button>
            </div>
            <span className="text-lg flex-shrink-0">{bm.icon || '🔗'}</span>
            <div className="flex-1 min-w-0">
              {bm.url.startsWith('http') ? <a href={bm.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-primary truncate block" onClick={e => e.stopPropagation()}>{bm.title}</a> : <span className="text-sm font-medium truncate block">{bm.title}</span>}
              <span className="text-xs text-muted-foreground truncate block">{bm.url}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground flex-shrink-0">{bm.category}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button className="p-1 hover:bg-muted rounded" onClick={e => { e.stopPropagation(); handleEdit(bm); }} aria-label="编辑书签"><Edit2 size={12} className="text-muted-foreground" /></button>
              <button className="p-1 hover:bg-red-50 rounded" onClick={e => { e.stopPropagation(); if (confirm('确认删除此书签？')) deleteBookmark(bm.id); }} aria-label="删除书签"><Trash2 size={12} className="text-red-400" /></button>
              {bm.url.startsWith('http') && <a href={bm.url} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-muted rounded" onClick={e => e.stopPropagation()}><ExternalLink size={12} className="text-muted-foreground" /></a>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 主组件 ──
export default function OtherTab({ onOpenDetail, onPageChange }: DashboardTabProps) {
  const { state, memberTasks, getMemberName, getAvatar, isTeamView, viewingMember } = useFilteredData();

  const handleQuickAction = (action: string) => {
    const pageMap: Record<string, string> = { newGoal: 'goals', newProject: 'projects', newTask: 'tasks' };
    onPageChange(pageMap[action]);
  };

  const recentActivities = useMemo(() => {
    if (isTeamView) return state.activities.slice(0, 6);
    return state.activities.filter(a => a.memberId === viewingMember?.id).slice(0, 6);
  }, [state.activities, isTeamView, viewingMember]);

  const memberTaskCounts = useMemo(() => {
    const countsMap = new Map<string, { active: number; done: number }>();
    for (const t of memberTasks) {
      if (!countsMap.has(t.leaderId)) countsMap.set(t.leaderId, { active: 0, done: 0 });
      const c = countsMap.get(t.leaderId)!;
      if (t.status === 'done') c.done++; else c.active++;
    }
    return state.members.map(m => {
      const c = countsMap.get(m.id) ?? { active: 0, done: 0 };
      return { member: m, active: c.active, done: c.done, total: c.active + c.done };
    });
  }, [state.members, memberTasks]);

  const teamWorkloadSorted = useMemo(() => memberTaskCounts.filter(m => m.total > 0).sort((a, b) => b.active - a.active), [memberTaskCounts]);

  return (
    <div className="space-y-6">
      {/* 快捷操作 */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border"><Zap size={18} className="text-amber-500" /><h2 className="font-semibold text-sm md:text-base">快捷操作</h2></div>
        <div className="grid grid-cols-3 gap-3 p-4">
          <button className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors" onClick={() => handleQuickAction('newGoal')}>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Target size={20} className="text-blue-600" /></div>
            <span className="text-xs font-medium">新建目标</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors" onClick={() => handleQuickAction('newProject')}>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><FolderKanban size={20} className="text-emerald-600" /></div>
            <span className="text-xs font-medium">新建项目</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors" onClick={() => handleQuickAction('newTask')}>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><ListTodo size={20} className="text-purple-600" /></div>
            <span className="text-xs font-medium">新建任务</span>
          </button>
        </div>
      </div>

      {/* 团队工作量 */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border"><div className="flex items-center gap-2"><Users size={18} className="text-indigo-500" /><h2 className="font-semibold text-sm md:text-base">团队工作量</h2></div></div>
        <div className="divide-y divide-border">
          {memberTaskCounts.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground text-sm">暂无成员数据</div>
          ) : teamWorkloadSorted.map(({ member, active, done, total }) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div key={member.id} className="px-4 md:px-5 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{member.avatar}</div>
                    <span className="text-sm font-medium">{member.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-orange-600 font-medium">{active} 进行中</span>
                    <span>·</span>
                    <span className="text-green-600">{done} 完成</span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 常用网址 */}
      <BookmarksWidget />

      {/* 最近动态 */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border"><h2 className="font-semibold text-sm md:text-base">最近动态</h2></div>
        <div className="divide-y divide-border">
          {recentActivities.length === 0 && <div className="px-5 py-10 text-center text-muted-foreground text-sm">暂无动态</div>}
          {recentActivities.map(activity => (
            <div key={activity.id} className="px-4 md:px-5 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => {
              if (activity.targetType === 'goal' || activity.targetType === 'project' || activity.targetType === 'task') onOpenDetail(activity.targetId, activity.targetType);
            }}>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{getAvatar(activity.memberId) || '?'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm"><span className="font-medium">{getMemberName(activity.memberId)}</span><span className="text-muted-foreground"> {actionLabels[activity.action] || activity.action} </span><span className="font-medium">{activity.targetTitle}</span></div>
                <div className="text-xs text-muted-foreground mt-0.5">{activity.details} · {new Date(activity.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${activity.targetType === 'goal' ? 'bg-blue-50 text-blue-600' : activity.targetType === 'project' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
                {activity.targetType === 'goal' ? '目标' : activity.targetType === 'project' ? '项目' : '任务'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 回收站 */}
      <RecycleBin />
    </div>
  );
}
