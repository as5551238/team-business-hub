/**
 * PWA 安装提示 — 三端适配（安卓/iOS/鸿蒙）
 * - 安卓 Chrome: beforeinstallprompt → 自动弹出安装横幅
 * - iOS Safari: 检测未安装 → 显示"分享→添加到主屏幕"分步引导
 * - 鸿蒙: 类安卓流程 + 桌面快捷方式提示
 */
import { useState, useEffect, useCallback } from 'react';
import { Download, X, Smartphone, Share, PlusCircle, ChevronRight } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'tbh-pwa-install-dismissed';

/** Detect iOS Safari (not in standalone) */
function detectIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIOS && isSafari && !isStandalone;
}

/** Detect HarmonyOS browser */
function detectHarmonyOS(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('harmonyos') || ua.includes('harmonybrowser');
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isHarmony, setIsHarmony] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // Check if dismissed
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {}

    // iOS Safari detection
    const iosSafari = detectIOSSafari();
    setIsIOS(iosSafari);

    // HarmonyOS detection
    const harmony = detectHarmonyOS();
    setIsHarmony(harmony);

    // Android Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 1000);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS / HarmonyOS: show banner after delay (no beforeinstallprompt event)
    if (iosSafari || harmony) {
      setTimeout(() => setShowBanner(true), 2000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSGuide(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
  };

  // Also detect if running inside Capacitor (native app shell)
  useEffect(() => {
    const isCapacitor = !!(window as any).capacitor;
    if (isCapacitor && isStandalone) return;
  }, [isStandalone]);

  if (isStandalone || !showBanner) return null;

  // iOS Guide overlay
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 flex items-end justify-center animate-fade-in" onClick={handleDismiss}>
        <div className="bg-card rounded-t-2xl w-full max-w-md p-6 pb-8" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Smartphone size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">添加到主屏幕</h3>
              <p className="text-xs text-muted-foreground">离线可用，像 App 一样快速打开</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <div>
                <p className="text-sm font-medium">点击底部分享按钮</p>
                <p className="text-xs text-muted-foreground mt-0.5">在 Safari 底部工具栏找到分享图标</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <div>
                <p className="text-sm font-medium">向下滚动，选择"添加到主屏幕"</p>
                <p className="text-xs text-muted-foreground mt-0.5">在弹出菜单中找到 <strong>添加到主屏幕</strong> 选项</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</span>
              <div>
                <p className="text-sm font-medium">点击"添加"完成安装</p>
                <p className="text-xs text-muted-foreground mt-0.5">回到桌面即可看到 TBH 图标，点击即可快速打开</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg mb-4">
            <Share size={16} className="text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              {isHarmony
                ? '鸿蒙用户：也可在浏览器菜单中选择"添加到桌面"或"创建快捷方式"'
                : '安装后支持离线使用和推送通知（需 iOS 16.4+）'}
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleDismiss} className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm hover:bg-muted/50 transition-colors">
              稍后再说
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-fade-in">
      <div className="bg-card border border-primary/20 rounded-xl shadow-lg p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">安装到桌面</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isHarmony ? '添加到桌面，像 App 一样快速打开' : '离线可用，随时打开无需浏览器'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            {(isIOS || isHarmony) ? (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <PlusCircle size={12} /> 查看安装步骤
              </button>
            ) : (
              <button
                onClick={handleInstall}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Download size={12} /> 立即安装
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              暂不需要
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground/50 hover:text-muted-foreground p-0.5" aria-label="关闭安装提示">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
