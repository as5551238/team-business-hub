/**
 * Undo/Redo 中间件 — 基于 useReducer dispatch 包装
 * 支持 Ctrl+Z(撤销) / Ctrl+Y / Ctrl+Shift+Z(重做)
 * 最大历史栈 50 步
 *
 * 设计原则: 只入栈有完整逆操作的 action,避免栈卡死
 */

import type { Action } from './types';

const MAX_UNDO_STACK = 50;

interface UndoEntry {
  action: Action;
  inverseAction: Action; // 预计算逆操作,确保入栈时就能确定可撤销
  label: string;
  timestamp: number;
}

let undoStack: UndoEntry[] = [];
let redoStack: UndoEntry[] = [];

// 可撤销的 action 类型 — 仅包含有完整逆操作的类型
const UNDOABLE_ACTIONS = new Set([
  // DELETE ↔ RESTORE (双方向)
  'DELETE_GOAL', 'RESTORE_GOAL',
  'DELETE_PROJECT', 'RESTORE_PROJECT',
  'DELETE_TASK', 'RESTORE_TASK',
  // ADD → DELETE (创建的逆操作是删除,需要 payload 中有 id)
  'ADD_GOAL', 'ADD_PROJECT', 'ADD_TASK',
  // TOGGLE 自逆
  'TOGGLE_SUBTASK',
]);

function getActionLabel(action: Action): string {
  const a = action as any;
  switch (a.type) {
    case 'ADD_GOAL': return '创建目标';
    case 'UPDATE_GOAL': return '更新目标';
    case 'DELETE_GOAL': return '删除目标';
    case 'RESTORE_GOAL': return '恢复目标';
    case 'ADD_PROJECT': return '创建项目';
    case 'UPDATE_PROJECT': return '更新项目';
    case 'DELETE_PROJECT': return '删除项目';
    case 'RESTORE_PROJECT': return '恢复项目';
    case 'ADD_TASK': return '创建任务';
    case 'UPDATE_TASK': return '更新任务';
    case 'DELETE_TASK': return '删除任务';
    case 'RESTORE_TASK': return '恢复任务';
    case 'TOGGLE_SUBTASK': return '切换子任务';
    default: return a.type;
  }
}

/**
 * 计算逆操作。如果无法计算(如 UPDATE 缺少旧值),返回 null。
 * 入栈时预计算,确保 popUndo 永远能成功。
 */
function computeInverse(action: Action): Action | null {
  const a = action as any;
  switch (a.type) {
    // DELETE ↔ RESTORE
    case 'DELETE_GOAL': return { type: 'RESTORE_GOAL', payload: a.payload };
    case 'DELETE_PROJECT': return { type: 'RESTORE_PROJECT', payload: a.payload };
    case 'DELETE_TASK': return { type: 'RESTORE_TASK', payload: a.payload };
    // RESTORE → DELETE (需要 id)
    case 'RESTORE_GOAL': {
      const id = typeof a.payload === 'string' ? a.payload : a.payload?.id;
      return id ? { type: 'DELETE_GOAL', payload: id } : null;
    }
    case 'RESTORE_PROJECT': {
      const id = typeof a.payload === 'string' ? a.payload : a.payload?.id;
      return id ? { type: 'DELETE_PROJECT', payload: id } : null;
    }
    case 'RESTORE_TASK': {
      const id = typeof a.payload === 'string' ? a.payload : a.payload?.id;
      return id ? { type: 'DELETE_TASK', payload: id } : null;
    }
    // ADD → DELETE (需要 payload 中有 id)
    case 'ADD_GOAL': {
      const id = a.payload?.id;
      return id ? { type: 'DELETE_GOAL', payload: id } : null;
    }
    case 'ADD_PROJECT': {
      const id = a.payload?.id;
      return id ? { type: 'DELETE_PROJECT', payload: id } : null;
    }
    case 'ADD_TASK': {
      const id = a.payload?.id;
      return id ? { type: 'DELETE_TASK', payload: id } : null;
    }
    // TOGGLE 自逆
    case 'TOGGLE_SUBTASK': return { type: 'TOGGLE_SUBTASK', payload: a.payload };
    default:
      return null;
  }
}

export function pushUndo(action: Action) {
  if (!UNDOABLE_ACTIONS.has(action.type)) return;
  const inverse = computeInverse(action);
  if (!inverse) return; // 无法计算逆操作则不入栈,避免栈卡死
  undoStack.push({ action, inverseAction: inverse, label: getActionLabel(action), timestamp: Date.now() });
  if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
  // 新操作清空redo栈
  redoStack = [];
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function popUndo(): Action | null {
  if (undoStack.length === 0) return null;
  const entry = undoStack.pop()!;
  redoStack.push(entry);
  if (redoStack.length > MAX_UNDO_STACK) redoStack.shift();
  return entry.inverseAction;
}

export function popRedo(): Action | null {
  if (redoStack.length === 0) return null;
  const entry = redoStack.pop()!;
  undoStack.push(entry);
  return entry.action;
}

export function getUndoLabel(): string | null {
  return undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null;
}

export function getRedoLabel(): string | null {
  return redoStack.length > 0 ? redoStack[redoStack.length - 1].label : null;
}

export function getUndoStackSize() { return undoStack.length; }
export function getRedoStackSize() { return redoStack.length; }
