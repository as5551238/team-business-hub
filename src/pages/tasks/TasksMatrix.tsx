import React, { useRef, useCallback, useEffect } from 'react';
import type { Task, TaskPriority } from '@/types';
import { cn } from '@/lib/utils';
import { GripVertical, MessageSquare } from 'lucide-react';
import { StatusBadge } from './TasksComponents';
import { getQuadrantForPriority, getTouchPos, type BatchProps } from './constants';

/** S5-3: Map quadrant key to the TaskPriority for keyboard move operations */
const QUADRANT_TO_PRIORITY: Record<string, TaskPriority> = {
  '紧急重要': 'urgent',
  '重要不紧急': 'high',
  '紧急不重要': 'medium',
  '不紧急不重要': 'low',
};

/** S5-3: Keyboard-navigable quadrant layout for arrow key movement */
const QUADRANT_ARROW_MAP: Record<string, { up?: string; down?: string; left?: string; right?: string }> = {
  '紧急重要':     { down: '重要不紧急', right: '紧急不重要' },
  '重要不紧急':   { up: '紧急重要', right: '不紧急不重要' },
  '紧急不重要':   { down: '不紧急不重要', left: '紧急重要' },
  '不紧急不重要': { up: '紧急不重要', left: '重要不紧急' },
};

