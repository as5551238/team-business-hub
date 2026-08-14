/**
 * Capacitor 原生桥接 — 当应用运行在 Capacitor 原生壳内时启用
 *
 * 能力：
 * - 原生推送通知（APNs/FCM，替代 Web Push）
 * - 本地定时通知（替代 setTimeout 提醒）
 * - 状态栏控制（沉浸式）
 * - 震动反馈
 *
 * 如果不在 Capacitor 环境中（纯浏览器/PWA），所有方法安全降级为 no-op。
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications, type PushNotificationToken } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** 是否运行在 Capacitor 原生壳内 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** 获取平台名称 */
export function getNativePlatform(): string {
  return Capacitor.getPlatform();
}

/**
 * 初始化原生功能 — 在 App.tsx 中调用一次
 * 仅在原生环境中生效，PWA 模式下安全跳过
 */
export async function initNativeFeatures(): Promise<void> {
  if (!isNativeApp()) return;

  const platform = getNativePlatform();

  // 1. 状态栏 — 深色背景，白色文字
  try {
    await StatusBar.setStyle({ style: Style.Light });
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#1E40AF' });
    }
  } catch (err) {
    console.warn('[Native] StatusBar setup failed:', err);
  }

  // 2. 隐藏启动屏
  try {
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[Native] SplashScreen hide failed:', err);
  }

  // 3. 请求推送通知权限并注册
  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') {
      console.log('[Native] Push notification permission not granted');
      return;
    }
    await PushNotifications.register();
    PushNotifications.addListener('registration', (token: PushNotificationToken) => {
      console.log('[Native] Push registration token:', token.value.substring(0, 20) + '...');
      // TODO: 将 token 发送到 Supabase push_subscriptions 表
    });
    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Native] Push registration error:', err);
    });
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Native] Push received:', notification.title);
    });
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Native] Push action:', action.actionId);
    });
  } catch (err) {
    console.warn('[Native] Push setup failed:', err);
  }
}

/**
 * 发送本地通知（定时提醒）
 * @param title 标题
 * @param body 内容
 * @param delayMinutes 延迟分钟数
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  delayMinutes: number = 1
): Promise<void> {
  if (!isNativeApp()) {
    // PWA 降级：用浏览器 Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icon-192.png' });
    }
    return;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now(),
          title,
          body,
          schedule: { at: new Date(Date.now() + delayMinutes * 60 * 1000) },
          sound: 'beep.wav',
          smallIcon: 'ic_stat_icon',
          iconColor: '#1E40AF',
        },
      ],
    });
  } catch (err) {
    console.warn('[Native] Local notification failed:', err);
  }
}

/** 触觉反馈 — 轻触 */
export async function hapticLight(): Promise<void> {
  if (!isNativeApp()) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
}

/** 触觉反馈 — 中等 */
export async function hapticMedium(): Promise<void> {
  if (!isNativeApp()) return;
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
}

/** 触觉反馈 — 成功振动 */
export async function hapticSuccess(): Promise<void> {
  if (!isNativeApp()) return;
  try { await Haptics.notification({ type: 'SUCCESS' }); } catch {}
}
