import { useRef, useCallback, useEffect } from 'react';

/**
 * 创建对话框草稿自动保存 hook
 * 表单数据变化时自动保存到 localStorage，重新打开时自动恢复
 * 成功提交后自动清除草稿
 */
export function useDraftSave<T extends Record<string, any>>(
  key: string,
  initialValue: T,
  ttlMs: number = 24 * 60 * 60 * 1000 // 默认24小时过期
): {
  loadDraft: () => T | null;
  saveDraft: (data: T) => void;
  clearDraft: () => void;
} {
  const fullKey = `tbh-draft-${key}`;

  const loadDraft = useCallback((): T | null => {
    try {
      const saved = localStorage.getItem(fullKey);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // 检查过期
      if (parsed._ts && Date.now() - parsed._ts > ttlMs) {
        localStorage.removeItem(fullKey);
        return null;
      }
      const { _ts, ...data } = parsed;
      // 只恢复非空字段（避免用空值覆盖初始值）
      const restored: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
          restored[k] = v;
        }
      }
      return Object.keys(restored).length > 0 ? restored as T : null;
    } catch {
      return null;
    }
  }, [fullKey, ttlMs]);

  const saveDraft = useCallback((data: T) => {
    try {
      // 只保存有实际值的字段
      const toSave: Record<string, any> = { _ts: Date.now() };
      for (const [k, v] of Object.entries(data)) {
        if (v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
          toSave[k] = v;
        }
      }
      if (Object.keys(toSave).length > 1) { // >1 因为 _ts 总是存在
        localStorage.setItem(fullKey, JSON.stringify(toSave));
      } else {
        localStorage.removeItem(fullKey);
      }
    } catch { /* ignore */ }
  }, [fullKey]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(fullKey); } catch { /* ignore */ }
  }, [fullKey]);

  return { loadDraft, saveDraft, clearDraft };
}
