/**
 * TabErrorBoundary + TabLoader — 页面分区 Tab 的统一错误边界与加载态
 * 被 Admin / Dashboard / Insight 共享复用
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type TabErrorBoundaryProps = { children: ReactNode; name: string };
type TabErrorBoundaryState = { hasError: boolean; error: Error | null };

export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`TabErrorBoundary [${this.props.name}]:`, error, info.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <div className="text-sm font-medium">{this.props.name}加载出错</div>
          <div className="text-xs max-w-md text-center">{this.state.error?.message || ''}</div>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">
            <RefreshCw size={14} /> 重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function TabLoader() {
  return <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">加载中...</div>;
}
