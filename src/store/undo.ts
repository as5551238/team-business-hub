/**
 * Undo/Redo 中间件 — 基于 useReducer dispatch 包装
 * 支持 Ctrl+Z(撤销) / Ctrl+Y / Ctrl+Shift+Z(重做)
 * 最大历史栈 50 步
 *
 * 设计原则: 只入栈有完整逆操作的 action,避免栈卡死
 * 批量UPDATE: 通过 pushBatchUndo 捕获旧值快照,一次入栈多步逆操作
 *
 * S3-1b: 持久化到 localStorage + 修复批量 Redo + 扩展可撤销操作(ADD/UPDATE)
 */

import type { Action } from './types';
import { handleError } from '@/lib/errorHandler';

const MAX_UNDO_STACK = 50;
const UNDO_LS_KEY = 'tbh-undo-stack';
const REDO_LS_KEY = 'tbh-redo-stack';

interface UndoEntry {
  action: Action;
  inverseAction: Action; // 预计算逆操作,确保入栈时就能确定可撤销
  label: string;
  timestamp: number;
}

/** 批量逆操作组 — 一次批量操作的多个撤销步骤 */
interface BatchUndoGroup {
  actions: Action[];         // 逆操作列表
  originalActions: Action[]; // S3-1b: 原始操作列表,用于重做
  label: string;
  timestamp: number;
}

let undoStack: (UndoEntry | BatchUndoGroup)[] = [];
let redoStack: (UndoEntry | BatchUndoGroup)[] = [];

// 可撤销的 action 类型 — S3-1b: 扩展包含 ADD/DELETE/RESTORE/TOGGLE
const UNDOABLE_ACTIONS = new Set([
  // ADD → DELETE (创建后可撤销删除)
  'ADD_GOAL', 'ADD_PROJECT', 'ADD_TASK',
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
  persistStacks();
  return true;
}

/**
 * 批量操作入栈 — 用于批量 UPDATE操作
 * @param inverseActions 逆操作列表(还原所有修改的旧值)
 * @param originalActions 原始操作列表(用于重做, S3-1b)
 * @param label 操作描述
 * @example
 *   // 在批量操作前收集旧值
 *   const inverses = selectedIds.map(id => {
 *     const item = state.tasks.find(t => t.id === id);
 *     return { type: 'UPDATE_TASK', payload: { id, updates: { tags: item.tags } } };
 *   });
 *   const originals = selectedIds.map(id => {
 *     return { type: 'UPDATE_TASK', payload: { id, updates: { tags: newTags } } };
 *   });
 *   pushBatchUndo(inverses, originals, '批量添加标签');
 *   // 然后执行批量更新
 */
export function pushBatchUndo(inverseActions: Action[], originalActions: Action[] | undefined, label: string): boolean {
  if (inverseActions.length === 0) return false;
  undoStack.push({ actions: inverseActions, originalActions: originalActions || inverseActions, label, timestamp: Date.now() });
  if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
  redoStack = [];
  persistStacks();
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
  persistStacks();
  if (isBatchGroup(entry)) {
    return entry.actions;
  }
  return (entry as UndoEntry).inverseAction;
}

export function popRedo(): Action | Action[] | null {
  if (redoStack.length === 0) return null;
  const entry = redoStack.pop()!;
  undoStack.push(entry);
  persistStacks();
  if (isBatchGroup(entry)) {
    // S3-1b: 返回原始操作完成重做
    return entry.originalActions;
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
export function clearUndoStack() { undoStack = []; redoStack = []; persistStacks(); }

// ==================== S3-1b: localStorage 持久化 ====================

/** Serialize a stack entry to a JSON-safe format */
function serializeEntry(entry: UndoEntry | BatchUndoGroup): unknown {
  if (isBatchGroup(entry)) {
    return { actions: entry.actions, originalActions: entry.originalActions, label: entry.label, timestamp: entry.timestamp, _type: 'batch' };
  }
  const e = entry as UndoEntry;
  return { action: e.action, inverseAction: e.inverseAction, label: e.label, timestamp: e.timestamp, _type: 'single' };
}

/** Deserialize a stack entry from localStorage */
function deserializeEntry(raw: Record<string, unknown>): UndoEntry | BatchUndoGroup | null {
  try {
    if (raw._type === 'batch') {
      return {
        actions: (raw.actions || []) as Action[],
        originalActions: (raw.originalActions || []) as Action[],
        label: (raw.label as string) || '批量操作',
        timestamp: (raw.timestamp as number) || Date.now(),
      };
    }
    return {
      action: raw.action as Action,
      inverseAction: raw.inverseAction as Action,
      label: (raw.label as string) || '操作',
      timestamp: (raw.timestamp as number) || Date.now(),
    };
  } catch (e) {
    handleError(e, { module: 'store', operation: 'UNDO_DESERIALIZE', severity: 'debug' });
    return null;
  }
}

/** Persist both stacks to localStorage (debounced internally) */
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistStacks() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      // Limit: only persist last 20 entries per stack to control size
      const undoSlice = undoStack.slice(-20).map(serializeEntry);
      const redoSlice = redoStack.slice(-20).map(serializeEntry);
      localStorage.setItem(UNDO_LS_KEY, JSON.stringify(undoSlice));
      localStorage.setItem(REDO_LS_KEY, JSON.stringify(redoSlice));
    } catch (e) {
      handleError(e, { module: 'store', operation: 'LS_PERSIST_UNDO', severity: 'debug' });
    }
    _persistTimer = null;
  }, 500);
}

/** Load stacks from localStorage on module init */
function loadStacks() {
  try {
    const undoRaw = localStorage.getItem(UNDO_LS_KEY);
    if (undoRaw) {
      const parsed = JSON.parse(undoRaw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const entry = deserializeEntry(item);
          if (entry) undoStack.push(entry);
        }
      }
    }
    const redoRaw = localStorage.getItem(REDO_LS_KEY);
    if (redoRaw) {
      const parsed = JSON.parse(redoRaw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const entry = deserializeEntry(item);
          if (entry) redoStack.push(entry);
        }
      }
    }
  } catch (e) {
    handleError(e, { module: 'store', operation: 'LS_LOAD_UNDO', severity: 'debug' });
  }
}
loadStacks();
