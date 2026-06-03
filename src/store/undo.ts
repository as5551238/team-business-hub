/**
 * Undo/Redo 中间件 — 基于 useReducer dispatch 包装
 * 支持 Ctrl+Z(撤销) / Ctrl+Y / Ctrl+Shift+Z(重做)
 * 最大历史栈 50 步
 *
 * 设计原则: 只入栈有完整逆操作的 action,避免栈卡死
 * 批量UPDATE: 通过 pushBatchUndo 捕获旧值快照,一次入栈多步逆操作
 */

import type { Action } from './types';

const MAX_UNDO_STACK = 50;

interface UndoEntry {
  action: Action;
  inverseAction: Action; // 预计算逆操作,确保入栈时就能确定可撤销
  label: string;
  timestamp: number;
}

/** 批量逆操作组 — 一次批量操作的多个撤销步骤 */
interface BatchUndoGroup {
  actions: Action[];
  label: string;
  timestamp: number;
}

let undoStack: (UndoEntry | BatchUndoGroup)[] = [];
let redoStack: (UndoEntry | BatchUndoGroup)[] = [];

// 可撤销的 action 类型 — 仅包含有完整逆操作的类型
const UNDOABLE_ACTIONS = new Set([
  // DELETE ↔ RESTORE (双方向)
  'DELETE_GOAL', 'RESTORE_GOAL',
  'DELETE_PROJECT', 'RESTORE_PROJECT',
  'DELETE_TASK', 'RESTORE_TASK',
  // TOGGLE 自逆
  'TOGGLE_SUBTASK',
]);

function getActionLabel(action: Action): string {
  switch (action.type) {
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
    default: return action.type;
  }
}

/**
 * 计算逆操作。如果无法计算(如 UPDATE 缺少旧值),返回 null。
 * 入栈时预计算,确保 popUndo 永远能成功。
 */
function computeInverse(action: Action): Action | null {
  switch (action.type) {
    // DELETE ↔ RESTORE
    case 'DELETE_GOAL': return { type: 'RESTORE_GOAL', payload: action.payload };
    case 'DELETE_PROJECT': return { type: 'RESTORE_PROJECT', payload: action.payload };
    case 'DELETE_TASK': return { type: 'RESTORE_TASK', payload: action.payload };
    // RESTORE → DELETE (需要 id)
    case 'RESTORE_GOAL': return { type: 'DELETE_GOAL', payload: action.payload };
    case 'RESTORE_PROJECT': return { type: 'DELETE_PROJECT', payload: action.payload };
    case 'RESTORE_TASK': return { type: 'DELETE_TASK', payload: action.payload };
    // ADD → DELETE (需要 payload 中有 id)
    case 'ADD_GOAL': return { type: 'DELETE_GOAL', payload: action.payload.id };
    case 'ADD_PROJECT': return { type: 'DELETE_PROJECT', payload: action.payload.id };
    case 'ADD_TASK': return { type: 'DELETE_TASK', payload: action.payload.id };
    // TOGGLE 自逆
    case 'TOGGLE_SUBTASK': return { type: 'TOGGLE_SUBTASK', payload: action.payload };
    default:
      return null;
  }
}

function isBatchGroup(entry: UndoEntry | BatchUndoGroup): entry is BatchUndoGroup {
  return 'actions' in entry && Array.isArray((entry as BatchUndoGroup).actions);
}

export function pushUndo(action: Action): boolean {
  if (!UNDOABLE_ACTIONS.has(action.type)) return false;
  const inverse = computeInverse(action);
  if (!inverse) return false; // 无法计算逆操作则不入栈,避免栈卡死
  undoStack.push({ action, inverseAction: inverse, label: getActionLabel(action), timestamp: Date.now() });
  if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
  // 新操作清空redo栈
  redoStack = [];
  return true;
}

/**
 * 批量操作入栈 — 用于批量 UPDATE操作
 * @param inverseActions 逆操作列表(还原所有修改的旧值)
 * @param label 操作描述
 * @example
 *   // 在批量操作前收集旧值
 *   const inverses = selectedIds.map(id => {
 *     const item = state.tasks.find(t => t.id === id);
 *     return { type: 'UPDATE_TASK', payload: { id, updates: { tags: item.tags } } };
 *   });
 *   pushBatchUndo(inverses, '批量添加标签');
 *   // 然后执行批量更新
 */
export function pushBatchUndo(inverseActions: Action[], label: string): boolean {
  if (inverseActions.length === 0) return false;
  undoStack.push({ actions: inverseActions, label, timestamp: Date.now() });
  if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
  redoStack = [];
  return true;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function popUndo(): Action | Action[] | null {
  if (undoStack.length === 0) return null;
  const entry = undoStack.pop()!;
  redoStack.push(entry);
  if (redoStack.length > MAX_UNDO_STACK) redoStack.shift();
  if (isBatchGroup(entry)) {
    return entry.actions;
  }
  return (entry as UndoEntry).inverseAction;
}

export function popRedo(): Action | Action[] | null {
  if (redoStack.length === 0) return null;
  const entry = redoStack.pop()!;
  undoStack.push(entry);
  if (isBatchGroup(entry)) {
    // 批量重做: 需要保存原始操作 — 但BatchUndoGroup只有逆操作
    // 重做时返回空(简化: 批量操作暂不支持重做)
    return null;
  }
  return (entry as UndoEntry).action;
}

export function getUndoLabel(): string | null {
  return undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null;
}

export function getRedoLabel(): string | null {
  return redoStack.length > 0 ? redoStack[redoStack.length - 1].label : null;
}

export function getUndoStackSize() { return undoStack.length; }
export function getRedoStackSize() { return redoStack.length; }
export function clearUndoStack() { undoStack = []; redoStack = []; }
