import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { Maximize2, Minimize2, X, Move, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * NoteOverlay — 笔记/条目自由缩放覆盖层
 *
 * 支持三种模式：
 * 1. 内联模式 (inline): 嵌入父容器中正常渲染
 * 2. 浮动模式 (floating): 可拖动+缩放的浮动面板
 * 3. 全屏模式 (fullscreen): 占满整个视口
 *
 * 交互：
 * - 点击全屏按钮 → 全屏
 * - 全屏中点击退出 → 回到浮动/内联
 * - 浮动模式：标题栏拖动移动，四角/四边拖动缩放
 * - 双击标题栏 → 切换全屏
 * - ESC 退出全屏
 *
 * 实现遵循红线：useRef+DOM操作，禁止useState驱动拖拽位置
 */

export type OverlayMode = 'inline' | 'floating' | 'fullscreen';

interface NoteOverlayProps {
  /** 是否显示覆盖层 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 标题（显示在标题栏） */
  title: string;
  /** 标题变更回调 */
  onTitleChange?: (title: string) => void;
  /** 颜色标识 */
  accentColor?: string;
  /** 子内容 */
  children: ReactNode;
  /** 额外工具栏按钮（插入在标题栏右侧，全屏/关闭按钮之前） */
  toolbarExtras?: ReactNode;
  /** 初始宽度（浮动模式），默认600 */
  defaultWidth?: number;
  /** 初始高度（浮动模式），默认500 */
  defaultHeight?: number;
  /** className */
  className?: string;
}

const MIN_WIDTH = 360;
const MIN_HEIGHT = 260;
const EDGE_THRESHOLD = 8;

export default function NoteOverlay({
  open,
  onClose,
  title,
  onTitleChange,
  accentColor,
  children,
  toolbarExtras,
  defaultWidth = 600,
  defaultHeight = 500,
  className,
}: NoteOverlayProps) {
  const [mode, setMode] = useState<OverlayMode>('floating');
  const [editingTitle, setEditingTitle] = useState(title);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    type: 'move' | 'resize';
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
    edge: string;
  } | null>(null);

  // 尺寸/位置用 ref 驱动 DOM（红线：禁止 useState 驱动拖拽）
  const posRef = useRef({ left: 80, top: 60 });
  const sizeRef = useRef({ width: defaultWidth, height: defaultHeight });

  // 同步标题
  useEffect(() => { setEditingTitle(title); }, [title]);

  const applyTransform = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    if (mode === 'fullscreen') {
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100dvw';
      el.style.height = '100dvh';
    } else {
      el.style.left = `${posRef.current.left}px`;
      el.style.top = `${posRef.current.top}px`;
      el.style.width = `${sizeRef.current.width}px`;
      el.style.height = `${sizeRef.current.height}px`;
    }
  }, [mode]);

  useEffect(() => { applyTransform(); }, [applyTransform]);

  // ESC 退出全屏
  useEffect(() => {
    if (mode !== 'fullscreen') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('floating');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode]);

  // --- 拖动/缩放事件 ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode === 'fullscreen') return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 检测边缘 resize
    const isLeft = x < EDGE_THRESHOLD;
    const isRight = x > rect.width - EDGE_THRESHOLD;
    const isTop = y < EDGE_THRESHOLD;
    const isBottom = y > rect.height - EDGE_THRESHOLD;

    if (isLeft || isRight || isTop || isBottom) {
      const edges: string[] = [];
      if (isTop) edges.push('n');
      if (isBottom) edges.push('s');
      if (isLeft) edges.push('w');
      if (isRight) edges.push('e');
      e.preventDefault();
      dragState.current = {
        type: 'resize',
        startX: e.clientX,
        startY: e.clientY,
        startLeft: posRef.current.left,
        startTop: posRef.current.top,
        startWidth: sizeRef.current.width,
        startHeight: sizeRef.current.height,
        edge: edges.join(''),
      };
    }
  }, [mode]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      e.preventDefault();

      if (ds.type === 'move') {
        const dx = e.clientX - ds.startX;
        const dy = e.clientY - ds.startY;
        posRef.current = {
          left: ds.startLeft + dx,
          top: ds.startTop + dy,
        };
      } else if (ds.type === 'resize') {
        const dx = e.clientX - ds.startX;
        const dy = e.clientY - ds.startY;
        let newW = ds.startWidth;
        let newH = ds.startHeight;
        let newLeft = ds.startLeft;
        let newTop = ds.startTop;

        if (ds.edge.includes('e')) newW = Math.max(MIN_WIDTH, ds.startWidth + dx);
        if (ds.edge.includes('s')) newH = Math.max(MIN_HEIGHT, ds.startHeight + dy);
        if (ds.edge.includes('w')) {
          const d = -dx;
          const candidateW = ds.startWidth + d;
          if (candidateW >= MIN_WIDTH) {
            newW = candidateW;
            newLeft = ds.startLeft - d;
          }
        }
        if (ds.edge.includes('n')) {
          const d = -dy;
          const candidateH = ds.startHeight + d;
          if (candidateH >= MIN_HEIGHT) {
            newH = candidateH;
            newTop = ds.startTop - d;
          }
        }
        sizeRef.current = { width: newW, height: newH };
        posRef.current = { left: newLeft, top: newTop };
      }
      applyTransform();
    };

    const onUp = () => { dragState.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [applyTransform]);

  // 触摸事件支持
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (mode === 'fullscreen') return;
    const touch = e.touches[0];
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const isLeft = x < EDGE_THRESHOLD * 2;
    const isRight = x > rect.width - EDGE_THRESHOLD * 2;
    const isTop = y < EDGE_THRESHOLD * 2;
    const isBottom = y > rect.height - EDGE_THRESHOLD * 2;
    if (isLeft || isRight || isTop || isBottom) {
      const edges: string[] = [];
      if (isTop) edges.push('n');
      if (isBottom) edges.push('s');
      if (isLeft) edges.push('w');
      if (isRight) edges.push('e');
      dragState.current = {
        type: 'resize',
        startX: touch.clientX,
        startY: touch.clientY,
        startLeft: posRef.current.left,
        startTop: posRef.current.top,
        startWidth: sizeRef.current.width,
        startHeight: sizeRef.current.height,
        edge: edges.join(''),
      };
    }
  }, [mode]);

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const touch = e.touches[0];
      if (ds.type === 'move') {
        const dx = touch.clientX - ds.startX;
        const dy = touch.clientY - ds.startY;
        posRef.current = { left: ds.startLeft + dx, top: ds.startTop + dy };
      } else if (ds.type === 'resize') {
        const dx = touch.clientX - ds.startX;
        const dy = touch.clientY - ds.startY;
        let newW = ds.startWidth;
        let newH = ds.startHeight;
        let newLeft = ds.startLeft;
        let newTop = ds.startTop;
        if (ds.edge.includes('e')) newW = Math.max(MIN_WIDTH, ds.startWidth + dx);
        if (ds.edge.includes('s')) newH = Math.max(MIN_HEIGHT, ds.startHeight + dy);
        if (ds.edge.includes('w')) {
          const d = -dx;
          if (ds.startWidth + d >= MIN_WIDTH) { newW = ds.startWidth + d; newLeft = ds.startLeft - d; }
        }
        if (ds.edge.includes('n')) {
          const d = -dy;
          if (ds.startHeight + d >= MIN_HEIGHT) { newH = ds.startHeight + d; newTop = ds.startTop - d; }
        }
        sizeRef.current = { width: newW, height: newH };
        posRef.current = { left: newLeft, top: newTop };
      }
      applyTransform();
    };
    const onTouchEnd = () => { dragState.current = null; };
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [applyTransform]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className={cn(
        'fixed z-50 flex flex-col bg-card border border-border shadow-2xl rounded-lg overflow-hidden',
        mode === 'fullscreen' ? 'rounded-none' : '',
        className,
      )}
      style={{
        ...(mode !== 'fullscreen' ? { resize: 'none' } : {}),
      }}
    >
      {/* 标题栏 — 拖动移动 */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 cursor-move select-none flex-shrink-0"
        onMouseDown={(e) => {
          if (mode === 'fullscreen') return;
          // 仅在标题栏空白区域触发拖动
          if ((e.target as HTMLElement).closest('button, input')) return;
          e.preventDefault();
          dragState.current = {
            type: 'move',
            startX: e.clientX,
            startY: e.clientY,
            startLeft: posRef.current.left,
            startTop: posRef.current.top,
            startWidth: sizeRef.current.width,
            startHeight: sizeRef.current.height,
            edge: '',
          };
        }}
        onTouchStart={(e) => {
          if (mode === 'fullscreen') return;
          if ((e.target as HTMLElement).closest('button, input')) return;
          const touch = e.touches[0];
          dragState.current = {
            type: 'move',
            startX: touch.clientX,
            startY: touch.clientY,
            startLeft: posRef.current.left,
            startTop: posRef.current.top,
            startWidth: sizeRef.current.width,
            startHeight: sizeRef.current.height,
            edge: '',
          };
        }}
        onDoubleClick={() => setMode(m => m === 'fullscreen' ? 'floating' : 'fullscreen')}
      >
        {accentColor && (
          <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: accentColor }} />
        )}
        <Move size={12} className="text-muted-foreground flex-shrink-0" />
        <input
          className="flex-1 text-sm font-semibold bg-transparent border-none outline-none min-w-0"
          value={editingTitle}
          onChange={e => { setEditingTitle(e.target.value); onTitleChange?.(e.target.value); }}
          onFocus={e => e.target.select()}
        />
        <div className="flex items-center gap-1 flex-shrink-0">
          {toolbarExtras}
          <button
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            onClick={() => setMode(m => m === 'fullscreen' ? 'floating' : 'fullscreen')}
            title={mode === 'fullscreen' ? '退出全屏' : '全屏'}
          >
            {mode === 'fullscreen' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto min-h-0">
        {children}
      </div>

      {/* 底部缩放手柄（浮动模式可见） */}
      {mode === 'floating' && (
        <div className="flex justify-center py-1 border-t border-border/50 bg-muted/20 cursor-nwse-resize flex-shrink-0"
          onMouseDown={(e) => {
            e.preventDefault();
            dragState.current = {
              type: 'resize',
              startX: e.clientX,
              startY: e.clientY,
              startLeft: posRef.current.left,
              startTop: posRef.current.top,
              startWidth: sizeRef.current.width,
              startHeight: sizeRef.current.height,
              edge: 'se',
            };
          }}
        >
          <GripHorizontal size={14} className="text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}
