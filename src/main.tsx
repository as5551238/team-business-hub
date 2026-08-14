import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react'
// v2: AI intent parser + FallbackForm
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RefreshCw } from 'lucide-react'

// Register Service Worker — PWA缓存+推送+离线的基础
import { registerSW } from 'virtual:pwa-register'
registerSW({
  onNeedRefresh() { /* 新SW等待激活，App.tsx中已有SKIP_WAITING逻辑 */ },
  onOfflineReady() { /* 离线资源已缓存就绪 */ },
  onError(registrationError) {
    console.warn('[PWA] Service Worker registration failed, offline features unavailable:', registrationError);
  },
})

// Web Vitals monitoring — LCP/FCP/CLS/TTFB/INP via PerformanceObserver (zero dependency)
function reportWebVitals() {
  const wv = (window as any).__webVitals = (window as any).__webVitals || {};
  const record = (name: string, value: number) => {
    const rating = name === 'CLS' ? (value < 0.1 ? 'good' : value < 0.25 ? 'needs-improvement' : 'poor')
      : value < 2500 ? 'good' : value < 4000 ? 'needs-improvement' : 'poor';
    wv[name] = { value: parseFloat(value.toFixed(2)), rating, timestamp: Date.now() };
    try { localStorage.setItem('tbh-web-vitals', JSON.stringify(wv)); } catch {}
  };

  // LCP (Largest Contentful Paint)
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    record('LCP', lastEntry.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // FCP (First Contentful Paint)
  new PerformanceObserver((list) => {
    list.getEntries().forEach(e => record('FCP', e.startTime));
  }).observe({ type: 'paint', buffered: true });

  // CLS (Cumulative Layout Shift)
  let clsValue = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!(entry as any).hadRecentInput) {
        clsValue += (entry as any).value;
      }
    }
    record('CLS', clsValue);
  }).observe({ type: 'layout-shift', buffered: true });

  // TTFB (Time to First Byte)
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navEntry) record('TTFB', navEntry.responseStart - navEntry.requestStart);

  // INP (Interaction to Next Paint) — via event timing
  let maxDuration = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const duration = (entry as any).duration || 0;
      if (duration > maxDuration) {
        maxDuration = duration;
        record('INP', maxDuration);
      }
    }
  }).observe({ type: 'event', buffered: true });
}
reportWebVitals();

// Global ErrorBoundary - prevents white screen when StoreProvider or root components crash
class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('GlobalErrorBoundary:', error, info.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9888;&#65039;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>应用运行异常</div>
          <div style={{ fontSize: 13, color: '#64748b', maxWidth: 480, textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
            {this.state.error?.message || '发生了未知错误，请刷新页面重试。'}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, padding: '8px 20px', fontSize: 13, fontWeight: 500, color: '#fff', background: '#3b82f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            <RefreshCw size={14} /> 刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) {
  document.body.innerHTML = '<div style="padding:2rem;text-align:center"><h1>加载失败</h1><p>请刷新页面重试</p></div>';
} else {
  createRoot(root).render(
    <StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </StrictMode>,
  );
}
