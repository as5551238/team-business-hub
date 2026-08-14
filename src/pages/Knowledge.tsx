import { useState, useMemo, useCallback, Fragment } from 'react';
import { useStore } from '@/store/useStore';
import { useKnowledge } from '@/store/hooks';
import type { Knowledge, ItemType, KnowledgeStatus, KnowledgePriority, KnowledgeVisibility } from '@/types';
import { BookOpen, Plus, Trash2, Search, Tag, X, Link2, Eye, Edit3, Palette, StickyNote, CircleDot, User, Flag, CalendarClock, Lock, Maximize2 } from 'lucide-react';
import { KNOWLEDGE_STATUSES, KNOWLEDGE_PRIORITIES, KNOWLEDGE_VISIBILITIES, KnowledgeStatusBadge } from '@/pages/knowledge/constants';
import { KnowledgeListView, KnowledgeTableView, KnowledgeKanbanView } from '@/pages/knowledge/views';
import { EmptyState } from '@/components/ui/EmptyState';
import DOMPurify from 'dompurify';
import { renderMarkdown } from '@/pages/admin/MarkdownDocTab';
import { NotesPane } from '@/pages/knowledge/NotesPane';
import NoteOverlay from '@/components/NoteOverlay';
import { NOTE_COLORS } from './admin/constants';
import { cn } from '@/lib/utils';
import ViewModeSwitch from '@/components/ViewModeSwitch';
import { LayoutGrid, List, Table2, Columns3, Sparkles, Check, Share2, Image as ImageIcon, Folder, MessageCircle, Loader2 } from 'lucide-react';
import { analyzeKnowledge, shouldAutoApply, type KnowledgeSuggestion } from '@/lib/ai/knowledgeRules';
import KnowledgeGraph from '@/pages/knowledge/KnowledgeGraph';

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<'entries' | 'notes'>('notes');
  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 pt-6 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><BookOpen size={20} /> 知识库</h1>
          <EmptyState title="条目与笔记统一管理，可关联事项" compact />
        </div>
        <div className="flex items-center gap-1">
          <ViewModeSwitch items={[{ value: 'entries', label: '条目', icon: BookOpen }, { value: 'notes', label: '笔记', icon: StickyNote }]} value={activeTab} onChange={v => setActiveTab(v as 'entries' | 'notes')} />
        </div>
      </div>
      <div className="flex-1 min-h-0 px-6 pb-6">
        <div className="bg-card rounded-xl border border-border shadow-sm h-full flex flex-col">
          {activeTab === 'entries' ? <EntriesView /> : <NotesPane />}
        </div>
      </div>
    </div>
  );
}

