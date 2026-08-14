/**
 * 浏览器通知服务 — 使用 Notification API + Web Push 协议
 * 当用户不在当前标签页时，通过浏览器原生通知提醒
 * 优先通过 Service Worker 推送，回退到直接 Notification API
 * 支持 Web Push 离线推送（需 PushManager 订阅 + 服务端支持）
 */

let permissionGranted = false;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') { permissionGranted = true; return true; }
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  permissionGranted = result === 'granted';
  return permissionGranted;
}

export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

export function isNotificationGranted(): boolean {
  return Notification.permission === 'granted';
}

/** Check if running as standalone PWA (required for iOS Push) */
export function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Check if iOS Safari needs "Add to Home Screen" for Push support */
export function needsIOSInstallForPush(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS && isSafari && !isStandaloneMode();
}

function isSwActive(): boolean {
  return ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
}

/**
 * 发送浏览器通知（仅当页面不可见时）
 * 优先使用 Service Worker 推送，SW 不可用时回退到 Notification API
 * 支持添加 action buttons 实现快速交互
 */
export function sendBrowserNotification(
  title: string,
  options?: NotificationOptions & { actions?: { action: string; title: string }[] }
): void {
  if (!permissionGranted && Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  if (isSwActive()) {
    try {
      navigator.serviceWorker.controller!.postMessage({
        type: 'PUSH_NOTIFICATION',
        payload: {
          title,
          body: options?.body || '',
          url: options?.data?.url as string | undefined,
          actions: options?.actions || [],
        },
      });
      return;
    } catch {}
  }

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    // 自动关闭
    setTimeout(() => notification.close(), 8000);
  } catch {}
}

/**
 * 发送带快速操作的浏览器通知 — 任务完成/稍后提醒
 */
export function sendTaskNotification(
  title: string,
  options: {
    body: string;
    taskId: string;
    url?: string;
  }
): void {
  const actions = [
    { action: 'complete', title: '完成' },
    { action: 'snooze', title: '稍后提醒' },
  ];

  sendBrowserNotification(title, {
    body: options.body,
    tag: `task-${options.taskId}`,
    data: { url: options.url || '/', taskId: options.taskId },
    actions,
  } as any);
}

/**
 * 强提醒 — @mention 时始终弹出浏览器通知（无论页面是否可见），并播放提示音
 */
export function sendUrgentNotification(title: string, options?: NotificationOptions): void {
  // Play notification sound
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {}

  // Always show browser notification for urgent mentions (even when page is visible)
  if (!permissionGranted && Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'mention-' + Date.now(),
      requireInteraction: true,
      ...options,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    setTimeout(() => notification.close(), 15000);
  } catch {}
}
