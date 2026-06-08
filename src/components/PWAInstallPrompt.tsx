/**
 * PWA 安装提示 — 检测 beforeinstallprompt 事件，显示安装横幅
 * R8升级：安装成功反馈 + iOS安装引导 + 更新提示
 */
import { useState, useEffect } from 'react';
import { Download, X, Smartphone, CheckCircle2, Share, Plus } from 'lucide-react';
import { handleError } from '@/lib/errorHandler';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'tbh-pwa-install-dismissed';

/** Detect iOS Safari (no beforeinstallprompt support) */
function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Record<string, unknown>).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch (e) { handleError(e, { module: 'PWAInstallPrompt', operation: 'CHECK_DISMISSED', severity: 'info' }); }

    // iOS Safari detection
    if (isIOSSafari()) {
      setIsIOS(true);
      setTimeout(() => setShowBanner(true), 5000);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallSuccess(true);
      setTimeout(() => {
        setShowBanner(false);
        setInstallSuccess(false);
      }, 2000);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { handleError(e, { module: 'PWAInstallPrompt', operation: 'SAVE_DISMISS', severity: 'debug' }); }
  };

  if (isStandalone || !showBanner) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-slide-up">
      <div className="bg-card border border-primary/20 rounded-xl shadow-lg overflow-hidden">
        {installSuccess ? (
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700">安装成功</p>
              <p className="text-xs text-muted-foreground">您可以从桌面直接打开应用</p>
            </div>
          </div>
        ) : isIOS ? (
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Smartphone size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">添加到主屏幕</p>
                <p className="text-xs text-muted-foreground mt-0.5">点击下方分享按钮，选择"添加到主屏幕"</p>
                <div className="flex items-center gap-2 mt-2">
                  <Share size={14} className="text-primary" />
                  <Plus size={14} className="text-primary" />
                  <span className="text-xs text-muted-foreground">Safari 底部工具栏</span>
                </div>
              </div>
              <button onClick={handleDismiss} className="text-muted-foreground/50 hover:text-muted-foreground p-0.5">
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Smartphone size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">安装到桌面</p>
              <p className="text-xs text-muted-foreground mt-0.5">离线可用，随时打开无需浏览器</p>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={handleInstall} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                  <Download size={12} /> 立即安装
                </button>
                <button onClick={handleDismiss} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  暂不需要
                </button>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-muted-foreground/50 hover:text-muted-foreground p-0.5">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

}