function EntriesView() {
  const { state } = useStore();
  const { addKnowledge, updateKnowledge, deleteKnowledge } = useKnowledge();
  const currentUser = state.currentUser;
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<KnowledgeStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list' | 'table' | 'kanban' | 'graph' | 'gallery'>('card');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState<KnowledgeStatus>('active');
  const [editPriority, setEditPriority] = useState<KnowledgePriority>('medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editVisibility, setEditVisibility] = useState<KnowledgeVisibility>('team');
  const [editAssignee, setEditAssignee] = useState('');
  const [editColor, setEditColor] = useState(NOTE_COLORS[0]);
  const [editRelatedItems, setEditRelatedItems] = useState<{ itemId: string; itemType: ItemType }[]>([]);
  const [markdownPreview, setMarkdownPreview] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<KnowledgeSuggestion | null>(null);
  const [entryOverlayOpen, setEntryOverlayOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [qaOpen, setQaOpen] = useState(false);
  const [qaQuery, setQaQuery] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  const myKnowledge = useMemo(() => {
    if (!currentUser) return [];
    return state.knowledge.filter(k => {
      const vis = k.visibility ?? 'team';
      if (vis === 'personal') return k.memberId === currentUser.id;
      return true;
    });
  }, [state.knowledge, currentUser?.id]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    myKnowledge.forEach(k => (k.tags ?? []).forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [myKnowledge]);

  const allCategories = useMemo(() => {
    const catSet = new Set<string>();
    myKnowledge.forEach(k => { if (k.category) catSet.add(k.category); });
    return Array.from(catSet).sort();
  }, [myKnowledge]);

  const filteredItems = useMemo(() => {
    let result = myKnowledge;
    if (filterTag) result = result.filter(k => (k.tags ?? []).includes(filterTag));
    if (filterStatus !== 'all') result = result.filter(k => (k.status ?? 'active') === filterStatus);
    if (filterCategory) result = result.filter(k => (k.category ?? '') === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(k => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q) || (k.category ?? '').toLowerCase().includes(q));
    }
    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [myKnowledge, search, filterTag, filterStatus, filterCategory]);

  const selectedItem = selectedId ? state.knowledge.find(k => k.id === selectedId) : null;

  const goals = state.goals;
  const projects = state.projects;
  const tasks = state.tasks;

  const viewMembers = useMemo(() => state.members.filter(m => m.status === 'active').map(m => ({ id: m.id, name: m.name })), [state.members]);

  function getItemTitle(itemId: string, itemType: ItemType): string {
    if (itemType === 'goal') return goals.find(g => g.id === itemId)?.title || '(已删除目标)';
    if (itemType === 'project') return projects.find(p => p.id === itemId)?.title || '(已删除项目)';
    return tasks.find(t => t.id === itemId)?.title || '(已删除任务)';
  }

  function startCreate() {
    setShowEditor(true);
    setSelectedId(null);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
    setEditCategory('');
    setEditStatus('active');
    setEditPriority('medium');
    setEditDueDate('');
    setEditVisibility('team');
    setEditAssignee('');
    setEditColor(NOTE_COLORS[0]);
    setEditRelatedItems([]);
    setMarkdownPreview(false);
    setAiSuggestion(null);
  }

  function startEdit(k: Knowledge) {
    if (currentUser && k.memberId !== currentUser.id) {
      const vis = k.visibility ?? 'team';
      if (vis === 'personal') return;
      if (vis === 'team') { alert('此条目为团队只读，仅创建者可编辑'); return; }
    }
    setSelectedId(k.id);
    setShowEditor(true);
    setEditTitle(k.title);
    setEditContent(k.content);
    setEditTags((k.tags ?? []).join(', '));
    setEditCategory(k.category ?? '');
    setEditStatus(k.status ?? 'active');
    setEditPriority(k.priority ?? 'medium');
    setEditDueDate(k.dueDate ? k.dueDate.slice(0, 10) : '');
    setEditVisibility(k.visibility ?? 'team');
    setEditAssignee(k.assigneeId ?? '');
    setEditColor(k.color || NOTE_COLORS[0]);
    setEditRelatedItems(k.relatedItems || []);
    setMarkdownPreview(false);
    setAiSuggestion(null);
  }

  function handleSave() {
    if (!currentUser) return;
    const tags = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    if (selectedId) {
      updateKnowledge(selectedId, { title: editTitle.trim() || '无标题', content: editContent, tags, category: editCategory.trim(), status: editStatus, priority: editPriority, dueDate: editDueDate ? new Date(editDueDate + 'T23:59:59').toISOString() : null, visibility: editVisibility, assigneeId: editAssignee || undefined, relatedItems: editRelatedItems, color: editColor });
    } else {
      addKnowledge({
        title: editTitle.trim() || '无标题',
        content: editContent,
        tags,
        category: editCategory.trim(),
        status: editStatus,
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate + 'T23:59:59').toISOString() : null,
        visibility: editVisibility,
        assigneeId: editAssignee || undefined,
        memberId: currentUser.id,
        relatedItems: editRelatedItems,
        color: editColor,
      });
    }
    setShowEditor(false);
    setSelectedId(null);
  }

  function handleDelete(id: string, title: string) {
    if (!confirm(`确定删除知识条目「${title}」吗？`)) return;
    deleteKnowledge(id);
    if (selectedId === id) {
      setSelectedId(null);
      setShowEditor(false);
    }
  }

  function addRelatedItem(itemId: string, itemType: ItemType) {
    if (editRelatedItems.some(r => r.itemId === itemId && r.itemType === itemType)) return;
    setEditRelatedItems([...editRelatedItems, { itemId, itemType }]);
  }

  function removeRelatedItem(itemId: string, itemType: ItemType) {
    setEditRelatedItems(editRelatedItems.filter(r => !(r.itemId === itemId && r.itemType === itemType)));
  }

  function handleQA() {
    if (!qaQuery.trim() || qaLoading) return;
    setQaLoading(true);
    setQaAnswer('');

    const q = qaQuery.toLowerCase();
    const tokens = q.split(/[\s,，。.!？?]+/).filter(t => t.length > 0);

    const scored = myKnowledge.map(k => {
      let score = 0;
      const title = k.title.toLowerCase();
      const content = (k.content || '').toLowerCase();
      const category = (k.category || '').toLowerCase();
      const tags = (k.tags ?? []).join(' ').toLowerCase();
      for (const token of tokens) {
        if (title.includes(token)) score += 3;
        if (content.includes(token)) score += 2;
        if (tags.includes(token)) score += 2;
        if (category.includes(token)) score += 1;
      }
      return { k, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

    setTimeout(() => {
      if (scored.length === 0) {
        setQaAnswer('未在知识库中找到与"' + qaQuery + '"相关的内容。请尝试换个关键词，或先创建相关知识条目。');
      } else {
        const lines = scored.map((item, i) => {
          const k = item.k;
          const snippet = (k.content || '').slice(0, 150);
          return `**${i + 1}. ${k.title}** [${k.category || '未分类'}]\n${snippet}${k.content && k.content.length > 150 ? '...' : ''}`;
        });
        const header = `基于知识库找到 ${scored.length} 条相关内容：\n\n`;
        setQaAnswer(header + lines.join('\n\n'));
      }
      setQaLoading(false);
    }, 300);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  return (
    <Fragment>
    <div className="flex flex-1 min-h-0">
      {/* 左侧标签筛选 */}
      <div className="w-48 flex-shrink-0 border-r border-border overflow-y-auto hidden lg:block p-3 space-y-1">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1">标签筛选</div>
        <button onClick={() => setFilterTag(null)} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${!filterTag ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}>全部</button>
        {allTags.map(tag => (
          <button key={tag} onClick={() => setFilterTag(tag)} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${filterTag === tag ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}>
            <Tag size={12} /> {tag}
          </button>
        ))}
        {allTags.length === 0 && <div className="text-xs text-muted-foreground px-2 py-1">暂无标签</div>}
        <div className="text-xs font-medium text-muted-foreground px-2 py-1 pt-3 mt-2 border-t border-border/50">分类导航</div>
        <button onClick={() => setFilterCategory(null)} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${!filterCategory ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}><Folder size={12} /> 全部分类</button>
        {allCategories.map(cat => {
          const count = myKnowledge.filter(k => (k.category ?? '') === cat).length;
          return (
            <button key={cat} onClick={() => setFilterCategory(cat)} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${filterCategory === cat ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}>
              <Folder size={12} /> <span className="truncate flex-1">{cat}</span>
              <span className="text-xs text-muted-foreground/60">{count}</span>
            </button>
          );
        })}
        {allCategories.length === 0 && <div className="text-xs text-muted-foreground px-2 py-1">暂无分类</div>}
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 p-4 border-b border-border flex-shrink-0">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="搜索知识条目..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {filterTag && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-primary/10 text-primary">
              <Tag size={10} /> {filterTag}
              <button onClick={() => setFilterTag(null)} className="hover:text-destructive"><X size={12} /></button>
            </span>
          )}
          <select className="border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 flex-shrink-0" value={filterStatus} onChange={e => setFilterStatus(e.target.value as KnowledgeStatus | 'all')}>
            <option value="all">全部状态</option>
            {KNOWLEDGE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <ViewModeSwitch items={[{ value: 'card', label: '卡片', icon: LayoutGrid }, { value: 'gallery', label: '画廊', icon: ImageIcon }, { value: 'list', label: '列表', icon: List }, { value: 'table', label: '表格', icon: Table2 }, { value: 'kanban', label: '看板', icon: Columns3 }, { value: 'graph', label: '图谱', icon: Share2 }]} value={viewMode} onChange={v => setViewMode(v as 'card' | 'list' | 'table' | 'kanban' | 'graph' | 'gallery')} size="sm" />
          <button onClick={() => setQaOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-primary/30 text-primary hover:bg-primary/5 flex-shrink-0" title="AI问答 - 基于知识库内容智能回答"><MessageCircle size={14} /> AI问答</button>
          <button onClick={startCreate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"><Plus size={14} /> 新建条目</button>
        </div>

        {showEditor ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium flex-shrink-0">标题</label>
                <button className="p-1 rounded hover:bg-muted text-muted-foreground" onClick={() => setEntryOverlayOpen(true)} title="展开到浮动窗口"><Maximize2 size={14} /></button>
              </div>
              <input className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="知识条目标题" value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={200} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">正文（支持Markdown）</label>
                <button className={`p-1 rounded hover:bg-muted ${markdownPreview ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`} onClick={() => setMarkdownPreview(!markdownPreview)} title={markdownPreview ? '编辑模式' : 'Markdown预览'}>{markdownPreview ? <Edit3 size={14} /> : <Eye size={14} />}</button>
              </div>
              {markdownPreview ? (
                <div className="w-full border border-border rounded-lg px-3 py-2 min-h-[200px] max-h-[400px] overflow-y-auto text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(editContent)) }} />
              ) : (
                <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[200px] resize-y font-mono" placeholder="输入内容... (支持Markdown)" value={editContent} onChange={e => setEditContent(e.target.value)} />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
              <div className="flex gap-2">
                <input className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="标签1, 标签2" value={editTags} onChange={e => setEditTags(e.target.value)} />
                <button onClick={() => { const s = analyzeKnowledge(editTitle, editContent); setAiSuggestion(s); if (shouldAutoApply(s)) { if (s.tags.length) { const existing = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean); const merged = [...new Set([...existing, ...s.tags])]; setEditTags(merged.join(', ')); } if (s.category) setEditCategory(s.category); if (s.priority) setEditPriority(s.priority); } }} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-primary/30 text-primary hover:bg-primary/5 whitespace-nowrap" title="AI智能分析标签/分类/优先级"><Sparkles size={14} /> AI标记</button>
              </div>
              {aiSuggestion && aiSuggestion.confidence > 0 && !shouldAutoApply(aiSuggestion) && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700"><Sparkles size={12} /> AI建议（置信度 {Math.round(aiSuggestion.confidence * 100)}%）</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {aiSuggestion.tags.length > 0 && <span className="text-xs text-muted-foreground">标签: {aiSuggestion.tags.join(', ')}</span>}
                    {aiSuggestion.category && <span className="text-xs text-muted-foreground">分类: {aiSuggestion.category}</span>}
                    {aiSuggestion.priority && <span className="text-xs text-muted-foreground">优先级: {aiSuggestion.priority}</span>}
                  </div>
                  <button onClick={() => { if (aiSuggestion.tags.length) { const existing = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean); const merged = [...new Set([...existing, ...aiSuggestion.tags])]; setEditTags(merged.join(', ')); } if (aiSuggestion.category) setEditCategory(aiSuggestion.category); if (aiSuggestion.priority) setEditPriority(aiSuggestion.priority); setAiSuggestion(null); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500 text-white hover:bg-amber-600"><Check size={10} /> 应用建议</button>
                </div>
              )}
              {aiSuggestion && shouldAutoApply(aiSuggestion) && (
                <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-1.5"><Check size={12} /> AI已自动标记: {aiSuggestion.tags.join(', ')}{aiSuggestion.category ? ` / ${aiSuggestion.category}` : ''}{aiSuggestion.priority ? ` / ${aiSuggestion.priority}` : ''}</div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">分类</label>
                <input className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="如：技术方案、团队管理" value={editCategory} onChange={e => setEditCategory(e.target.value)} maxLength={50} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">状态</label>
                <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={editStatus} onChange={e => setEditStatus(e.target.value as KnowledgeStatus)}>
                  {KNOWLEDGE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">优先级</label>
                <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={editPriority} onChange={e => setEditPriority(e.target.value as KnowledgePriority)}>
                  {KNOWLEDGE_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">截止日期</label>
                <input type="date" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">可见范围</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={editVisibility} onChange={e => setEditVisibility(e.target.value as KnowledgeVisibility)}>
                {KNOWLEDGE_VISIBILITIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">负责人</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={editAssignee} onChange={e => setEditAssignee(e.target.value)}>
                <option value="">未指定</option>
                {state.members.filter(m => m.status === 'active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">颜色标记</label>
              <div className="flex items-center gap-2">
                <Palette size={14} className="text-muted-foreground" />
                {NOTE_COLORS.map(c => (
                  <button key={c} className={cn('w-6 h-6 rounded-full border-2 transition-transform hover:scale-110', editColor === c ? 'border-primary scale-110' : 'border-gray-200')} style={{ backgroundColor: c }} onClick={() => setEditColor(c)} />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">关联事项</label>
              <div className="space-y-2">
                {editRelatedItems.map(r => (
                  <div key={r.itemId + r.itemType} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted text-sm">
                    <Link2 size={12} className="text-muted-foreground" />
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">{r.itemType === 'goal' ? '目标' : r.itemType === 'project' ? '项目' : '任务'}</span>
                    <span className="truncate flex-1">{getItemTitle(r.itemId, r.itemType)}</span>
                    <button onClick={() => removeRelatedItem(r.itemId, r.itemType)} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>
                  </div>
                ))}
                <div className="flex gap-2 flex-wrap">
                  <select className="border border-border rounded-lg px-2 py-1 text-xs" defaultValue="" onChange={e => { if (e.target.value) { const [id, type] = e.target.value.split('|'); addRelatedItem(id, type as ItemType); e.target.value = ''; } }}>
                    <option value="">+ 关联目标</option>
                    {goals.map(g => <option key={g.id} value={`${g.id}|goal`}>{g.title}</option>)}
                  </select>
                  <select className="border border-border rounded-lg px-2 py-1 text-xs" defaultValue="" onChange={e => { if (e.target.value) { const [id, type] = e.target.value.split('|'); addRelatedItem(id, type as ItemType); e.target.value = ''; } }}>
                    <option value="">+ 关联项目</option>
                    {projects.map(p => <option key={p.id} value={`${p.id}|project`}>{p.title}</option>)}
                  </select>
                  <select className="border border-border rounded-lg px-2 py-1 text-xs" defaultValue="" onChange={e => { if (e.target.value) { const [id, type] = e.target.value.split('|'); addRelatedItem(id, type as ItemType); e.target.value = ''; } }}>
                    <option value="">+ 关联任务</option>
                    {tasks.map(t => <option key={t.id} value={`${t.id}|task`}>{t.title}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">保存</button>
              <button onClick={() => { setShowEditor(false); setSelectedId(null); }} className="px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted">取消</button>
            </div>
          </div>
        ) : viewMode === 'graph' ? (
          <div className="flex-1 min-h-0 p-4">
            <KnowledgeGraph
              knowledge={filteredItems}
              goals={goals}
              projects={projects}
              tasks={tasks}
              itemLinks={state.itemLinks}
              onSelectNode={(id, type) => {
                if (type === 'knowledge') {
                  const k = state.knowledge.find(k => k.id === id);
                  if (k) startEdit(k);
                }
              }}
            />
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="flex-1 overflow-y-auto p-4">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <BookOpen size={32} className="opacity-30" />
                <div className="text-sm">暂无知识条目</div>
                <div className="text-xs">点击「新建条目」开始记录</div>
              </div>
            ) : (
              <KnowledgeKanbanView items={filteredItems} members={viewMembers} onEdit={startEdit} onUpdateField={(id, updates) => updateKnowledge(id, updates)} />
            )}
          </div>
        ) : viewMode === 'table' ? (
          <div className="flex-1 overflow-y-auto p-4">
            <KnowledgeTableView items={filteredItems} members={viewMembers} onEdit={startEdit} />
          </div>
        ) : viewMode === 'list' ? (
          <div className="flex-1 overflow-y-auto p-4">
            <KnowledgeListView items={filteredItems} members={viewMembers} onEdit={startEdit} />
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="flex-1 overflow-y-auto p-4">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <ImageIcon size={32} className="opacity-30" />
                <div className="text-sm">暂无知识条目</div>
                <div className="text-xs">点击「新建条目」开始记录</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map(k => (
                  <div key={k.id} className="border border-border rounded-xl overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group bg-card" onClick={() => startEdit(k)}>
                    <div className="h-20 flex items-center justify-center relative" style={{ background: k.color && k.color !== NOTE_COLORS[0] ? k.color : 'linear-gradient(135deg, hsl(var(--primary)/0.15), hsl(var(--primary)/0.05))' }}>
                      <span className="text-2xl opacity-30">{k.category ? k.category.charAt(0).toUpperCase() : '📄'}</span>
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <KnowledgeStatusBadge status={k.status} />
                      </div>
                      {k.visibility === 'personal' && (
                        <span className="absolute top-2 left-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/30 text-white backdrop-blur-sm"><Lock size={8} /></span>
                      )}
                    </div>
                    <div className="p-3 space-y-1.5">
                      <h3 className="text-sm font-medium truncate">{k.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">{k.content || '暂无内容'}</p>
                      <div className="flex items-center gap-1 flex-wrap pt-1">
                        {k.category && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"><Folder size={8} /> {k.category}</span>}
                        {(k.tags ?? []).slice(0, 2).map(tag => (
                          <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary"><Tag size={8} /> {tag}</span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-border/50">
                        <span className="text-[10px] text-muted-foreground/60">{formatTime(k.updatedAt)}</span>
                        {k.priority && k.priority !== 'medium' && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] ${(KNOWLEDGE_PRIORITIES.find(p => p.value === k.priority) || KNOWLEDGE_PRIORITIES[1]).cls}`}>
                            <Flag size={8} /> {(KNOWLEDGE_PRIORITIES.find(p => p.value === k.priority) || KNOWLEDGE_PRIORITIES[1]).label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <BookOpen size={32} className="opacity-30" />
                <div className="text-sm">暂无知识条目</div>
                <div className="text-xs">点击「新建条目」开始记录</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredItems.map(k => (
                  <div key={k.id} className={cn('border border-border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden', k.color && k.color !== NOTE_COLORS[0] && 'border-l-4')} style={{ borderLeftColor: k.color === NOTE_COLORS[0] ? undefined : k.color }} onClick={() => startEdit(k)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-medium truncate flex-1">{k.title}</h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <KnowledgeStatusBadge status={k.status} />
                        {k.visibility === 'personal' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600"><Lock size={8} /> 个人</span>}
                        {k.priority && k.priority !== 'medium' && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${(KNOWLEDGE_PRIORITIES.find(p => p.value === k.priority) || KNOWLEDGE_PRIORITIES[1]).cls}`}>
                            <Flag size={8} /> {(KNOWLEDGE_PRIORITIES.find(p => p.value === k.priority) || KNOWLEDGE_PRIORITIES[1]).label}
                          </span>
                        )}
                        <button onClick={e => { e.stopPropagation(); handleDelete(k.id, k.title); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-opacity"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap mb-2">
                      {k.category && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600"><CircleDot size={8} /> {k.category}</span>}
                      {k.assigneeId && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"><User size={8} /> {state.members.find(m => m.id === k.assigneeId)?.name || '成员'}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 mb-2 whitespace-pre-wrap">{k.content || '暂无内容'}</p>
                    <div className="flex items-center gap-1 flex-wrap mb-2">
                      {(k.tags ?? []).map(tag => (
                        <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary"><Tag size={8} /> {tag}</span>
                      ))}
                    </div>
                    {(k.relatedItems || []).length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mb-2">
                        {k.relatedItems.map(r => (
                          <span key={r.itemId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"><Link2 size={8} /> {getItemTitle(r.itemId, r.itemType)}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] text-muted-foreground/60">{formatTime(k.updatedAt)}</div>
                      {k.dueDate && (
                        <span className={`inline-flex items-center gap-0.5 text-[10px] ${new Date(k.dueDate).getTime() < Date.now() ? 'text-red-500' : 'text-muted-foreground/70'}`}>
                          <CalendarClock size={9} /> {formatTime(k.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 条目编辑浮动/全屏覆盖层 */}
      {showEditor && entryOverlayOpen && (
        <NoteOverlay
          open={entryOverlayOpen}
          onClose={() => setEntryOverlayOpen(false)}
          title={editTitle || '新建条目'}
          onTitleChange={t => setEditTitle(t)}
          accentColor={editColor !== NOTE_COLORS[0] ? editColor : undefined}
          defaultWidth={700}
          defaultHeight={600}
        >
          <div className="p-4 space-y-4 overflow-y-auto h-full">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">正文（支持Markdown）</label>
                <button className={`p-1 rounded hover:bg-muted ${markdownPreview ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`} onClick={() => setMarkdownPreview(!markdownPreview)} title={markdownPreview ? '编辑模式' : 'Markdown预览'}>{markdownPreview ? <Edit3 size={14} /> : <Eye size={14} />}</button>
              </div>
              {markdownPreview ? (
                <div className="w-full border border-border rounded-lg px-3 py-2 min-h-[200px] max-h-[400px] overflow-y-auto text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(editContent)) }} />
              ) : (
                <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[200px] resize-y font-mono" placeholder="输入内容... (支持Markdown)" value={editContent} onChange={e => setEditContent(e.target.value)} />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
              <div className="flex gap-2">
                <input className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="标签1, 标签2" value={editTags} onChange={e => setEditTags(e.target.value)} />
                <button onClick={() => { const s = analyzeKnowledge(editTitle, editContent); setAiSuggestion(s); if (shouldAutoApply(s)) { if (s.tags.length) { const existing = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean); const merged = [...new Set([...existing, ...s.tags])]; setEditTags(merged.join(', ')); } if (s.category) setEditCategory(s.category); if (s.priority) setEditPriority(s.priority); } }} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-primary/30 text-primary hover:bg-primary/5 whitespace-nowrap" title="AI智能分析"><Sparkles size={14} /> AI标记</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">分类</label><input className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={editCategory} onChange={e => setEditCategory(e.target.value)} /></div>
              <div><label className="block text-sm font-medium mb-1">状态</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm" value={editStatus} onChange={e => setEditStatus(e.target.value as KnowledgeStatus)}>{KNOWLEDGE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">优先级</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm" value={editPriority} onChange={e => setEditPriority(e.target.value as KnowledgePriority)}>{KNOWLEDGE_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">可见性</label><select className="w-full border border-border rounded-lg px-3 py-2 text-sm" value={editVisibility} onChange={e => setEditVisibility(e.target.value as KnowledgeVisibility)}>{KNOWLEDGE_VISIBILITIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}</select></div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">保存</button>
              <button onClick={() => { setEntryOverlayOpen(false); setShowEditor(false); setSelectedId(null); }} className="px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted">取消</button>
            </div>
          </div>
        </NoteOverlay>
      )}

      {/* AI问答对话框 */}
      {qaOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="AI问答" onClick={() => setQaOpen(false)}>
          <div className="bg-card rounded-xl border border-border shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} className="text-primary" />
                <h3 className="text-sm font-semibold">AI问答 — 基于知识库</h3>
              </div>
              <button onClick={() => setQaOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="关闭"><X size={16} /></button>
            </div>
            <div className="p-4 border-b border-border">
              <div className="flex gap-2">
                <input className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="输入你的问题，AI将基于知识库内容回答..." value={qaQuery} onChange={e => setQaQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQA(); } }} autoFocus aria-label="输入问题" />
                <button onClick={handleQA} disabled={qaLoading || !qaQuery.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex-shrink-0">
                  {qaLoading ? <><Loader2 size={14} className="animate-spin" /> 搜索中</> : <><MessageCircle size={14} /> 提问</>}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {qaAnswer ? (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">{qaAnswer}</div>
              ) : (
                <div className="text-muted-foreground text-center py-8">
                  <MessageCircle size={32} className="mx-auto opacity-30 mb-2" />
                  <div className="text-xs">输入问题后点击提问，AI将从知识库中检索相关内容并生成回答</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </Fragment>
  );
}
