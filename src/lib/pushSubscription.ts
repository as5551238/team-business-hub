/**
 * Push Subscription 管理 — Web Push 协议 (VAPID)
 * 负责：订阅/退订、Supabase 存储订阅、iOS standalone 检测
 *
 * 使用流程：
 * 1. 用户首次创建任务后自然引导请求通知权限
 * 2. 权限获取后自动注册 Push 订阅
 * 3. 订阅信息存储到 Supabase push_subscriptions 表
 * 4. SW 添加 push 事件监听，接收服务端推送
 *
 * 注意：iOS 16.4+ 需要添加到主屏幕(standalone)才支持 Web Push
 */

// VAPID 公钥 — 需要替换为你自己的公钥
// 生成方式：npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = 'BMPFI8VVJ2Q14o6BwOzHqtLTRPnaSMvfv7y1KwD1ebJYE4yjYbdN1vaBMH3f-lZAz26IgCf2fPhgCQF5DZvcNcQ';

/** Check if current context supports Push subscription */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Check if running as standalone PWA (required for iOS Push) */
export function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Check if current device is iOS and not standalone — can't use Push */
export function needsIOSInstall(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS && isSafari && !isStandaloneMode();
}

/** Convert base64 VAPID key to Uint8Array for PushManager */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe to Push notifications
 * Returns PushSubscription or null if failed
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  // iOS Safari check — need standalone mode
  if (needsIOSInstall()) {
    console.warn('[Push] iOS Safari requires "Add to Home Screen" for Push. Skipping subscription.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = registration.pushManager.getSubscription();
    const existingSub = await existing;
    if (existingSub) {
      // Already subscribed, sync to server
      await syncSubscriptionToServer(existingSub);
      return existingSub;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Sync to Supabase
    await syncSubscriptionToServer(subscription);
    return subscription;
  } catch (err) {
    console.warn('[Push] Subscription failed:', err);
    return null;
  }
}

/**
 * Unsubscribe from Push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await removeSubscriptionFromServer(subscription);
    }
    return true;
  } catch (err) {
    console.warn('[Push] Unsubscribe failed:', err);
    return false;
  }
}

/** Sync Push subscription to Supabase for server-side push */
async function syncSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  try {
    const sub = subscription.toJSON();
    const payload = {
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    };

    // Store to localStorage as backup (Supabase sync requires auth context)
    try {
      localStorage.setItem('tbh-push-subscription', JSON.stringify(payload));
    } catch {}

    // Attempt Supabase upsert (may fail if not authenticated)
    // This will be called from the App context where Supabase client is available
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SYNC_SUBSCRIPTION',
        payload,
      });
    }
  } catch (err) {
    console.warn('[Push] Server sync failed:', err);
  }
}

/** Remove Push subscription from server */
async function removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
  try {
    localStorage.removeItem('tbh-push-subscription');
  } catch {}
}

/**
 * Smart permission request — only ask after user's first meaningful action
 * Returns true if permission was granted (or already granted)
 */
export async function requestPushPermissionAndSubscribe(): Promise<boolean> {
  if (!isPushSupported()) return false;

  // Already granted
  if (Notification.permission === 'granted') {
    // Ensure we have a push subscription
    await subscribeToPush();
    return true;
  }

  // Denied
  if (Notification.permission === 'denied') return false;

  // Request permission
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    await subscribeToPush();
    return true;
  }
  return false;
}
