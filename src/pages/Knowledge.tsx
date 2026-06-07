import { useState, useMemo, useCallback, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { useKnowledge } from '@/store/hooks';
import type { Knowledge, ItemType } from '@/types';
import { BookOpen, Plus, Trash2, Search, Tag, X, Link2, Eye, Edit3, Palette, StickyNote } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import DOMPurify from 'dompurify';
import { renderMarkdown } from '@/pages/admin/MarkdownDocTab';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { NotesView } from '@/pages/knowledge/NotesView';
import { NOTE_COLORS } from './admin/constants';
import { cn } from '@/lib/utils';
import ViewModeSwitch from '@/components/ViewModeSwitch';
import { useAutoSave } from '@/hooks/useAutoSave';

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<'entries' | 'notes'>('entries');
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
          {activeTab === 'entries' ? <EntriesView /> : <NotesView />}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editColor, setEditColor] = useState(NOTE_COLORS[0]);
  const [editRelatedItems, setEditRelatedItems] = useState<{ itemId: string; itemType: ItemType }[]>([]);
  const [markdownPreview, setMarkdownPreview] = useState(false);

  // Auto-save content when editing an existing entry
  const lastSavedContentRef = useRef('');
  const lastSavedTitleRef = useRef('');
  const { flush: flushContent } = useAutoSave(editContent, {
    delay: 1200,
    enabled: showEditor && !!selectedId && editContent !== lastSavedContentRef.current,
    onSave: (val) => {
      if (!selectedId || val === lastSavedContentRef.current) return;
      lastSavedContentRef.current = val;
      updateKnowledge(selectedId, { content: val });
    },
  });
  const { flush: flushTitle } = useAutoSave(editTitle, {
    delay: 1200,
    enabled: showEditor && !!selectedId && editTitle !== lastSavedTitleRef.current,
    onSave: (val) => {
      if (!selectedId || val === lastSavedTitleRef.current) return;
      lastSavedTitleRef.current = val;
      updateKnowledge(selectedId, { title: val.trim() || '无标题' });
    },
  });

  const myKnowledge = useMemo(() => {
    if (!currentUser) return [];
    return state.knowledge.filter(k => k.memberId === currentUser.id);
  }, [state.knowledge, currentUser?.id]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    myKnowledge.forEach(k => (k.tags ?? []).forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [myKnowledge]);

  const filteredItems = useMemo(() => {
    let result = myKnowledge;
    if (filterTag) result = result.filter(k => (k.tags ?? []).includes(filterTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(k => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q));
    }
    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [myKnowledge, search, filterTag]);

  const selectedItem = selectedId ? state.knowledge.find(k => k.id === selectedId) : null;

  const goals = state.goals;
  const projects = state.projects;
  const tasks = state.tasks;

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
    setEditColor(NOTE_COLORS[0]);
    setEditRelatedItems([]);
    setMarkdownPreview(false);
  }

  function startEdit(k: Knowledge) {
    // Flush any pending auto-save before switching
    flushContent();
    flushTitle();
    setSelectedId(k.id);
    setShowEditor(true);
    setEditTitle(k.title);
    setEditContent(k.content);
    lastSavedTitleRef.current = k.title;
    lastSavedContentRef.current = k.content;
    setEditTags((k.tags ?? []).join(', '));
    setEditColor(k.color || NOTE_COLORS[0]);
    setEditRelatedItems(k.relatedItems || []);
    setMarkdownPreview(false);
  }

  function handleSave() {
    if (!currentUser) return;
    const tags = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    if (selectedId) {
      updateKnowledge(selectedId, { title: editTitle.trim() || '无标题', content: editContent, tags, relatedItems: editRelatedItems, color: editColor });
    } else {
      addKnowledge({
        title: editTitle.trim() || '无标题',
        content: editContent,
        tags,
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

  function formatTime(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  return (
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
              <button onClick={() => setFilterTag(null)} className="hover:text-destructive" aria-label="清除标签筛选"><X size={12} /></button>
            </span>
          )}
          <button onClick={startCreate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"><Plus size={14} /> 新建条目</button>
        </div>

        {showEditor ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">标题</label>
              <input className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="知识条目标题" value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={200} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">正文（支持Markdown）</label>
                <Tooltip><TooltipTrigger asChild><button className={`p-1 rounded hover:bg-muted ${markdownPreview ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`} onClick={() => setMarkdownPreview(!markdownPreview)}>{markdownPreview ? <Edit3 size={14} /> : <Eye size={14} />}</button></TooltipTrigger><TooltipContent>{markdownPreview ? '编辑模式' : 'Markdown预览'}</TooltipContent></Tooltip>
              </div>
              {markdownPreview ? (
                <div className="w-full border border-border rounded-lg px-3 py-2 min-h-[200px] max-h-[400px] overflow-y-auto text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(editContent)) }} />
              ) : (
                <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[200px] resize-y font-mono" placeholder="输入内容... (支持Markdown)" value={editContent} onChange={e => setEditContent(e.target.value)} />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
              <input className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="标签1, 标签2" value={editTags} onChange={e => setEditTags(e.target.value)} />
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
                    <button onClick={() => removeRelatedItem(r.itemId, r.itemType)} className="text-muted-foreground hover:text-destructive" aria-label="移除关联项"><X size={14} /></button>
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
              <button onClick={() => { flushContent(); flushTitle(); setShowEditor(false); setSelectedId(null); }} className="px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted">取消</button>
            </div>
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
                      <button onClick={e => { e.stopPropagation(); handleDelete(k.id, k.title); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-opacity" aria-label="删除笔记"><Trash2 size={13} /></button>
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
                    <div className="text-[10px] text-muted-foreground/60">{formatTime(k.updatedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
