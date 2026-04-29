import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore, useDashboardStats, useViewingMember, useMemberLookup, useBookmarks, usePermissions } from '@/store/useStore';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import {
  Target, FolderKanban, CheckCircle2, AlertTriangle,
  TrendingUp, Clock, ArrowRight, Zap, Settings,
  Calendar, Users, Plus, ListTodo, BarChart3, X, GripVertical, Trash2, UserPlus, Bookmark, ExternalLink, Edit2, ChevronUp, ChevronDown, Globe, Search
} from 'lucide-react';
import type { Bookmark as BookmarkType } from '@/types';

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};
const priorityLabels: Record<string, string> = {
  urgent: '紧急', high: '高', medium: '中', low: '低',
};
const statusLabels: Record<string, string> = {
  todo: '待处理', in_progress: '进行中', done: '已完成', blocked: '已阻塞',
};
const actionLabels: Record<string, string> = { completed: '完成了', created: '创建了', updated: '更新了' };

type WidgetId = 'stats' | 'todayTodos' | 'goalProgress' | 'recentActivities' | 'upcomingDeadlines' | 'teamWorkload' | 'quickActions' | 'bookmarks';

const WIDGET_META: Record<WidgetId, { label: string; icon: React.ReactNode }> = {
  stats: { label: '数据概览', icon: <BarChart3 size={16} /> },
  todayTodos: { label: '今日待办', icon: <Zap size={16} /> },
  goalProgress: { label: '目标进度', icon: <TrendingUp size={16} /> },
  recentActivities: { label: '最近动态', icon: <Clock size={16} /> },
  upcomingDeadlines: { label: '即将到期', icon: <Calendar size={16} /> },
  teamWorkload: { label: '团队工作量', icon: <Users size={16} /> },
  quickActions: { label: '快捷操作', icon: <Plus size={16} /> },
  bookmarks: { label: '常用网址', icon: <Globe size={16} /> },
};

const DEFAULT_WIDGETS: WidgetId[] = ['stats', 'todayTodos', 'goalProgress', 'recentActivities'];
const ALL_WIDGETS: WidgetId[] = ['stats', 'todayTodos', 'goalProgress', 'recentActivities', 'upcomingDeadlines', 'teamWorkload', 'quickActions', 'bookmarks'];
const STORAGE_KEY = 'dashboard-widgets-order';

function loadWidgets(): WidgetId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled: WidgetId[]; order: WidgetId[] };
      if (parsed.enabled && parsed.order) {
        const valid = parsed.order.filter((w: WidgetId) => parsed.enabled.includes(w) && ALL_WIDGETS.includes(w));
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    void 0;
  }
  return DEFAULT_WIDGETS;
}

function saveWidgets(widgets: WidgetId[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: widgets, order: widgets })); } catch {}
}

