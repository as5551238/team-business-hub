/**
 * 浏览器通知服务 — 使用 Notification API
 * 当用户不在当前标签页时，通过浏览器原生通知提醒
 * 优先通过 Service Worker 推送，回退到直接 Notification API
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

function isSwActive(): boolean {
  return ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
}

/**
 * 发送浏览器通知（仅当页面不可见时）
 * 优先使用 Service Worker 推送，SW 不可用时回退到 Notification API
 */
export function sendBrowserNotification(title: string, options?: NotificationOptions): void {
  if (!permissionGranted && Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  if (isSwActive()) {
    try {
      navigator.serviceWorker.controller!.postMessage({
        type: 'PUSH_NOTIFICATION',
        payload: { title, body: options?.body || '', url: options?.data?.url as string | undefined },
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
 * 强提醒 — @mention 时始终弹出浏览器通知（无论页面是否可见），并播放提示音
 */
export function sendUrgentNotification(title: string, options?: NotificationOptions): void {
  // Play notification sound
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkpuTi4F1b2ZxeISOm6OnpKCUjYF5cGtuYoSLmqanqKSmopCNhoJ9eHRyb2VkiZOop6qop6Wljo+Kh4OBfXp4dXJva2dgZGJme4KJk5yhp6ijpKWmj4yGhIJ+eXZ0cW5raWhlb3+EipWcoKeppKKlpo+MhoSCf3p2dHFua2doZG9/hIqVnKCnqaSi paWaPjIaEgn5+dnZ0cW5raWhlb3+EipWcoKeppKKlpo+MhoSCf3p2dHFua2doZG9/hIqVnKCnqaSipaWaPjIaEgn5+dnZ0cW5raWhlb3+EipWcoKeppKKlpo+MhoSCf3p2dHJ=');
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

