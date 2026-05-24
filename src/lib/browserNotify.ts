/**
 * 浏览器通知服务 — 使用 Notification API
 * 当用户不在当前标签页时，通过浏览器原生通知提醒
 * 无需 Service Worker / VAPID，页面打开即可工作
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

/**
 * 发送浏览器通知（仅当页面不可见时）
 */
export function sendBrowserNotification(title: string, options?: NotificationOptions): void {
  if (!permissionGranted && Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // 页面可见时不弹通知
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