interface DashboardProps {
  onPageChange: (page: string) => void;
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

function CustomizeDialog({ widgets, onSave, onClose }: {
  widgets: WidgetId[]; onSave: (w: WidgetId[]) => void; onClose: () => void;
}) {
  const [enabled, setEnabled] = useState<Set<WidgetId>>(new Set(widgets));
  const [order, setOrder] = useState<WidgetId[]>(widgets);

  const toggle = (id: WidgetId) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setOrder(p => p.filter(w => w !== id));
      } else {
        next.add(id);
        setOrder(p => p.includes(id) ? p : [...p, id]);
      }
      return next;
    });
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    setOrder(prev => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; });
  };
  const moveDown = (idx: number) => {
    if (idx >= order.length - 1) return;
    setOrder(prev => { const n = [...prev]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; return n; });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-lg">自定义仪表盘</h3>
          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {ALL_WIDGETS.map((id, idx) => {
            const isOn = enabled.has(id);
            const actualIdx = order.indexOf(id);
            return (
              <div key={id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isOn ? 'border-border bg-white' : 'border-transparent bg-muted/40 opacity-60'}`}>
                <div className="flex flex-col gap-0.5">
                  <button className="p-0.5 hover:bg-muted rounded disabled:opacity-30" disabled={actualIdx <= 0 || !isOn} onClick={() => moveUp(actualIdx)}><ArrowRight size={12} className="rotate[-90deg]" /></button>
                  <button className="p-0.5 hover:bg-muted rounded disabled:opacity-30" disabled={actualIdx >= order.length - 1 || !isOn} onClick={() => moveDown(actualIdx)}><ArrowRight size={12} className="rotate-90" /></button>
                </div>
                <div className="text-muted-foreground"><GripVertical size={16} /></div>
                <div className="text-primary">{WIDGET_META[id].icon}</div>
                <span className="flex-1 text-sm font-medium">{WIDGET_META[id].label}</span>
                <button className={`w-10 h-6 rounded-full transition-colors relative ${isOn ? 'bg-primary' : 'bg-muted'}`} onClick={() => toggle(id)}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-transform ${isOn ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-border">
          <button className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors" onClick={() => { const final = order.filter(w => enabled.has(w)); saveWidgets(final); onSave(final); onClose(); }}>保存</button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CATEGORIES = ['全部', '工作', '学习', '工具', '参考'];
const BOOKMARK_LS_KEY = 'tbh-bookmarks-list';

function loadBookmarksFromLS(): BookmarkType[] {
  try { const r = localStorage.getItem(BOOKMARK_LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveBookmarksToLS(bms: BookmarkType[]) {
  try { localStorage.setItem(BOOKMARK_LS_KEY, JSON.stringify(bms)); } catch {}
}

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
    if (synced) return; // Already synced, don't dispatch again
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
    const url = formUrl.trim().startsWith('http') ? formUrl.trim() : 'https://' + formUrl.trim();
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
    <div className="bg-white rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-indigo-500" />
          <h2 className="font-semibold text-sm md:text-base">常用网址</h2>
          <span className="text-xs text-muted-foreground">{bookmarks.length}个</span>
        </div>
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
            <select className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white" value={formCategory} onChange={e => setFormCategory(e.target.value)}>{DEFAULT_CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}</select>
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
              <button className="p-0.5 hover:bg-muted rounded disabled:opacity-30" disabled={idx === filtered.length - 1 && activeCat === '全部'} onClick={() => handleMoveDown(idx)}><ChevronDown size={12} /></button>
            </div>
            <span className="text-lg flex-shrink-0">{bm.icon || '🔗'}</span>
             <div className="flex-1 min-w-0">
              <a href={bm.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-primary truncate block" onClick={e => e.stopPropagation()}>{bm.title}</a>
              <span className="text-xs text-muted-foreground truncate block">{bm.url}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground flex-shrink-0">{bm.category}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button className="p-1 hover:bg-muted rounded" onClick={e => e.stopPropagation()}><Edit2 size={12} className="text-muted-foreground" /></button>
              <button className="p-1 hover:bg-red-50 rounded" onClick={e => { e.stopPropagation(); deleteBookmark(bm.id); }}><Trash2 size={12} className="text-red-400" /></button>
              <a href={bm.url} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-muted rounded" onClick={e => e.stopPropagation()}><ExternalLink size={12} className="text-muted-foreground" /></a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ onPageChange }: DashboardProps) {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const stats = useDashboardStats();
  const { isTeamView, viewingMember, viewingMemberId } = useViewingMember();
  const { nameMap: memberNameMap } = useMemberLookup();
  const [widgets, setWidgets] = useState<WidgetId[]>(loadWidgets);
  const [showCustomize, setShowCustomize] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<'goal' | 'project' | 'task' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [showBatchOps, setShowBatchOps] = useState(false);
  const [batchStatus, setBatchStatus] = useState('');

  useEffect(() => { saveWidgets(widgets); }, [widgets]);

  const memberGoals = useMemo(() => {
    if (!isTeamView && viewingMember) {
      return state.goals.filter(g => g.leaderId === viewingMember.id || (g.supporterIds || []).includes(viewingMember.id));
    }
    return state.goals;
  }, [state.goals, isTeamView, viewingMember]);

  const memberTasks = useMemo(() => {
    if (!isTeamView && viewingMember) {
      return state.tasks.filter(t => t.leaderId === viewingMember.id || (t.supporterIds || []).includes(viewingMember.id));
    }
    return state.tasks;
  }, [state.tasks, isTeamView, viewingMember]);

  const activeGoals = useMemo(() => memberGoals.filter(g => g.status === 'in_progress'), [memberGoals]);
  const recentActivities = useMemo(() => {
    if (isTeamView) return state.activities.slice(0, 6);
    return state.activities.filter(a => a.memberId === viewingMember?.id).slice(0, 6);
  }, [state.activities, isTeamView, viewingMember]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const weekLaterStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; }, []);
  const nowDisplay = useMemo(() => new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }), []);
  const upcomingTasks = useMemo(() => {
    return memberTasks.filter(t => {
      if (t.status === 'done') return false;
      if (!t.dueDate) return false;
      return t.dueDate >= todayStr && t.dueDate <= weekLaterStr;
    }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 8);
  }, [memberTasks, todayStr, weekLaterStr]);

  const memberTaskCounts = useMemo(() => {
    return state.members.map(m => {
      const assigned = memberTasks.filter(t => t.leaderId === m.id && t.status !== 'done');
      const done = memberTasks.filter(t => t.leaderId === m.id && t.status === 'done');
      return { member: m, active: assigned.length, done: done.length, total: assigned.length + done.length };
    });
  }, [state.members, memberTasks]);

  const openDetail = useCallback((id: string, type: 'goal' | 'project' | 'task') => {
    setSelectedItemId(id);
    setSelectedItemType(type);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
  }, []);

  const getMemberName = useCallback((id: string) => memberNameMap.get(id) || '未知', [memberNameMap]);

  const handleQuickAction = useCallback((action: string) => {
    const pageMap: Record<string, string> = { newGoal: 'goals', newProject: 'projects', newTask: 'tasks' };
    onPageChange(pageMap[action]);
  }, [onPageChange]);

  const handleBatchDelete = useCallback(() => {
    if (!can('delete_tasks')) return;
    if (!confirm(`确认删除选中的 ${selectedIds.size} 个任务？`)) return;
    selectedIds.forEach(id => { dispatch({ type: 'DELETE_TASK', payload: id }); });
    setSelectedIds(new Set());
    setShowBatchOps(false);
    setBatchMode(false);
  }, [selectedIds, dispatch]);

  const handleBatchStatus = useCallback(() => {
    if (!batchStatus) return;
    selectedIds.forEach(id => {
      dispatch({ type: 'UPDATE_TASK', payload: { id, updates: { status: batchStatus as any } } });
    });
    setSelectedIds(new Set());
    setShowBatchOps(false);
    setBatchStatus('');
  }, [selectedIds, dispatch, batchStatus]);

  const WIDGETS: Record<WidgetId, () => React.ReactNode> = {
    stats: () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Target size={20} className="text-blue-600" />} label="进行中目标" value={stats.activeGoals} sub={`平均进度 ${stats.overallGoalProgress}%`} color="bg-blue-50" />
        <StatCard icon={<FolderKanban size={20} className="text-emerald-600" />} label="活跃项目" value={stats.activeProjects} color="bg-emerald-50" />
        <StatCard icon={<Clock size={20} className="text-orange-600" />} label="我的待办" value={stats.myTasks} sub={`今日 ${stats.todayTodos.length} 项`} color="bg-orange-50" />
        <StatCard icon={<AlertTriangle size={20} className="text-red-600" />} label="已逾期" value={stats.overdueTasks} color="bg-red-50" />
      </div>
    ),
    todayTodos: () => (
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            <h2 className="font-semibold text-sm md:text-base">今日待办</h2>
            {stats.todayTodos.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{stats.todayTodos.length}项</span>}
          </div>
          <span className="text-xs md:text-sm text-muted-foreground">{nowDisplay}</span>
        </div>
        <div className="divide-y divide-border">
          {stats.todayTodos.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground text-sm">今日暂无待办任务，可以放松一下</div>
          ) : stats.todayTodos.map(task => {
            const doneSubs = (task.subtasks || []).filter(s => s.completed).length;
            const totalSubs = (task.subtasks || []).length;
            const taskComments = (state.comments || []).filter(c => c.itemId === task.id).length;
            return (
              <div key={task.id} className="px-4 md:px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openDetail(task.id, 'task')}>
                <div className="flex items-start gap-3">
                  <button className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${task.status === 'done' ? 'bg-success border-success text-white' : 'border-muted-foreground/30 hover:border-primary'}`} onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, updates: { status: task.status === 'done' ? 'in_progress' : 'done', completedAt: task.status === 'done' ? null : new Date().toISOString() } } }); }}>
                    {task.status === 'done' && <CheckCircle2 size={12} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-2 flex-wrap ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      <span className="text-sm font-medium truncate">{task.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${priorityColors[task.priority]}`}>{priorityLabels[task.priority]}</span>
                      {taskComments > 0 && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{taskComments}</span>}
                    </div>
                    {totalSubs > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                          <div className="h-full bg-primary rounded-full animate-progress" style={{ width: `${(doneSubs / totalSubs) * 100}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{doneSubs}/{totalSubs}</span>
                      </div>
                    )}
                    {task.projectId && <div className="text-xs text-muted-foreground mt-1">{state.projects.find(p => p.id === task.projectId)?.title}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    goalProgress: () => (
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-primary" />
            <h2 className="font-semibold text-sm md:text-base">目标进度</h2>
          </div>
        </div>
        <div className="divide-y divide-border">
          {activeGoals.slice(0, 5).map(goal => {
            const goalComments = (state.comments || []).filter(c => c.itemId === goal.id).length;
            return (
              <div key={goal.id} className="px-4 md:px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openDetail(goal.id, 'goal')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium truncate flex-1 mr-2">{goal.title}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {goalComments > 0 && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{goalComments}</span>}
                    <span className="text-sm font-bold text-primary">{goal.progress}%</span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full animate-progress transition-all" style={{ width: `${goal.progress}%`, backgroundColor: goal.progress >= 80 ? 'hsl(var(--success))' : goal.progress >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--warning))' }} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground">{getMemberName(goal.leaderId)}</span>
                  <span className="text-xs text-muted-foreground/50">|</span>
                  <span className="text-xs text-muted-foreground">{goal.endDate && `截止 ${new Date(goal.endDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`}</span>
                </div>
              </div>
            );
          })}
          {activeGoals.length === 0 && <div className="px-5 py-10 text-center text-muted-foreground text-sm">暂无进行中的目标</div>}
        </div>
      </div>
    ),
    recentActivities: () => (
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm md:text-base">最近动态</h2>
        </div>
        <div className="divide-y divide-border">
          {recentActivities.length === 0 && <div className="px-5 py-10 text-center text-muted-foreground text-sm">暂无动态</div>}
          {recentActivities.map(activity => (
            <div key={activity.id} className="px-4 md:px-5 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => {
              if (activity.targetType === 'goal' || activity.targetType === 'project' || activity.targetType === 'task') openDetail(activity.targetId, activity.targetType);
            }}>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {state.members.find(m => m.id === activity.memberId)?.avatar || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-medium">{getMemberName(activity.memberId)}</span>
                  <span className="text-muted-foreground"> {actionLabels[activity.action] || activity.action} </span>
                  <span className="font-medium">{activity.targetTitle}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{activity.details} · {new Date(activity.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${activity.targetType === 'goal' ? 'bg-blue-50 text-blue-600' : activity.targetType === 'project' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
                {activity.targetType === 'goal' ? '目标' : activity.targetType === 'project' ? '项目' : '任务'}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    upcomingDeadlines: () => (
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-rose-500" />
            <h2 className="font-semibold text-sm md:text-base">即将到期</h2>
            <span className="text-xs text-muted-foreground">近7天</span>
          </div>
        </div>
        <div className="divide-y divide-border">
          {upcomingTasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground text-sm">近7天暂无到期任务</div>
          ) : upcomingTasks.map(task => {
            const daysLeft = Math.ceil((new Date(task.dueDate!).getTime() - new Date(todayStr).getTime()) / 86400000);
            const urgency = daysLeft <= 1 ? 'text-red-600 bg-red-50' : daysLeft <= 3 ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50';
            return (
              <div key={task.id} className="px-4 md:px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openDetail(task.id, 'task')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgency}`}>{daysLeft === 0 ? '今天' : daysLeft === 1 ? '明天' : `${daysLeft}天后`}</span>
                    <span className="text-sm font-medium truncate">{task.title}</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ml-2 ${priorityColors[task.priority]}`}>{priorityLabels[task.priority]}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 ml-[72px]">{getMemberName(task.leaderId)}</div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    teamWorkload: () => (
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-indigo-500" />
            <h2 className="font-semibold text-sm md:text-base">团队工作量</h2>
          </div>
        </div>
        <div className="divide-y divide-border">
          {memberTaskCounts.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground text-sm">暂无成员数据</div>
          ) : memberTaskCounts.filter(m => m.total > 0).sort((a, b) => b.active - a.active).map(({ member, active, done, total }) => {
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
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    quickActions: () => (
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-2 px-4 md:px-5 py-4 border-b border-border">
          <Zap size={18} className="text-amber-500" />
          <h2 className="font-semibold text-sm md:text-base">快捷操作</h2>
        </div>
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
    ),
    bookmarks: () => <BookmarksWidget />,
  };

  function renderWidgets() {
    return (
      <>
        {widgets.map(id => {
          if (WIDGETS[id]) return <div key={id}>{WIDGETS[id]()}</div>;
          return null;
        })}
      </>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {!isTeamView && viewingMember ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">{viewingMember.avatar}</div>
              <div className="min-w-0">
                <span className="text-sm font-medium">{viewingMember.name}</span>
                <span className="text-sm text-muted-foreground ml-1">的个人工作台</span>
              </div>
            </div>
          ) : (
            <h1 className="text-2xl font-bold">工作台</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors" onClick={() => setShowCustomize(true)}>
            <Settings size={18} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {batchMode && selectedIds.size > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={true} className="w-4 h-4 rounded" readOnly />
            <span className="text-sm font-medium">已选 {selectedIds.size} 项</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors" onClick={() => { if (!can('delete_tasks')) return; handleBatchDelete(); }}>
              <Trash2 size={14} /> 批量删除
            </button>
            <select value={batchStatus} onChange={e => setBatchStatus(e.target.value)} className="border border-border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/20">
              <option value="">批量修改状态</option>
              <option value="todo">待处理</option>
              <option value="in_progress">进行中</option>
              <option value="done">已完成</option>
              <option value="blocked">已阻塞</option>
            </select>
            {batchStatus && (
              <button className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" onClick={handleBatchStatus}>
                确认修改
              </button>
            )}
            <button className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors" onClick={() => setSelectedIds(new Set())}>
              取消选择
            </button>
          </div>
        </div>
      )}

      {renderWidgets()}
      {showCustomize && <CustomizeDialog widgets={widgets} onSave={setWidgets} onClose={() => setShowCustomize(false)} />}
      {selectedItemId && selectedItemType && (
        <ItemDetailPanel isOpen={true} onClose={closeDetail} itemId={selectedItemId} itemType={selectedItemType} />
      )}
    </div>
  );
}
