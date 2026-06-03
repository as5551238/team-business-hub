/**
 * Sentry 初始化 — 前端异常监控
 * DSN 从环境变量或 localStorage 读取，未配置则静默跳过
 */
import * as Sentry from '@sentry/react';
import { handleError } from '@/lib/errorHandler';

const SENTRY_DSN_KEY = 'tbh-sentry-dsn';
const SENTRY_DEFAULT_DSN = ''; // 用户在Settings中配置

export function initSentry() {
  const dsn = (() => {
    try { return localStorage.getItem(SENTRY_DSN_KEY) || SENTRY_DEFAULT_DSN; } catch (e) { handleError(e, { module: 'sentry', operation: 'LOAD_DSN', severity: 'debug' }); return ''; }
  })();
  if (!dsn) {
    console.info('[Sentry] No DSN configured, skipping init');
    return;
  }
  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1, // 10% of transactions
    replaysSessionSampleRate: 0, // No session replays by default
    replaysOnErrorSampleRate: 1.0, // 100% on error
    environment: import.meta.env.MODE || 'production',
    release: 'tbh@' + (import.meta.env.VITE_APP_VERSION || 'dev'),
    beforeSend(event) {
      // Don't send events in development
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
  console.info('[Sentry] Initialized');
}

/** Capture an exception manually */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

/** Set Sentry user context for error tracking */
export function setSentryUser(userId: string, userName?: string) {
  Sentry.setUser({ id: userId, username: userName });
}

/** Clear Sentry user context on logout */
export function clearSentryUser() {
  Sentry.setUser(null);
}