export function TaskMatrixView({ filteredTasks, setDetailItem, getMemberName, getQuadrantForPriority: _gfq, handleDropToQuadrant, commentCounts, batchProps }: {
  filteredTasks: Task[];
  setDetailItem: (item: { type: 'task'; id: string } | null) => void;
  getMemberName: (id: string) => string;
  getQuadrantForPriority: (p: TaskPriority) => string;
  handleDropToQuadrant: (taskId: string, quadrant: string) => void;
  commentCounts: Record<string, number>;
  batchProps: BatchProps;
}) {
  const gfq = _gfq;
  const dragRef = useRef<{ id: string; el: HTMLElement } | null>(null);
  const dragMovedRef = useRef(false);
  const hoverQRef = useRef<string | null>(null);
  const quadrantBoxRefs = useRef<Record<string, HTMLElement | null>>({});
  const focusAfterMoveId = useRef<string | null>(null);
  const quadrantMap: Record<string, { accent: string; hoverAccent: string }> = {
    '紧急重要': { accent: 'border-red-200 bg-red-50', hoverAccent: 'border-red-300 bg-red-50 ring-2 ring-red-200' },
    '重要不紧急': { accent: 'border-blue-200 bg-blue-50', hoverAccent: 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' },
    '紧急不重要': { accent: 'border-yellow-200 bg-yellow-50', hoverAccent: 'border-yellow-300 bg-yellow-50 ring-2 ring-yellow-200' },
    '不紧急不重要': { accent: 'border-gray-200 bg-gray-50', hoverAccent: 'border-gray-300 bg-gray-50 ring-2 ring-gray-200' },
  };
  const quadrantKeys = ['紧急重要', '重要不紧急', '紧急不重要', '不紧急不重要'];

  function resetHover() {
    const prev = hoverQRef.current;
    hoverQRef.current = null;
    if (prev && quadrantBoxRefs.current[prev]) {
      const box = quadrantBoxRefs.current[prev];
      if (box) box.className = box.className.replace(quadrantMap[prev].hoverAccent, quadrantMap[prev].accent);
    }
  }

  function handlePointerMove(cx: number, cy: number) {
    if (!dragRef.current) return;
    dragMovedRef.current = true;
    let found = false;
    for (const key of quadrantKeys) {
      const el = quadrantBoxRefs.current[key];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        if (hoverQRef.current !== key) {
          if (hoverQRef.current) {
            const prevBox = quadrantBoxRefs.current[hoverQRef.current];
            if (prevBox) prevBox.className = prevBox.className.replace(quadrantMap[hoverQRef.current].hoverAccent, quadrantMap[hoverQRef.current].accent);
          }
          hoverQRef.current = key;
          const box = quadrantBoxRefs.current[key];
          if (box) box.className = box.className.replace(quadrantMap[key].accent, quadrantMap[key].hoverAccent);
        }
        found = true;
        break;
      }
    }
    if (!found && hoverQRef.current) resetHover();
  }

  function handlePointerUp() {
    if (dragRef.current) {
      if (dragRef.current.el) dragRef.current.el.classList.remove('opacity-30', 'scale-95');
      if (hoverQRef.current) handleDropToQuadrant(dragRef.current.id, hoverQRef.current);
      resetHover();
      dragRef.current = null;
    }
  }

  /** S5-3: Alt+Arrow moves task between quadrants; Enter/Space opens detail */
  function handleTaskKeyDown(e: React.KeyboardEvent, taskId: string, currentQuadrant: string) {
    if (e.altKey && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      const arrows = QUADRANT_ARROW_MAP[currentQuadrant];
      if (!arrows) return;
      let tq: string | undefined;
      if (e.key === 'ArrowUp') tq = arrows.up;
      else if (e.key === 'ArrowDown') tq = arrows.down;
      else if (e.key === 'ArrowLeft') tq = arrows.left;
      else if (e.key === 'ArrowRight') tq = arrows.right;
      if (tq) { e.preventDefault(); handleDropToQuadrant(taskId, tq); focusAfterMoveId.current = taskId; }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setDetailItem({ type: 'task', id: taskId });
    }
  }

  const mmHandler = useCallback((e: MouseEvent) => handlePointerMove(e.clientX, e.clientY), []);
  const muHandler = useCallback(() => handlePointerUp(), [handleDropToQuadrant]);
  const tmHandler = useCallback((e: TouchEvent) => { const pos = getTouchPos(e); handlePointerMove(pos.x, pos.y); }, []);
  const teHandler = useCallback(() => handlePointerUp(), [handleDropToQuadrant]);

  useEffect(() => {
    document.addEventListener('mousemove', mmHandler);
    document.addEventListener('mouseup', muHandler);
    document.addEventListener('touchmove', tmHandler, { passive: true });
    document.addEventListener('touchend', teHandler);
    return () => { document.removeEventListener('mousemove', mmHandler); document.removeEventListener('mouseup', muHandler); document.removeEventListener('touchmove', tmHandler); document.removeEventListener('touchend', teHandler); };
  }, [mmHandler, muHandler, tmHandler, teHandler]);

  /** S5-3: After a keyboard move, re-render places the card in the new quadrant — focus it */
  useEffect(() => {
    if (focusAfterMoveId.current) {
      const el = document.querySelector(`[data-task-id="${focusAfterMoveId.current}"]`) as HTMLElement | null;
      if (el) { el.focus(); el.classList.add('ring-2','ring-primary'); setTimeout(() => el.classList.remove('ring-2','ring-primary'), 400); }
      focusAfterMoveId.current = null;
    }
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[500px] select-none">
      {quadrantKeys.map(key => {
        const q = quadrantMap[key];
        const qTasks = filteredTasks.filter(t => gfq(t.priority) === key);
        return (
          <div key={key} data-qk={key} ref={el => { quadrantBoxRefs.current[key] = el; }} role="listbox" aria-label={`${key} 任务列表`} className={`rounded-xl border-2 p-4 min-h-[240px] transition-all duration-150 ${q.accent}`}>
            <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold">{key}</span><span className="text-xs text-muted-foreground ml-auto">{qTasks.length} 项</span></div>
            <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto">
              {qTasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-8 opacity-60">拖入任务</p>}
              {qTasks.map(task => (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  tabIndex={0}
                  role="option"
                  aria-label={`${task.title}, 象限: ${key}, 优先级: ${task.priority}`}
                  className="bg-white/80 rounded-lg border border-border/50 shadow-sm p-2.5 hover:shadow-md transition-all cursor-pointer focus:ring-2 focus:ring-primary focus:outline-none"
                  onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); dragMovedRef.current = false; dragRef.current = { id: task.id, el: e.currentTarget }; e.currentTarget.classList.add('opacity-30', 'scale-95'); }}
                  onTouchStart={e => { const t = e.touches[0]; if (!t) return; dragRef.current = { id: task.id, el: e.currentTarget as HTMLElement }; (e.currentTarget as HTMLElement).classList.add('opacity-30', 'scale-95'); }}
                  onClick={() => { if (!dragMovedRef.current) setDetailItem({ type: 'task', id: task.id }); }}
                  onKeyDown={e => handleTaskKeyDown(e, task.id, key)}
                >
                  {batchProps.batchMode && <div className="mb-1" onClick={e => e.stopPropagation()}><input type="checkbox" checked={batchProps.selectedIds.has(task.id)} className="rounded" onChange={() => batchProps.onToggleSelect(task.id)} /></div>}
                  <div className="flex items-center gap-2 mb-1">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                    <StatusBadge status={task.status} />
                    <span className="text-xs text-muted-foreground ml-auto">{getMemberName(task.leaderId)}</span>
                  </div>
                  <p className="text-sm font-medium truncate pl-5">{task.title}</p>
                  {(commentCounts[task.id] || 0) > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 pl-5 mt-0.5"><MessageSquare size={10} />{commentCounts[task.id]}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
