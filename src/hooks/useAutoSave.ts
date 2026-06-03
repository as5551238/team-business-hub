/**
 * useAutoSave — 防抖自动保存 hook
 * 监听值变化,在指定延迟后触发保存回调
 * 支持手动 flush (如关闭面板时立即保存)
 */
import { useRef, useCallback, useEffect } from 'react';

interface UseAutoSaveOptions {
  /** 保存延迟(ms), 默认 800ms */
  delay?: number;
  /** 保存回调 */
  onSave: (value: string) => void;
  /** 是否启用, 默认 true */
  enabled?: boolean;
}

export function useAutoSave(value: string, options: UseAutoSaveOptions) {
  const { delay = 800, onSave, enabled = true } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(value);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Flush any pending save immediately
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (value !== lastSavedRef.current && enabled) {
      lastSavedRef.current = value;
      onSaveRef.current(value);
    }
  }, [value, enabled]);

  // Debounced save on value change
  useEffect(() => {
    if (!enabled || value === lastSavedRef.current) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSavedRef.current = value;
      onSaveRef.current(value);
      timerRef.current = null;
    }, delay);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delay, enabled]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        lastSavedRef.current = value;
        onSaveRef.current(value);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { flush };
}
