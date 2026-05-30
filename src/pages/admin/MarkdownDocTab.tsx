import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Plus, Trash2, Edit2, FileText, Link2, Eye, Code } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

type DocItem = { id: string; title: string; content: string; linkedItemId: string | null; linkedItemType: 'goal' | 'project' | 'task' | null; updatedAt: string };

// Full GFM Markdown renderer using marked + DOMPurify for XSS protection
marked.setOptions({
  breaks: true,
  gfm: true,
});

const mdRenderer = {
  heading(this: any, text: string, level: number): string {
    const sizes = { 1: 'text-lg font-bold mt-4 mb-2', 2: 'text-base font-semibold mt-4 mb-1', 3: 'text-sm font-semibold mt-3 mb-1' };
    const cls = sizes[level as keyof typeof sizes] || 'text-sm font-semibold mt-2 mb-1';
    return `<h${level} class="${cls}">${text}</h${level}>`;
  },
  code(this: any, code: string, lang: string | undefined): string {
    const langAttr = lang ? ` class="language-${lang}"` : '';
    return `<pre class="bg-gray-50 border border-border rounded-lg p-3 my-2 overflow-x-auto text-xs"><code${langAttr}>${code}</code></pre>`;
  },
  codespan(this: any, code: string): string {
    return `<code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs text-primary">${code}</code>`;
  },
  table(this: any, header: string, body: string): string {
    return `<div class="overflow-x-auto my-2"><table class="w-full text-xs border border-border rounded-lg"><thead class="bg-muted/50">${header}</thead><tbody>${body}</tbody></table></div>`;
  },
  tablerow(this: any, content: string): string {
    return `<tr class="border-b border-border/50">${content}</tr>`;
  },
  tablecell(this: any, content: string, flags: { header: boolean; align: string | null }): string {
    const tag = flags.header ? 'th' : 'td';
    const align = flags.align ? ` style="text-align:${flags.align}"` : '';
    return `<${tag} class="px-3 py-1.5 border-r border-border/30 last:border-0"${align}>${content}</${tag}>`;
  },
  blockquote(this: any, quote: string): string {
    return `<blockquote class="border-l-4 border-primary/30 pl-3 my-2 text-sm text-muted-foreground italic">${quote}</blockquote>`;
  },
  list(this: any, body: string, ordered: boolean, start: number): string {
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = (start !== 1) ? ` start="${start}"` : '';
    return `<${tag} class="ml-4 my-1 space-y-0.5 text-sm list-${ordered ? 'decimal' : 'disc'}"${startAttr}>${body}</${tag}>`;
  },
  hr(this: any): string {
    return '<hr class="my-3 border-border" />';
  },
  link(this: any, href: string, title: string | null | undefined, text: string): string {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} class="text-primary underline hover:text-primary/80" target="_blank" rel="noopener noreferrer">${text}</a>`;
  },
  image(this: any, href: string, title: string | null | undefined, text: string): string {
    return `<img src="${href}" alt="${text}" class="max-w-full rounded-lg my-2 border border-border" loading="lazy" />`;
  },
};

marked.use({ renderer: mdRenderer });

export function renderMarkdown(md: string): string {
  try {
    const raw = marked.parse(md) as string;
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'start', 'loading'], ADD_TAGS: ['img'] });
  } catch {
    return DOMPurify.sanitize(md);
  }
}

export function MarkdownDocTab() {
  const { state } = useStore();
  // Store docs in notes with category='markdown_doc'
  const docs = useMemo(() => (state.notes || []).filter(n => n.category === 'markdown_doc'), [state.notes]);
  const { dispatch } = useStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLinkedItem, setEditLinkedItem] = useState<{ id: string; type: 'goal' | 'project' | 'task' } | null>(null);
  const newDocCreated = useRef(false);

  const selectedDoc = docs.find(d => d.id === selectedId);

  // Auto-select newly created doc
  useEffect(() => {
    if (newDocCreated.current && docs.length > 0) {
      const latest = docs.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
      handleSelect(latest.id);
      newDocCreated.current = false;
    }
  }, [docs.length]);

  function handleNew() {
    dispatch({ type: 'ADD_NOTE', payload: { title: '未命名文档', content: '# 标题\n\n在此输入内容...', folder: '文档', color: '#ffffff', category: 'markdown_doc', tags: [], isPinned: false, linkedItemId: null, linkedItemType: null, createdBy: state.currentUser?.id ?? '', updatedBy: state.currentUser?.id ?? '' } });
    newDocCreated.current = true;
  }

  function handleSelect(id: string) {
    const doc = docs.find(d => d.id === id);
    if (doc) {
      setSelectedId(id);
      setEditTitle(doc.title);
      setEditContent(doc.content);
      setEditLinkedItem(doc.linkedItemId ? { id: doc.linkedItemId, type: (doc.linkedItemType as any) ?? 'task' } : null);
      setMode('edit');
    }
  }

  function handleSave() {
    if (!selectedId) return;
    dispatch({ type: 'UPDATE_NOTE', payload: { id: selectedId, updates: { title: editTitle, content: editContent, linkedItemId: editLinkedItem?.id ?? null, linkedItemType: editLinkedItem?.type ?? null, updatedBy: state.currentUser?.id ?? '' } } });
  }

  function handleDelete(id: string) {
    dispatch({ type: 'DELETE_NOTE', payload: id });
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2"><FileText size={16} /> Markdown 文档</h3>
        <button onClick={handleNew} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新建文档</button>
      </div>
      <p className="text-xs text-muted-foreground">使用 Markdown 语法编写文档，支持与事项关联</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Doc list */}
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {docs.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">暂无文档</p>}
          {docs.map(doc => (
            <div key={doc.id} onClick={() => handleSelect(doc.id)} className={`p-2 rounded-lg cursor-pointer text-sm transition-colors ${selectedId === doc.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'}`}>
              <div className="font-medium text-xs truncate">{doc.title}</div>
              <div className="text-[10px] text-muted-foreground">{doc.updatedAt?.split('T')[0] ?? ''}</div>
            </div>
          ))}
        </div>

        {/* Editor/Preview */}
        <div className="md:col-span-2">
          {selectedDoc ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input className="flex-1 border border-input rounded px-2 py-1 text-sm font-medium" value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={handleSave} />
                <button onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer">
                  {mode === 'edit' ? <><Eye size={12} /> 预览</> : <><Code size={12} /> 编辑</>}
                </button>
              </div>

              {/* Linked item */}
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">关联事项：</span>
                <select className="text-xs border border-input rounded px-1.5 py-0.5" value={editLinkedItem?.id ?? ''} onChange={e => {
                  const val = e.target.value;
                  if (!val) { setEditLinkedItem(null); return; }
                  const goal = state.goals.find(g => g.id === val);
                  const project = state.projects.find(p => p.id === val);
                  const type = goal ? 'goal' : project ? 'project' : 'task';
                  setEditLinkedItem({ id: val, type });
                }}>
                  <option value="">无</option>
                  <optgroup label="目标">
                    {state.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </optgroup>
                  <optgroup label="项目">
                    {state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </optgroup>
                  <optgroup label="任务">
                    {state.tasks.slice(0, 50).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </optgroup>
                </select>
              </div>

              {mode === 'edit' ? (
                <textarea className="w-full h-[300px] border border-input rounded-lg px-3 py-2 text-sm font-mono resize-y" value={editContent} onChange={e => setEditContent(e.target.value)} onBlur={handleSave} placeholder="输入 Markdown 内容..." />
              ) : (
                <div className="w-full min-h-[300px] border border-input rounded-lg px-3 py-2 text-sm overflow-y-auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }} />
              )}

              <div className="flex gap-2">
                <button onClick={handleSave} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">保存</button>
                <button onClick={() => handleDelete(selectedId!)} className="px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-red-50">删除</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">选择或新建文档开始编辑</div>
          )}
        </div>
      </div>
    </div>
  );
}
