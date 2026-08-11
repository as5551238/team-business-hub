import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Code, Link2, Undo, Redo, Highlighter,
  Palette, RemoveFormatting
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

/**
 * TipTap Rich Text Editor — 非受控模式
 *
 * 关键设计：TipTap是ProseMirror内核，不能用React受控模式(content prop驱动setContent)，
 * 否则会形成 onUpdate→onChange→setState→prop变化→setContent 循环，导致光标重置/无法编辑。
 *
 * 正确模式：非受控 + key重建
 * - 编辑器内部own状态，onUpdate仅通知父组件保存
 * - 切换笔记时通过key={noteId}销毁旧实例、创建新实例
 * - 绝不用useEffect同步content prop → editor.setContent()
 */

interface RichTextEditorProps {
  initialContent: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
}

const FONT_COLORS = [
  '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#ffffff'
];

const BG_COLORS = [
  '#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3',
  '#f3e8ff', '#ffedd5', '#e2e8f0', '#fecaca', '#ccfbf1'
];

export default function RichTextEditor({ initialContent, onChange, placeholder, className, onFocus }: RichTextEditorProps) {
  // Debounce ref: avoid calling onChange on every keystroke
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHtml = useRef<string>(initialContent);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: 'text-primary underline', target: '_blank', rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder: placeholder || '开始书写...' }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-full p-4 text-sm',
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      latestHtml.current = html;
      // Debounce: notify parent after 300ms of inactivity
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onChange(html);
      }, 300);
    },
    onFocus: () => { onFocus?.(); },
  });

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Immediately flush pending changes when losing focus
  const handleBlur = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      onChange(latestHtml.current);
    }
  }, [onChange]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('输入链接URL:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  const ToolbarButton = ({ onClick, isActive, title, children }: { onClick: () => void; isActive?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
    >
      {children}
    </button>
  );

  return (
    <div className={`flex flex-col min-h-0 flex-1 ${className || ''}`} onBlur={handleBlur}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-border/50 flex-shrink-0 bg-muted/20">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="加粗">
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="斜体">
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="删除线">
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="标题1">
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="标题2">
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="标题3">
          <Heading3 size={15} />
        </ToolbarButton>

        <span className="w-px h-4 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="无序列表">
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="有序列表">
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive('codeBlock')} title="代码块">
          <Code size={15} />
        </ToolbarButton>

        <span className="w-px h-4 bg-border mx-1" />

        {/* Font color picker */}
        <div className="relative group">
          <ToolbarButton onClick={() => {}} title="字体颜色">
            <Palette size={15} />
          </ToolbarButton>
          <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-2 hidden group-hover:flex flex-wrap gap-1 z-50 w-[200px]">
            {FONT_COLORS.map(c => (
              <button
                key={`fc-${c}`}
                type="button"
                title={c}
                className="w-5 h-5 rounded-full border border-gray-300 hover:scale-125 transition-transform"
                style={{ backgroundColor: c, color: c === '#ffffff' ? '#999' : c }}
                onClick={() => editor.chain().focus().setColor(c).run()}
              />
            ))}
            <button
              type="button"
              title="重置字体颜色"
              className="w-5 h-5 rounded-full border border-gray-300 hover:scale-125 transition-transform flex items-center justify-center text-[10px] text-muted-foreground bg-white"
              onClick={() => editor.chain().focus().unsetColor().run()}
            >
              ×
            </button>
          </div>
        </div>

        {/* Background highlight color picker */}
        <div className="relative group">
          <ToolbarButton onClick={() => {}} title="背景高亮">
            <Highlighter size={15} />
          </ToolbarButton>
          <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-2 hidden group-hover:flex flex-wrap gap-1 z-50 w-[200px]">
            {BG_COLORS.map(c => (
              <button
                key={`bg-${c}`}
                type="button"
                title={c}
                className="w-5 h-5 rounded-full border border-gray-300 hover:scale-125 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
              />
            ))}
            <button
              type="button"
              title="移除背景高亮"
              className="w-5 h-5 rounded-full border border-gray-300 hover:scale-125 transition-transform flex items-center justify-center text-[10px] text-muted-foreground bg-white"
              onClick={() => editor.chain().focus().unsetHighlight().run()}
            >
              ×
            </button>
          </div>
        </div>

        <ToolbarButton onClick={setLink} isActive={editor.isActive('link')} title="插入链接">
          <Link2 size={15} />
        </ToolbarButton>

        <span className="w-px h-4 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="清除格式">
          <RemoveFormatting size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="撤销">
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="重做">
          <Redo size={15} />
        </ToolbarButton>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto min-h-0 tiptap-editor-body">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Tiptap styles */}
      <style>{`
        .tiptap-editor-body .tiptap {
          min-height: 100%;
        }
        .tiptap-editor-body .tiptap p.is-editor-empty:first-child::before {
          color: #adb5bd;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tiptap-editor-body .tiptap h1 { font-size: 1.25rem; font-weight: 700; margin: 0.5rem 0; }
        .tiptap-editor-body .tiptap h2 { font-size: 1.125rem; font-weight: 600; margin: 0.5rem 0; }
        .tiptap-editor-body .tiptap h3 { font-size: 1rem; font-weight: 600; margin: 0.5rem 0; }
        .tiptap-editor-body .tiptap ul { list-style: disc; padding-left: 1.5rem; }
        .tiptap-editor-body .tiptap ol { list-style: decimal; padding-left: 1.5rem; }
        .tiptap-editor-body .tiptap pre { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.75rem; margin: 0.5rem 0; font-size: 0.8rem; overflow-x: auto; }
        .tiptap-editor-body .tiptap code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-size: 0.85em; }
        .tiptap-editor-body .tiptap pre code { background: transparent; padding: 0; }
        .tiptap-editor-body .tiptap mark { border-radius: 0.2rem; padding: 0.1em 0.2em; }
        .tiptap-editor-body .tiptap a { color: var(--primary); text-decoration: underline; }
        .tiptap-editor-body .tiptap p { margin: 0.25rem 0; }
        .tiptap-editor-body .tiptap blockquote { border-left: 3px solid var(--primary); padding-left: 0.75rem; color: #6b7280; margin: 0.5rem 0; }
      `}</style>
    </div>
  );
}
