import { useState, useRef, useMemo } from 'react';
import { useStore, useTemplates } from '@/store/useStore';
import { uploadFile, BUCKET_NAMES } from '@/supabase/storage';
import { Plus, Search, Copy, Edit2, Trash2, Eye, Tag, FileText, Upload, Download } from 'lucide-react';
import { inputCls, btnCls, primaryBtnCls, typeLabels, typeColors, emptyForm, formFromTemplate } from './constants';
import type { TForm } from './constants';

export function ToolboxTab() {
  const { members, currentUser } = useStore().state;
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TForm>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<string>('');
  const [attachedUrl, setAttachedUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => Array.from(new Set(templates.map(t => t.category).filter(Boolean))), [templates]);
  const filtered = useMemo(() => templates.filter(t => {
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (search) { const q = search.toLowerCase(); return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.content.toLowerCase().includes(q); }
    return true;
  }), [templates, filterType, filterCategory, search]);

  function getMemberName(id: string) { return members.find(m => m.id === id)?.name || id; }
  function openCreate() { setForm(emptyForm); setEditingId(null); setAttachedFile(''); setAttachedUrl(''); setShowDialog(true); }
  function openEdit(id: string) { const t = templates.find(x => x.id === id); if (!t) return; setForm(formFromTemplate(t)); setEditingId(id); setAttachedFile(''); setAttachedUrl(''); setShowDialog(true); }
  function handleSave() {
    if (!form.title.trim()) return;
    const userId = currentUser?.id || '';
    if (editingId) { updateTemplate(editingId, { ...form, title: form.title.trim(), description: form.description.trim(), category: form.category.trim(), updatedBy: userId }); }
    else { addTemplate({ ...form, title: form.title.trim(), description: form.description.trim(), category: form.category.trim(), createdBy: userId, updatedBy: userId }); }
    setShowDialog(false); setEditingId(null);
  }
  function handleDelete(id: string, title: string) { if (!confirm(`确定要删除模板「${title}」吗？`)) return; deleteTemplate(id); }
  function handleCopy(content: string) { navigator.clipboard.writeText(content).then(() => alert('模板内容已复制到剪贴板')); }
  async function handleUpload(file: File) {
    setUploading(true);
    try { const path = `templates/${Date.now()}_${file.name}`; const url = await uploadFile(BUCKET_NAMES.templates, path, file); if (url) { setAttachedFile(file.name); setAttachedUrl(url); } } finally { setUploading(false); }
  }
  function formatDate(iso: string) { return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold">工具库 / 模板管理</h2><p className="text-sm text-muted-foreground mt-0.5">创建和管理可复用的模板</p></div>
        <button onClick={openCreate} className={primaryBtnCls}><Plus size={16} /> 新建模板</button>
      </div>
      <div className="bg-white rounded-xl border border-border shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
            <Search size={16} className="text-muted-foreground" />
            <input className="bg-transparent border-none outline-none text-sm flex-1 placeholder:text-muted-foreground" placeholder="搜索模板..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">全部类型</option><option value="goal">目标</option><option value="project">项目</option><option value="task">任务</option><option value="document">文档</option>
          </select>
          <select className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="all">全部分类</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(tpl => (
          <div key={tpl.id} className="bg-white rounded-xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm truncate">{tpl.title}</span><span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeColors[tpl.type]}`}>{typeLabels[tpl.type]}</span>{tpl.isPublic && <Eye size={12} className="text-muted-foreground" />}</div>
                {tpl.category && <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground"><Tag size={10} /> {tpl.category}</div>}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{tpl.description || '暂无描述'}</p>
            {tpl.content && <p className="text-xs text-muted-foreground/60 mt-2 line-clamp-2 bg-muted/50 rounded p-2">{tpl.content}</p>}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground"><span>创建：{getMemberName(tpl.createdBy)}</span><span>{formatDate(tpl.updatedAt)}</span></div>
            <div className="flex items-center gap-2 mt-3">
              <button className={btnCls} onClick={() => handleCopy(tpl.content)}><Copy size={14} /> 使用</button>
              <button className={btnCls} onClick={() => openEdit(tpl.id)}><Edit2 size={14} /> 编辑</button>
              <button className={btnCls + ' text-red-500 hover:text-red-700'} onClick={() => handleDelete(tpl.id, tpl.title)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full py-16 text-center"><FileText size={40} className="mx-auto text-muted-foreground/40" /><p className="text-sm text-muted-foreground mt-3">暂无模板</p><button onClick={openCreate} className={primaryBtnCls + ' mt-3'}><Plus size={16} /> 创建第一个模板</button></div>}
      </div>
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDialog(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-border w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border"><h3 className="font-semibold">{editingId ? '编辑模板' : '新建模板'}</h3></div>
            <div className="px-6 py-4 space-y-4">
              <div><label className="block text-sm font-medium mb-1">标题 *</label><input className={inputCls} placeholder="模板标题" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><label className="block text-sm font-medium mb-1">描述</label><input className={inputCls} placeholder="模板描述" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">类型</label>
                  <select className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TForm['type'] }))}>
                    <option value="goal">目标</option><option value="project">项目</option><option value="task">任务</option><option value="document">文档</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">分类</label><input className={inputCls} placeholder="分类名称" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">内容</label><textarea className={inputCls + ' min-h-[120px] resize-y'} placeholder="模板内容..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} /></div>
              <div><label className="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" className="rounded" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} />公开模板（团队成员可见）</label></div>
              <div>
                <label className="block text-sm font-medium mb-1">附件</label>
                <div className="flex items-center gap-2">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                  <button className={btnCls} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> {uploading ? '上传中...' : '上传附件'}</button>
                  {attachedFile && <span className="text-xs text-muted-foreground flex items-center gap-1"><Download size={12} /><a href={attachedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{attachedFile}</a></span>}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted" onClick={() => setShowDialog(false)}>取消</button>
              <button className={primaryBtnCls} onClick={handleSave}>{editingId ? '保存修改' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
