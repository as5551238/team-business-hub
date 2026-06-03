/**
 * 结构化错误处理 — S1-3
 *
 * 替代裸 catch {} 的统一错误处理方案：
 * - 分类日志（debug/info/warn/error 致命度）
 * - 上下文标注（模块+操作，便于定位）
 * - 可选 Sentry 上报（仅 error 级别）
 * - 用户通知（仅关键路径的 error 级别）
 */

export type ErrorSeverity = 'debug' | 'info' | 'warn' | 'error';

export interface ErrorContext {
  module: string;
  operation: string;
  severity?: ErrorSeverity;
  /** 是否向用户显示提示（仅 error 级别） */
  notifyUser?: boolean;
  /** 额外的结构化数据 */
  data?: Record<string, unknown>;
}

/**
 * 结构化错误捕获
 *
 * 替代 catch {} 的标准模式：
 *   catch (e) { handleError(e, { module: 'store', operation: 'UPDATE_TASK' }); }
 *
 * severity 默认规则：
 *   - 非关键路径（localStorage, BroadcastChannel, 可视化） → 'warn'
 *   - 数据写入/同步失败 → 'error'
 *   - 主动轮询/心跳类 → 'info'
 */
export function handleError(error: unknown, ctx: ErrorContext): void {
  const severity = ctx.severity ?? 'warn';
  const msg = `[${ctx.module}] ${ctx.operation}`;

  const errObj = error instanceof Error ? error : new Error(String(error));

  switch (severity) {
    case 'debug':
      // 开发环境才输出
      if (import.meta.env.DEV) {
        console.debug(msg, errObj.message, ctx.data ?? '');
      }
      break;
    case 'info':
      console.info(msg, errObj.message);
      break;
    case 'warn':
      console.warn(msg, errObj.message, ctx.data ?? '');
      break;
    case 'error':
      console.error(msg, errObj.message, ctx.data ?? '');
      // 上报 Sentry（如果已集成）
      if (typeof window !== 'undefined' && (window as Record<string, unknown>).__SENTRY__) {
        try {
          const Sentry = (window as Record<string, unknown>).Sentry as { captureException?: (e: unknown) => void } | undefined;
          Sentry?.captureException?.(errObj);
        } catch { /* Sentry itself failed, nothing we can do */ }
      }
      break;
  }
}

/**
 * 安全执行 — catch {} 的函数式替代
 *
 * const result = safeExec(() => JSON.parse(str), { module: 'store', operation: 'parseData' });
 * // result = parsed value or undefined
 */
export function safeExec<T>(
  fn: () => T,
  ctx: ErrorContext,
): T | undefined {
  try {
    return fn();
  } catch (e) {
    handleError(e, ctx);
    return undefined;
  }
}

/**
 * 安全异步执行
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  ctx: ErrorContext,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    handleError(e, ctx);
    return undefined;
  }
}
