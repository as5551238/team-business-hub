import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RefreshCw } from 'lucide-react'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)
